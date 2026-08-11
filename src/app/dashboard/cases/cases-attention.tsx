"use client";

// WO-59 · The Cases "Attention" strip. WO-331 (Daybreak reskin) restyles the WO-59 triage cards
// into the reference's inline value+label chip row (design-mockups/iteration3/console/cases.tsx
// AttentionSeg) — same real counts, same click-to-filter behaviour, just the visual language.
//
// WO-331 EXACT-FIDELITY pass: the reference shows exactly THREE buckets — "hearings this week",
// "need follow-up", "stale records" — plus a right-aligned "Last synced …" line. We don't have a
// real "follow-up" flag in the schema, so rather than fabricate one, this reuses the real `overdue`
// signal (a hearing date that's already passed IS the thing that needs the advocate's follow-up —
// the existing attention.overdue hint already said "Reschedule or follow up") and `soon` (next 7
// days) for "hearings this week". `noDate` has no reference slot — it's dropped from the strip but
// stays reachable via the Filters drawer's Next-hearing "No date" option, so nothing is lost, only
// de-duplicated. Purely reads the bounded HEAD counts the page already fetched (no new query beyond
// the additive `stale` + `lastSyncedAt` fields in cases-query.ts).
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { relativeAge } from "@/components/court";
import { useCasesNav } from "./cases-nav";
import type { ViewCounts } from "./cases-query";

type Bucket = { key: "soon" | "overdue" | "stale"; next: string; hint?: true };

// `next` mirrors the console/query urgency (or sync-freshness) filter values so a chip and the
// filter always agree — `stale` routes through the same real `last_synced_at` cutoff as the count.
// Order matches the reference: hearings this week → need follow-up → stale records.
const BUCKETS: Bucket[] = [
  { key: "soon", next: "7d" },
  { key: "overdue", next: "overdue", hint: true },
  { key: "stale", next: "stale", hint: true },
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
      className="stagger flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-ec-hair pt-3"
    >
      <div className="flex flex-wrap items-center gap-2">
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
                title={b.hint ? t(`${b.key}.hint`) : undefined}
                aria-pressed={on}
                data-testid={`attention-${b.key}`}
                data-active={on ? "true" : "false"}
                aria-label={t("filterAria", { label: t(`${b.key}.label`) })}
                className={`press inline-flex items-baseline gap-1.5 rounded-ec-s border px-3 py-1.5 text-left transition ${
                  on
                    ? "border-ec-honey bg-ec-honey/15 shadow-[inset_0_-2px_0_var(--honey)]"
                    : "border-ec-hair bg-ec-paper hover:border-ec-hair-strong hover:bg-ec-paper-3"
                }`}
              >
                <span className="font-display figures text-[19px] font-semibold leading-none text-ec-ink">
                  {counts[b.key]}
                </span>
                <span className={`text-[12.5px] ${on ? "font-medium text-ec-ink" : "text-ec-ink-2"}`}>
                  {t(`${b.key}.label`)}
                </span>
              </button>
            );
          })
        )}
      </div>
      {/* WO-331 render-inspect (hi): `.ec-label` (not a hand-rolled `tracking-[0.12em]`) — it already
          carries the html[lang="hi"] letter-spacing reset every tracked mono eyebrow in this app
          shares (ui-frontend hard rule: Devanagari is never letter-spaced); a one-off arbitrary
          tracking value would silently miss that reset. */}
      <span className="ec-label num">
        {counts.lastSyncedAt ? t("lastSynced", { ago: relativeAge(counts.lastSyncedAt) }) : t("neverSynced")}
      </span>
    </section>
  );
}
