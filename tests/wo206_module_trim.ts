// WO-206 · Voice / Messages / Portfolio / Notices are hidden from the console behind a single
// DISABLED_MODULES flag in nav.tsx — gone from the sidebar nav + ⌘K palette, and their routes
// redirect to /dashboard (no 404). Code is NOT deleted; re-enable = empty the array.
// Offline structural test — no network, no .env. Run: npx tsx tests/wo206_module_trim.ts
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
let ok = true;
const fail = (m: string) => { ok = false; console.log("FAIL:", m); };

const HIDDEN = ["voice", "messages", "portfolio", "notices"] as const;
const STILL_ON = ["cases", "clients", "inbox", "notifications", "documents", "invoices"] as const;

// 1. The single flag file lists exactly the four disabled routes.
const modules = read("src/app/dashboard/modules.ts");
for (const m of HIDDEN) {
  if (!modules.includes(`"/dashboard/${m}"`)) fail(`modules.ts DISABLED_MODULES missing /dashboard/${m}`);
}
if (!modules.includes("DISABLED_MODULES") || !modules.includes("isDisabled")) fail("modules.ts missing the DISABLED_MODULES flag / isDisabled helper");

// nav must consume the flag and build NAV_TARGETS + the sidebar from the filtered VISIBLE_SECTIONS, not raw SECTIONS.
const nav = read("src/app/dashboard/nav.tsx");
if (!/isDisabled\b/.test(nav) || !nav.includes('from "./modules"')) fail("nav.tsx must import isDisabled from ./modules");
if (!/NAV_TARGETS[^=]*=\s*\[\s*\.\.\.VISIBLE_SECTIONS/.test(nav)) fail("NAV_TARGETS must derive from VISIBLE_SECTIONS (filtered)");
if (!/VISIBLE_SECTIONS\.map\(\(section\)/.test(nav)) fail("NavLinks must render VISIBLE_SECTIONS, not SECTIONS");

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
