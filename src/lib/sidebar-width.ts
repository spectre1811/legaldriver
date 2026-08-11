// WO-406 D4 — pure sidebar width/collapse math, deliberately free of React/Next imports so it's
// unit-testable offline (tests/wo406_sidebar.ts) without a DOM, mirroring the persisted-state.ts /
// use-persisted-state.ts split. The client shell (drag + keyboard + persistence) lives in
// src/app/dashboard/nav.tsx's `Sidebar` component.
//
// Values per DESIGN.md D4: expanded default 224px (today's `w-56`), collapsed rail 56px, drag
// range ~200-360px, persisted under `mukadma:sidebar:width` + `mukadma:sidebar:collapsed`.
export const SIDEBAR_WIDTH_KEY = "mukadma:sidebar:width";
export const SIDEBAR_COLLAPSED_KEY = "mukadma:sidebar:collapsed";
export const SIDEBAR_DEFAULT_WIDTH = 224;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 360;
export const SIDEBAR_COLLAPSED_WIDTH = 56;
export const SIDEBAR_KEY_STEP = 16; // px per arrow-key press on the drag separator

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}
