// WO-54 W3 · Cases row information-depth + detail drawer. Guards:
//   (1) the pure row helpers (urgency, court-scoped case no.) — deterministic, no fabrication;
//   (2) the shared detail-value extractor maps every eCourts jsonb key + formats dates via the caller;
//   (3) structural: the drawer renders through the court kit, layers above the bulk bar, opens from
//       the row, and the list query surfaces the fields the drawer needs (no second fetch).
//
// Run: npx tsx tests/wo54_cases_row_depth.ts

import { readFileSync } from "node:fs";
import { hearingUrgency, isoDayDiff, urgencyTone, courtCaseNo } from "../src/app/dashboard/cases/cases-row";
import { extractCaseDetailValues } from "../src/lib/court/case-detail-fields";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

// ── 1. hearingUrgency ────────────────────────────────────────────────────────
const TODAY = "2026-07-06";
ok("urgency none when no date", hearingUrgency(null, TODAY).key === "none");
ok("urgency none on garbage date", hearingUrgency("not-a-date", TODAY).key === "none");
ok("urgency today", hearingUrgency("2026-07-06", TODAY).key === "today");
ok("urgency tomorrow", hearingUrgency("2026-07-07", TODAY).key === "tomorrow");
ok("urgency soon (≤7d)", hearingUrgency("2026-07-11", TODAY).key === "soon");
ok("urgency future (>7d)", hearingUrgency("2026-08-06", TODAY).key === "future");
ok("urgency overdue (past)", hearingUrgency("2026-07-01", TODAY).key === "overdue");
ok("overdue days are negative", (hearingUrgency("2026-07-01", TODAY).days ?? 0) === -5);
ok("soon days positive", (hearingUrgency("2026-07-11", TODAY).days ?? 0) === 5);
ok("isoDayDiff whole days", isoDayDiff("2026-07-06", "2026-07-16") === 10);
ok("isoDayDiff null on bad input", isoDayDiff("x", "2026-07-16") === null);
// urgencyTone: future/none render NO chip (the date speaks for itself; never invent urgency).
ok("tone: overdue → danger", urgencyTone("overdue") === "danger");
ok("tone: today → hot", urgencyTone("today") === "hot");
ok("tone: soon → warn", urgencyTone("soon") === "warn");
ok("tone: future → null (no chip)", urgencyTone("future") === null);
ok("tone: none → null (no chip)", urgencyTone("none") === null);

// ── 2. courtCaseNo (no fabrication) ─────────────────────────────────────────
ok("caseNo composes type/number/year", courtCaseNo("SCA", { registrationNumber: "9465", registrationYear: 2023 }) === "SCA/9465/2023");
ok("caseNo doesn't double the year", courtCaseNo("SCA", { registrationNumber: "9465/2023", registrationYear: 2023 }) === "SCA/9465/2023");
ok("caseNo falls back to filing number", courtCaseNo("CS", { filingNumber: "120", registrationYear: 2024 }) === "CS/120/2024");
ok("caseNo without type = bare number", courtCaseNo(null, { registrationNumber: "9465" }) === "9465");
ok("caseNo null when no number stored", courtCaseNo("SCA", {}) === null);
ok("caseNo type+number, no year", courtCaseNo("SCA", { registrationNumber: "9465" }) === "SCA/9465");

// ── 3. extractCaseDetailValues (shared with the case page) ──────────────────
const fmt = (r: string) => `D:${r}`; // sentinel formatter to prove dates route through the caller
const v = extractCaseDetailValues(
  { registrationNumber: "9465", registrationDate: "2023-05-01", firNo: "42", firYear: 2023, district: "Ahmedabad", policeStation: "  Navrangpura  " },
  fmt,
);
ok("extract: plain string field", v.registrationNo === "9465");
ok("extract: date routed through fmt", v.registrationDate === "D:2023-05-01");
ok("extract: FIR joins year", v.firNo === "42/2023");
ok("extract: trims whitespace", v.policeStation === "Navrangpura");
ok("extract: missing → null", v.filingNo === null);

// ── 4. structural guards ─────────────────────────────────────────────────────
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const drawer = src("src/components/cases/case-detail-drawer.tsx");
ok("drawer renders court-kit fields", /@\/components\/court/.test(drawer) && /CourtField/.test(drawer));
ok("drawer reuses the shared honest-empty taxonomy", /selectCaseDetailRows/.test(drawer) && /extractCaseDetailValues/.test(drawer));
ok("drawer layers above the bulk bar (z-50)", /z-50/.test(drawer));
ok("drawer is Escape-dismissible", /Escape/.test(drawer));
ok("drawer has no direct Supabase import (renders from props)", !/@\/lib\/supabase/.test(drawer));

const table = src("src/app/dashboard/cases/cases-table.tsx");
ok("table opens the drawer from the row", /CaseDetailDrawer/.test(table) && /setDrawerRow/.test(table));
ok("table renders the urgency chip", /UrgencyChip/.test(table));
ok("table shows the court-scoped case no.", /courtCaseNo/.test(table));

const query = src("src/app/dashboard/cases/cases-query.ts");
ok("list query surfaces detail + name arrays (no 2nd fetch)", /\bdetail\b/.test(query) && /advocate_names/.test(query) && /judge_names/.test(query));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
