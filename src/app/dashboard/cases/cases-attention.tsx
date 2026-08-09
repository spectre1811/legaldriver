"use client";

// WO-59 · The Cases "Attention" strip. WO-331 (Daybreak reskin) restyles the WO-59 triage cards
// into the reference's inline value+label chip row (design-mockups/iteration3/console/cases.tsx
// AttentionSeg) — same real counts, same click-to-filter behaviour, just the visual language.
// Purely reads the bounded HEAD counts the page already fetched (no new query beyond the
// additive `stale` count in cases-query.ts). Only non-empty buckets render; when nothing needs
// attention (but cases exist) it shows a calm "all caught up" line, so the strip is signal, never
// noise. Honest framing: `stale` (sync freshness) is a DIFFERENT signal from `overdue` (hearing
// urgency) — see the hint copy, never conflated.

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { useCasesNav } from "./cases-nav";
import type { ViewCounts } from "./cases-query";

type Bucket = { key: "overdue" | "soon" | "noDate" | "stale"; next: string };

// `next` mirrors the console/query urgency (or sync-freshness) filter values so a chip and the
// filter always agree — `stale` routes through the same real `last_synced_at` cutoff as the count.
const BUCKETS: Bucket[] = [
  { key: "overdue", next: "overdue" },
  { key: "soon", next: "7d" },
  { key: "noDate", next: "none" },
  { key: "stale", next: "stale" },
];

export function CasesAttention({ counts }: { counts: ViewCounts }) {
  const t = useTranslations("cases.attention");
  const { sp, setParam } = useCasesNav();

  // Nothing to triage on an empty account — the page's empty state speaks instead.
  if (counts.all === 0) return null;

  const active = sp.get("next");
  const shown = BUCKETS.filter((b) => counts[b.key] > 0);

  // Click the active chip again → clear the filter. Routes through the shared soft-nav (no churn).
  const toggle = (b: Bucket) => setParam("next", active === b.next ? "" : b.next);

  return (
    <section
      aria-label={t("title")}
      data-testid="cases-attention"
      className="flex flex-wrap items-center gap-2 border-t border-ec-hair pt-3"
    >
      {shown.length === 0 ? (
        <span className="inline-flex items-center gap-2 text-[13px] text-ec-ink-2">
          <Icon name="check" className="h-4 w-4 text-ec-success" />
          {t("allClear")}
        </span>
      ) : (
        shown.map((b) => {
          const on = active === b.next;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => toggle(b)}
              title={b.key === "stale" ? t("stale.hint") : undefined}
              aria-pressed={on}
              data-testid={`attention-${b.key}`}
              data-active={on ? "true" : "false"}
              aria-label={t("filterAria", { label: t(`${b.key}.label`) })}
              className={`inline-flex items-baseline gap-1.5 rounded-ec-s border px-3 py-1.5 text-left transition ${
                on
                  ? "border-ec-honey bg-ec-honey/15 shadow-[inset_0_-2px_0_var(--honey)]"
                  : "border-ec-hair bg-ec-paper hover:border-ec-hair-strong hover:bg-ec-paper-3"
              }`}
            >
              <span className="font-display num text-[19px] leading-none text-ec-ink">
                {counts[b.key]}
              </span>
              <span className={`text-[12.5px] ${on ? "font-medium text-ec-ink" : "text-ec-ink-2"}`}>
                {t(`${b.key}.label`)}
              </span>
            </button>
          );
        })
      )}
    </section>
  );
}
