import type {
  AdvocateQuery, CaseSearchResult, CauseListItem, CauseListQuery, CourtOrder, NormalizedCase,
  NormalizedParty, NormalizedHearing, NormalizedOrderRef,
} from "./types";
import type { CourtDataClient } from "./client";

// Adapter for the LegalDriver court-data API (our own, compliant, licensed-consumption
// model — we call a REST API with a key; we do NOT scrape eCourts ourselves). Read-
// through/DB-first with a live-eCourts fallback on the provider side, so any CNR
// resolves. Base URL + key from env (LD_API_BASE / LD_API_KEY). See the API reference.

const DEFAULT_BASE = "http://13.202.148.71:8080";

type RawCase = {
  cnr: string; tier?: string; case_type?: string; status?: string;
  registration_number?: string | null; registration_year?: number | null; decision_date?: string | null;
  coram?: string | null; fir_no?: string | null; fir_year?: number | null; police_station?: string | null; source?: string;
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
  const re = /([A-Za-z][A-Za-z.\s&]*?)\((\d{2,6})\)/g; // NAME(bar)
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const nm = m[1].replace(/^[\s,.)0-9]+/, "").replace(/\s+/g, " ").trim(); // strip leaked party-marker leftovers
    if (isRealAdvocate(nm) && !ADV_NOISE.test(nm)) out.push({ name: nm, bar: m[2] });
  }
  if (out.length) return out;
  // No bar markers → plain name: cut at the first leaked party marker ("5)" / "12.2)") + noise.
  const plain = s.split(/\s+\d+[.\d]*\)/)[0].replace(/\s*\(\d+\)\s*$/, "").trim();
  return isRealAdvocate(plain) && !ADV_NOISE.test(plain) ? [{ name: plain }] : [];
}

export class LegalDriverClient implements CourtDataClient {
  readonly source = "legaldriver";
  constructor(private readonly apiKey: string, private readonly base: string = process.env.LD_API_BASE || DEFAULT_BASE) {}

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
    const parties: NormalizedParty[] = (r.parties ?? []).map((p) => ({ name: decode(p.name) || (p.name ?? ""), side: side(p.side) }));
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

    // Drop phantom placeholder orders (null date + "Order" + no PDF); keep real ones,
    // decode the title, and carry the signed pdf_url through when present.
    const orders: NormalizedOrderRef[] = (r.orders ?? [])
      .filter((o) => !(!o.order_date && (o.description ?? "").trim().toLowerCase() === "order" && !o.pdf_url))
      .map((o) => ({ id: String(o.order_id ?? ""), date: o.order_date ?? undefined, title: decode(o.description) || "Order", pdfUrl: o.pdf_url ?? undefined }));
    const acts = (r.acts ?? []).map((a) => decode(`${a.act_name ?? ""}${a.section ? ` ${a.section}` : ""}`).trim()).filter(Boolean);
    const coram = decode(r.coram) || undefined;

    // Title from English parties (fall back to regional / cnr).
    const pet = parties.find((p) => p.side === "petitioner")?.name || r.regional?.pet_name || "";
    const res = parties.find((p) => p.side === "respondent")?.name || r.regional?.res_name || "";
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
        decisionDate: r.decision_date, coram,
        firNo: r.fir_no, firYear: r.fir_year, policeStation: r.police_station,
        regional: r.regional ?? {}, processes: r.processes ?? [], advocateBars: advBars,
        liveSource: r._source, fetchedMs: r._fetched_ms,
      },
      source: this.source,
      fetchedAt: new Date().toISOString(),
    };
  }

  async getCaseByCNR(cnr: string): Promise<NormalizedCase | null> {
    const r = await this.req<RawCase>(`/case/${encodeURIComponent(cnr)}`);
    return r && r.cnr ? this.map(r) : null;
  }

  async searchByAdvocate(q: AdvocateQuery): Promise<CaseSearchResult[]> {
    // Prefer the exact bar-code endpoint (numeric); else fuzzy name → resolve bar → caseload.
    if (q.barNumber && /^\d+$/.test(q.barNumber)) {
      const r = await this.req<{ cases?: { cnr: string; case_type?: string; status?: string; tier?: string; registration_year?: number }[] }>(`/advocate/${encodeURIComponent(q.barNumber)}`);
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
    const r = await this.req<{ items?: { court_id?: string; item_no?: string; cnr?: string; title?: string }[]; cases?: unknown[] }>(`/cause-list?court_id=${encodeURIComponent(courtId)}&date=${encodeURIComponent(q.date)}`);
    const items = (r?.items ?? (Array.isArray(r?.cases) ? r?.cases : [])) as { item_no?: string; cnr?: string; title?: string }[];
    return items.map((it) => ({ listDate: q.date, court: courtId, itemNo: it.item_no, cnr: it.cnr, title: it.title, raw: it }));
  }

  async refreshCases(cnrs: string[]): Promise<NormalizedCase[]> {
    const out: NormalizedCase[] = [];
    for (const cnr of cnrs.slice(0, 50)) {
      const r = await this.req<RawCase>(`/case/${encodeURIComponent(cnr)}/refresh`, { method: "POST" });
      if (r?.cnr) out.push(this.map(r));
    }
    return out;
  }

  async getOrder(cnr: string, orderId: string): Promise<CourtOrder | null> {
    // Per the API: PDFs are streamed durably via /order/{id}/pdf (our /api/court/order-pdf
    // proxy does this). This helper returns the stable stream path (never a presigned URL —
    // those expire) + extracted text. ?fetch=true pulls a missing district PDF live.
    const data = await this.req<{ orders?: { order_id?: number | string; has_pdf?: boolean; pdf_stream?: string | null; text?: string | null }[] }>(`/case/${encodeURIComponent(cnr)}/orders?fetch=true&text=true`);
    const o = (data?.orders ?? []).find((x) => String(x.order_id ?? "") === String(orderId));
    if (!o) return null;
    const streamPath = o.pdf_stream ?? (o.has_pdf ? `/order/${encodeURIComponent(orderId)}/pdf` : undefined);
    return { id: orderId, cnr, pdfUrl: streamPath ? `${this.base}${streamPath}` : undefined, markdown: o.text ?? undefined };
  }
}
