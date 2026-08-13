"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons";

// Route-based tabs for the merged Assistant surface (Ask = grounded copilot,
// Draft = document drafting). Each tab is a real, deep-linkable URL; the old
// /dashboard/copilot and /dashboard/draft routes redirect here (next.config.mjs).
const TABS: { href: string; key: string; icon: IconName }[] = [
  { href: "/dashboard/assistant/ask", key: "ask", icon: "sparkles" },
  { href: "/dashboard/assistant/draft", key: "draft", icon: "edit" },
];

export function AssistantTabs() {
  const pathname = usePathname();
  const t = useTranslations("assistant");
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
