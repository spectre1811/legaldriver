// Auto-fetch an advocate's cases BY ADVOCATE (name / bar number) from compliant
// sources — no manual upload, and NEVER by scraping eCourts / solving a CAPTCHA
// (CLAUDE.md §2). Provider seam, env-routed like CourtDataClient / the LLM layer:
//   - corpus (DEFAULT, keyless): our CC-BY open-judgments datastore by advocate NAME
//     (broad HC/SC coverage; decided cases). Runs with zero config.
//   - indiankanoon (key): full-text advocate search over the IK judgment database.
//   - vakeel360 (key): licensed live orders by advocate (Allahabad/Lucknow benches).
// Compliance reality: NO compliant API returns an advocate's full LIVE open-case
// roster by bar number nationwide today — that path is CAPTCHA-scraping, which we
// refuse. We fetch what IS compliantly available and label provenance + coverage.

import { corpusEnabled } from "./corpus-athena";

export interface FetchedAdvocateCase {
  cnr?: string | null;
  caseNumber?: string | null;
  title?: string | null;
  court?: string | null;
  status?: string | null;
  nextHearingDate?: string | null;
  parties: string[];
  pdfUrl?: string | null;
  decided: boolean;        // true = disposed/judgment (historical), false = live/open
  source: string;          // 'corpus' | 'indiankanoon' | 'vakeel360'
}

export interface AdvocateQuery { name: string; barNumber?: string | null; stateCode?: string | null }

interface AdvocateCaseProvider {
  source: string;
  enabled(): boolean;
  fetchByAdvocate(q: AdvocateQuery): Promise<FetchedAdvocateCase[]>;
}

// Split an eCourts-style title "CASE/NO of X Vs Y" into party names.
function partiesFromTitle(title?: string | null): string[] {
  if (!title) return [];
  const rest = title.includes(" of ") ? title.slice(title.indexOf(" of ") + 4) : title;
  return rest.split(/\s+(?:Vs|Versus|V\/s)\s+/i).map((s) => s.trim()).filter(Boolean).slice(0, 4);
}

// ── corpus (default, keyless) ────────────────────────────────────────────────
const corpusProvider: AdvocateCaseProvider = {
  source: "corpus",
  enabled() { return corpusEnabled(); },
  async fetchByAdvocate(q): Promise<FetchedAdvocateCase[]> {
    try {
      const { searchCasesByAdvocate, judgmentPdfUrl, courtLabel } = await import("./corpus-athena");
      const rows = await searchCasesByAdvocate(q.name, 100);
      return rows.map((r) => ({
        cnr: r.cnr,
        caseNumber: null,
        title: r.title,
        court: courtLabel(r.court),
        status: r.disposal_nature ?? (r.decision_date ? "disposed" : null),
        nextHearingDate: null,
        parties: partiesFromTitle(r.title),
        pdfUrl: judgmentPdfUrl(r.pdf_link, r.court, r.year, r.src),
        decided: !!r.decision_date || !!r.disposal_nature,
        source: "corpus",
      }));
    } catch { return []; }
  },
};

// ── Indian Kanoon (key-gated) ────────────────────────────────────────────────
const indianKanoonProvider: AdvocateCaseProvider = {
  source: "indiankanoon",
  enabled() { return !!process.env.INDIANKANOON_API_KEY; },
  async fetchByAdvocate(q): Promise<FetchedAdvocateCase[]> {
    const key = process.env.INDIANKANOON_API_KEY;
    if (!key) return [];
    try {
      // No dedicated advocate filter — full-text match the advocate's name.
      const url = `https://api.indiankanoon.org/search/?formInput=${encodeURIComponent(`"${q.name}"`)}&pagenum=0`;
      const res = await fetch(url, { method: "POST", headers: { Authorization: `Token ${key}` } });
      if (!res.ok) return [];
      const data = await res.json();
      const docs = (data?.docs ?? []) as { tid?: number; title?: string; docsource?: string }[];
      return docs.slice(0, 50).map((d) => ({
        cnr: null, caseNumber: null, title: d.title ?? null, court: d.docsource ?? null,
        status: "disposed", nextHearingDate: null, parties: partiesFromTitle(d.title),
        pdfUrl: d.tid ? `https://indiankanoon.org/doc/${d.tid}/` : null, decided: true, source: "indiankanoon",
      }));
    } catch { return []; }
  },
};

// ── Vakeel360 (key-gated; live orders by advocate, Allahabad/Lucknow only) ────
const vakeel360Provider: AdvocateCaseProvider = {
  source: "vakeel360",
  enabled() { return !!process.env.VAKEEL360_API_KEY; },
  async fetchByAdvocate(q): Promise<FetchedAdvocateCase[]> {
    const key = process.env.VAKEEL360_API_KEY;
    if (!key) return [];
    const out: FetchedAdvocateCase[] = [];
    for (const bench of ["allahabad", "lucknow"]) {
      try {
        const res = await fetch(`https://vakeel360.com/api/v1/protected/order-search/${bench}/advocate`, {
          method: "POST",
          headers: { "X-API-Key": key, "Content-Type": "application/json" },
          body: JSON.stringify({ advocate_name: q.name }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const rows = Array.isArray(data?.data) ? data.data : data?.data ? [data.data] : [];
        for (const r of rows as Record<string, string>[]) {
          out.push({
            cnr: r.cnr ?? null, caseNumber: r.case_number ?? null, title: r.case_type ?? r.case_number ?? null,
            court: r.court_name ?? `${bench} (HC)`, status: r.status ?? null, nextHearingDate: r.next_date ?? null,
            parties: [r.petitioner, r.respondent].filter(Boolean), pdfUrl: null, decided: false, source: "vakeel360",
          });
        }
      } catch { /* skip bench */ }
    }
    return out;
  },
};

const PROVIDERS = [corpusProvider, indianKanoonProvider, vakeel360Provider];

export function enabledAdvocateProviders(): string[] {
  return PROVIDERS.filter((p) => p.enabled()).map((p) => p.source);
}

// Fetch + merge across all enabled providers, de-duped by CNR (then case-number/title).
export async function fetchAdvocateCases(q: AdvocateQuery): Promise<FetchedAdvocateCase[]> {
  if (!q.name || q.name.trim().length < 3) return [];
  const results = await Promise.all(PROVIDERS.filter((p) => p.enabled()).map((p) => p.fetchByAdvocate(q).catch(() => [])));
  const merged: FetchedAdvocateCase[] = [];
  const seen = new Set<string>();
  for (const list of results) {
    for (const c of list) {
      const key = (c.cnr || c.caseNumber || c.title || "").trim().toUpperCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(c);
    }
  }
  return merged;
}
