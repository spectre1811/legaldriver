import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyShareToken } from "@/lib/court/share-token";
import { loadCaseFileData } from "@/lib/court/case-file-data";
import { formatCourtDate } from "@/components/court/logic";
import { Disclaimer } from "@/components/court";
import { Icon } from "@/components/icons";
import { brand } from "@/lib/brand";

export const dynamic = "force-dynamic";

// WO-411 · the read-only view a "Share case file" link resolves to. Outside /dashboard and
// /portal on purpose — middleware.ts only gates those two prefixes, so this route is reachable
// with NO session, exactly as a share link needs to be. All authority comes from the signed token
// (share-token.ts), never a cookie: verify it first, then fetch with the admin client (RLS
// bypassed) scoped to EXACTLY the tenant+case the token names (loadCaseFileData re-asserts that
// scope on every query it runs) — the one thing standing between this route and every other
// tenant's data.
export default async function SharedCasePage({ params }: { params: { token: string } }) {
  const t = await getTranslations("caseActions.share.view");
  const tc = await getTranslations("common");
  const td = await getTranslations("caseDetail"); // reuse the case-detail page's own source/freshness copy — same concept, not reinvented
  const result = verifyShareToken(params.token);

  if (!result.ok) {
    const expired = result.reason === "expired";
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
        <Icon name="alert" className="h-8 w-8 text-ec-ink-3" />
        <h1 className="font-display mt-3 text-xl text-ec-ink">{expired ? t("expiredTitle") : t("invalidTitle")}</h1>
        <p className="mt-2 text-sm text-ec-ink-3">{expired ? t("expiredBody") : t("invalidBody")}</p>
      </div>
    );
  }

  const supabase = createAdminClient();
  const data = await loadCaseFileData(supabase, result.tenantId, result.matterId);
  if (!data) notFound();

  const events = [
    ...data.hearings.map((h) => ({ date: h.date, kind: "hearing" as const, purpose: h.purpose, judge: h.judge })),
    ...data.orders.map((o) => ({ date: o.date, kind: "order" as const, title: o.title })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const expiresLabel = new Date(result.expiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const sourceLabel = data.source === "manual" ? td("sourceName.manual") : data.source === "mock" ? td("sourceName.demo") : td("sourceName.court");
  const refreshedLabel = data.lastSyncedAt ? new Date(data.lastSyncedAt).toLocaleString("en-IN") : td("source.never");

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <div className="mk-engraved rounded-[14px] bg-ec-ink px-5 py-6 sm:px-7">
        <span className="ec-chip !border-transparent bg-ec-ink-chip text-ec-honey">{t("badge")}</span>
        <h1 className="font-display mt-2 text-[24px] leading-tight text-paper sm:text-[28px]">{data.title}</h1>
        <p className="mt-2 text-[13px] text-ec-line-strong">
          {data.cnr && <span className="num mr-2">CNR {data.cnr}</span>}
          {data.court}
        </p>
      </div>

      <div className="ec-card mt-5 px-4 py-3 text-[13px] text-ec-ink-2">
        <p>{t("scopeNote", { brand: brand.name })}</p>
        <p className="mt-1 text-ec-ink-3">{t("expiresNote", { date: expiresLabel })}</p>
      </div>

      <div className="mt-7 text-xs text-ec-ink-3">
        {td.rich("source.line", { source: sourceLabel, time: refreshedLabel, b: (c) => <span className="font-medium text-ec-ink">{c}</span> })}
      </div>

      <section className="mt-6">
        <h2 className="ec-label mb-2">{t("partiesTitle")}</h2>
        {data.parties.length ? (
          <div className="ec-card divide-y divide-ec-hair">
            {data.parties.map((p, i) => (
              <div key={i} className="px-4 py-3 text-[13.5px]">
                <span className="ec-chip mr-2 !text-[10px]">{p.side}</span>
                <span className="text-ec-ink">{p.name}</span>
                {p.advocate && <span className="ml-1 text-ec-ink-3">— {p.advocate}</span>}
              </div>
            ))}
          </div>
        ) : (
          <p className="ec-card px-4 py-6 text-center text-sm text-ec-ink-3">{t("empty.parties")}</p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="ec-label mb-2">{t("hearingsOrders")}</h2>
        {events.length ? (
          <div className="ec-card divide-y divide-ec-hair">
            {events.map((e, i) => (
              <div key={i} className="px-4 py-3 text-[13.5px]">
                <div className="num text-[11.5px] text-ec-ink-3">{formatCourtDate(e.date) ?? e.date}</div>
                <div className="text-ec-ink-2">
                  {e.kind === "hearing" ? (e.purpose ?? t("hearing")) : (e.title ?? t("order"))}
                  {e.kind === "hearing" && e.judge && <span className="text-ec-ink-3"> · {e.judge}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="ec-card px-4 py-6 text-center text-sm text-ec-ink-3">{t("empty.events")}</p>
        )}
      </section>

      <section className="mt-6">
        <h2 className="ec-label mb-2">{t("deadlinesTitle")}</h2>
        {data.deadlines.length ? (
          <div className="ec-card divide-y divide-ec-hair">
            {data.deadlines.map((d, i) => (
              <div key={i} className="px-4 py-3 text-[13.5px]">
                <div className="num text-[11.5px] text-ec-ink-3">{formatCourtDate(d.dueDate) ?? d.dueDate}</div>
                <div className="text-ec-ink-2">
                  {d.kind.replace(/_/g, " ")}
                  {d.status !== "open" && <span className="text-ec-ink-3"> · {d.status}</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="ec-card px-4 py-6 text-center text-sm text-ec-ink-3">{t("empty.deadlines")}</p>
        )}
      </section>

      <div className="mt-8 space-y-1.5 border-t border-ec-hair pt-4">
        <Disclaimer text={tc("disclaimer")} />
        <p className="text-xs text-ec-ink-3">{t("poweredBy", { brand: brand.name })}</p>
      </div>
    </div>
  );
}
