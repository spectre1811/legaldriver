"use client";

// WO-59 · The Cases "Attention" bar. Replaces the passive urgency tab-pills with an actionable
// triage surface: the cases that need the advocate NOW (overdue · due this week · no hearing date),
// each a card that states the count, the next action, and — on click — filters the list to exactly
// those cases (toggling off when already active). Purely reads the bounded HEAD counts the page
// already fetched (no new query). Only non-empty buckets render; when nothing is urgent (but cases
// exist) it shows a calm "all caught up" line, so the bar is signal, never noise.

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons";
import type { ViewCounts } from "./cases-query";

type Tone = "danger" | "warn" | "neutral";
type Bucket = { key: "overdue" | "soon" | "noDate"; next: string; icon: IconName; tone: Tone };

// `next` mirrors the console/query urgency filter values so a card and the filter agree.
const BUCKETS: Bucket[] = [
  { key: "overdue", next: "overdue", icon: "alert", tone: "danger" },
  { key: "soon", next: "7d", icon: "clock", tone: "warn" },
  { key: "noDate", next: "none", icon: "calendar", tone: "neutral" },
];

const TONE: Record<Tone, { chip: string; ring: string }> = {
  danger: { chip: "bg-ec-danger-t text-ec-danger", ring: "ring-ec-danger/50 border-ec-danger/40" },
  warn: { chip: "bg-ec-warn-t text-ec-warn", ring: "ring-ec-warn/50 border-ec-warn/40" },
  neutral: { chip: "bg-ec-brass-tint text-ec-brass-deep", ring: "ring-ec-brass/50 border-ec-brass/40" },
};

export function CasesAttention({ counts }: { counts: ViewCounts }) {
  const t = useTranslations("cases.attention");
  const router = useRouter();
  const sp = useSearchParams();

  // Nothing to triage on an empty account — the page's empty state speaks instead.
  if (counts.all === 0) return null;

  const active = sp.get("next");
  const shown = BUCKETS.filter((b) => counts[b.key] > 0);

  const toggle = (b: Bucket) => {
    const next = new URLSearchParams(sp.toString());
    next.delete("page");
    if (active === b.next) next.delete("next"); // click the active card again → clear the filter
    else next.set("next", b.next);
    router.push(next.toString() ? `/dashboard/cases?${next.toString()}` : "/dashboard/cases");
  };

  return (
    <section aria-label={t("title")} data-testid="cases-attention" className="space-y-2">
      <h2 className="flex items-center gap-1.5 px-1 text-xs font-medium uppercase tracking-wide text-ec-ink-3">
        <Icon name="bell" className="h-3.5 w-3.5" /> {t("title")}
      </h2>

      {shown.length === 0 ? (
        <div className="ec-card flex items-center gap-2.5 p-3.5 text-sm text-ec-ink-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ec-m bg-ec-success-t text-ec-success">
            <Icon name="check" className="h-4 w-4" />
          </span>
          {t("allClear")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {shown.map((b) => {
            const on = active === b.next;
            const tone = TONE[b.tone];
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => toggle(b)}
                aria-pressed={on}
                data-testid={`attention-${b.key}`}
                data-active={on ? "true" : "false"}
                aria-label={t("filterAria", { label: t(`${b.key}.label`) })}
                className={`ec-card group flex items-center gap-3 p-3.5 text-left transition motion-safe:hover:-translate-y-px ${
                  on ? `ring-1 ${tone.ring}` : "hover:border-ec-hair-strong"
                }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-ec-m ${tone.chip}`}>
                  <Icon name={b.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="num text-lg font-medium leading-none text-ec-ink">{counts[b.key]}</span>
                    <span className="text-sm font-medium text-ec-ink">{t(`${b.key}.label`)}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ec-ink-3">
                    {on ? t("showingAll") : t(`${b.key}.hint`)}
                  </span>
                </span>
                <Icon
                  name={on ? "close" : "chevron"}
                  className="ml-auto h-4 w-4 shrink-0 text-ec-ink-3 transition group-hover:text-ec-ink-2"
                />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
