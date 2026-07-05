// BP-17 · Shared court-data component kit. Two parts:
//  (1) unit-tests the PURE logic core (bands, date parse, mask detect, staleness, four-state
//      resolver) — the decisions the kit makes, testable without a DOM;
//  (2) structural guards on the kit files — every net-new/primitive component exists, the barrel
//      exports them, the four-state contract is a single dispatcher, and the PORTABLE files carry
//      no Supabase/server-only/app-icon imports (so peshi can consume them verbatim).
// Run: npx tsx tests/bp17_court_kit.ts
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  confidenceBand,
  confidenceTone,
  chipToneClass,
  interpretationTone,
  isMaskedName,
  looksDirty,
  decodeEntities,
  resolveFieldState,
  parseCourtDate,
  formatCourtDate,
  pendencyAge,
  pendencyTone,
  stalenessState,
  relativeAge,
} from "../src/components/court/logic";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

// ── confidence bands (FG-3 thresholds) ───────────────────────────────────────
check("confidence ≥0.90 → high", confidenceBand(0.92) === "high");
check("confidence 0.75–0.90 → medium", confidenceBand(0.8) === "medium");
check("confidence <0.75 → low", confidenceBand(0.5) === "low");
check("confidence tolerates 0–100 scale", confidenceBand(95) === "high");
check("confidence NaN → low (never fabricate certainty)", confidenceBand(Number.NaN) === "low");
check("high band → success tone", confidenceTone("high") === "success");
check("low band → neutral tone (not a false green)", confidenceTone("low") === "neutral");

// ── chip tone map (single source) ────────────────────────────────────────────
check("chipToneClass danger", chipToneClass("danger") === "ec-chip ec-chip-danger");
check("chipToneClass unknown falls back to neutral", chipToneClass("bogus" as never) === "ec-chip");

// ── interpretation is always distinct ────────────────────────────────────────
check("substantive → success", interpretationTone("substantive") === "success");
check("adjourned → warn", interpretationTone("adjourned") === "warn");
check("uncertain → neutral", interpretationTone("uncertain") === "neutral");

// ── masked-name detection ────────────────────────────────────────────────────
check("XXXXXXX is masked", isMaskedName("XXXXXXX"));
check("spaced/dotted X.X.X is masked", isMaskedName("X.X.X.X"));
check("real name is NOT masked", !isMaskedName("Ramesh Kumar"));
check("short 'Xi' is NOT masked (avoid false positives)", !isMaskedName("Xi"));
check("empty is NOT masked (that's the empty state)", !isMaskedName(""));

// ── dirty detection + decode ─────────────────────────────────────────────────
check("raw entity looksDirty", looksDirty("Ram &amp; Co"));
check("clean value not dirty", !looksDirty("Ram & Co"));
check("double-encoded decodes fully", decodeEntities("A &amp;amp; B") === "A & B");

// ── four-state resolver (exactly one) ────────────────────────────────────────
check("null → empty", resolveFieldState(null) === "empty");
check("blank → empty", resolveFieldState("   ") === "empty");
check("XXXXXXX → masked", resolveFieldState("XXXXXXX") === "masked");
check("entity junk → dirty", resolveFieldState("Ram &amp;amp; Co") === "dirty");
check("clean value → populated", resolveFieldState("District Court, Ahmedabad") === "populated");

// ── date parsing (the peshi new Date() bug) ──────────────────────────────────
check("DD-MM-YYYY parses day-first", formatCourtDate("13-05-2024") === "13 May 2024");
check("DD/MM/YYYY parses day-first", formatCourtDate("01/12/2023") === "01 Dec 2023");
check("ISO parses", formatCourtDate("2024-05-13") === "13 May 2024");
check("DD-Mon-YYYY parses", formatCourtDate("13-May-2024") === "13 May 2024");
check("impossible date (31-02) → null, not a rolled date", parseCourtDate("31-02-2024") === null);
check("junk date → null (routes to dirty/empty)", parseCourtDate("not a date") === null);
check("empty date → null", parseCourtDate("") === null);

// ── pendency age (freezes at disposal) ───────────────────────────────────────
const NOW = new Date("2026-07-05T00:00:00Z");
check("fresh (<1y) → neutral", pendencyTone(pendencyAge("01-01-2026", null, NOW).band) === "neutral");
check("watch (1–3y) → warn", pendencyTone(pendencyAge("01-01-2024", null, NOW).band) === "warn");
check("aging (3–5y) → hot", pendencyTone(pendencyAge("01-01-2022", null, NOW).band) === "hot");
check("old (>5y) → danger", pendencyTone(pendencyAge("01-01-2018", null, NOW).band) === "danger");
check("disposed case freezes age", pendencyAge("01-01-2018", "01-01-2019", NOW).frozen === true);
const frozen = pendencyAge("01-01-2018", "01-01-2019", NOW);
check("frozen age measured to disposal, not now", frozen.years !== null && frozen.years < 1.1);
check("no filing date → unknown (renders nothing, not a guess)", pendencyAge(null, null, NOW).band === "unknown");

// ── staleness ────────────────────────────────────────────────────────────────
check("fresh sync → not stale", stalenessState("2026-07-04T20:00:00Z", 24, NOW).stale === false);
check("old sync → stale", stalenessState("2026-06-01T00:00:00Z", 24, NOW).stale === true);
check("never synced → stale by definition", stalenessState(null, 24, NOW).stale === true);
check("relativeAge deterministic", relativeAge("2026-07-04T22:00:00Z", NOW) === "2h ago");

// ── structural guards on the kit files ───────────────────────────────────────
const root = process.cwd();
const kit = join(root, "src/components/court");
check("court/ kit directory exists", existsSync(kit));

const EXPECTED = [
  "logic.ts", "court-chip.tsx", "empty-cell.tsx", "dirty-value.tsx", "masked-name.tsx",
  "court-field.tsx", "confidence-badge.tsx", "pendency-age.tsx", "staleness-banner.tsx",
  "interpretation-badge.tsx", "court-date.tsx", "provenance-chip.tsx", "disclaimer.tsx",
  "notice-banner.tsx", "code-label.tsx", "timeline.tsx", "index.ts",
];
for (const f of EXPECTED) check(`kit has ${f}`, existsSync(join(kit, f)));

const barrel = readFileSync(join(kit, "index.ts"), "utf8");
for (const name of [
  "CourtChip", "EmptyCell", "DirtyValue", "MaskedName", "CourtField", "ConfidenceBadge",
  "PendencyAge", "StalenessBanner", "InterpretationBadge", "CourtDate", "ProvenanceChip",
  "Disclaimer", "NoticeBanner", "CodeLabel", "HearingTimeline",
]) {
  check(`barrel exports ${name}`, barrel.includes(name));
}

// The four-state contract must be a SINGLE dispatcher (enforced-by-construction), not scattered.
const field = readFileSync(join(kit, "court-field.tsx"), "utf8");
check("CourtField dispatches via resolveFieldState", field.includes("resolveFieldState"));
check("CourtField handles all four states", ["empty", "masked", "dirty", "populated"].every((s) => field.includes(`"${s}"`)));

// Portable files must NOT import Supabase / server-only / the app icon set — else peshi can't
// consume them. (CourtProviderBanner is deliberately NOT in the kit folder for exactly this reason.)
const FORBIDDEN = ["@/lib/supabase", "next-intl/server", "@/components/icons", "server-only"];
for (const f of readdirSync(kit)) {
  const src = readFileSync(join(kit, f), "utf8");
  for (const bad of FORBIDDEN) {
    // Match a quoted import specifier only (e.g. "next-intl/server", "@/lib/supabase/x") — not the
    // module name appearing in comment prose.
    const q = bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const importsIt = new RegExp(`["'\`]${q}(/[^"'\`]*)?["'\`]`).test(src);
    check(`portable ${f} does not import ${bad}`, !importsIt);
  }
}

// Kit components use ec-* design tokens (BP-16), not legacy/raw hexes.
const chip = readFileSync(join(kit, "court-chip.tsx"), "utf8");
check("CourtChip uses ec-chip tokens", chip.includes("chipToneClass"));
const emptyCell = readFileSync(join(kit, "empty-cell.tsx"), "utf8");
check("EmptyCell uses ec-* ink token", emptyCell.includes("text-ec-ink-3"));

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll bp17_court_kit checks passed.");
