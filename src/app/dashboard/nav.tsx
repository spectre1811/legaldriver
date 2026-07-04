"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons";

type NavEntry = { href: string; label: string; icon: IconName };

// Scrollable nav sections. Onboarding is demoted out of the top slot into its own
// low-key "setup" group; the four comms surfaces (inbox/messages/voice/notifications)
// are consolidated under "communication"; every item now carries a distinct icon.
const SECTIONS: { heading: string; items: NavEntry[] }[] = [
  {
    heading: "practice",
    items: [
      { href: "/dashboard", label: "overview", icon: "overview" },
      { href: "/dashboard/cases", label: "cases", icon: "cases" },
      { href: "/dashboard/clients", label: "clients", icon: "clients" },
      { href: "/dashboard/calendar", label: "calendar", icon: "calendar" },
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
      { href: "/dashboard/research", label: "research", icon: "search" },
      { href: "/dashboard/lookup", label: "lookup", icon: "scale" },
      { href: "/dashboard/analytics", label: "analytics", icon: "chart" },
    ],
  },
  {
    heading: "assistant",
    items: [
      { href: "/dashboard/copilot", label: "copilot", icon: "sparkles" },
      { href: "/dashboard/draft", label: "drafting", icon: "edit" },
      { href: "/dashboard/ai-usage", label: "aiUsage", icon: "gauge" },
    ],
  },
  {
    heading: "setup",
    items: [{ href: "/dashboard/onboarding", label: "onboarding", icon: "check" }],
  },
];

// Pinned in the sidebar footer (out of the scroll region) so it never clips off short viewports.
const ACCOUNT_ITEMS: NavEntry[] = [{ href: "/dashboard/settings", label: "settings", icon: "settings" }];

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

function NavItem({ item, active, t }: { item: NavEntry; active: boolean; t: (k: string) => string }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`group flex items-center gap-3 rounded-ec-s px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-indigo ${
        active
          ? "bg-ec-ink font-medium text-ec-paper"
          : "text-ec-ink-2 hover:bg-ec-paper-3 hover:text-ec-ink"
      }`}
    >
      <Icon
        name={item.icon}
        className={`h-[1.15rem] w-[1.15rem] ${active ? "text-ec-paper" : "text-ec-ink-3 group-hover:text-ec-brass-deep"}`}
      />
      {t(`item.${item.label}`)}
    </Link>
  );
}

export function NavLinks() {
  const t = useTranslations("nav");
  const isActive = useIsActive();

  return (
    <nav className="flex flex-col gap-6" aria-label={t("ariaMain")}>
      {SECTIONS.map((section) => (
        <div key={section.heading}>
          <p className="ec-label mb-2 px-3">{t(`heading.${section.heading}`)}</p>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => (
              <NavItem key={item.href} item={item} active={isActive(item.href)} t={t} />
            ))}
          </div>
        </div>
      ))}
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
