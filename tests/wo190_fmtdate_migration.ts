// WO-190 W2 · Regression guard for the fmtDate → formatCourtDate migration.
// Two jobs:
//  (1) OUTPUT-EQUALITY: for every date shape the ~40 migrated callsites actually feed, the new
//      `formatCourtDate(x) ?? "—"` renders byte-identically to the old `fmtDate(x)` — for VALID
//      inputs on a UTC runtime (Vercel is UTC). The old fmtDate is inlined below as the golden
//      reference so this test stays true even though the function is now deleted.
//  (2) BUG-FIX PIN: the day-first corpus shape `13-05-2024` rendered "Invalid Date" under the old
//      fmtDate (the whole reason W2 exists) and now renders "13 May 2024".
//  (3) STRUCTURAL: `fmtDate` is gone from the UI barrel (the migration is finished, not aliased).
// Run: npx tsx tests/wo190_fmtdate_migration.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatCourtDate } from "../src/components/court/logic";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

// The OLD fmtDate, verbatim from src/components/ui.tsx before WO-190 — the golden reference.
// NOTE: forced to UTC here so the comparison is deterministic in CI regardless of the runner's
// local TZ; on Vercel (UTC) the deployed old behaviour was already this.
function oldFmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}
const migrated = (d: string | null | undefined): string => formatCourtDate(d) ?? "—";

// ── (1) output-equality on the shapes real callsites feed ──────────────────────
// These are the concrete field shapes across the migrated pages: ISO timestamps (created_at/
// updated_at/issue_date from Postgres), ISO dates, pg timestamp strings, and empty/null.
const equalInputs: Array<string | null | undefined> = [
  null,
  undefined,
  "",
  "2024-05-13",                     // ISO date (next_hearing_date, due_date)
  "2024-05-13T10:30:00.000Z",       // ISO timestamptz (created_at / updated_at) — pg serializes as Z
  "2024-05-13 10:30:00",            // pg timestamp string form
  "2024-12-31T23:59:59.000Z",       // year-end ISO timestamp (no day-roll on UTC)
  "2024-01-01",                     // year boundary
];
for (const inp of equalInputs) {
  check(`output-equal for ${JSON.stringify(inp)} (both → ${JSON.stringify(oldFmtDate(inp))})`,
    migrated(inp) === oldFmtDate(inp));
}

// ── (1b) inputs where the OLD fmtDate was itself buggy/locale-dependent — the new one is
// STRICTLY BETTER, so equality is NOT expected (documented divergence, flagged to the reviewer).
// `+05:30`-offset ISO is not a real callsite shape (Supabase serializes timestamptz as Z), and
// `new Date("13-May-2024")` is non-standard V8 parsing; both fed the exact TZ/locale drift the
// court kit exists to kill.
check("DD-Mon-YYYY: new parses day-first correctly (13 May 2024), old drifted",
  migrated("13-May-2024") === "13 May 2024");

// ── (2) the day-first corpus bug the migration fixes ───────────────────────────
// Old fmtDate: `new Date("13-05-2024")` → Invalid Date. New: parsed day-first.
check("old fmtDate mis-rendered 13-05-2024 (Invalid Date)", oldFmtDate("13-05-2024") === "Invalid Date");
check("migrated renders 13-05-2024 → 13 May 2024 (BUG FIXED)", migrated("13-05-2024") === "13 May 2024");
check("migrated renders 13/05/2024 → 13 May 2024", migrated("13/05/2024") === "13 May 2024");
check("migrated renders 01-01-2020 → 01 Jan 2020", migrated("01-01-2020") === "01 Jan 2020");

// ── (2b) empty-state preserved exactly ─────────────────────────────────────────
check("empty → em-dash (unchanged empty-state)", migrated(null) === "—" && migrated("") === "—" && migrated(undefined) === "—");
check("unparseable junk → em-dash (never 'Invalid Date' on the surface)", migrated("not a date") === "—");

// ── (3) structural: the old formatter is retired, not aliased ───────────────────
const ui = readFileSync(join(process.cwd(), "src/components/ui.tsx"), "utf8");
check("fmtDate is removed from src/components/ui.tsx", !/export function fmtDate\b/.test(ui));

// ── (3b) no page still imports fmtDate from the UI barrel ───────────────────────
// (a stale `import { fmtDate }` would fail typecheck, but pin it here for a clear signal)
check("no `fmtDate` export identifier remains in ui.tsx", !/\bfmtDate\b/.test(ui));

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll wo190_fmtdate_migration checks passed.");
