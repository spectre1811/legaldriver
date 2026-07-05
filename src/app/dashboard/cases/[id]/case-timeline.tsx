import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/icons";
import { HearingTimeline } from "@/components/court/timeline";
import type { TimelineEvent } from "@/lib/court/legaldriver-api";

// App wrapper around the shared court-kit HearingTimeline (BP-17). This owns the app-bound bits —
// next-intl copy, the app Icon set, and href construction — while the kit owns the visual timeline
// structure (dots/connectors/chips/dates/decode), shared with peshi.
const TYPE_ICON: Record<string, "scale" | "notices" | "alert"> = {
  hearing: "scale",
  order: "notices",
  process: "alert",
};

export async function CaseTimeline({ events, hasCnr }: { events: TimelineEvent[]; hasCnr: boolean }) {
  const t = await getTranslations("caseDetail");

  // With no events at all: a case without a CNR has no court record to draw from ("data gap");
  // a CNR'd case simply has nothing logged yet ("empty"). Events (live OR DB-derived) always render.
  if (!events.length) {
    if (!hasCnr) {
      return (
        <div className="ec-card px-5 py-10 text-center">
          <p className="text-sm text-ec-ink-3">{t("timeline.dataGap")}</p>
        </div>
      );
    }
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
      <HearingTimeline
        events={events}
        typeLabel={typeLabel}
        labels={{
          undated: t("timeline.undated"),
          noDetail: t("timeline.noDetail"),
          judgePrefix: t("timeline.judgePrefix"),
        }}
        renderIcon={(type) => <Icon name={TYPE_ICON[type] ?? "alert"} className="h-3.5 w-3.5" />}
        orderHref={(ev) => (ev.order_id ? `/api/court/order-pdf?order=${ev.order_id}` : null)}
        judgeHref={(judge) => `/dashboard/search/directory?q=${encodeURIComponent(judge)}`}
      />
    </div>
  );
}
