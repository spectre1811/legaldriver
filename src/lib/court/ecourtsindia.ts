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
const strArr = (o: Json, key: string): string[] =>
  Array.isArray(o?.[key]) ? (o[key] as unknown[]).map((x) => String(x)) : [];
// Party strings come as "NAME - PARENTAGE"; keep the party name, drop the suffix.
const cleanName = (s: string) => s.split(" - ")[0].trim();
const titleCase = (s: string) =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, " ").trim();

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

  // Maps the real eCourtsIndia shape: body.data.courtCaseData (+ entityInfo).
  private normalizeCase(raw: Json, cnr: string): NormalizedCase {
    const root = (raw.data as Json) ?? raw;
    const d = (root.courtCaseData as Json) ?? root;
    const entity = (root.entityInfo as Json) ?? {};

    const petitioners = strArr(d, "petitioners");
    const petAdv = strArr(d, "petitionerAdvocates");
    const respondents = strArr(d, "respondents");
    const resAdv = strArr(d, "respondentAdvocates");
    const parties: NormalizedParty[] = [
      ...petitioners.map((p, i) => ({ name: cleanName(p), side: "petitioner" as const, advocate: petAdv[i] })),
      ...respondents.map((p, i) => ({ name: cleanName(p), side: "respondent" as const, advocate: resAdv[i] })),
    ];

    const nextHearing = ((str(d, "nextHearingDate") ?? str(entity, "nextDateOfHearing")) ?? "").slice(0, 10) || null;

    const hearings: NormalizedHearing[] = arr(d, "historyOfCaseHearings", "hearings")
      .map((h) => ({
        date: (str(h, "date", "hearingDate", "businessDate", "nextDate") ?? "").slice(0, 10),
        purpose: str(h, "purpose", "business", "stage"),
        judge: str(h, "judge", "coram"),
        raw: h,
      }))
      .filter((h) => h.date);
    // eCourts often returns an empty history but a known next date — surface it.
    if (!hearings.length && nextHearing) {
      hearings.push({ date: nextHearing, purpose: str(d, "purpose") ?? "Next hearing" });
    }

    const orders = [...arr(d, "judgmentOrders"), ...arr(d, "interimOrders")].map((o, i) => ({
      id: str(o, "id", "orderId") ?? `${cnr}-ORD-${i + 1}`,
      date: str(o, "date", "orderDate"),
      title: str(o, "title", "subject"),
    }));

    const pet0 = petitioners[0] ? titleCase(cleanName(petitioners[0])) : "";
    const res0 = respondents[0] ? titleCase(cleanName(respondents[0])) : "";
    const reg = str(d, "registrationNumber");
    const title = pet0 && res0 ? `${pet0} v. ${res0}` : reg ? `${str(d, "caseType") ?? "Case"} ${reg}` : cnr;

    // Acts & sections come either as a list of {act, section} objects or as a
    // flat string array — handle both, fall back to the flat list.
    const actObjs = arr(d, "actsAndSections", "acts");
    let acts = actObjs
      .map((a) => [str(a, "act", "actName", "name"), str(a, "section", "sections")].filter(Boolean).join(" ").trim())
      .filter(Boolean);
    if (!acts.length) acts = strArr(d, "acts");
    acts = [...new Set(acts.map((a) => titleCase(a)))];

    const judges = [...new Set(strArr(d, "judges").concat(str(d, "judge", "coram") ? [str(d, "judge", "coram")!] : []).map(titleCase))].filter(Boolean);

    const detail = {
      registrationNumber: reg,
      filingNumber: str(d, "filingNumber"),
      registrationDate: str(d, "registrationDate"),
      filingDate: str(d, "filingDate"),
      cnr,
      caseTypeRaw: str(d, "caseTypeRaw", "caseType"),
      district: str(d, "district", "districtName"),
      state: str(d, "state", "stateName"),
      petitionerAdvocates: petAdv,
      respondentAdvocates: resAdv,
    };

    return {
      cnr,
      title,
      court: str(d, "courtName", "court", "establishment"),
      caseType: str(d, "caseTypeSub", "caseType", "caseTypeRaw"),
      stage: str(d, "stageOfCaseRaw", "stageOfCase", "stage"),
      status: str(d, "caseStatus", "status"),
      parties,
      judge: judges.join(", ") || undefined,
      nextHearingDate: nextHearing,
      hearings,
      orders,
      acts,
      judges,
      detail,
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
    // Use the verified per-CNR endpoint (the bulk-refresh response shape is not yet
    // verified). Capped at 50 per call to match the bulk limit.
    const out: NormalizedCase[] = [];
    for (const cnr of cnrs.slice(0, 50)) {
      // Per-CNR isolation: a bad/synthetic CNR must not kill the rest of the batch.
      try {
        const c = await this.getCaseByCNR(cnr);
        if (c) out.push(c);
      } catch {
        continue;
      }
    }
    return out;
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
