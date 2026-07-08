// WO-72 — Judgments corpus search pagination. Offline, no secrets (Athena SQL itself is
// live-verified on deploy). Run: npx tsx tests/wo72_judgments_pagination.ts
// Locks the honesty invariant: the page slice, the count, and the JS de-dupe all collapse
// on the SAME key, so the numbered pager's "of N" agrees with what a page actually shows.
import { readFileSync } from "node:fs";
import {
  dedupeJudgments,
  DEDUP_KEY_FIELDS,
  DEDUP_KEY_SQL_COLS,
  type JudgmentRow,
} from "../src/lib/court/corpus-athena";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

function row(o: Partial<JudgmentRow>): JudgmentRow {
  return {
    src: null, cnr: null, title: null, judge: null, court: null, year: null,
    decision_date: null, disposal_nature: null, citation: null, pdf_link: null,
    petitioner: null, respondent: null, ...o,
  };
}

// ── The two de-dupe key lists are parallel (JudgmentRow fields ↔ raw SQL columns) ──
{
  ok("dedup keys same length", DEDUP_KEY_FIELDS.length === DEDUP_KEY_SQL_COLS.length);
  const parallel = DEDUP_KEY_FIELDS.every((f, i) => {
    const sql = DEDUP_KEY_SQL_COLS[i];
    return f === sql || (f === "pdf_link" && sql === "path"); // the only field aliased from its column
  });
  ok("dedup keys parallel (only pdf_link↔path differs)", parallel);
}

// ── dedupeJudgments collapses on EXACTLY the declared key (so JS agrees with the SQL de-dupe) ──
{
  const k = { cnr: "C1", pdf_link: "p1", title: "T", decision_date: "2024-01-01", disposal_nature: "Dismissed" };
  // Differ only on NON-key fields (judge/citation/petitioner) → still one document.
  ok(
    "collapse when only non-key fields differ",
    dedupeJudgments([row({ ...k, judge: "A", citation: "c1" }), row({ ...k, judge: "B", citation: "c2" })]).length === 1,
  );
  // Differ on each KEY field in turn → kept apart.
  for (const key of ["cnr", "pdf_link", "title", "decision_date", "disposal_nature"] as const) {
    ok(`keep apart when key field '${key}' differs`, dedupeJudgments([row(k), row({ ...k, [key]: "other" })]).length === 2);
  }
}

// ── corpus-athena: SQL slice + count share the dedup key; slice pages with OFFSET ──
{
  const corpus = src("src/lib/court/corpus-athena.ts");
  ok("searchJudgments takes an offset", /offset\?: number/.test(corpus));
  ok("page slice de-dupes in SQL (row_number()=1 over the partition)", /row_number\(\) OVER \(PARTITION BY \$\{DEDUP_KEY_SQL_COLS/.test(corpus) && /rn = 1/.test(corpus));
  ok("slice applies the offset", /OFFSET \$\{offset\}/.test(corpus));
  ok("countJudgments counts DISTINCT on the same key", /count\(\*\) n FROM \(\s*SELECT DISTINCT \$\{DEDUP_KEY_SQL_COLS/.test(corpus));
}

// ── page.tsx: numbered <Pagination> wired, honest total, no silent "100+" ──
{
  const page = src("src/app/dashboard/search/judgments/page.tsx");
  ok("page fetches the honest total via countJudgments", /countJudgments\(filter\)/.test(page));
  ok("page requests only this page's slice (per-limit + offset)", /limit: per, offset:/.test(page));
  ok("page renders the shared <Pagination> with the real total", /<Pagination page=\{safePage\} perPage=\{per\} total=\{total\} \/>/.test(page));
  ok("page clamps an out-of-range ?page into range", /Math\.min\(page, totalPages\)/.test(page));
  ok("old silent 100+ truncation removed", !/rows\.length === 100/.test(page));
  ok("count header shows the real total, not rows.length", /t\("results", \{ count: total \}\)/.test(page));
  // Existing dedupe/react-key contract from WO-42 must survive (row key still index-suffixed).
  ok("row key still index-suffixed", /<tr key=\{`\$\{r\.cnr \?\? r\.title \?\? "row"\}-\$\{i\}`\}/.test(page));
}

// ── i18n: pager + count render bilingually with NO new keys ──
{
  const en = JSON.parse(src("src/i18n/messages/en.json"));
  const hi = JSON.parse(src("src/i18n/messages/hi.json"));
  ok("pagination.showing present en+hi", Boolean(en.pagination.showing && hi.pagination.showing));
  ok("research.results present en+hi", Boolean(en.research.results && hi.research.results));
}

console.log(failed ? `\n${failed} assertion(s) FAILED` : "\nAll WO-72 assertions passed");
process.exit(failed ? 1 : 0);
