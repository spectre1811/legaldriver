import type {
  AdvocateQuery, CaseSearchResult, CauseListItem, CauseListQuery, CourtOrder, NormalizedCase,
  NormalizedParty, NormalizedHearing, NormalizedOrderRef,
} from "./types";
import type { CourtDataClient } from "./client";

// Adapter for the LegalDriver court-data API (our own, compliant, licensed-consumption
// model — we call a REST API with a key; we do NOT scrape eCourts ourselves). Read-
// through/DB-first with a live-eCourts fallback on the provider side, so any CNR
// resolves. Base URL + key from env (LD_API_BASE / LD_API_KEY). See the API reference.

const DEFAULT_BASE = "http://43.205.90.255:8080";

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
    const parties: NormalizedParty[] = (r.parties ?? []).map((p) => ({ name: p.name ?? "", side: side(p.side) }));
    // Attach advocates to their side's party; collect all advocate names + bar ids.
    const advBars: Record<string, string> = {};
    for (const a of r.advocates ?? []) {
      if (a.name && a.bar_id) advBars[a.name] = a.bar_id;
      const s = side(a.side);
      const party = parties.find((p) => p.side === s && !p.advocate);
      if (party && a.name) party.advocate = a.name;
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
      hearings.push({ date: d, purpose: purpose ?? undefined, judge: judge ?? undefined, raw: raw ?? {} });
    };
    for (const h of sittings) pushHearing(h.business_date, h.purpose, h.judge, h);            // past sittings
    if (nextHearingDate) pushHearing(nextHearingDate, "Next hearing (as listed)", lastSitting?.judge, { scheduled: true }); // upcoming → calendar + reminders
    for (const h of rawHearings.filter((x) => !x.business_date && x.hearing_date)) pushHearing(h.hearing_date, h.purpose ?? "Listed", h.judge, h); // purely-scheduled rows
    hearings.sort((a, b) => a.date.localeCompare(b.date));

    const orders: NormalizedOrderRef[] = (r.orders ?? []).map((o) => ({ id: String(o.order_id ?? ""), date: o.order_date ?? undefined, title: o.description ?? "Order" }));
    const acts = (r.acts ?? []).map((a) => `${a.act_name ?? ""}${a.section ? ` ${a.section}` : ""}`.trim()).filter(Boolean);

    // Title from English parties (fall back to regional / cnr).
    const pet = parties.find((p) => p.side === "petitioner")?.name || r.regional?.pet_name || "";
    const res = parties.find((p) => p.side === "respondent")?.name || r.regional?.res_name || "";
    const title = pet && res ? `${pet} v. ${res}` : pet || res || r.cnr;

    return {
      cnr: r.cnr,
      title,
      court: r.coram || r.tier || undefined,
      caseType: r.case_type ?? undefined,
      status: r.status ?? undefined,
      parties,
      judge: r.coram ?? undefined,
      judges: r.coram ? [r.coram] : [],
      nextHearingDate,
      hearings,
      orders,
      acts,
      detail: {
        // camelCase keys the case-page info grid already reads, plus the LD extras.
        tier: r.tier, registrationNumber: r.registration_number, registrationYear: r.registration_year,
        decisionDate: r.decision_date, coram: r.coram,
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
    // The direct /order/{id}/pdf proxy returns 502; the working path is the case's
    // orders list (with ?fetch=true it pulls missing PDFs live), which carries a
    // time-limited signed S3 pdf_url per order. Pick the matching order.
    const data = await this.req<{ orders?: { order_id?: number | string; pdf_url?: string | null; text?: string | null }[] }>(`/case/${encodeURIComponent(cnr)}/orders?fetch=true`);
    const o = (data?.orders ?? []).find((x) => String(x.order_id ?? "") === String(orderId));
    if (!o) return null;
    return { id: orderId, cnr, pdfUrl: o.pdf_url ?? undefined, markdown: o.text ?? undefined };
  }
}
