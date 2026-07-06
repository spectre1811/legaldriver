// WO-56 · Pagination adoption sweep. Guards that every large, growable list the founder
// flagged now flows through the shared WO-39 pagination primitive instead of a bare
// `.limit(N)` fetch-all or a `.slice(0, N)` that hides the real size — so a future edit
// can't silently reintroduce a "built-for-demo" un-paginated list.
//
// This is a STRUCTURAL/source guard (the pagination arithmetic itself is covered by
// tests/wo39_paginate.ts). It asserts, per target surface: the pagination primitive is
// adopted, and the specific un-paginated pattern this WO removed is gone.
// Run: npx tsx tests/wo56_pagination_adoption.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
// Comment-free view for the "forbidden pattern removed" checks — otherwise a code
// comment that *mentions* the old `.limit(300)` we deleted would trip its own guard.
// (`://` is spared so URLs in JSX survive.)
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/([^:])\/\/.*$/gm, "$1");

// ── (0) the shared primitive supports two independent lists on one page (WO-56) ──────
const paginationComp = read("src/components/pagination.tsx");
check("Pagination: exposes pageKey/perKey props", /pageKey\s*=\s*["']page["']/.test(paginationComp) && /perKey\s*=\s*["']per["']/.test(paginationComp));

// ── (1) Supabase-backed lists: numbered pagination (range + exact count), no bare cap ─
const SUPABASE_LISTS: { file: string; forbid: RegExp; label: string }[] = [
  { file: "src/app/dashboard/documents/page.tsx", forbid: /\.limit\(300\)/, label: "documents" },
  { file: "src/app/dashboard/inbox/page.tsx", forbid: /\.limit\(200\)/, label: "inbox" },
  { file: "src/app/dashboard/messages/page.tsx", forbid: /MSG_CAP|\.limit\(300\)/, label: "messages" },
];
for (const { file, forbid, label } of SUPABASE_LISTS) {
  const src = read(file);
  const name = file.split("/").slice(-2).join("/") + ` (${label})`;
  check(`${name}: adopts the shared <Pagination>`, /from ["']@\/components\/pagination["']/.test(src) && /<Pagination\b/.test(src));
  check(`${name}: pages via range() + exact count`, /\.range\(\s*from\s*,\s*to\s*\)/.test(src) && /count:\s*["']exact["']/.test(src));
  check(`${name}: bare .limit fetch-all removed`, !forbid.test(code(file)));
  check(`${name}: uses the paginate helpers`, /parsePage|rangeFor/.test(src));
}

// client-detail hosts TWO independent paginated lists (matters + documents), so it uses
// the pageKey/perKey variant. The matters query was unbounded (no page control at all).
const clientDetail = read("src/app/dashboard/clients/[id]/page.tsx");
check("clients/[id]: adopts the shared <Pagination> (matters + docs)", /from ["']@\/components\/pagination["']/.test(clientDetail) && (clientDetail.match(/<Pagination\b/g) ?? []).length >= 2);
check("clients/[id]: two independent page params (docs uses dpage/dper)", /pageKey=["']dpage["']/.test(clientDetail));
check("clients/[id]: matters + docs both range()-paged with exact count", /\.range\(\s*mRange\.from/.test(clientDetail) && /\.range\(\s*dRange\.from/.test(clientDetail) && (clientDetail.match(/count:\s*["']exact["']/g) ?? []).length >= 2);

// ── (2) /v1 API-array dossiers: bound the DOM by windowing the returned array ─────────
const DOSSIERS: { file: string; forbid: RegExp; slice: string; label: string }[] = [
  { file: "src/app/dashboard/advocate/[...barId]/page.tsx", forbid: /profile\.cases\.map/, slice: "pageCases", label: "advocate" },
  { file: "src/app/dashboard/judge/[judgeId]/page.tsx", forbid: /\.slice\(0,\s*15\)/, slice: "pageDecisions", label: "judge" },
];
for (const { file, forbid, slice, label } of DOSSIERS) {
  const src = read(file);
  const name = file.split("/").slice(-2).join("/") + ` (${label})`;
  check(`${name}: adopts the shared <Pagination>`, /from ["']@\/components\/pagination["']/.test(src) && /<Pagination\b/.test(src));
  check(`${name}: windows the array (slice from,to+1)`, /\.slice\(from,\s*to\s*\+\s*1\)/.test(src));
  check(`${name}: table renders the page window (${slice})`, new RegExp(`\\b${slice}\\.map\\b`).test(src));
  check(`${name}: full-array dump / hard slice removed`, !forbid.test(code(file)));
}

// ── (3) portfolio risk dashboard: bounded + indexed, no fetch-all scans ───────────────
const portfolio = read("src/app/dashboard/portfolio/page.tsx");
check("portfolio: uses the bounded portfolio-query helper", /from ["']\.\/portfolio-query["']/.test(portfolio));
check("portfolio: .limit(1000) matter fetch-all removed", !/\.limit\(1000\)/.test(portfolio));
check("portfolio: .limit(3000) document fetch-all removed", !/\.limit\(3000\)/.test(portfolio));

const portfolioQuery = read("src/app/dashboard/portfolio/portfolio-query.ts");
check("portfolio-query: caps the open scan (named constant, honest overflow)", /OPEN_SCAN_CAP/.test(portfolioQuery));
check("portfolio-query: open-status filter pushed to SQL (nulls = open)", /status\.is\.null/.test(portfolioQuery) && /not\.ilike/.test(portfolioQuery));
check("portfolio-query: latest-doc lookup scoped to at-risk candidates", /\.in\(["']matter_id["']/.test(portfolioQuery));

console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILED"}  (wo56_pagination_adoption)`);
process.exit(failures === 0 ? 0 : 1);
