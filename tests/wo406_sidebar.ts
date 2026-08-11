// WO-406 D4 — collapsible & resizable sidebar. No live services, no DOM/React: exercises the pure
// clamp math directly (src/lib/sidebar-width.ts), plus source-greps to guard the load-bearing wiring
// (shared persistence hook, shared constants, the separator's a11y contract, the real panel-collapse
// glyph, and that layout.tsx no longer hardcodes the old fixed w-56 aside).
// Run: npx tsx tests/wo406_sidebar.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clampSidebarWidth,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_KEY,
} from "../src/lib/sidebar-width";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

// ── pure clamp math ───────────────────────────────────────────────────────────────────────────
check("default width matches today's w-56 (224px)", SIDEBAR_DEFAULT_WIDTH === 224);
check("collapsed rail is 56px", SIDEBAR_COLLAPSED_WIDTH === 56);
check("drag range matches DESIGN.md D4 (~200-360px)", SIDEBAR_MIN_WIDTH === 200 && SIDEBAR_MAX_WIDTH === 360);
check(
  "keys are mukadma-namespaced per DESIGN.md D4",
  SIDEBAR_WIDTH_KEY === "mukadma:sidebar:width" && SIDEBAR_COLLAPSED_KEY === "mukadma:sidebar:collapsed",
);
check("clamp: below min snaps to min", clampSidebarWidth(50) === SIDEBAR_MIN_WIDTH);
check("clamp: above max snaps to max", clampSidebarWidth(900) === SIDEBAR_MAX_WIDTH);
check("clamp: in-range value passes through unchanged", clampSidebarWidth(300) === 300);
check(
  "clamp: exact boundaries pass through",
  clampSidebarWidth(SIDEBAR_MIN_WIDTH) === SIDEBAR_MIN_WIDTH && clampSidebarWidth(SIDEBAR_MAX_WIDTH) === SIDEBAR_MAX_WIDTH,
);

// ── wiring (source-grep, matches the wo405_persisted_state.ts convention) ───────────────────────
const root = process.cwd();
const nav = readFileSync(join(root, "src/app/dashboard/nav.tsx"), "utf8");
const layout = readFileSync(join(root, "src/app/dashboard/layout.tsx"), "utf8");
const icons = readFileSync(join(root, "src/components/icons.tsx"), "utf8");

check(
  "nav.tsx persists width/collapsed via the shared usePersistedState hook, not hand-rolled localStorage",
  nav.includes("usePersistedState") && !nav.includes(".setItem(") && !nav.includes(".getItem("),
);
check(
  "nav.tsx uses the shared SIDEBAR_* constants, not a re-hardcoded literal",
  nav.includes("SIDEBAR_WIDTH_KEY") && nav.includes("SIDEBAR_COLLAPSED_KEY") && nav.includes("clampSidebarWidth"),
);
check(
  "the drag handle is a role=separator, vertical-orientation, keyboard-resizable a11y contract",
  /role="separator"/.test(nav) && /aria-orientation="vertical"/.test(nav) && nav.includes("onKeyDown"),
);
check(
  "the collapse control wires the real panel-collapse glyph, never a bare chevron",
  nav.includes('"panelCollapse"') && nav.includes('"panelExpand"'),
);
check("icons.tsx defines both panelCollapse and panelExpand glyphs", icons.includes("panelCollapse:") && icons.includes("panelExpand:"));
check(
  "layout.tsx mounts the collapsible Sidebar, not the old hardcoded w-56 aside",
  layout.includes("<Sidebar") && !layout.includes("w-56 shrink-0"),
);
check("collapsed rail hides the CONSOLE eyebrow/hairline", nav.includes("!collapsed") && nav.includes('t("heading.console")'));
check("collapsed rail drops the honey active-rail marker (expanded-only)", /!collapsed && active/.test(nav));

console.log(failures === 0 ? "WO-406 SIDEBAR: PASS" : `WO-406 SIDEBAR: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
