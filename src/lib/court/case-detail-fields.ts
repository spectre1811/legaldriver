// WO-41 · Case-detail field spec + honest-empty selection — pure, i18n-free, testable.
//
// The case page renders an eCourts field grid. Three failure modes we must never commit:
//   1. Drop a field the mobile API parsed (the bug WO-41 fixes) → a real value shown as absent.
//   2. Show "not on record at eCourts" for a field the mobile API does NOT source → conflates
//      "we didn't ingest it" with "eCourts doesn't have it" (a false claim about the record).
//   3. Show "not on record" for a field that is genuinely not-applicable (a pending case has no
//      decision date) → should read "not applicable".
//
// This module owns the field taxonomy + the selection rule; the page only maps ids → localized
// labels/values, so the trust contract is unit-tested independent of React/i18n.

export type CaseDetailFieldId =
  | "registrationNo" | "filingNo" | "registrationDate" | "filingDate" | "firstHearingDate"
  | "district" | "state" | "category" | "subCategory" | "benchType" | "judicialBranch"
  | "subordinateCourt" | "filedBy" | "decidedOn" | "firNo" | "policeStation";

export type CaseDetailField = {
  id: CaseDetailFieldId;
  /** The eCourts MOBILE API (our source of record) carries this field. An empty court-sourced
   *  value is then truthfully "not on record at eCourts". Fields that live only on the HTML portal
   *  path we don't ingest are `sourced:false` → an empty one is omitted, never falsely labelled. */
  sourced: boolean;
  /** When set, the field is not-applicable in this situation → "not applicable", not "not on record". */
  naWhen?: "pending";
};

// Order = render order. `sourced` reflects what the eCourts mobile `history` payload actually
// provides (see ecourts-scraper mobile_api.map_history). The six classification fields are
// sourced:false until WO-41 W3 confirms a mobile source; today they live only in the HTML path.
export const CASE_DETAIL_FIELDS: CaseDetailField[] = [
  { id: "registrationNo", sourced: true },
  { id: "filingNo", sourced: true },
  { id: "registrationDate", sourced: true },
  { id: "filingDate", sourced: true },
  { id: "firstHearingDate", sourced: true },
  { id: "district", sourced: true },
  { id: "state", sourced: true },
  { id: "category", sourced: false },
  { id: "subCategory", sourced: false },
  { id: "benchType", sourced: false },
  { id: "judicialBranch", sourced: false },
  { id: "subordinateCourt", sourced: false },
  { id: "filedBy", sourced: false },
  { id: "decidedOn", sourced: true, naWhen: "pending" },
  { id: "firNo", sourced: true },
  { id: "policeStation", sourced: true },
];

export type CaseDetailRow = {
  id: CaseDetailFieldId;
  value: string | null;
  emptyReason: "not-on-record" | "not-applicable";
};

/**
 * WO-54 · Map the raw eCourts `matter.detail` jsonb to the `CaseDetailFieldId → value` shape that
 * `selectCaseDetailRows` consumes. Pure + i18n-free so the case-detail page and the Cases-list
 * detail drawer render the SAME fields from the SAME keys (no drift). Date fields are formatted by
 * the caller-supplied `fmt` so each surface controls its own date presentation (the page's legacy
 * `fmtDate`, the drawer's TZ-correct court-kit `formatCourtDate`).
 */
export function extractCaseDetailValues(
  detail: Record<string, unknown>,
  fmt: (raw: string) => string,
): Partial<Record<CaseDetailFieldId, string | null>> {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const d = (v: unknown) => { const t = s(v); return t ? fmt(t) : null; };
  const fir = s(detail.firNo);
  return {
    registrationNo: s(detail.registrationNumber),
    filingNo: s(detail.filingNumber),
    registrationDate: d(detail.registrationDate),
    filingDate: d(detail.filingDate),
    firstHearingDate: d(detail.first_hearing_date),
    district: s(detail.district),
    state: s(detail.state),
    category: s(detail.category),
    subCategory: s(detail.sub_category),
    benchType: s(detail.bench_type),
    judicialBranch: s(detail.judicial_branch),
    subordinateCourt: s(detail.subordinate_court),
    filedBy: s(detail.filed_by),
    decidedOn: d(detail.decisionDate),
    firNo: fir ? `${fir}${detail.firYear ? `/${String(detail.firYear)}` : ""}` : null,
    policeStation: s(detail.policeStation),
  };
}

/**
 * Pick + annotate the rows to render.
 *  - Manual case (no eCourts record to mirror): only fields that actually have a value.
 *  - Court-sourced: populated values + honest empties for MOBILE-sourced fields; empty
 *    not-sourced fields are dropped (we can't truthfully say eCourts lacks them).
 *  - A `naWhen:"pending"` field on a non-disposed case reads "not applicable".
 */
export function selectCaseDetailRows(
  values: Partial<Record<CaseDetailFieldId, string | null>>,
  opts: { isCourtSourced: boolean; isDisposed: boolean },
): CaseDetailRow[] {
  const rows: CaseDetailRow[] = [];
  for (const f of CASE_DETAIL_FIELDS) {
    const value = values[f.id] ?? null;
    const keep = opts.isCourtSourced ? value != null || f.sourced : value != null;
    if (!keep) continue;
    const na = f.naWhen === "pending" && !opts.isDisposed;
    rows.push({ id: f.id, value, emptyReason: na ? "not-applicable" : "not-on-record" });
  }
  return rows;
}
