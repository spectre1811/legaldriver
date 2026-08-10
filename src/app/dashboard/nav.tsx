"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons";
import { isDisabled } from "./modules"; // WO-206: hide voice/messages/portfolio/notices behind one flag.

type NavEntry = { href: string; label: string; icon: IconName; badgeKey?: "inbox" };

// WO-345 — prototype fidelity (design-mockups/iteration3/console/app-shell.tsx:28-37,280-308):
// ONE flat "Console" list, exact order Overview→Onboarding. Supersedes WO-328's "onboarding
// pinned first" note (this order is the founder-approved one now). WO-206 module-hiding still
// applies below (none of these 8 are currently disabled, but the flag stays live so a future
// "have it later" module still hides cleanly without touching this order).
const NAV_ALL: NavEntry[] = [
  { href: "/dashboard", label: "overview", icon: "overview" },
  { href: "/dashboard/cases", label: "cases", icon: "cases" },
  { href: "/dashboard/clients", label: "clients", icon: "clients" },
  { href: "/dashboard/documents", label: "documents", icon: "documents" },
  { href: "/dashboard/inbox", label: "inbox", icon: "gmail", badgeKey: "inbox" },
  { href: "/dashboard/notifications", label: "notifications", icon: "bell" },
  { href: "/dashboard/directory", label: "directory", icon: "scale" },
  { href: "/dashboard/onboarding", label: "onboarding", icon: "sparkles" },
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

// Daybreak two-tone active row (app-shell.tsx:290-297): a tinted honey-family pill
// (bronze-tint bg + bronze-deep text, never a solid fill) PLUS a honey left rail —
// replacing the old one-tone honey border-l treatment.
function NavItem({
  item,
  active,
  badge,
  t,
}: {
  item: NavEntry;
  active: boolean;
  badge?: number;
  t: (k: string) => string;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group relative flex items-center gap-2.5 rounded-ec-s py-2 pl-3 pr-2 text-[13px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo ${
        active ? "bg-ec-bronze-tint font-medium text-ec-bronze-deep" : "text-ec-ink-2 hover:bg-ec-paper-3"
      }`}
    >
      {active && <span className="absolute left-0 h-4 w-[3px] rounded-r-full bg-ec-honey" />}
      <Icon
        name={item.icon}
        className={`h-[1.15rem] w-[1.15rem] shrink-0 ${active ? "text-ec-bronze-deep" : "text-ec-ink-3 group-hover:text-ec-brass-deep"}`}
      />
      <span className="min-w-0 flex-1 truncate">{t(`item.${item.label}`)}</span>
      {!!badge && (
        <span className="num shrink-0 rounded bg-ec-honey px-1.5 font-mono text-[10px] text-ec-honey-ink">
          {badge}
        </span>
      )}
    </Link>
  );
}

export function NavLinks({ isAdmin = false, inboxCount = 0 }: { isAdmin?: boolean; inboxCount?: number }) {
  const t = useTranslations("nav");
  const isActive = useIsActive();
  const items = isAdmin ? [...NAV, ...ADMIN_ITEMS] : NAV;

  return (
    <>
      {/* Mono "Console" eyebrow + hairline (app-shell.tsx:280-281) — replaces the old
          PRACTICE/WORKFLOW/COMMUNICATION/INSIGHT/ASSISTANT/ADMIN group headers entirely. */}
      <div className="eyebrow">{t("heading.console")}</div>
      <div className="mt-1.5 h-[3px] border-y border-ec-line" />
      <nav aria-label={t("ariaMain")} className="mt-2 flex flex-col gap-0.5">
        {items.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            active={isActive(item.href)}
            badge={item.badgeKey === "inbox" ? inboxCount : undefined}
            t={t}
          />
        ))}
      </nav>
    </>
  );
}

// Sidebar-bottom pinned Settings (app-shell.tsx:310-318) — the ONE Settings entry point now
// (top-bar.tsx AccountLinks no longer has its own copy, so it appears exactly once per the
// founder's "2 settings" fix). Shared by the desktop aside AND the mobile drawer — never
// inline-fork this into two copies.
export function SidebarFooter() {
  const t = useTranslations("nav");
  return (
    <div className="mt-auto border-t border-ec-line pt-3">
      <Link
        href="/dashboard/settings"
        className="flex items-center gap-2.5 rounded-ec-s px-3 py-2 text-[13px] text-ec-muted-ink transition hover:bg-ec-paper-3 hover:text-ec-ink-2"
      >
        <Icon name="settings" className="h-[1.15rem] w-[1.15rem] shrink-0" />
        {t("item.settings")}
      </Link>
    </div>
  );
}
