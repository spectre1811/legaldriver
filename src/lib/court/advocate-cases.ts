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
import { parseBarNumber, stateBarCouncil, barSearchScopes } from "./bar-number";

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

// `barNumber` = the canonical enrollment string "STATE/SERIAL/YEAR" (parsed for the
// live eCourts tuple) or a bare numeric serial. `stateCode` = the State Bar Council
// token (verified councils only) used as the cross-state guard + council resolver.
// `live` = do a LIVE eCourts roster refresh (onboarding); off for warehouse-only reads.
export interface AdvocateQuery { name: string; barNumber?: string | null; stateCode?: string | null; live?: boolean }

// eCourts CNRs begin with the 2-letter state code (GJHC… = Gujarat, UPHC… = UP).
// When an advocate is identified by an exact bar id + state, that state is the
// ground truth; a case from another state is a different (name-collision) advocate.
function cnrState(cnr?: string | null): string | null {
  return cnr && cnr.length >= 2 ? cnr.slice(0, 2).toUpperCase() : null;
}

// Whether a fetched case should count as THIS bar-identified advocate's. The
// authoritative `legaldriver` bar lookup always passes; fuzzy name-only rows pass
// only when their CNR's state prefix matches the advocate's state. `stateGuard` is
// null when the advocate isn't pinned by bar+state (name-only search) → keep all.
export function passesStateGuard(c: { source: string; cnr?: string | null }, stateGuard: string | null): boolean {
  if (!stateGuard || c.source === "legaldriver") return true;
  return cnrState(c.cnr) === stateGuard;
}

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

// ── LegalDriver API (our own; live eCourts bar search when year+verified-state) ────
// WO-42: the roster fetch is only exact when it sends the FULL eCourts tuple —
// `barstatecode` (tier-dependent) + `barcode` (serial) + **`year`** + numeric
// `state_code`. So when the query carries a parsed enrollment (with year) + a verified
// State Bar Council, we drive a LIVE `searchByAdvocateName.php` refresh across BOTH tiers
// (HC then the district complex) so a single-tier advocate is never missed. Otherwise we
// fall back to the warehouse (exact serial) then a fuzzy name search. This is what fixes
// "valid advocate → 0 cases": the year was never sent, so the bar search returned nothing.
interface LdProfileCase { cnr: string; case_type?: string; status?: string; tier?: string; registration_year?: number }
const legaldriverProvider: AdvocateCaseProvider = {
  source: "legaldriver",
  enabled() { return !!process.env.LD_API_KEY; },
  async fetchByAdvocate(q): Promise<FetchedAdvocateCase[]> {
    const key = process.env.LD_API_KEY;
    if (!key) return [];
    const base = process.env.LD_API_BASE || "http://13.202.148.71:8080";
    const H = { "X-API-Key": key };
    const sig = () => AbortSignal.timeout(Number(process.env.LD_API_TIMEOUT_MS ?? "60000"));
    const get = async (path: string) => {
      try { const r = await fetch(`${base}${path}`, { headers: H, signal: sig() }); return r.ok ? await r.json() : null; } catch { return null; }
    };
    const post = async (path: string) => {
      try { const r = await fetch(`${base}${path}`, { method: "POST", headers: H, signal: sig() }); return r.ok ? await r.json() : null; } catch { return null; }
    };
    const map = (c: LdProfileCase): FetchedAdvocateCase => ({
      cnr: c.cnr, caseNumber: null, title: `${c.case_type ?? "Case"}${c.registration_year ? ` (${c.registration_year})` : ""}`,
      court: c.tier ?? null, status: c.status ?? null, nextHearingDate: null, parties: [], pdfUrl: null,
      decided: (c.status ?? "").toUpperCase().includes("DISPOSED"), source: "legaldriver",
    });
    const out: FetchedAdvocateCase[] = [];
    const seen = new Set<string>();
    const collect = (a: { cases?: LdProfileCase[] } | null) => {
      for (const c of a?.cases ?? []) { if (c.cnr && !seen.has(c.cnr)) { seen.add(c.cnr); out.push(map(c)); } }
    };

    const parsed = parseBarNumber(q.barNumber);
    const council = stateBarCouncil(q.stateCode) ?? (parsed ? stateBarCouncil(parsed.stateBar) : null);

    // LIVE path (onboarding): full tuple + retry HC then district. `/advocate/{serial}/refresh`
    // ingests each returned case and re-reads the warehouse profile, so its `cases` is the roster.
    if (q.live && parsed && council?.verified) {
      const serial = String(parsed.serial);
      for (const scope of barSearchScopes(council)) {
        const p = new URLSearchParams({ year: String(parsed.year), bar_state: scope.barState, state_code: String(scope.stateCode), tier: scope.tier });
        if (scope.courtCodeArr) p.set("court_code_arr", scope.courtCodeArr);
        else { p.set("dist_code", String(scope.distCode ?? 1)); p.set("court_code", String(scope.courtCode ?? 1)); }
        const prof = await post(`/advocate/${encodeURIComponent(serial)}/refresh?${p.toString()}`);
        if (prof && !prof.error) collect(prof);
      }
    }

    // Warehouse / name fallback: exact serial when known, else fuzzy by name.
    if (!out.length) {
      let barIds: string[] = [];
      if (parsed) barIds = [String(parsed.serial)];
      else if (q.barNumber && /^\d+$/.test(q.barNumber)) barIds = [q.barNumber]; // bare numeric serial
      else if (q.name) {
        const s = await get(`/search/advocate?name=${encodeURIComponent(q.name)}`);
        barIds = [...new Set(((s?.results ?? []) as { bar_id?: string }[]).map((r) => r.bar_id).filter((b): b is string => !!b))].slice(0, 3);
      }
      for (const bar of barIds) collect(await get(`/advocate/${encodeURIComponent(bar)}`));
    }
    return out;
  },
};

const PROVIDERS = [legaldriverProvider, corpusProvider, indianKanoonProvider, vakeel360Provider];

export function enabledAdvocateProviders(): string[] {
  return PROVIDERS.filter((p) => p.enabled()).map((p) => p.source);
}

// Fetch + merge across all enabled providers, de-duped by CNR (then case-number/title).
//
// STATE GUARD: when the advocate is pinned by an exact bar id + state (e.g. a Gujarat
// High Court bar), the `legaldriver` bar lookup is the AUTHORITATIVE roster for that
// exact advocate. The other providers (corpus, Indian Kanoon) only fuzzy-match on
// NAME, so for a common name ("… Patel") they pull NAMESAKES from other states — this
// is what silently seeded 59 Allahabad (UP) cases onto a Gujarat HC advocate. So when
// a bar id + state are given, name-only rows are kept only if their CNR's state prefix
// matches; cross-state / unverifiable (no-CNR) rows are dropped rather than seeded as
// this advocate's. (No bar id → name-only search → unchanged: keep everything.)
export async function fetchAdvocateCases(q: AdvocateQuery): Promise<FetchedAdvocateCase[]> {
  if (!q.name || q.name.trim().length < 3) return [];
  const results = await Promise.all(PROVIDERS.filter((p) => p.enabled()).map((p) => p.fetchByAdvocate(q).catch(() => [])));
  const stateGuard = q.barNumber && q.stateCode ? q.stateCode.trim().toUpperCase() : null;
  const merged: FetchedAdvocateCase[] = [];
  const seen = new Set<string>();
  for (const list of results) {
    for (const c of list) {
      // Authoritative bar-lookup rows always pass; fuzzy name rows must match the state.
      if (!passesStateGuard(c, stateGuard)) continue;
      const key = (c.cnr || c.caseNumber || c.title || "").trim().toUpperCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(c);
    }
  }
  return merged;
}
