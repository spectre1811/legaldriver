import type {
  AdvocateQuery, CaseSearchResult, CauseListItem, CauseListListing, CauseListQuery, CourtOrder,
  NormalizedCase, NormalizedParty, NormalizedHearing, NormalizedOrderRef,
} from "./types";
import type { CourtDataClient } from "./client";
import { isMaskedName, maskName } from "./mask";

// Adapter for the LegalDriver court-data API (our own, compliant, licensed-consumption
// model — we call a REST API with a key; we do NOT scrape eCourts ourselves). Read-
// through/DB-first with a live-eCourts fallback on the provider side, so any CNR
// resolves. Base URL + key from env (LD_API_BASE / LD_API_KEY). See the API reference.
//
// KEYED surface (BP-11 / founder ruling FG-2): this client consumes the KEYED `/v1/*`
// surface (X-API-Key) — the authed advocate app gets the FULL record: real order PDFs
// (streamed via the durable `pdf_stream`, never a persisted presigned URL), live-eCourts
// fallback, no PII suppression. That is the documented carve-out for the licensed
// professional surface. It must NEVER call `/v1/public/*` — that suppression-clean,
// cache-only, `has_pdf`-only surface is for peshi-search/SEO/MCP (a different consumer).
// Contract: ecourts-scraper `docs/decisions/2026-07-05-keyed-vs-public-v1-surface.md`.

// FAIL CLOSED (WO-190, WO-52 pattern — see peshi's upstream.ts): there is NO hardcoded prod-IP
// fallback. A missing LD_API_BASE is a configuration error surfaced loudly at construction time —
// never a silent default to a raw origin IP, which (a) rots the day the box IP changes and (b)
// bakes an origin IP into the app. CI/Vercel set the env; a deploy without it fails fast with a
// clear message instead of talking to a ghost.
function resolveBase(): string {
  const base = process.env.LD_API_BASE;
  if (!base) {
    throw new Error(
      "LD_API_BASE is not set — refusing to consume court data with no configured API base (fail-closed, WO-190/WO-52).",
    );
  }
  return base;
}

// Sync contract (02-DATA §3): we consume the versioned /v1 surface and the provider stamps
// every /v1 response with `schema_version`. We pin the MAJOR we were built against; a major
// mismatch means a breaking provider change → warn loudly (once) so it surfaces in logs
// without hard-failing a lawyer's add-case. Additive/minor changes are ignored by design.
const SYNC_SCHEMA_MAJOR = 1;
let warnedSchema = false;

type RawCase = {
  schema_version?: string;
  cnr: string; tier?: string; case_type?: string; status?: string;
  registration_number?: string | null; registration_year?: number | null; decision_date?: string | null;
  // WO-41: eCourts provides these + the mobile ingest already parses them — carry them through the
  // contract so the case page stops showing a false "not on record" for data we hold.
  filing_number?: string | null; filing_date?: string | null; first_hearing_date?: string | null;
  registration_date?: string | null; district?: string | null; state?: string | null;
  coram?: string | null; fir_no?: string | null; fir_year?: number | null; police_station?: string | null; source?: string;
  // WO-69b: bench type + judicial branch (coram is the real judge platform-side now; state above).
  bench_type?: string | null; judicial_branch?: string | null;
  // WO-69: rich case-detail blocks eCourts sends as composite strings (parsed platform-side). FIR is
  // above; these are the remaining sections the case page was missing.
  disposal_nature?: string | null;
  category?: { category?: string | null; sub_category?: string | null; sub_sub_category?: string | null } | null;
  subordinate_court?: { decision_date?: string | null; case_number?: string | null; court?: string | null; district?: string | null } | null;
  documents?: { doc_no?: number | string; document?: string | null; filed_by?: string | null; advocate?: string | null; filed_date?: string | null }[];
  objections?: { sr_no?: string | null; objection?: string | null; scrutiny_date?: string | null; receipt_date?: string | null; compliance_date?: string | null }[];
  regional?: Record<string, string | null>;
  parties?: { side?: string; name?: string; name_regional?: string | null }[];
  advocates?: { name?: string; bar_id?: string | null; side?: string }[];
  hearings?: { business_date?: string | null; hearing_date?: string | null; purpose?: string | null; judge?: string | null }[];
  acts?: { act_name?: string; section?: string | null }[];
  orders?: { order_id?: number; order_date?: string | null; description?: string | null; has_text?: boolean; pdf_url?: string | null }[];
  processes?: { process_id?: string; process_date?: string | null; title?: string | null }[];
  _source?: string; _fetched_ms?: number;
};

const side = (s?: string): NormalizedParty["side"] => {
  const l = (s ?? "").toLowerCase();
  return l.includes("pet") || l.includes("applicant") || l.includes("complainant") ? "petitioner"
    : l.includes("res") || l.includes("opponent") || l.includes("accused") ? "respondent" : "other";
};

// The API leaks HTML entities (often double-encoded, e.g. "&amp;amp;") in coram /
// judge / name fields — decode before storing/displaying.
function decode(s?: string | null): string {
  if (!s) return "";
  let t = s;
  for (let i = 0; i < 2; i++) t = t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'");
  return t.trim();
}
// On HC cases the API explodes an advocate name string into per-character junk rows
// ({"name":"P"},{"name":"A"},{"name":"1"}…) — keep only real names.
function isRealAdvocate(name: string): boolean {
  return name.length >= 3 && /[a-z]/i.test(name) && !/^\d+$/.test(name);
}
// Court-process noise that leaks into advocate values on multi-party rows.
const ADV_NOISE = /\b(NOTICE|RULE|SERVED|UNSERVED|APPEARANCE|EXPARTE|LEGAL HEIR|REPRESENTATIVE|DELETED|ORDER)\b/i;
// Mirror of the API's split_advocate_value (DATA_QUALITY §1): a multi-party advocate
// field concatenates several advocates + leaks the next party's "N)" marker, e.g.
// "MR X(5950) ,BHARGAV P THAKAR(8194) 5) LEGAL HEIRS…". The "(NNNN)" bar-council markers
// are reliable split points — recover each NAME(bar); else it's a plain single name.
// No-op on already-clean values.
function splitAdvocateValue(raw?: string | null): { name: string; bar?: string }[] {
  const s = decode(raw);
  if (!s) return [];
  const out: { name: string; bar?: string }[] = [];
  // Bar id is inline in two formats: HC numeric "NAME(7260)" and district slash-form
  // "NAME G/3350/2020" (state-bar reg). Extract each advocate + its bar.
  const re = /([A-Za-z][A-Za-z.\s&]*?)(?:\((\d{2,6})\)|\s+([A-Za-z]\/\d+\/\d{2,4}))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const nm = m[1].replace(/^[\s,.)0-9]+/, "").replace(/\s+/g, " ").trim(); // strip leaked party-marker leftovers
    if (isRealAdvocate(nm) && !ADV_NOISE.test(nm)) out.push({ name: nm, bar: m[2] ?? m[3] });
  }
  if (out.length) return out;
  // No bar markers → plain name: cut at the first leaked party marker ("5)" / "12.2)"),
  // any trailing (bar) or slash-bar, + noise.
  const plain = s.split(/\s+\d+[.\d]*\)/)[0].replace(/\s*\(\d+\)\s*$/, "").replace(/\s+[A-Za-z]\/\d+\/\d{2,4}\s*$/, "").trim();
  return isRealAdvocate(plain) && !ADV_NOISE.test(plain) ? [{ name: plain }] : [];
}
// A bar id is numeric (HC) or slash-form "G/NN/YYYY" (district state bar).
function isBarId(b: string): boolean { return /^\d+$/.test(b) || /^[A-Za-z]\/\d+\/\d{2,4}$/.test(b); }
// Build the /advocate/{bar} path preserving slashes (the API uses a :path param).
function barPath(b: string): string { return b.split("/").map(encodeURIComponent).join("/"); }

export class LegalDriverClient implements CourtDataClient {
  readonly source = "legaldriver";
  constructor(private readonly apiKey: string, private readonly base: string = resolveBase()) {}

  // Soft schema-version guard for /v1 sync responses. Warns once per process on a MAJOR
  // mismatch; never throws (a stale-but-usable payload still beats blocking the user).
  private checkSchema(version?: string): void {
    if (!version || warnedSchema) return;
    const major = Number(String(version).split(".")[0]);
    if (Number.isFinite(major) && major !== SYNC_SCHEMA_MAJOR) {
      warnedSchema = true;
      console.warn(`[court:legaldriver] sync API schema_version=${version} but client expects major ${SYNC_SCHEMA_MAJOR} — verify the /v1 contract (02-DATA §3).`);
    }
  }

  private async req<T>(path: string, init?: RequestInit): Promise<T | null> {
    try {
      const res = await fetch(`${this.base}${path}`, {
        ...init,
        headers: { "X-API-Key": this.apiKey, ...(init?.headers ?? {}) },
        // Provider is called on add-case / refresh / onboarding — allow for a live eCourts hop (~3-6s).
        signal: AbortSignal.timeout(Number(process.env.LD_API_TIMEOUT_MS ?? "60000")),
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch { return null; }
  }

  private map(r: RawCase): NormalizedCase {
    const parties: NormalizedParty[] = (r.parties ?? []).map((p) => {
      const name = decode(p.name) || (p.name ?? "");
      return { name, side: side(p.side), masked: isMaskedName(name) };
    });
    // Attach advocates to their side's party; collect VALID advocate names + bar ids
    // (filter the per-character junk rows the API emits on HC cases; dedupe; keep bar).
    const advBars: Record<string, string> = {};
    const seenAdv = new Set<string>();
    for (const a of r.advocates ?? []) {
      const s = side(a.side);
      // Split any multi-party garbled concatenation into individual advocates (no-op if clean).
      for (const adv of splitAdvocateValue(a.name)) {
        const bar = adv.bar ?? (a.bar_id ? String(a.bar_id) : undefined);
        if (bar) advBars[adv.name] = bar; // capture the bar id from whichever segment/row has it
        if (seenAdv.has(adv.name)) continue;
        seenAdv.add(adv.name);
        const party = parties.find((p) => p.side === s && !p.advocate);
        if (party) party.advocate = adv.name;
      }
    }
    // eCourts hearing model: the court did business ON `business_date` and FIXED the
    // next date to `hearing_date`. So the HISTORY of sittings = business_dates (with
    // purpose + bench), and the UPCOMING hearing = the hearing_date fixed at the most
    // recent sitting. (Using hearing_date as the sitting date is wrong — it shows the
    // next date as if it were a past hearing.)
    const rawHearings = r.hearings ?? [];
    const disposed = (r.status ?? "").toUpperCase().includes("DISPOSED");
    const sittings = rawHearings.filter((h) => h.business_date).sort((a, b) => String(a.business_date).localeCompare(String(b.business_date)));
    const lastSitting = sittings[sittings.length - 1];
    const nextHearingDate = disposed ? null : ((lastSitting?.hearing_date ?? null) || null)?.slice(0, 10) ?? null;

    const hearings: NormalizedHearing[] = [];
    const seenH = new Set<string>();
    const pushHearing = (date?: string | null, purpose?: string | null, judge?: string | null, raw?: unknown) => {
      const d = (date ?? "").slice(0, 10);
      const key = `${d}|${purpose ?? ""}`;
      if (!d || seenH.has(key)) return;
      seenH.add(key);
      hearings.push({ date: d, purpose: decode(purpose) || undefined, judge: decode(judge) || undefined, raw: raw ?? {} });
    };
    for (const h of sittings) pushHearing(h.business_date, h.purpose, h.judge, h);            // past sittings
    if (nextHearingDate) pushHearing(nextHearingDate, "Next hearing (as listed)", lastSitting?.judge, { scheduled: true }); // upcoming → calendar + reminders
    for (const h of rawHearings.filter((x) => !x.business_date && x.hearing_date)) pushHearing(h.hearing_date, h.purpose ?? "Listed", h.judge, h); // purely-scheduled rows
    hearings.sort((a, b) => a.date.localeCompare(b.date));

    // Keep every order that has a provider id (dedup by id). We do NOT drop dateless
    // "Order" rows: district orders are legitimately dateless with pdf_url:null at /case
    // time yet have a REAL PDF fetched on demand on first click (/order/{id}/pdf → S3).
    // Filtering them by the null-date heuristic hid genuine PDFs (e.g. GJBN050013102026).
    // PDF availability is resolved at click-time by the streaming route, not guessed here.
    const seenOrder = new Set<string>();
    const orders: NormalizedOrderRef[] = (r.orders ?? [])
      .filter((o) => o.order_id != null && String(o.order_id) !== "")
      .filter((o) => { const k = String(o.order_id); if (seenOrder.has(k)) return false; seenOrder.add(k); return true; })
      .map((o) => ({ id: String(o.order_id), date: o.order_date ?? undefined, title: decode(o.description) || "Order", pdfUrl: o.pdf_url ?? undefined }));
    const acts = (r.acts ?? []).map((a) => decode(`${a.act_name ?? ""}${a.section ? ` ${a.section}` : ""}`).trim()).filter(Boolean);
    const coram = decode(r.coram) || undefined;

    // Title from English parties (fall back to regional / cnr). Mask protected-matter names so the
    // stored/displayed title is never "XXXXXXX v. XXXXXXX" (BP-24) — either side masks independently.
    const pet = maskName(parties.find((p) => p.side === "petitioner")?.name || r.regional?.pet_name || "");
    const res = maskName(parties.find((p) => p.side === "respondent")?.name || r.regional?.res_name || "");
    const title = pet && res ? `${pet} v. ${res}` : pet || res || r.cnr;

    return {
      cnr: r.cnr,
      title,
      court: coram || r.tier || undefined,
      caseType: r.case_type ?? undefined,
      status: r.status ?? undefined,
      parties,
      judge: coram,
      judges: coram ? [coram] : [],
      nextHearingDate,
      hearings,
      orders,
      acts,
      detail: {
        // camelCase keys the case-page info grid already reads, plus the LD extras.
        tier: r.tier, registrationNumber: r.registration_number, registrationYear: r.registration_year,
        // WO-41: keys match exactly what cases/[id]/page.tsx reads (mixed case is intentional).
        filingNumber: r.filing_number, filingDate: r.filing_date, first_hearing_date: r.first_hearing_date,
        registrationDate: r.registration_date, district: r.district, state: r.state,
        // WO-69b: bench type + judicial branch feed the info grid (sourced:false, show-if-present).
        bench_type: r.bench_type, judicial_branch: r.judicial_branch,
        decisionDate: r.decision_date, coram,
        firNo: r.fir_no, firYear: r.fir_year, policeStation: r.police_station,
        // WO-69: nature-of-disposal + category (tri-level) + subordinate court + court filings +
        // objections. Category/subordinate feed the info grid (show-if-present, `sourced:false` so a
        // civil case with none is silently omitted, never a false "not on record"); documents +
        // objections render as their own on-record sections.
        disposal_nature: r.disposal_nature ?? null,
        category: r.category?.category ?? null,
        sub_category: r.category?.sub_category ?? null,
        sub_sub_category: r.category?.sub_sub_category ?? null,
        subordinate_court: r.subordinate_court
          ? ([r.subordinate_court.court, r.subordinate_court.case_number].filter(Boolean).map((x) => decode(x)).join(" · ") || null)
          : null,
        subordinateCourt: r.subordinate_court ?? null,
        documents: (r.documents ?? []).map((d) => ({
          docNo: d.doc_no, document: decode(d.document) || null, filedBy: decode(d.filed_by) || null,
          advocate: decode(d.advocate) || null, filedDate: d.filed_date ?? null,
        })),
        objections: (r.objections ?? []).map((o) => ({
          srNo: o.sr_no ?? null, objection: decode(o.objection) || null,
          scrutinyDate: o.scrutiny_date ?? null, receiptDate: o.receipt_date ?? null, complianceDate: o.compliance_date ?? null,
        })),
        regional: r.regional ?? {}, processes: r.processes ?? [], advocateBars: advBars,
        liveSource: r._source, fetchedMs: r._fetched_ms,
      },
      source: this.source,
      fetchedAt: new Date().toISOString(),
    };
  }

  async getCaseByCNR(cnr: string): Promise<NormalizedCase | null> {
    const r = await this.req<RawCase>(`/v1/cases/${encodeURIComponent(cnr)}`);
    this.checkSchema(r?.schema_version);
    return r && r.cnr ? this.map(r) : null;
  }

  async searchByAdvocate(q: AdvocateQuery): Promise<CaseSearchResult[]> {
    // Prefer the exact bar-code endpoint (numeric HC or slash-form district); else fuzzy
    // name → resolve bar → caseload. Slashes are kept raw (the API uses a :path param).
    if (q.barNumber && isBarId(q.barNumber)) {
      const r = await this.req<{ cases?: { cnr: string; case_type?: string; status?: string; tier?: string; registration_year?: number }[] }>(`/advocate/${barPath(q.barNumber)}`);
      return (r?.cases ?? []).map((c) => ({ cnr: c.cnr, title: `${c.case_type ?? "Case"}${c.registration_year ? ` (${c.registration_year})` : ""}`, court: c.tier }));
    }
    if (q.name) {
      const s = await this.req<{ results?: { bar_id?: string }[] }>(`/search/advocate?name=${encodeURIComponent(q.name)}`);
      const barIds = [...new Set((s?.results ?? []).map((r) => r.bar_id).filter((b): b is string => !!b))].slice(0, 3);
      const out: CaseSearchResult[] = [];
      for (const bar of barIds) out.push(...(await this.searchByAdvocate({ barNumber: bar })));
      return out;
    }
    return [];
  }

  async getCauseList(q: CauseListQuery): Promise<CauseListItem[]> {
    // LD cause-list is court-scoped (court_id+date), not advocate-scoped; onboarding uses
    // searchByAdvocate for the caseload instead. Support the court-scoped form when given.
    const courtId = q.court;
    if (!courtId) return [];
    const r = await this.req<{ schema_version?: string; items?: { court_id?: string; item_no?: string; item_number?: string; cnr?: string; title?: string; parties?: string; advocate?: string }[]; cases?: unknown[] }>(`/v1/cause-lists?court_id=${encodeURIComponent(courtId)}&date=${encodeURIComponent(q.date)}`);
    this.checkSchema(r?.schema_version);
    const items = (r?.items ?? (Array.isArray(r?.cases) ? r?.cases : [])) as { item_no?: string; item_number?: string; cnr?: string; title?: string; parties?: string }[];
    return items.map((it) => ({ listDate: q.date, court: courtId, itemNo: it.item_no ?? it.item_number, cnr: it.cnr, title: it.title ?? it.parties, raw: it }));
  }

  // WO-205 W3 · On-demand cause-list fetch. A held miss for a District court+date enqueues a
  // priority live fetch (the founder-opened FG-6 lane). We need the raw HTTP STATUS (200 found/empty
  // · 202 fetching · 422 not-a-record/HC), which `req()` collapses to null — so this does its own
  // fetch. The API-key stays server-side (this runs only from the /api/court/cause-list-fetch route).
  async requestCauseListFetch(courtId: string, date: string): Promise<{ status: number; hasItems: boolean }> {
    try {
      const res = await fetch(`${this.base}/v1/cause-lists/fetch`, {
        method: "POST",
        headers: { "X-API-Key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ court_id: courtId, date }),
        signal: AbortSignal.timeout(Number(process.env.LD_API_TIMEOUT_MS ?? "60000")),
      });
      // A 200 may carry a just-served board (found) or an honest-empty; peek at items for the caller.
      let hasItems = false;
      if (res.status === 200) {
        const body = (await res.json().catch(() => null)) as { items?: unknown[]; cases?: unknown[] } | null;
        hasItems = (body?.items?.length ?? 0) > 0 || (Array.isArray(body?.cases) && body!.cases!.length > 0);
      }
      return { status: res.status, hasItems };
    } catch {
      // Network/abort → surface as a transient error (never a fake empty; WO-68 rule).
      return { status: 0, hasItems: false };
    }
  }

  async getCauseListByCNRs(cnrs: string[], date: string): Promise<CauseListListing[]> {
    // Ask the internal API which of our tracked CNRs are listed on `date` (across any court).
    // Batched so the query string stays bounded; dedupe + normalize CNRs first.
    const uniq = [...new Set(cnrs.map((c) => c.trim().toUpperCase()).filter(Boolean))];
    const out: CauseListListing[] = [];
    for (let i = 0; i < uniq.length; i += 100) {
      const qs = uniq.slice(i, i + 100).map((c) => `cnr=${encodeURIComponent(c)}`).join("&");
      const r = await this.req<{ schema_version?: string; items?: { cnr?: string; item_number?: string | number; case_number?: string; cause_list_type?: string; parties?: string; advocate?: string; judge?: string; court_id?: number; list_date?: string }[] }>(`/v1/cause-lists/by-cnr?date=${encodeURIComponent(date)}&${qs}`);
      this.checkSchema(r?.schema_version);
      for (const it of r?.items ?? []) {
        if (!it.cnr) continue;
        out.push({
          cnr: it.cnr, listDate: it.list_date ?? date,
          itemNo: it.item_number != null ? String(it.item_number) : undefined,
          caseNumber: it.case_number || undefined, type: it.cause_list_type || undefined,
          parties: decode(it.parties) || undefined, advocate: it.advocate || undefined,
          judge: decode(it.judge) || undefined, courtId: it.court_id,
        });
      }
    }
    return out;
  }

  async refreshCases(cnrs: string[]): Promise<NormalizedCase[]> {
    const out: NormalizedCase[] = [];
    for (const cnr of cnrs.slice(0, 50)) {
      const r = await this.req<RawCase>(`/v1/cases/${encodeURIComponent(cnr)}/refresh`, { method: "POST" });
      this.checkSchema(r?.schema_version);
      if (r?.cnr) out.push(this.map(r));
    }
    return out;
  }

  async getOrder(cnr: string, orderId: string): Promise<CourtOrder | null> {
    // Per the API: PDFs are streamed durably via /order/{id}/pdf (our /api/court/order-pdf
    // proxy does this). This helper returns the stable stream path (never a presigned URL —
    // those expire) + extracted text. ?fetch=true pulls a missing district PDF live.
    const data = await this.req<{ schema_version?: string; orders?: { order_id?: number | string; has_pdf?: boolean; pdf_stream?: string | null; text?: string | null }[] }>(`/v1/cases/${encodeURIComponent(cnr)}/orders?fetch=true&text=true`);
    this.checkSchema(data?.schema_version);
    const o = (data?.orders ?? []).find((x) => String(x.order_id ?? "") === String(orderId));
    if (!o) return null;
    const streamPath = o.pdf_stream ?? (o.has_pdf ? `/order/${encodeURIComponent(orderId)}/pdf` : undefined);
    return { id: orderId, cnr, pdfUrl: streamPath ? `${this.base}${streamPath}` : undefined, markdown: o.text ?? undefined };
  }
}

// ── On-demand cause-list lane wiring (WO-205 W3) ──────────────────────────────────────────────
// The UI depends only on this seam, never the fetch mechanism (queue/drainer). The lane is LIVE
// only when the keyed provider is active AND the W2 endpoint is enabled in prod — a single flag the
// route + page gate on, so the whole page ships (cascade + held board) before W2 lands and the
// on-demand call simply no-ops to honest-empty until then.

/** Whether the live on-demand cause-list fetch lane is available (keyed provider + W2 flag ON).
 *  Off → a District miss renders the honest-empty state, never a spinner for a lane that can't run.
 *  `LD_ONDEMAND_CAUSELIST=1` flips it on once W2 is verified live in prod (default OFF, ship-safe). */
export function hasOnDemandCauseList(): boolean {
  const { getCourtDataClient } = require("./client") as typeof import("./client");
  return getCourtDataClient().source === "legaldriver" && process.env.LD_ONDEMAND_CAUSELIST === "1";
}

/** Enqueue an on-demand cause-list fetch via the keyed client. Returns the raw status class for the
 *  route to hand the island. When the lane is off (or the active provider isn't the keyed one), we
 *  return a synthetic 200/empty so the caller falls to the honest-empty state (never a live call). */
export async function requestCauseListFetch(
  courtId: string,
  date: string,
): Promise<{ status: number; hasItems: boolean }> {
  if (!hasOnDemandCauseList()) return { status: 200, hasItems: false };
  const { getCourtDataClient } = require("./client") as typeof import("./client");
  const client = getCourtDataClient() as LegalDriverClient;
  return client.requestCauseListFetch(courtId, date);
}
