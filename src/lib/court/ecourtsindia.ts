import type { CourtDataClient } from "./client";
import type {
  AdvocateQuery,
  CaseSearchResult,
  CauseListItem,
  CauseListQuery,
  CourtOrder,
  NormalizedCase,
  NormalizedHearing,
  NormalizedParty,
} from "./types";

// Live adapter for eCourtsIndia (https://webapi.ecourtsindia.com, Bearer auth).
// Endpoint paths follow the published /api/partner/* contract. Response field
// names are mapped defensively (multiple likely keys) and normalized centrally,
// so the rest of the app is insulated from provider quirks. NOTE: this host's IP
// is WAF-blocked by the provider; live-verify field mappings on the deployed env
// (see docs/decisions/2026-06-24-court-data-strategy.md).

const BASE = process.env.ECOURTSINDIA_BASE_URL ?? "https://webapi.ecourtsindia.com";

type Json = Record<string, unknown>;
const str = (o: Json, ...keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return String(v);
  }
  return undefined;
};
const arr = (o: Json, ...keys: string[]): Json[] => {
  for (const k of keys) {
    const v = o?.[k];
    if (Array.isArray(v)) return v as Json[];
  }
  return [];
};

export class ECourtsIndiaClient implements CourtDataClient {
  readonly source = "ecourtsindia";
  constructor(private readonly token: string) {}

  private async req(path: string, init?: RequestInit): Promise<Json | null> {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
      // never cache court data fetches
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      // No PII in logs: only status + path, never response bodies/tokens.
      throw new Error(`eCourtsIndia ${init?.method ?? "GET"} ${path} -> ${res.status}`);
    }
    return (await res.json()) as Json;
  }

  private normalizeCase(raw: Json, cnr: string): NormalizedCase {
    const data = (raw.data as Json) ?? raw;
    const parties: NormalizedParty[] = arr(data, "parties", "petitioners", "litigants").map((p) => ({
      name: str(p, "name", "party_name") ?? "",
      side: (str(p, "side", "type") as NormalizedParty["side"]) ?? "other",
      advocate: str(p, "advocate", "advocate_name"),
    }));
    const hearings: NormalizedHearing[] = arr(data, "hearings", "history", "case_history").map((h) => ({
      date: (str(h, "date", "hearing_date", "business_date") ?? "").slice(0, 10),
      purpose: str(h, "purpose", "business", "stage"),
      courtNo: str(h, "court_no", "court_number"),
      judge: str(h, "judge", "coram"),
      raw: h,
    }));
    const orders = arr(data, "orders", "judgments").map((o, i) => ({
      id: str(o, "id", "order_id") ?? `${cnr}-ORD-${i + 1}`,
      date: str(o, "date", "order_date"),
      title: str(o, "title", "subject"),
    }));
    return {
      cnr,
      title: str(data, "title", "case_title", "case_name") ?? cnr,
      court: str(data, "court", "court_name", "establishment"),
      caseType: str(data, "case_type", "type"),
      stage: str(data, "stage", "case_stage"),
      status: str(data, "status", "case_status"),
      parties,
      judge: str(data, "judge", "coram"),
      nextHearingDate: (str(data, "next_hearing_date", "next_date") ?? null)?.slice(0, 10) ?? null,
      hearings,
      orders,
      source: this.source,
      fetchedAt: new Date().toISOString(),
    };
  }

  async getCaseByCNR(cnr: string): Promise<NormalizedCase | null> {
    const raw = await this.req(`/api/partner/case/${encodeURIComponent(cnr)}`);
    return raw ? this.normalizeCase(raw, cnr.toUpperCase()) : null;
  }

  async searchByAdvocate(q: AdvocateQuery): Promise<CaseSearchResult[]> {
    const raw = await this.req(`/api/partner/search`, {
      method: "POST",
      body: JSON.stringify({
        advocate_name: q.name,
        advocate_bar_number: q.barNumber,
        court: q.court,
        state: q.stateCode,
      }),
    });
    if (!raw) return [];
    return arr((raw.data as Json) ?? raw, "results", "cases").map((c) => ({
      cnr: str(c, "cnr", "cnr_number") ?? "",
      title: str(c, "title", "case_title") ?? "",
      court: str(c, "court", "court_name"),
      parties: str(c, "parties"),
    }));
  }

  async getCauseList(q: CauseListQuery): Promise<CauseListItem[]> {
    const raw = await this.req(`/api/partner/causelist/search`, {
      method: "POST",
      body: JSON.stringify({
        date: q.date,
        advocate_name: q.name,
        advocate_bar_number: q.barNumber,
        court: q.court,
        state: q.stateCode,
      }),
    });
    if (!raw) return [];
    return arr((raw.data as Json) ?? raw, "items", "entries", "results").map((e) => ({
      listDate: (str(e, "list_date", "date") ?? q.date).slice(0, 10),
      court: str(e, "court", "court_name"),
      itemNo: str(e, "item_no", "serial_no"),
      cnr: str(e, "cnr", "cnr_number"),
      title: str(e, "title", "case_title"),
      raw: e,
    }));
  }

  async refreshCases(cnrs: string[]): Promise<NormalizedCase[]> {
    const batch = cnrs.slice(0, 50);
    const raw = await this.req(`/api/partner/refresh`, {
      method: "POST",
      body: JSON.stringify({ cnrs: batch }),
    });
    const cases = raw ? arr((raw.data as Json) ?? raw, "cases", "results") : [];
    return cases.map((c, i) => this.normalizeCase(c, str(c, "cnr", "cnr_number") ?? batch[i]));
  }

  async getOrder(cnr: string, orderId: string): Promise<CourtOrder | null> {
    const raw = await this.req(
      `/api/partner/order/${encodeURIComponent(cnr)}/${encodeURIComponent(orderId)}`,
    );
    if (!raw) return null;
    const data = (raw.data as Json) ?? raw;
    return {
      id: orderId,
      cnr,
      date: str(data, "date", "order_date"),
      pdfUrl: str(data, "pdf_url", "signed_pdf", "url"),
      markdown: str(data, "markdown", "ocr_markdown", "text"),
      aiSummary: str(data, "ai_summary", "summary"),
    };
  }
}
