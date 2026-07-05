// BP-17 · HearingTimeline (promoted from case-timeline.tsx) — the canonical, pure presentational
// timeline: dots + connectors + type chips + dates, entity-decoded. Kept decoupled from the app:
// i18n copy, icons, and href construction come in as props (the app wrapper supplies next-intl
// strings, its Icon set, and its /api routes). peshi consumes the same structure for its inline
// timeline. Empty/data-gap states stay in the app wrapper (they need app i18n) — this renders a
// non-empty list.
import { CourtChip } from "./court-chip";
import { CourtDate } from "./court-date";
import { decodeEntities, type ChipTone } from "./logic";

export interface TimelineEventLike {
  date: string | null;
  type: string; // "hearing" | "order" | "process" | …
  detail?: string;
  judge?: string;
  order_id?: number | string;
}

const CHIP_TONE: Record<string, ChipTone> = { hearing: "success", order: "neutral", process: "warn" };
const DOT_CLASS: Record<string, string> = {
  hearing: "bg-ec-success-t text-ec-success",
  order: "bg-ec-brass-tint text-ec-brass-deep",
  process: "bg-ec-warn-t text-ec-warn",
};

// Reverse-chronological, null-date-safe (undated events sink to the bottom rather than crashing on
// null.localeCompare). Mirrors lib/court/timeline-sort so the kit carries no app import.
const SEQ: Record<string, number> = { hearing: 1, process: 2, order: 3 };
function sortEvents(events: TimelineEventLike[]): TimelineEventLike[] {
  return [...events].sort(
    (a, b) => (b.date ?? "").localeCompare(a.date ?? "") || (SEQ[b.type] ?? 0) - (SEQ[a.type] ?? 0),
  );
}

export function HearingTimeline({
  events,
  typeLabel,
  labels,
  renderIcon,
  orderHref,
  judgeHref,
}: {
  events: TimelineEventLike[];
  /** Localized label for an event type. */
  typeLabel: (type: string) => string;
  labels: { undated: string; noDetail: string; judgePrefix: string };
  /** App-supplied icon for a dot (optional; a bare dot renders without it). */
  renderIcon?: (type: string) => React.ReactNode;
  /** App-supplied link for an order event's detail (e.g. the order PDF); null → plain text. */
  orderHref?: (ev: TimelineEventLike) => string | null | undefined;
  /** App-supplied link for a judge name; null → plain text. */
  judgeHref?: (judge: string) => string | null | undefined;
}) {
  const sorted = sortEvents(events);
  return (
    <ol className="relative px-5 py-5">
      {sorted.map((ev, i) => {
        const dotClass = DOT_CLASS[ev.type] ?? "bg-ec-paper-3 text-ec-ink-3";
        const isLast = i === sorted.length - 1;
        const oHref = ev.type === "order" ? orderHref?.(ev) : null;
        const judgeName = ev.judge ? decodeEntities(ev.judge) : "";
        const jHref = judgeName ? judgeHref?.(judgeName) : null;
        const detail = ev.detail ? decodeEntities(ev.detail) : "";
        return (
          <li key={`${ev.date}-${i}`} className="relative mb-7 flex gap-4 last:mb-0">
            {!isLast && (
              <span className="absolute left-[11px] top-7 h-[calc(100%+0.25rem)] w-px bg-ec-hair" aria-hidden="true" />
            )}
            <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${dotClass}`}>
              {renderIcon?.(ev.type)}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-xs font-medium text-ec-ink-3">
                  {ev.date ? <CourtDate value={ev.date} /> : labels.undated}
                </span>
                <CourtChip tone={CHIP_TONE[ev.type] ?? "neutral"}>{typeLabel(ev.type)}</CourtChip>
              </div>
              {ev.type === "order" && oHref ? (
                <a
                  href={oHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-ec-brass-deep hover:text-ec-brass"
                >
                  {detail || typeLabel("order")} ↗
                </a>
              ) : (
                <p className="mt-1 text-sm text-ec-ink">{detail || labels.noDetail}</p>
              )}
              {judgeName && (
                <p className="mt-0.5 text-xs text-ec-ink-3">
                  {labels.judgePrefix}{" "}
                  {jHref ? (
                    <a href={jHref} className="font-medium text-ec-brass-deep hover:text-ec-brass">
                      {judgeName}
                    </a>
                  ) : (
                    <span className="font-medium">{judgeName}</span>
                  )}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
