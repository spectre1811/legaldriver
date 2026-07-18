// WO-205 W1 · The console cause-list court directory's pure contract: the label-dedupe,
// held-board filter, deterministic grouping/sort, district-as-searchable-hint, and the URL param
// round-trip that scopes the board. No DOM, no React, no network — runs under tsx offline.
// Ported from peshi's court-select.test.ts (WO-86/WO-81), adapted to the LD flat combobox options.
// Run: npx tsx tests/wo205_causelist_directory.ts
import {
  courtLabel,
  courtHasData,
  buildCourtOptions,
  type CourtGroup,
} from "../src/lib/court/court-directory";
import { filterOptions, type ComboOption } from "../src/components/combobox/logic";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log("  ✓", name);
  else { console.error("  ✗ FAIL:", name); failures++; }
}

// ── courtLabel: drops the "X · X" bench echo (peshi WO-81 bug) ──
check(
  "courtLabel drops the duplicate when bench_label === name",
  courtLabel({ name: "Additional Court, Vanthali", bench_label: "Additional Court, Vanthali" }) === "Additional Court, Vanthali",
);
check("courtLabel trims before comparing", courtLabel({ name: "  Principal Court  ", bench_label: "  Principal Court  " }) === "Principal Court");
check("courtLabel appends the bench only when it adds signal", courtLabel({ name: "City Civil Court", bench_label: "Court No. 5" }) === "City Civil Court · Court No. 5");
check("courtLabel: no bench → just the name", courtLabel({ name: "District Court", bench_label: null }) === "District Court");
check("courtLabel: empty bench → just the name", courtLabel({ name: "District Court", bench_label: "" }) === "District Court");

// ── courtHasData: only courts with a latest_date AND positive list_days are offerable ──
check("courtHasData true when latest_date + list_days>0", courtHasData({ court_id: 1, name: "X", latest_date: "2026-07-08", list_days: 3 }));
check("courtHasData false with no latest_date", !courtHasData({ court_id: 1, name: "X", latest_date: null, list_days: 3 }));
check("courtHasData false with list_days 0", !courtHasData({ court_id: 1, name: "X", latest_date: "2026-07-08", list_days: 0 }));
check("courtHasData false with missing list_days", !courtHasData({ court_id: 1, name: "X", latest_date: "2026-07-08" }));

const groups: CourtGroup[] = [
  {
    tier: "DISTRICT", tier_label: "District Court", district: "Rajkot",
    courts: [
      { court_id: 3, name: "Sessions Court", bench_label: "Sessions Court", latest_date: "2026-07-08", list_days: 4 },
      { court_id: 1, name: "Additional Court", bench_label: "Court No. 2", latest_date: "2026-07-06", list_days: 1 },
      { court_id: 7, name: "No Board Court", bench_label: null, latest_date: null, list_days: 0 }, // dropped
    ],
  },
  {
    tier: "HIGH", tier_label: "High Court", district: "",
    courts: [{ court_id: 9, name: "Gujarat High Court", bench_label: null, latest_date: "2026-07-09", list_days: 20 }],
  },
  { tier: "DISTRICT", tier_label: "District Court", district: "Junagadh", courts: [] }, // empty → dropped
];

const opts = buildCourtOptions(groups);

check("buildCourtOptions: High Court tier first (court_id 9 leads)", opts[0]?.value === "9");
check("buildCourtOptions: no-board court dropped (7 absent)", !opts.some((o) => o.value === "7"));
check("buildCourtOptions: empty group dropped (only 3 courts survive)", opts.length === 3);
check("buildCourtOptions: ids stringified", opts.every((o) => typeof o.value === "string"));

// Rajkot courts sorted by deduped label: "Additional Court · Court No. 2" (1) before "Sessions Court" (3)
const rajkot = opts.filter((o) => o.hint === "Rajkot");
check("buildCourtOptions: Rajkot courts sorted by label", rajkot.map((o) => o.value).join(",") === "1,3");
check("buildCourtOptions: bench===name deduped in label", rajkot.find((o) => o.value === "3")?.label === "Sessions Court");
check("buildCourtOptions: bench adds signal kept in label", rajkot.find((o) => o.value === "1")?.label === "Additional Court · Court No. 2");

// District carried as searchable hint (LD combobox has no heading row); freshness on the option.
const hc = opts.find((o) => o.value === "9");
check("buildCourtOptions: HC hint = its tier label (no district)", hc?.hint === "High Court");
check("buildCourtOptions: freshness = latest_date", hc?.freshness === "2026-07-09");
check("buildCourtOptions: DC hint = its district (search-only)", rajkot[0]?.hint === "Rajkot");

// ── The shared combobox filter over the built options: matches name AND district (via hint) ──
const co: ComboOption[] = opts.map((o) => ({ value: o.value, label: o.label, hint: o.hint }));
check("filterOptions: empty query keeps all", filterOptions(co, "").length === co.length);
check("filterOptions: matches court name", filterOptions(co, "sessions").map((o) => o.value).join(",") === "3");
check("filterOptions: matches district (in hint, not label)", filterOptions(co, "rajkot").map((o) => o.value).sort().join(",") === "1,3");
check("filterOptions: token-AND across name + district", filterOptions(co, "add rajkot").map((o) => o.value).join(",") === "1");
check("filterOptions: no match → empty", filterOptions(co, "zzzznotacourt").length === 0);

// ── URL param round-trip: the state/court/date scope survives a stepper build (the ?date= back-compat
// contract + optional ?state=&court_id=). Mirrors page.tsx's stepHref. ──
const scope = { state: "17", court_id: "9" };
const stepped = new URLSearchParams({ ...scope, date: "2026-07-10" }).toString();
const parsed = new URLSearchParams(stepped);
check("param round-trip: state preserved", parsed.get("state") === "17");
check("param round-trip: court_id preserved", parsed.get("court_id") === "9");
check("param round-trip: date set", parsed.get("date") === "2026-07-10");
// A bare link (no date) keeps scope, drops date (jump-to-today) — back-compat with the old ?date= form.
const bare = new URLSearchParams(scope).toString();
check("param round-trip: jump-to-today keeps scope, no date", !new URLSearchParams(bare).has("date") && new URLSearchParams(bare).get("court_id") === "9");

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll wo205_causelist_directory checks passed.");
