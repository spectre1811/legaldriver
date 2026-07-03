import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/icons";
import { fmtDate } from "@/components/ui";
import type { TimelineEvent } from "@/lib/court/legaldriver-api";

const TYPE_ICON: Record<string, "scale" | "notices" | "alert"> = {
  hearing: "scale",
  order: "notices",
  process: "alert",
};

const TYPE_CHIP: Record<string, string> = {
  hearing: "ec-chip ec-chip-success",
  order: "ec-chip",
  process: "ec-chip ec-chip-warn",
};

const DOT_CLASS: Record<string, string> = {
  hearing: "bg-ec-success-t text-ec-success",
  order: "bg-ec-brass-tint text-ec-brass-deep",
  process: "bg-ec-warn-t text-ec-warn",
};

// The /timeline endpoint leaks HTML entities (sometimes double-encoded, e.g. "&amp;amp;")
// in detail/judge strings — React renders them literally, so decode before display.
function decode(s?: string): string {
  if (!s) return "";
  let t = s;
  for (let i = 0; i < 2; i++)
    t = t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'");
  return t.trim();
}

export async function CaseTimeline({ events, hasCnr }: { events: TimelineEvent[]; hasCnr: boolean }) {
  const t = await getTranslations("caseDetail");

  if (!hasCnr) {
    return (
      <div className="ec-card px-5 py-10 text-center">
        <p className="text-sm text-ec-ink-3">{t("timeline.dataGap")}</p>
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="ec-card">
        <div className="border-b border-ec-hair px-5 py-4">
          <h2 className="font-display text-base font-medium">{t("timeline.title")}</h2>
          <p className="mt-0.5 text-xs text-ec-ink-3">{t("timeline.help")}</p>
        </div>
        <div className="px-5 py-10 text-center">
          <Icon name="scale" className="mx-auto mb-3 h-8 w-8 text-ec-ink-3" />
          <p className="text-sm text-ec-ink-3">{t("timeline.empty")}</p>
        </div>
      </div>
    );
  }

  const sorted = [...events].sort((a, b) => b.date.localeCompare(a.date));

  const typeLabel = (type: string) => {
    if (type === "hearing") return t("timeline.typeHearing");
    if (type === "order") return t("timeline.typeOrder");
    return t("timeline.typeProcess");
  };

  return (
    <div className="ec-card">
      <div className="border-b border-ec-hair px-5 py-4">
        <h2 className="font-display text-base font-medium">
          {t("timeline.title")} <span className="text-ec-ink-3">({events.length})</span>
        </h2>
        <p className="mt-0.5 text-xs text-ec-ink-3">{t("timeline.help")}</p>
      </div>
      <ol className="relative px-5 py-5">
        {sorted.map((ev, i) => {
          const iconName = TYPE_ICON[ev.type] ?? "alert";
          const chipClass = TYPE_CHIP[ev.type] ?? "ec-chip";
          const dotClass = DOT_CLASS[ev.type] ?? "bg-ec-paper-3 text-ec-ink-3";
          const isLast = i === sorted.length - 1;
          return (
            <li key={`${ev.date}-${i}`} className="relative mb-7 flex gap-4 last:mb-0">
              {!isLast && (
                <span
                  className="absolute left-[11px] top-7 h-[calc(100%+0.25rem)] w-px bg-ec-hair"
                  aria-hidden="true"
                />
              )}
              <span
                className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${dotClass}`}
              >
                <Icon name={iconName} className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="num text-xs font-medium text-ec-ink-3">{fmtDate(ev.date)}</span>
                  <span className={chipClass}>{typeLabel(ev.type)}</span>
                </div>
                <p className="mt-1 text-sm text-ec-ink">{ev.detail ? decode(ev.detail) : t("timeline.noDetail")}</p>
                {ev.judge && (
                  <p className="mt-0.5 text-xs text-ec-ink-3">
                    {t("timeline.judgePrefix")}{" "}
                    <Link
                      href={`/dashboard/lookup?q=${encodeURIComponent(decode(ev.judge))}`}
                      className="font-medium text-ec-brass-deep hover:text-ec-brass"
                    >
                      {decode(ev.judge)}
                    </Link>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
