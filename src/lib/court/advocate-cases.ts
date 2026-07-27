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
import { parseBarNumber, stateBarCouncil, councilByStatePrefix, barSearchScopes } from "./bar-number";
import type { ParsedBarNumber, StateBarCouncil } from "./bar-number";

// ── Fetch-failure classification (WO-64) ─────────────────────────────────────
// A provider fetch fails three ways the UI MUST tell apart, because they call for different actions:
//   • auth        — the source rejected our credentials (401/403): a key rotted/is wrong → an ADMIN
//                   must fix LD_API_KEY; retrying changes nothing.
//   • source_down — the source broke or was unreachable (5xx / network / timeout): transient → retry.
//   • (neither)   — the source answered fine and the advocate genuinely has no cases: NOT a failure.
// Conflating "auth failed" with "empty" is exactly what rendered a rotted-key 401 as the reassuring
// "still fetching…" for days (the WO-64 incident). `classifyHttpStatus` is the pure kernel.
export type FetchErrorKind = "auth" | "source_down" | "unknown";

export function classifyHttpStatus(status: number): FetchErrorKind | null {
  if (status === 401 || status === 403) return "auth";        // key wrong / rotted / missing scope
  if (status >= 500) return "source_down";                    // provider broke — transient
  return null;                                                // 2xx / 404 / other → NOT a failure (empty is a valid answer)
}

// A provider failure that CARRIES its classification, so it survives the merge into
// `AdvocateFetchMeta.errors` instead of being flattened to a bare `[]` (the anti-blackhole contract,
// WO-58 + WO-64). Providers throw this on a hard/transport failure; a plain empty result is not an error.
export class ProviderError extends Error {
  constructor(public source: string, public kind: FetchErrorKind, message: string) {
    super(message);
    this.name = "ProviderError";
  }
}

// WO-49: the bar id to look up in the LD warehouse (`GET /advocate/{bar_id}`). The warehouse keys
// advocates on the **full canonical bar id** ("G/4732/1999" → 5075 cases), NOT the bare serial
// (`GET /advocate/4732` → 404) — so onboarding was returning 0 even for advocates whose cases we
// fully hold. Return the canonical string when the enrollment parses; else a bare numeric eCourts
// code as-is; else null → the caller falls back to a fuzzy name search.
export function warehouseBarId(parsed: ParsedBarNumber | null, barNumber?: string | null): string | null {
  if (parsed) return parsed.canonical;                          // e.g. "G/4732/1999" — the warehouse key
  if (barNumber && /^\d+$/.test(barNumber)) return barNumber;   // bare numeric eCourts code (e.g. 11240)
  return null;                                                  // → caller does a name search
}

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
// WO-93: how many roster cases to request from the box `/advocate/{bar}` read. The box caps at
// `min(limit, 500)`; ask for 500 so a ≤500-case advocate imports in full (was defaulting to 200).
const ROSTER_READ_LIMIT = 500;
const legaldriverProvider: AdvocateCaseProvider = {
  source: "legaldriver",
  enabled() { return !!process.env.LD_API_KEY; },
  async fetchByAdvocate(q): Promise<FetchedAdvocateCase[]> {
    const key = process.env.LD_API_KEY;
    if (!key) return [];
    const base = process.env.LD_API_BASE || "http://13.202.148.71:8080";
    const H = { "X-API-Key": key };
    const sig = () => AbortSignal.timeout(Number(process.env.LD_API_TIMEOUT_MS ?? "60000"));
    // Thread the HTTP status through (WO-64): a 401/403 or 5xx must NOT masquerade as an empty roster —
    // it throws a classified ProviderError so `fetchAdvocateCasesWithMeta` records WHY the fetch failed
    // (auth vs source-down) instead of returning a silent, indistinguishable zero. A 404 (advocate simply
    // absent from the warehouse) stays a valid empty answer → null, not an error.
    const get = async (path: string) => {
      let r: Response;
      try {
        r = await fetch(`${base}${path}`, { headers: H, signal: sig() });
      } catch (e) {
        throw new ProviderError("legaldriver", "source_down", e instanceof Error ? e.message : "box unreachable");
      }
      if (r.ok) return await r.json();
      const kind = classifyHttpStatus(r.status);
      if (kind) throw new ProviderError("legaldriver", kind, `HTTP ${r.status}`);
      return null; // 404 etc. → nothing here, but the source answered: a valid empty result.
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
    const whId = warehouseBarId(parsed, q.barNumber);

    // READ THE WAREHOUSE — the cases we already hold. Exact CANONICAL bar id when known (WO-49 — the
    // warehouse keys on the full "STATE/SERIAL/YEAR", not the bare serial), else fuzzy by name. This is
    // synchronous + fast; the LIVE roster refresh is fired SEPARATELY by the caller (onboarding) via
    // `startLiveAdvocateRefresh` and its results are HARVESTED by re-reading the warehouse — so this
    // provider is a pure, side-effect-free read (also reused as the harvest primitive). See WO-58.
    // WO-93: the box `/advocate/{bar}` defaults to `limit=200` while `case_count` is the true (unlimited)
    // total — so a 257-case advocate silently imported only 200. Ask for the box's max (`min(limit,500)`)
    // so a ≤500-case roster lands in full. (Advocates with >500 cases still truncate at 500 → the box needs
    // offset pagination; filed as the WO-93 W2 follow-up. Guarded honestly, not silently.)
    if (whId) {
      collect(await get(`/advocate/${encodeURIComponent(whId)}?limit=${ROSTER_READ_LIMIT}`));
    } else if (q.name) {
      const s = await get(`/search/advocate?name=${encodeURIComponent(q.name)}`);
      const barIds = [...new Set(((s?.results ?? []) as { bar_id?: string }[]).map((r) => r.bar_id).filter((b): b is string => !!b))].slice(0, 3);
      for (const bar of barIds) collect(await get(`/advocate/${encodeURIComponent(bar)}?limit=${ROSTER_READ_LIMIT}`));
    }
    return out;
  },
};

// Fire the LIVE eCourts roster refresh, FIRE-AND-FORGET. The scraper endpoint is ASYNC (BP-71): each
// scope POST returns 202 + enqueues the advocate's CNR spine for the rotating-IP fleet, which ingests
// the FULL roster into our warehouse OFF-BOX (never bursting the box EIP into the BP-66 WAF). We never
// await or read the response (it carries no cases). Onboarding later HARVESTS the ingested cases by
// re-reading the warehouse (a plain `fetchAdvocateCases` warehouse read — see actions.harvestOnboarding).
// Returns true iff a refresh was actually dispatched (LD_API_KEY set + a parsed enrolment + a verified
// council) — the caller records that so the UI can honestly say "still fetching your cases…". WO-58.
export function startLiveAdvocateRefresh(q: AdvocateQuery): boolean {
  const key = process.env.LD_API_KEY;
  if (!key) return false;
  const parsed = parseBarNumber(q.barNumber);
  // Stored council token first (dropdown); else infer from the enrolment STATE prefix ("G" → Gujarat),
  // NOT the token id — the advocate writes "G/702/2020", not "GJ/…".
  const council = stateBarCouncil(q.stateCode) ?? (parsed ? councilByStatePrefix(parsed.stateBar) : null);
  if (!parsed || !council?.verified) return false;
  const base = process.env.LD_API_BASE || "http://13.202.148.71:8080";
  const H = { "X-API-Key": key };
  const serial = String(parsed.serial);
  const refreshTimeout = Number(process.env.LD_REFRESH_TIMEOUT_MS ?? "20000");

  // BP-74 W3: the ONE-CALL server-side statewide fan-out — the point of the WO. Instead of the client
  // firing one `/advocate/{serial}/refresh` per registry scope (332 for Gujarat → ~600+ upstream calls
  // from the box EIP → a WAF self-DOS, BP-66), we POST a SINGLE `refresh-statewide` job that a rotating-IP
  // worker fans over EVERY court_scope for the state off its own disposable IP, then drains the CNRs. So a
  // district advocate is seeded across ALL districts, not just HC + one complex — with zero box-EIP burst.
  // Gated OFF by default (LD_ADVOCATE_STATEWIDE_FANOUT=1): the flip only activates once the on-demand
  // fan-out drainer is deployed (BP-74 W3a) — until then the per-scope loop (drained by the live fleet)
  // stays the path, so merging this can never strand onboarding on an undrained job.
  if (statewideFanoutEnabled() && council.stateCode != null) {
    const barState = (council.statePrefix ?? parsed.stateBar).toUpperCase();
    const p = new URLSearchParams({ year: String(parsed.year), bar_state: barState, state_code: String(council.stateCode) });
    void fetch(`${base}/advocate/${encodeURIComponent(serial)}/refresh-statewide?${p.toString()}`,
      { method: "POST", headers: H, signal: AbortSignal.timeout(refreshTimeout) }).catch(() => null);
    return true;
  }

  // Fallback (pre-W3a / a state with no registry): the per-scope client loop, drained by the live fleet.
  void Promise.allSettled(barSearchScopes(council).map((scope) => {
    const p = new URLSearchParams({ year: String(parsed.year), bar_state: scope.barState, state_code: String(scope.stateCode), tier: scope.tier });
    if (scope.courtCodeArr) p.set("court_code_arr", scope.courtCodeArr);
    else { p.set("dist_code", String(scope.distCode ?? 1)); p.set("court_code", String(scope.courtCode ?? 1)); }
    return fetch(`${base}/advocate/${encodeURIComponent(serial)}/refresh?${p.toString()}`,
      { method: "POST", headers: H, signal: AbortSignal.timeout(refreshTimeout) }).catch(() => null);
  }));
  return true;
}

// BP-74 W3 · statewide fan-out feature flag. Default OFF so merging the client flip is a no-op until the
// founder deploys the on-demand fan-out drainer (W3a) AND flips this on in the Vercel env — that ordering
// is what prevents onboarding jobs enqueueing against an empty drain.
export function statewideFanoutEnabled(): boolean {
  return process.env.LD_ADVOCATE_STATEWIDE_FANOUT === "1";
}

// The canonical fan-out job id the server keys on (STATE/SERIAL/YEAR) — what `refresh-statewide` returns
// and `GET /advocate/refresh/{job_id}` is polled by. Pure so it's tested offline.
export function advocateFanoutJobId(parsed: ParsedBarNumber, council: StateBarCouncil): string {
  const barState = (council.statePrefix ?? parsed.stateBar).toUpperCase();
  return `${barState}/${parsed.serial}/${parsed.year}`;
}

// The server's fan-out progress record (BP-74) — the `fanout` block of `GET /advocate/refresh/{job_id}`.
// Every field optional: the endpoint omits the block for a non-fan-out refresh, and we degrade gracefully.
export interface AdvocateFanoutStatus {
  done?: boolean;
  fanout?: {
    state?: string;                 // queued | running | done | failed
    scopes_planned?: number | null; // e.g. 332 for Gujarat
    scopes_searched?: number | null;
    cases_found?: number | null;
    scope_complete?: boolean;       // false = a WAF-stopped / partial sweep (honest)
    stopped?: boolean;
    coverage?: { searched?: number; returned?: number; empty?: number; failed?: number } | null;
  } | null;
}

// Read the statewide fan-out progress for a job (KEYED /v1 surface). WAREHOUSE/ledger read — never a live
// eCourts burst. Null on any error (missing key / unreachable / non-2xx) so callers degrade to prior copy.
export async function fetchAdvocateFanoutStatus(jobId: string): Promise<AdvocateFanoutStatus | null> {
  const key = process.env.LD_API_KEY;
  if (!key) return null;
  const base = process.env.LD_API_BASE || "http://13.202.148.71:8080";
  try {
    // job id carries slashes (STATE/SERIAL/YEAR) and the route is `{job_id:path}` — pass it RAW (its parts
    // are letters/digits), NOT percent-encoded, so the path converter captures the segments.
    const r = await fetch(`${base}/advocate/refresh/${jobId}`,
      { headers: { "X-API-Key": key }, signal: AbortSignal.timeout(Number(process.env.LD_API_TIMEOUT_MS ?? "60000")) });
    if (!r.ok) return null;
    return (await r.json()) as AdvocateFanoutStatus;
  } catch { return null; }
}

// WO-278: attribute a COLD advocate's freshly-INGESTED roster to their bar id. The async fleet ingests
// the roster CNRs into the warehouse over the minutes AFTER `startLiveAdvocateRefresh` fires — but the
// enrolment→CNR gold-link is written server-side ONLY when `GET /advocate/refresh/{job}` is polled
// (`roster_job_status` → `link_roster_cnrs` links the `state='done'` CNRs). Onboarding's harvest reads
// `GET /advocate/{bar}` (`advocate_profile`), which only READS those links — so without this poke a cold
// advocate's fleet-scraped roster is NEVER linked → the warehouse read returns 0 → onboarding stalls at
// "Paused" until a manual re-run. We poke the refresh endpoint for its server-side LINKING side-effect so
// the harvest's very next warehouse read finds the now-linked roster (it converges as the fleet drains).
// Guarded EXACTLY like `startLiveAdvocateRefresh` (LD_API_KEY + a parsed enrolment + a verified council):
// if no refresh could have been fired, there is nothing to link. Best-effort + idempotent (the server
// link is `ON CONFLICT DO NOTHING`); `fetchAdvocateFanoutStatus` already swallows all errors. Returns true
// iff a link poke was dispatched (for honest callers + the offline test).
export async function linkIngestedRoster(q: AdvocateQuery): Promise<boolean> {
  const parsed = parseBarNumber(q.barNumber);
  const council = stateBarCouncil(q.stateCode) ?? (parsed ? councilByStatePrefix(parsed.stateBar) : null);
  if (!process.env.LD_API_KEY || !parsed || !council?.verified) return false;
  // The GET runs `roster_job_status` server-side, which gold-links the roster's `done` CNRs to the bar id;
  // the returned status is unused here — we call it purely for that linking side-effect.
  await fetchAdvocateFanoutStatus(advocateFanoutJobId(parsed, council));
  return true;
}

// Honest "we searched N courts across <state>" coverage copy from the server fan-out record. NEVER a bare
// "0 cases" (info-integrity ⭐): a zero is framed as "none in the N courts we searched", and a WAF-stopped
// / partial run says so — so re-onboarding to finish reads as expected, not as "you have none". Returns
// null when there's no fan-out record to speak to (caller keeps its prior copy). Pure → tested offline.
export function advocateFanoutCoverageNote(status: AdvocateFanoutStatus | null, stateLabel: string): string | null {
  const f = status?.fanout;
  if (!f) return null;
  const searched = f.scopes_searched ?? f.coverage?.searched ?? f.scopes_planned ?? 0;
  if (!searched) return null;
  const courts = `${searched} court${searched === 1 ? "" : "s"}`;
  const where = stateLabel ? ` across ${stateLabel}` : "";
  const found = f.cases_found ?? 0;
  const cases = `${found} case${found === 1 ? "" : "s"}`;
  if (f.stopped || f.scope_complete === false) {
    return `Searched ${courts}${where} so far — a few timed out and finish on your next refresh; ${cases} found.`;
  }
  if (found === 0) {
    return `Searched ${courts}${where} — no cases on file for this bar number in the courts we searched.`;
  }
  return `Searched ${courts}${where} — ${cases} found.`;
}

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
export interface AdvocateFetchMeta {
  cases: FetchedAdvocateCase[];
  providers: string[];                                          // sources that were enabled + queried
  errors: { source: string; error: string; kind: FetchErrorKind }[]; // per-provider failures — RECORDED + CLASSIFIED, never swallowed
}

// Fetch across enabled providers, returning the merged cases AND diagnostics. WO-58: a provider that
// throws is captured in `errors` (not silently `.catch(() => [])`'d into a blank zero) so onboarding can
// tell the user WHY a fetch came back empty ("a source didn't respond") vs. "you genuinely have none"
// vs. "no source is configured" (empty `providers`). This is the anti-blackhole contract.
export async function fetchAdvocateCasesWithMeta(q: AdvocateQuery): Promise<AdvocateFetchMeta> {
  const enabled = PROVIDERS.filter((p) => p.enabled());
  const providers = enabled.map((p) => p.source);
  if (!q.name || q.name.trim().length < 3) return { cases: [], providers, errors: [] };
  const settled = await Promise.all(enabled.map((p) =>
    p.fetchByAdvocate(q)
      .then((cases) => ({ source: p.source, cases, error: null as string | null, kind: null as FetchErrorKind | null }))
      .catch((e) => ({
        source: p.source,
        cases: [] as FetchedAdvocateCase[],
        error: e instanceof Error ? e.message : "fetch failed",
        // Keep the provider's own classification (auth vs source_down); an unclassified throw → "unknown".
        kind: (e instanceof ProviderError ? e.kind : "unknown") as FetchErrorKind,
      }))));
  const stateGuard = q.barNumber && q.stateCode ? q.stateCode.trim().toUpperCase() : null;
  const merged: FetchedAdvocateCase[] = [];
  const seen = new Set<string>();
  for (const r of settled) {
    for (const c of r.cases) {
      // Authoritative bar-lookup rows always pass; fuzzy name rows must match the state.
      if (!passesStateGuard(c, stateGuard)) continue;
      const key = (c.cnr || c.caseNumber || c.title || "").trim().toUpperCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(c);
    }
  }
  return {
    cases: merged,
    providers,
    errors: settled.filter((r) => r.error).map((r) => ({ source: r.source, error: r.error!, kind: r.kind ?? "unknown" })),
  };
}

// ── Honest onboarding fetch note (WO-64) ─────────────────────────────────────
// The user-facing copy the onboarding fetch stage shows, chosen from the HONEST outcome. This is the
// fix for the incident's third failure: a set-but-wrong (401) key must read as "authentication failed —
// an admin must fix it", never the reassuring "still fetching…". Pure + exported so it's tested offline.
export const FETCH_NOTE = {
  // No provider configured at all (distinct from "we searched and you have none").
  notConfigured:
    "Court-data source isn’t configured here, so cases can’t be auto-fetched (an administrator must set LD_API_KEY). Your cause list and add-by-CNR still work.",
  // Set-but-wrong / rotted key → 401/403. Actionable, and NEVER shown as latency.
  authFailed:
    "We couldn’t fetch your cases — the court-data source rejected our credentials (authentication failed). An administrator must check LD_API_KEY. Your cause list and add-by-CNR still work.",
  // 5xx / unreachable — transient; we retry in the background.
  sourceDown:
    "The court-data source is temporarily unavailable — we’ll keep trying in the background. Your cause list and add-by-CNR still work.",
  // Auth is healthy, the async roster refresh is in flight — the ONLY case where "still fetching" is honest.
  fetching:
    "Fetching your cases from the court record — this can take a moment; they’ll appear as they arrive.",
} as const;

export function onboardingFetchNote(o: {
  providersConfigured: boolean;
  casesFetched: number;
  livePending: boolean;
  errors: { source: string; kind: FetchErrorKind }[];
}): string | null {
  if (!o.providersConfigured) return FETCH_NOTE.notConfigured;
  // Auth failure dominates: it's a hard misconfig, so it can never render as "still fetching".
  if (o.errors.some((e) => e.kind === "auth")) return FETCH_NOTE.authFailed;
  if (o.errors.some((e) => e.kind === "source_down")) return FETCH_NOTE.sourceDown;
  if (o.errors.length) {
    const names = [...new Set(o.errors.map((e) => e.source))].join(", ");
    return `Some court-data sources didn’t respond (${names}) — we’ll keep trying in the background.`;
  }
  if (o.casesFetched === 0 && o.livePending) return FETCH_NOTE.fetching;
  return null; // cases arrived (or none pending) → the counts speak; no note needed.
}

export async function fetchAdvocateCases(q: AdvocateQuery): Promise<FetchedAdvocateCase[]> {
  return (await fetchAdvocateCasesWithMeta(q)).cases;
}
