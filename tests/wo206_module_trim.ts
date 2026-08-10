// WO-206 · Voice / Messages / Portfolio / Notices are hidden from the console behind a single
// DISABLED_MODULES flag in nav.tsx — gone from the sidebar nav + ⌘K palette, and their routes
// redirect to /dashboard (no 404). Code is NOT deleted; re-enable = empty the array.
// WO-345 flattened nav.tsx from grouped SECTIONS/VISIBLE_SECTIONS to a single flat NAV list
// (design-mockups/iteration3/console/app-shell.tsx) — this test was updated to match that shape;
// the underlying isDisabled guarantee it checks is unchanged.
// Offline structural test — no network, no .env. Run: npx tsx tests/wo206_module_trim.ts
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
let ok = true;
const fail = (m: string) => { ok = false; console.log("FAIL:", m); };

const HIDDEN = ["voice", "messages", "portfolio", "notices", "ip"] as const; // WO-201 W4: ip joined the trim (founder 2026-07-18).
// "invoices" dropped from STILL_ON (WO-328 folded it into DISABLED_MODULES too — it's no longer
// part of the flat Console list WO-345 enumerates).
const STILL_ON = ["cases", "clients", "inbox", "notifications", "documents"] as const;

// 1. The single flag file lists exactly the four disabled routes.
const modules = read("src/app/dashboard/modules.ts");
for (const m of HIDDEN) {
  if (!modules.includes(`"/dashboard/${m}"`)) fail(`modules.ts DISABLED_MODULES missing /dashboard/${m}`);
}
if (!modules.includes("DISABLED_MODULES") || !modules.includes("isDisabled")) fail("modules.ts missing the DISABLED_MODULES flag / isDisabled helper");

// nav must consume the flag and build NAV_TARGETS + the sidebar from the filtered NAV, not the raw list.
const nav = read("src/app/dashboard/nav.tsx");
if (!/isDisabled\b/.test(nav) || !nav.includes('from "./modules"')) fail("nav.tsx must import isDisabled from ./modules");
if (!/NAV:\s*NavEntry\[\]\s*=\s*NAV_ALL\.filter\(\(i\)\s*=>\s*!isDisabled\(i\.href\)\)/.test(nav)) fail("NAV must derive from NAV_ALL filtered by isDisabled");
if (!/NAV_TARGETS[^=]*=\s*\[\s*\.\.\.NAV\b/.test(nav)) fail("NAV_TARGETS must derive from the filtered NAV");
if (!/items\.map\(\(item\)/.test(nav)) fail("NavLinks must render the flat item list, not a grouped SECTIONS");

// 2. ⌘K quick actions carry no link to a hidden module (the newNotice → /dashboard/notices deep-link is gone).
const palette = read("src/components/command-palette.tsx");
const quickBlock = palette.slice(palette.indexOf("const QUICK"), palette.indexOf("export function CommandPalette"));
for (const m of HIDDEN) {
  if (quickBlock.includes(`/dashboard/${m}`)) fail(`command palette QUICK still deep-links a hidden module: /dashboard/${m}`);
}

// 3. Each hidden route redirects to /dashboard, gated on the same flag (server component, before render).
for (const m of HIDDEN) {
  const page = read(`src/app/dashboard/${m}/page.tsx`);
  if (!page.includes('from "next/navigation"') || !/isDisabled\([^)]*\)\)\s*redirect\(\s*["']\/dashboard["']\s*\)/.test(page)) {
    fail(`/dashboard/${m}/page.tsx must guard with isDisabled(...) → redirect("/dashboard")`);
  }
  // Code preserved, not deleted — the page body still exists after the redirect gate.
  if (!page.includes("getTranslations") && !page.includes("createClient")) fail(`/dashboard/${m}/page.tsx body looks deleted — code must be kept`);
}

// 4. Enabled modules are untouched: still listed in nav, no redirect stub on their pages.
for (const m of STILL_ON) {
  if (!nav.includes(`label: "${m}"`)) fail(`enabled module "${m}" vanished from nav`);
}

console.log(ok ? "WO206 MODULE TRIM: PASS" : "WO206 MODULE TRIM: FAIL");
process.exit(ok ? 0 : 1);
