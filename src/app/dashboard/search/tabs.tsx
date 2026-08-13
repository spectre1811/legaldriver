"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons";

// Route-based tabs for the Court Search surface. WO-82: the Directory (Judges & Lawyers)
// moved to a first-class Practice surface at /dashboard/directory — the tab now links there
// as a cross-surface bridge, alongside the Judgments (historical judgment corpus) sub-route.
const TABS: { href: string; key: string; icon: IconName }[] = [
  { href: "/dashboard/directory", key: "directory", icon: "scale" },
  { href: "/dashboard/search/judgments", key: "judgments", icon: "search" },
];

export function SearchTabs() {
  const pathname = usePathname();
  const t = useTranslations("search");
  return (
    <nav aria-label={t("tabsAria")} className="flex gap-1 border-b border-ec-hair pb-2">
      {TABS.map((tab) => {
        const on = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            className={`flex items-center gap-2 rounded-ec-s px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey ${
              on ? "bg-ec-ink font-medium text-ec-paper" : "text-ec-ink-2 hover:bg-ec-paper-3 hover:text-ec-ink"
            }`}
          >
            <Icon name={tab.icon} className={`h-[1.05rem] w-[1.05rem] ${on ? "text-ec-paper" : "text-ec-ink-3"}`} />
            {t(`tabs.${tab.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
