"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { isDisabled } from "./modules"; // WO-206: hide voice/messages/portfolio/notices behind one flag.
import { BrandMark } from "@/components/brand-mark";
import { brand } from "@/lib/brand";
import { usePersistedState } from "@/lib/hooks/use-persisted-state";
import {
  clampSidebarWidth,
  SIDEBAR_COLLAPSED_KEY,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_KEY_STEP,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_KEY,
} from "@/lib/sidebar-width";

type NavEntry = { href: string; label: string; icon: IconName };

// WO-403 (§D5) — Onboarding moved to 2nd position, right after Overview. Supersedes WO-345's
// "exact order Overview→Onboarding" note (that described the list's span, not adjacency — this
// is the new founder-approved order). WO-206 module-hiding still applies below (none of these 8
// are currently disabled, but the flag stays live so a future "have it later" module still hides
// cleanly without touching this order).
const NAV_ALL: NavEntry[] = [
  { href: "/dashboard", label: "overview", icon: "overview" },
  { href: "/dashboard/onboarding", label: "onboarding", icon: "sparkles" },
  { href: "/dashboard/cases", label: "cases", icon: "cases" },
  { href: "/dashboard/clients", label: "clients", icon: "clients" },
  { href: "/dashboard/documents", label: "documents", icon: "documents" },
  { href: "/dashboard/inbox", label: "inbox", icon: "gmail" },
  { href: "/dashboard/notifications", label: "notifications", icon: "bell" },
  { href: "/dashboard/directory", label: "directory", icon: "scale" },
];
export const NAV: NavEntry[] = NAV_ALL.filter((i) => !isDisabled(i.href));

// Settings now lives ONLY in the sidebar footer (SidebarFooter below) — kept here too so it
// still surfaces as a ⌘K jump-to target (NAV_TARGETS), even though it's off the visible list.
const ACCOUNT_ITEMS: NavEntry[] = [{ href: "/dashboard/settings", label: "settings", icon: "settings" }];

// WO-272 — founder-only. Appended to the SAME flat Console list (WO-345 kills every group
// header, including the old ADMIN one) when the layout passes isAdmin (ADMIN_EMAILS gate).
// Deliberately NOT in NAV_TARGETS, so it never leaks into the ⌘K palette for non-admins.
const ADMIN_ITEMS: NavEntry[] = [{ href: "/dashboard/access-requests", label: "accessRequests", icon: "inbox" }];

// Flattened jump-to targets (single source of truth) — reused by the ⌘K command palette.
export const NAV_TARGETS: NavEntry[] = [...NAV, ...ACCOUNT_ITEMS];

export function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

// Shared collapsed-rail tooltip: a dark pill to the right, hidden until hover/focus.
// aria-hidden because the Link itself carries the accessible name via aria-label when collapsed
// (DESIGN.md D4 a11y: "tooltips via title/aria-label on collapsed icons").
function RailTooltip({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-full top-1/2 z-ec-dropdown ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-ec-s border border-ec-line bg-ec-ink px-2 py-1 text-[11.5px] text-ec-paper opacity-0 shadow-ec-2 transition-opacity motion-safe:duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {label}
    </span>
  );
}

// Daybreak two-tone active row (app-shell.tsx:290-297): a tinted honey-family pill
// (bronze-tint bg + bronze-deep text, never a solid fill) PLUS a honey left rail —
// replacing the old one-tone honey border-l treatment.
// WO-406 D4: `collapsed` swaps the row for a centered h-9 w-9 icon square (no honey rail
// marker, no label) with the RailTooltip above standing in for the hidden label.
function NavItem({
  item,
  active,
  collapsed,
  t,
}: {
  item: NavEntry;
  active: boolean;
  collapsed: boolean;
  t: (k: string) => string;
}) {
  const label = t(`item.${item.label}`);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      className={
        collapsed
          ? `group relative flex h-9 w-9 items-center justify-center rounded-ec-s transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey ${
              active ? "bg-ec-bronze-tint text-ec-bronze-deep" : "text-ec-ink-2 hover:bg-ec-band"
            }`
          : `group relative flex items-center gap-2.5 rounded-ec-s py-2 pl-3 pr-2 text-[13px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey ${
              active ? "bg-ec-bronze-tint font-medium text-ec-bronze-deep" : "text-ec-ink-2 hover:bg-ec-band"
            }`
      }
    >
      {!collapsed && active && <span className="absolute left-0 h-4 w-[3px] rounded-r-full bg-ec-honey" />}
      <Icon
        name={item.icon}
        className={`h-[1.15rem] w-[1.15rem] shrink-0 ${active ? "text-ec-bronze-deep" : "text-ec-ink-3 group-hover:text-ec-brass-deep"}`}
      />
      {collapsed ? <RailTooltip label={label} /> : <span className="min-w-0 flex-1 truncate">{label}</span>}
    </Link>
  );
}

export function NavLinks({ isAdmin = false, collapsed = false }: { isAdmin?: boolean; collapsed?: boolean }) {
  const t = useTranslations("nav");
  const isActive = useIsActive();
  const items = isAdmin ? [...NAV, ...ADMIN_ITEMS] : NAV;

  return (
    <>
      {/* Mono "Console" eyebrow + hairline (app-shell.tsx:280-281) — expanded only; DESIGN.md
          D4 drops both in the collapsed rail. */}
      {!collapsed && (
        <>
          <div className="eyebrow">{t("heading.console")}</div>
          <div className="mt-1.5 h-[3px] border-y border-ec-line" />
        </>
      )}
      <nav
        aria-label={t("ariaMain")}
        className={`flex flex-col gap-0.5 ${collapsed ? "mt-0 items-center" : "mt-2"}`}
      >
        {items.map((item) => (
          <NavItem key={item.href} item={item} active={isActive(item.href)} collapsed={collapsed} t={t} />
        ))}
      </nav>
    </>
  );
}

// Sidebar-bottom pinned Settings (app-shell.tsx:310-318) — the ONE Settings entry point now
// (top-bar.tsx AccountLinks no longer has its own copy, so it appears exactly once per the
// founder's "2 settings" fix). Shared by the desktop aside AND the mobile drawer — never
// inline-fork this into two copies. `collapsed` (desktop rail only) swaps it for a centered
// icon square + RailTooltip, same treatment as NavItem.
export function SidebarFooter({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations("nav");
  const label = t("item.settings");
  return (
    <div className="mt-auto border-t border-ec-line pt-3">
      <Link
        href="/dashboard/settings"
        aria-label={collapsed ? label : undefined}
        className={
          collapsed
            ? "group relative mx-auto flex h-9 w-9 items-center justify-center rounded-ec-s text-ec-muted-ink transition hover:bg-ec-paper-3 hover:text-ec-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey"
            : "group relative flex items-center gap-2.5 rounded-ec-s px-3 py-2 text-[13px] text-ec-muted-ink transition hover:bg-ec-paper-3 hover:text-ec-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey"
        }
      >
        <Icon name="settings" className="h-[1.15rem] w-[1.15rem] shrink-0" />
        {collapsed ? <RailTooltip label={label} /> : label}
      </Link>
    </div>
  );
}

// WO-406 D4 — the collapsible & resizable desktop sidebar. Wraps the logo/NavLinks/SidebarFooter
// composition that used to live inline in layout.tsx (a server component, so the interactive bits
// — collapse toggle, drag-to-resize, persistence — have to live in a client child instead).
// Width + collapsed persist via the shared usePersistedState hook (WO-405 PRE-C4), never hand-rolled
// localStorage. The <aside> stays `shrink-0` in layout.tsx's flex row, so <main> (`flex-1`) reflows
// to whatever width lands here for free — no coordination needed on the layout.tsx side.
export function Sidebar({ isAdmin = false, homeLabel }: { isAdmin?: boolean; homeLabel: string }) {
  const t = useTranslations("nav");
  const [collapsed, setCollapsed] = usePersistedState<boolean>(SIDEBAR_COLLAPSED_KEY, false);
  const [width, setWidth] = usePersistedState<number>(SIDEBAR_WIDTH_KEY, SIDEBAR_DEFAULT_WIDTH);
  // Live width while actively dragging — kept in local state so a pointermove doesn't hammer
  // localStorage on every pixel; the persisted `width` only commits once, on pointer-up.
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef<{ x: number; width: number } | null>(null);

  const displayWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : clampSidebarWidth(liveWidth ?? width);

  function onHandlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (collapsed) return;
    // Best-effort: capturing keeps the drag tracking even if the pointer leaves the 4px handle
    // mid-drag. Not essential to correctness (onHandlePointerMove/endDrag work without it), so a
    // capture failure (unsupported pointerId, some synthetic-event paths) must never abort the drag.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore — see above
    }
    dragStart.current = { x: e.clientX, width: clampSidebarWidth(width) };
    setDragging(true);
  }
  function onHandlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    setLiveWidth(clampSidebarWidth(dragStart.current.width + (e.clientX - dragStart.current.x)));
  }
  function endDrag() {
    if (dragStart.current && liveWidth != null) setWidth(liveWidth);
    dragStart.current = null;
    setDragging(false);
    setLiveWidth(null);
  }
  function onHandleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (collapsed) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setWidth((w) => clampSidebarWidth(w - SIDEBAR_KEY_STEP));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setWidth((w) => clampSidebarWidth(w + SIDEBAR_KEY_STEP));
    }
  }

  return (
    <aside
      style={{ width: displayWidth }}
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-ec-line bg-ec-card py-5 md:flex ${
        collapsed ? "px-2" : "px-4"
      } ${dragging ? "" : "motion-safe:transition-[width] motion-safe:duration-150 motion-safe:ease-out"}`}
    >
      {/* Brand mark (letter tile) + typographic wordmark — the "date underline" motif.
          Collapsed rail: mark only, centered (DESIGN.md D4) — never the prototype's all-caps
          seal wordmark (Reconciliation §1: our lowercase mukadma + मुक़दमा lockup, always). */}
      <Link
        href="/dashboard"
        aria-label={homeLabel}
        className={
          collapsed
            ? "flex items-center justify-center rounded-ec-s py-1 transition hover:bg-ec-paper-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey"
            : "flex items-center gap-2.5 rounded-ec-s px-2 py-1 transition hover:bg-ec-paper-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey"
        }
      >
        <BrandMark size={32} tone="dark" className="shrink-0" />
        {!collapsed && (
          <div className="leading-tight">
            <p className="ec-underline inline-block font-display text-2xl font-semibold lowercase tracking-tight text-ec-ink">
              {brand.name}
            </p>
            <p className="mt-1.5 truncate text-xs text-ec-ink-3" lang="hi">{brand.nameDevanagari}</p>
          </div>
        )}
      </Link>

      <div className={`mt-7 flex-1 ${collapsed ? "overflow-visible" : "overflow-y-auto"}`}>
        <NavLinks isAdmin={isAdmin} collapsed={collapsed} />
      </div>

      {/* Collapse control — mt-auto, above Settings. FOUNDER TWEAK (11 Aug): a real
          panel-collapse glyph (components/icons.tsx), never a bare chevron. */}
      <div className={collapsed ? "flex justify-center pb-1" : "flex justify-end pb-1"}>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
          className="flex h-7 w-7 items-center justify-center rounded-ec-s border border-ec-line bg-ec-card text-ec-muted-ink transition hover:text-ec-bronze focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey"
        >
          <Icon name={collapsed ? "panelExpand" : "panelCollapse"} className="h-4 w-4" />
        </button>
      </div>

      <SidebarFooter collapsed={collapsed} />

      {/* Drag handle — resizes 200-360px. Hidden on the collapsed rail (nothing to drag at a
          fixed 56px). role=separator + arrow-key resize per DESIGN.md D4 a11y (H1/H2 audit). */}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("resizeSidebar")}
          aria-valuenow={Math.round(displayWidth)}
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          tabIndex={0}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onHandleKeyDown}
          className={`absolute inset-y-0 right-0 w-[4px] cursor-col-resize touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ec-honey ${
            dragging ? "bg-ec-bronze-tint" : "bg-ec-band"
          }`}
        >
          <span
            className={`absolute inset-y-0 right-0 ${dragging ? "w-[2px] bg-ec-bronze" : "w-px bg-ec-hair-strong/60"}`}
          />
        </div>
      )}
    </aside>
  );
}
