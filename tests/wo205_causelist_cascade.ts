// WO-205 W3 · The cascade + honest-state contract, tested offline (no DOM, no React, no network).
// Covers the tier/district slicers over the court directory, and the pure board-state machine that
// mirrors the read-through vocabulary (held | fetching | empty | hcUnheld | pick | error).
// Run: npx tsx tests/wo205_causelist_cascade.ts
import {
  heldTiers,
  districtOptions,
  courtOptionsFor,
  findCourt,
  type CourtGroup,
} from "../src/lib/court/court-directory";
import {
  initialBoardState,
  outcomeFromStatus,
  nextFromOutcome,
} from "../src/lib/court/causelist-state";

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log("  ✓", name);
  else { console.error("  ✗ FAIL:", name); failures++; }
}

// A directory with both tiers, two DC districts (one with a no-board court), and an empty district.
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
    tier: "DISTRICT", tier_label: "District Court", district: "Ahmedabad",
    courts: [{ court_id: 5, name: "City Civil Court", bench_label: null, latest_date: "2026-07-09", list_days: 12 }],
  },
  { tier: "DISTRICT", tier_label: "District Court", district: "Junagadh", courts: [] }, // empty → no district
  {
    tier: "HIGH", tier_label: "High Court", district: "",
    courts: [{ court_id: 9, name: "Gujarat High Court", bench_label: null, latest_date: "2026-07-09", list_days: 20 }],
  },
];

// ── heldTiers: only tiers with a held board; District first, then High ──
check("heldTiers = [DISTRICT, HIGH]", heldTiers(groups).join(",") === "DISTRICT,HIGH");
check("heldTiers drops a tier with no held board", heldTiers([groups[2]]).length === 0);
check(
  "heldTiers HIGH-only when only HC holds",
  heldTiers([groups[3]]).join(",") === "HIGH",
);

// ── districtOptions: one per district holding ≥1 board, sorted; empty district dropped ──
const dopts = districtOptions(groups);
check("districtOptions: Ahmedabad + Rajkot only, sorted", dopts.map((d) => d.value).join(",") === "Ahmedabad,Rajkot");
check("districtOptions: value === label (the district name)", dopts.every((d) => d.value === d.label));
check("districtOptions: none for a state with no DC boards", districtOptions([groups[3]]).length === 0);

// ── courtOptionsFor: sliced by tier + district; held-only; deduped label; sorted ──
const rajkot = courtOptionsFor(groups, "DISTRICT", "Rajkot");
check("courtOptionsFor DISTRICT/Rajkot: 2 held courts (no-board dropped)", rajkot.length === 2);
check("courtOptionsFor DISTRICT/Rajkot: sorted by label (1 before 3)", rajkot.map((c) => c.value).join(",") === "1,3");
check("courtOptionsFor: bench===name deduped", rajkot.find((c) => c.value === "3")?.label === "Sessions Court");
check("courtOptionsFor: bench signal kept", rajkot.find((c) => c.value === "1")?.label === "Additional Court · Court No. 2");
check("courtOptionsFor: freshness carried", rajkot.find((c) => c.value === "3")?.freshness === "2026-07-08");
check("courtOptionsFor DISTRICT with no district → empty (cascade waits)", courtOptionsFor(groups, "DISTRICT", null).length === 0);
check("courtOptionsFor DISTRICT/Ahmedabad: only that district's court", courtOptionsFor(groups, "DISTRICT", "Ahmedabad").map((c) => c.value).join(",") === "5");
const hc = courtOptionsFor(groups, "HIGH", null);
check("courtOptionsFor HIGH ignores district", hc.map((c) => c.value).join(",") === "9");
check("courtOptionsFor: cross-district isolation (Rajkot ≠ Ahmedabad court)", !rajkot.some((c) => c.value === "5"));

// ── findCourt: tier/district/freshness lookup by id ──
check("findCourt DC → DISTRICT tier + district", findCourt(groups, "5")?.tier === "DISTRICT" && findCourt(groups, "5")?.district === "Ahmedabad");
check("findCourt HC → HIGH tier", findCourt(groups, "9")?.tier === "HIGH");
check("findCourt unknown → null", findCourt(groups, "999") === null);
check("findCourt: freshness", findCourt(groups, "3")?.freshness === "2026-07-08");

// ── initialBoardState: the honest server-side resolution ──
check("no court → pick", initialBoardState({ courtId: null, tier: "DISTRICT", heldCount: 0, onDemandLive: true }) === "pick");
check("held rows → held", initialBoardState({ courtId: "3", tier: "DISTRICT", heldCount: 5, onDemandLive: true }) === "held");
check("DC miss + lane on → fetching", initialBoardState({ courtId: "3", tier: "DISTRICT", heldCount: 0, onDemandLive: true }) === "fetching");
check("DC miss + lane OFF → empty (honest, no spinner)", initialBoardState({ courtId: "3", tier: "DISTRICT", heldCount: 0, onDemandLive: false }) === "empty");
check("HC miss → hcUnheld (never a live fetch)", initialBoardState({ courtId: "9", tier: "HIGH", heldCount: 0, onDemandLive: true }) === "hcUnheld");
check("HC held → held (still renders what we hold)", initialBoardState({ courtId: "9", tier: "HIGH", heldCount: 3, onDemandLive: true }) === "held");

// ── outcomeFromStatus: W2 HTTP status → outcome ──
check("200 + items → found", outcomeFromStatus(200, true) === "found");
check("200 + no items → empty", outcomeFromStatus(200, false) === "empty");
check("202 → fetching", outcomeFromStatus(202, false) === "fetching");
check("422 → error (WO-289: a 422 reaching here is a contract bug, never a genuine 'no board')", outcomeFromStatus(422, false) === "error");
check("null (network) → error", outcomeFromStatus(null, false) === "error");
check("500 → error (never a silent empty)", outcomeFromStatus(500, false) === "error");
check("0 (synthetic network fail) → error", outcomeFromStatus(0, false) === "error");

// ── nextFromOutcome: outcome → next board state ──
check("found → held (refresh the server board)", nextFromOutcome("found") === "held");
check("fetching → fetching (keep polling)", nextFromOutcome("fetching") === "fetching");
check("empty → empty", nextFromOutcome("empty") === "empty");
check("error → error", nextFromOutcome("error") === "error");

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll wo205_causelist_cascade checks passed.");
