"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons";

const SECTIONS: { heading: string; items: { href: string; label: string; icon: IconName }[] }[] = [
  {
    heading: "practice",
    items: [
      { href: "/dashboard", label: "overview", icon: "overview" },
      { href: "/dashboard/onboarding", label: "onboarding", icon: "sparkles" },
      { href: "/dashboard/clients", label: "clients", icon: "overview" },
      { href: "/dashboard/cases", label: "cases", icon: "cases" },
      { href: "/dashboard/calendar", label: "calendar", icon: "calendar" },
      { href: "/dashboard/analytics", label: "analytics", icon: "overview" },
      { href: "/dashboard/portfolio", label: "portfolio", icon: "alert" },
      { href: "/dashboard/research", label: "research", icon: "search" },
      { href: "/dashboard/lookup", label: "lookup", icon: "scale" },
    ],
  },
  {
    heading: "workflow",
    items: [
      { href: "/dashboard/notices", label: "notices", icon: "notices" },
      { href: "/dashboard/cause-list", label: "causeList", icon: "clock" },
      { href: "/dashboard/inbox", label: "inbox", icon: "gmail" },
      { href: "/dashboard/messages", label: "messages", icon: "inbox" },
      { href: "/dashboard/voice", label: "voice", icon: "clip" },
      { href: "/dashboard/documents", label: "documents", icon: "documents" },
      { href: "/dashboard/invoices", label: "invoices", icon: "documents" },
      { href: "/dashboard/ip", label: "ip", icon: "scale" },
      { href: "/dashboard/notifications", label: "notifications", icon: "bell" },
    ],
  },
  {
    heading: "assistant",
    items: [
      { href: "/dashboard/copilot", label: "copilot", icon: "sparkles" },
      { href: "/dashboard/draft", label: "drafting", icon: "edit" },
    ],
  },
  {
    heading: "account",
    items: [{ href: "/dashboard/settings", label: "settings", icon: "settings" }],
  },
];

export function NavLinks() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <nav className="flex flex-col gap-6" aria-label={t("ariaMain")}>
      {SECTIONS.map((section) => (
        <div key={section.heading}>
          <p className="ec-label mb-2 px-3">{t(`heading.${section.heading}`)}</p>
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
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
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
