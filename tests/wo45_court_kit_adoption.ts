// WO-45 · Court-kit page migration (BP-17 W-5/W-6). Guards that the swept court surfaces render
// through the shared kit instead of hand-rolling dates/empties/chips — so a future edit can't
// silently reintroduce a bare "—" (ambiguous), a locale-buggy `fmtDate`, or a stray `ec-chip`.
//
// Two parts:
//  (1) STRUCTURAL guards — each migrated page imports "@/components/court", no longer imports
//      `fmtDate`, and carries none of the render-context anti-patterns the kit replaces.
//  (2) LOGIC parity — `formatCourtDate` produces the same "DD Mon YYYY" the old `fmtDate` did for
//      the shapes these pages feed it (DB `date` string + the cause-list YYYY-MM-DD group key),
//      and is timezone-safe (the reason CourtDate is a strict upgrade).
// Run: npx tsx tests/wo45_court_kit_adoption.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatCourtDate } from "../src/components/court/logic";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

// The court surfaces migrated in this WO (relative to repo root).
const MIGRATED = [
  "src/app/dashboard/cause-list/page.tsx",
  "src/app/dashboard/judge/[judgeId]/page.tsx",
  "src/app/dashboard/advocate/[...barId]/page.tsx",
  "src/app/dashboard/cases/[id]/orders-panel.tsx",
];

// ── (1) structural adoption guards ───────────────────────────────────────────
for (const rel of MIGRATED) {
  const src = read(rel);
  const name = rel.split("/").slice(-2).join("/");

  check(`${name}: imports the court kit`, /from ["']@\/components\/court["']/.test(src));

  // Dates must flow through <CourtDate>/formatCourtDate — never the locale-dependent ui `fmtDate`.
  check(`${name}: no fmtDate import`, !/\bfmtDate\b/.test(src));

  // A missing value must render an explicit <EmptyCell> ("not on record"), never a bare dash in a
  // JSX cell. We allow `|| "—"` ONLY in string-const contexts (e.g. a Map grouping key), which is
  // not a rendered field — so we forbid just the render-context shapes.
  check(`${name}: no ambiguous JSX "—" fallback`, !/\?\?\s*["']—["']/.test(src) && !/text-ink-faint">—/.test(src));

  // No hand-rolled chip — chips come from <CourtChip>/<CourtField tone>.
  check(`${name}: no hand-rolled ec-chip span`, !/className="ec-chip/.test(src));
}

// ── (2) date-format parity + timezone safety ─────────────────────────────────
// The old ui.fmtDate rendered "02 Jan 2026" via toLocaleDateString(en-IN, 2-digit/short/numeric).
// formatCourtDate must match that shape for the inputs these pages pass it.
check("DB date string → DD Mon YYYY", formatCourtDate("2026-01-02") === "02 Jan 2026");
check("cause-list group key (ISO) → DD Mon YYYY", formatCourtDate("2024-12-31") === "31 Dec 2024");
check("eCourts day-first DD-MM-YYYY parses correctly", formatCourtDate("13-05-2024") === "13 May 2024");
// Timezone safety: an ISO instant near a day boundary keeps its calendar day (UTC parts), unlike
// `new Date(...).toLocaleDateString()` which could roll a day in a non-UTC runtime.
check("ISO datetime keeps its UTC calendar day", formatCourtDate("2026-01-02T20:30:00Z") === "02 Jan 2026");
check("blank date → null (caller shows EmptyCell, not a wrong date)", formatCourtDate("") === null && formatCourtDate(null) === null);
check("junk date → null (caller shows DirtyValue, never a fabricated date)", formatCourtDate("not a date") === null);

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILED"}  (wo45_court_kit_adoption)`);
process.exit(failures === 0 ? 0 : 1);
