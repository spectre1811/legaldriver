import { getTranslations } from "next-intl/server";
import { decodeEntities, chipToneClass } from "@/components/court/logic";
import { formatCourtDate } from "@/components/court";
import { Icon } from "@/components/icons";
import type { TimelineEvent } from "@/lib/court/legaldriver-api";

// WO-332 FIDELITY RECONCILE · reproduces app.case.tsx's single combined "Hearings & orders" `<ol>`
// node-for-node (dots + connector + date/purpose/chip + judge + an order's document link) — this
// used to be two page components (the shared BP-17 HearingTimeline + a separate OrdersPanel card);
// merged into one list here to match the reference's ONE section. Left page-local rather than
// changed in the shared kit (`components/court/timeline.tsx`) — that primitive also renders the
// CNR preview page's timeline, out of this WO's scope; only pure helpers (decodeEntities,
// chipToneClass) are reused from it, not its JSX. Real data has one text field per event
// (hearing.purpose / order.title) — the reference's separate longer "business" paragraph has no
// real equivalent, so it's honestly never rendered (same as the reference's own `h.business &&` guard).
const SEQ: Record<string, number> = { hearing: 1, process: 2, order: 3 };

export async function CaseTimeline({ events, hasCnr }: { events: TimelineEvent[]; hasCnr: boolean }) {
  const t = await getTranslations("caseDetail");

  // With no events at all: a case without a CNR has no court record to draw from ("data gap");
  // a CNR'd case simply has nothing logged yet ("empty").
  if (!events.length) {
    return (
      <div className="ec-card px-5 py-10 text-center">
        <p className="text-sm text-ec-ink-3">{hasCnr ? t("timeline.empty") : t("timeline.dataGap")}</p>
      </div>
    );
  }

  const sorted = [...events].sort(
    (a, b) => (b.date ?? "").localeCompare(a.date ?? "") || (SEQ[b.type] ?? 0) - (SEQ[a.type] ?? 0),
  );
  const typeLabel = (type: string) =>
    type === "hearing" ? t("timeline.typeHearing") : type === "order" ? t("timeline.typeOrder") : t("timeline.typeProcess");

  return (
    <div className="ec-card px-5 py-2">
      <ol className="relative">
        {sorted.map((ev, i) => {
          const isOrder = ev.type === "order";
          const isLast = i === sorted.length - 1;
          const detail = ev.detail ? decodeEntities(ev.detail) : null;
          const judge = ev.judge ? decodeEntities(ev.judge) : null;
          return (
            <li key={`${ev.date}-${i}`} className="relative border-b border-ec-hair py-4 pl-6 last:border-0">
              <span
                className={`absolute left-0 top-[22px] h-[9px] w-[9px] rounded-full ${
                  isOrder ? "bg-ec-bronze" : i === 0 ? "bg-ec-honey" : "border-[1.5px] border-ec-line-strong bg-ec-card"
                }`}
              />
              {!isLast && <span className="absolute bottom-0 left-[4px] top-[32px] w-px bg-ec-hair" />}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="num font-mono text-[12px] text-ec-ink">{formatCourtDate(ev.date) ?? t("timeline.undated")}</span>
                <span className="font-display text-[15px] text-ec-ink">{detail ?? (isOrder ? typeLabel("order") : t("timeline.noDetail"))}</span>
                {isOrder && <span className={chipToneClass("hot")}>{typeLabel("order")}</span>}
              </div>
              {judge && <p className="mt-1 text-[12.5px] text-ec-ink-3">{judge}</p>}
              {isOrder && ev.order_id != null && (
                <a
                  href={`/api/court/order-pdf?order=${ev.order_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-ec-hair bg-ec-paper px-2.5 py-1 text-[12px] text-ec-bronze-deep transition-colors hover:border-ec-bronze hover:bg-ec-bronze-tint/40"
                >
                  <Icon name="documents" className="h-3 w-3" /> {detail ?? typeLabel("order")}
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
