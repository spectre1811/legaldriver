"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons";
import { isDisabled } from "./modules"; // WO-206: hide voice/messages/portfolio/notices behind one flag.

type NavEntry = { href: string; label: string; icon: IconName };

// Scrollable nav sections. "Advocate Onboarding" is the activation entry point, pinned to the
// top of the practice group (founder 2026-07-05); the four comms surfaces
// (inbox/messages/voice/notifications) are consolidated under "communication"; every item
// carries a distinct icon.
const SECTIONS: { heading: string; items: NavEntry[] }[] = [
  {
    heading: "practice",
    items: [
      { href: "/dashboard/onboarding", label: "onboarding", icon: "sparkles" },
      { href: "/dashboard", label: "overview", icon: "overview" },
      { href: "/dashboard/cases", label: "cases", icon: "cases" },
      { href: "/dashboard/clients", label: "clients", icon: "clients" },
      { href: "/dashboard/calendar", label: "calendar", icon: "calendar" },
      // WO-82: Judges & Lawyers — the live-corpus people directory, promoted out of the
      // buried Insight→Search tab shell to a first-class Practice surface (not hidden).
      { href: "/dashboard/directory", label: "directory", icon: "scale" },
    ],
  },
  {
    heading: "workflow",
    items: [
      { href: "/dashboard/cause-list", label: "causeList", icon: "clock" },
      { href: "/dashboard/notices", label: "notices", icon: "notices" },
      { href: "/dashboard/documents", label: "documents", icon: "documents" },
      { href: "/dashboard/invoices", label: "invoices", icon: "invoice" },
      { href: "/dashboard/ip", label: "ip", icon: "bulb" },
      { href: "/dashboard/portfolio", label: "portfolio", icon: "alert" },
    ],
  },
  {
    heading: "communication",
    items: [
      { href: "/dashboard/inbox", label: "inbox", icon: "gmail" },
      { href: "/dashboard/messages", label: "messages", icon: "chat" },
      { href: "/dashboard/voice", label: "voice", icon: "mic" },
      { href: "/dashboard/notifications", label: "notifications", icon: "bell" },
    ],
  },
  {
    heading: "insight",
    items: [
      { href: "/dashboard/search", label: "search", icon: "search" },
      { href: "/dashboard/analytics", label: "analytics", icon: "chart" },
    ],
  },
  {
    heading: "assistant",
    items: [
      { href: "/dashboard/assistant", label: "assistant", icon: "sparkles" },
      { href: "/dashboard/ai-usage", label: "aiUsage", icon: "gauge" },
    ],
  },
];

// Pinned in the sidebar footer (out of the scroll region) so it never clips off short viewports.
const ACCOUNT_ITEMS: NavEntry[] = [{ href: "/dashboard/settings", label: "settings", icon: "settings" }];

// WO-272 — founder-only. Rendered ONLY when the layout passes isAdmin (ADMIN_EMAILS
// gate). Deliberately NOT in NAV_TARGETS, so it never leaks into the ⌘K palette for
// non-admins (that list is static/client-side and can't be gated per-user).
const ADMIN_ITEMS: NavEntry[] = [{ href: "/dashboard/access-requests", label: "accessRequests", icon: "inbox" }];

// Sections with disabled modules filtered out; sections that empty out are dropped entirely.
const VISIBLE_SECTIONS = SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => !isDisabled(i.href)) })).filter(
  (s) => s.items.length > 0,
);

// Flattened jump-to targets (single source of truth) — reused by the ⌘K command palette.
export const NAV_TARGETS: NavEntry[] = [...VISIBLE_SECTIONS.flatMap((s) => s.items), ...ACCOUNT_ITEMS];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

// Daybreak signature (WO-328): honey is the ONE accent for the active row — a tinted honey
// pill + a honey rail, never a solid ink fill. Icon on active uses bronze-deep (the AA-safe
// honey-family text colour, per tokens.css) so it stays legible on the light tint.
function NavItem({ item, active, t }: { item: NavEntry; active: boolean; t: (k: string) => string }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 rounded-ec-s border-l-2 py-2 pl-[10px] pr-3 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo ${
        active
          ? "border-ec-honey bg-ec-honey/15 font-medium text-ec-ink"
          : "border-transparent text-ec-ink-2 hover:bg-ec-paper-3 hover:text-ec-ink"
      }`}
    >
      <Icon
        name={item.icon}
        className={`h-[1.15rem] w-[1.15rem] ${active ? "text-ec-bronze-deep" : "text-ec-ink-3 group-hover:text-ec-brass-deep"}`}
      />
      {t(`item.${item.label}`)}
    </Link>
  );
}

export function NavLinks({ isAdmin = false }: { isAdmin?: boolean }) {
  const t = useTranslations("nav");
  const isActive = useIsActive();

  return (
    <nav className="flex flex-col gap-6" aria-label={t("ariaMain")}>
      {VISIBLE_SECTIONS.map((section) => (
        <div key={section.heading}>
          {/* Daybreak "mono section label" — scoped to this element (not the shared .ec-label
              rule other surfaces use) so ledger/table headers elsewhere are untouched. */}
          <p className="ec-label mb-2 px-3 font-mono">{t(`heading.${section.heading}`)}</p>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <NavItem key={item.href} item={item} active={isActive(item.href)} t={t} />
            ))}
          </div>
        </div>
      ))}
      {isAdmin && (
        <div>
          <p className="ec-label mb-2 px-3 font-mono">{t("heading.admin")}</p>
          <div className="flex flex-col gap-0.5">
            {ADMIN_ITEMS.map((item) => (
              <NavItem key={item.href} item={item} active={isActive(item.href)} t={t} />
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

// Rendered in the pinned footer of both the desktop sidebar and the mobile drawer.
export function AccountNav() {
  const t = useTranslations("nav");
  const isActive = useIsActive();

  return (
    <nav className="flex flex-col gap-0.5" aria-label={t("heading.account")}>
      {ACCOUNT_ITEMS.map((item) => (
        <NavItem key={item.href} item={item} active={isActive(item.href)} t={t} />
      ))}
    </nav>
  );
}
