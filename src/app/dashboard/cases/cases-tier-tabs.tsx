"use client";

// WO-54 W2 · Court-tier tab strip — the founder's "segregate by HC / District" headline. A separate
// navigation axis ABOVE the saved-view tabs (WO-43-W2): tier is the primary mental model advocates
// already use (eCourts is hard-segmented by tier), so it's tabs, not a facet. Selecting a tier scopes
// the list via `?tier=` against the indexed `matter.tier` column (WO-54 W1). "All" clears the scope.
// Tribunals / Supreme Court tabs appear only when the tenant actually has cases there (no empty tabs);
// HC + District always show (Gujarat's two tiers). Counts are live HEAD counts.

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { TierCounts } from "./cases-query";

type TierTab = { tier: "" | "HC" | "DISTRICT" | "TRIBUNAL" | "SC"; labelKey: string; count: number; alwaysShow: boolean };

export function CasesTierTabs({ counts }: { counts: TierCounts }) {
  const t = useTranslations("cases.tierTabs");
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const active = sp.get("tier") ?? "";

  const tabs = ([
    { tier: "", labelKey: "all", count: counts.all, alwaysShow: true },
    { tier: "HC", labelKey: "HC", count: counts.HC, alwaysShow: true },
    { tier: "DISTRICT", labelKey: "DISTRICT", count: counts.DISTRICT, alwaysShow: true },
    { tier: "TRIBUNAL", labelKey: "TRIBUNAL", count: counts.TRIBUNAL, alwaysShow: false },
    { tier: "SC", labelKey: "SC", count: counts.SC, alwaysShow: false },
  ] as TierTab[]).filter((tab) => tab.alwaysShow || tab.count > 0);

  // Selecting a tier preserves the rest of the query (filters/free-text/view); only page resets.
  const select = (tier: string) => {
    const next = new URLSearchParams(sp.toString());
    if (tier) next.set("tier", tier);
    else next.delete("tier");
    next.delete("page");
    startTransition(() =>
      router.push(next.toString() ? `/dashboard/cases?${next.toString()}` : "/dashboard/cases"),
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label={t("aria")}>
      <span className="ec-label mr-1 hidden sm:inline">{t("label")}</span>
      {tabs.map((tab) => {
        const isActive = active === tab.tier;
        return (
          <button
            key={tab.tier || "all"}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={pending}
            onClick={() => select(tab.tier)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
              isActive
                ? "border-ec-brass-deep bg-ec-brass-deep text-paper"
                : "border-ec-hair-strong text-ec-ink-2 hover:border-ec-brass hover:bg-ec-brass-tint"
            }`}
          >
            {t(tab.labelKey)}
            <span className={`num rounded-full px-1.5 text-[0.65rem] ${isActive ? "bg-paper/20" : "bg-ec-hair text-ec-ink-3"}`}>{tab.count}</span>
          </button>
        );
      })}
    </div>
  );
}
