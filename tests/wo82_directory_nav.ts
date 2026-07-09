// WO-82 · The Judges & Lawyers directory is promoted out of the buried Insight→Search tab
// shell to a first-class Practice nav surface at /dashboard/directory, and the old route
// redirects there so nothing breaks. Offline structural test — no network, no .env.
// Run: npx tsx tests/wo82_directory_nav.ts
import { readFileSync } from "node:fs";
import en from "@/i18n/messages/en.json";
import hi from "@/i18n/messages/hi.json";

const read = (p: string) => readFileSync(p, "utf8");
let ok = true;
const fail = (m: string) => { ok = false; console.log("FAIL:", m); };

// 1. Nav: the "directory" item lives in the Practice section (not Insight), pointing at the new route.
const nav = read("src/app/dashboard/nav.tsx");
const practiceBlock = nav.slice(nav.indexOf('heading: "practice"'), nav.indexOf('heading: "workflow"'));
if (!practiceBlock.includes('href: "/dashboard/directory"')) fail("nav Practice section missing /dashboard/directory");
if (!practiceBlock.includes('label: "directory"')) fail("nav Practice section missing the directory label");

// 2. The new Practice-level directory page exists (a real page, not a redirect).
const dir = read("src/app/dashboard/directory/page.tsx");
if (!/export default async function/.test(dir)) fail("/dashboard/directory is not a page component");
if (!dir.includes('getTranslations("lookup")')) fail("/dashboard/directory should reuse the lookup catalog");
if (!dir.includes("/dashboard/advocate/") || !dir.includes("/dashboard/judge/")) fail("/dashboard/directory must link advocate + judge dossiers");

// 3. The old route redirects to the new one, preserving the query — old links keep working.
const oldDir = read("src/app/dashboard/search/directory/page.tsx");
if (!oldDir.includes("redirect(") || !oldDir.includes("/dashboard/directory")) fail("old /dashboard/search/directory must redirect to /dashboard/directory");

// 4. i18n parity for the new keys (i18n_coverage guards the rest; assert presence explicitly here).
type Dict = Record<string, any>;
const navItem = (d: Dict) => d?.nav?.item ?? {};
const lookup = (d: Dict) => d?.lookup ?? {};
for (const [loc, d] of [["en", en], ["hi", hi]] as const) {
  if (!navItem(d).directory) fail(`${loc}: nav.item.directory missing`);
  if (!lookup(d).directoryTitle) fail(`${loc}: lookup.directoryTitle missing`);
  if (!lookup(d).browseTitle) fail(`${loc}: lookup.browseTitle missing`);
}

console.log(ok ? "WO82 DIRECTORY NAV: PASS" : "WO82 DIRECTORY NAV: FAIL");
process.exit(ok ? 0 : 1);
