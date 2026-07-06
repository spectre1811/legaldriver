// WO-41 — Court-record ingest gap: the honest-empty case-detail selection contract.
// Pure/offline — GATES every PR. Run: npx tsx tests/wo41_case_detail_rows.ts
//
// The founder bug: a court-sourced case showed a wall of "not on record at eCourts" for fields
// eCourts provides + we already parse. These assertions lock the fix:
//  - fields the mobile API sources are shown (populated → value; empty → honest "not on record");
//  - fields the mobile API does NOT source are DROPPED when empty (never a false "not on record");
//  - a pending case's decision date reads "not applicable", not "not on record";
//  - a manual case shows only filled fields (no eCourts mirror at all).
import {
  selectCaseDetailRows,
  CASE_DETAIL_FIELDS,
  type CaseDetailFieldId,
  type CaseDetailRow,
} from "../src/lib/court/case-detail-fields";

let failed = 0;
function ok(name: string, cond: boolean) { console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`); if (!cond) failed++; }
const byId = (rows: CaseDetailRow[], id: CaseDetailFieldId) => rows.find((r) => r.id === id);

// The founder's case: mobile-sourced fields populated (post-fix), classification fields empty.
const founderCase: Partial<Record<CaseDetailFieldId, string | null>> = {
  registrationNo: "12804/2025", filingNo: "F/CR.MA/9999/2025",
  registrationDate: "2025-03-20", filingDate: "2025-03-15", firstHearingDate: "2025-04-01",
  district: "Ahmedabad", state: "Gujarat",
  category: null, subCategory: null, benchType: null, judicialBranch: null,
  subordinateCourt: null, filedBy: null,
  decidedOn: null, firNo: "123/2025", policeStation: "Navrangpura",
};

const court = selectCaseDetailRows(founderCase, { isCourtSourced: true, isDisposed: false });

// 1. The formerly-dropped fields now render with their real values (the core fix).
ok("filing number shown with value", byId(court, "filingNo")?.value === "F/CR.MA/9999/2025");
ok("first-hearing shown with value", byId(court, "firstHearingDate")?.value === "2025-04-01");
ok("district shown with value", byId(court, "district")?.value === "Ahmedabad");
ok("state shown with value", byId(court, "state")?.value === "Gujarat");

// 2. Empty NOT-sourced classification fields are dropped — never a false "not on record".
for (const id of ["category", "subCategory", "benchType", "judicialBranch", "subordinateCourt", "filedBy"] as CaseDetailFieldId[]) {
  ok(`empty not-sourced '${id}' is omitted`, byId(court, id) === undefined);
}

// 3. A pending case's empty decision date reads "not applicable", not "not on record".
ok("pending decidedOn present", byId(court, "decidedOn") !== undefined);
ok("pending decidedOn → not-applicable", byId(court, "decidedOn")?.emptyReason === "not-applicable");

// 4. A disposed case missing a decision date → honest "not on record" (it should have one).
const disposed = selectCaseDetailRows({ ...founderCase, decidedOn: null }, { isCourtSourced: true, isDisposed: true });
ok("disposed decidedOn → not-on-record", byId(disposed, "decidedOn")?.emptyReason === "not-on-record");

// 5. An empty SOURCED field is kept as an honest "not on record" (not silently dropped).
const noDistrict = selectCaseDetailRows({ ...founderCase, district: null }, { isCourtSourced: true, isDisposed: false });
ok("empty sourced district kept", byId(noDistrict, "district") !== undefined);
ok("empty sourced district → not-on-record", byId(noDistrict, "district")?.emptyReason === "not-on-record");

// 6. Manual case: only fields with a value; zero honest-empty rows.
const manual = selectCaseDetailRows(founderCase, { isCourtSourced: false, isDisposed: false });
ok("manual drops all empties", manual.every((r) => r.value != null));
ok("manual keeps populated firNo", byId(manual, "firNo")?.value === "123/2025");
ok("manual has no empty decidedOn (empty in fixture)", byId(manual, "decidedOn") === undefined);

// 7. A populated NOT-sourced field is still shown (so W3 promotions light up automatically).
const withCategory = selectCaseDetailRows({ ...founderCase, category: "Bail Application" }, { isCourtSourced: true, isDisposed: false });
ok("populated not-sourced category is shown", byId(withCategory, "category")?.value === "Bail Application");

// 7b. WO-69: the new mobile-sourced-but-partial fields (category tri-level / subordinate court /
// nature of disposal) show when present and are omitted when empty (never a false "not on record").
const wo69 = selectCaseDetailRows(
  { ...founderCase, category: "CRIMINAL MISC", subSubCategory: "REGULAR BAIL",
    subordinateCourt: "DISTRICT COURT, MAHESANA", natureOfDisposal: "ALLOWED" },
  { isCourtSourced: true, isDisposed: true });
ok("WO-69 subSubCategory shown when present", byId(wo69, "subSubCategory")?.value === "REGULAR BAIL");
ok("WO-69 subordinate court shown when present", byId(wo69, "subordinateCourt")?.value === "DISTRICT COURT, MAHESANA");
ok("WO-69 nature of disposal shown when present", byId(wo69, "natureOfDisposal")?.value === "ALLOWED");
ok("WO-69 empty natureOfDisposal omitted (partial-coverage, not a false claim)",
  byId(court, "natureOfDisposal") === undefined);

// 8. Taxonomy invariant: the classification + partial-coverage fields are the not-sourced set.
const notSourced = CASE_DETAIL_FIELDS.filter((f) => !f.sourced).map((f) => f.id).sort();
ok("exactly the classification + WO-69 partial fields are not-sourced",
  JSON.stringify(notSourced) === JSON.stringify(
    ["benchType", "category", "filedBy", "judicialBranch", "natureOfDisposal",
     "subCategory", "subSubCategory", "subordinateCourt"]));

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
