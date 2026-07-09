import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { getCaseCached } from "@/lib/court/gateway";
import { getTimeline, type TimelineEvent } from "@/lib/court/legaldriver-api";
import { fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CourtField, MaskedName } from "@/components/court";
import { isMaskedName, maskTitle } from "@/lib/court/mask";
import { expandCaseType, cleanPurpose } from "@/lib/court/code-labels";
import { selectCaseDetailRows, extractCaseDetailValues, type CaseDetailFieldId } from "@/lib/court/case-detail-fields";
import { normalizeCnr } from "@/lib/court/case-links";
import { OrdersPanel } from "@/app/dashboard/cases/[id]/orders-panel";
import { CaseTimeline } from "@/app/dashboard/cases/[id]/case-timeline";
import { TrackCaseCta } from "./track-cta";

export const dynamic = "force-dynamic";

type Party = { name?: string; side?: string; advocate?: string; masked?: boolean };

// tone → ec chip class (mirrors the tracked case page so the preview looks like the real thing).
const chip = (tone: string) =>
  `ec-chip ${({ green: "ec-chip-success", amber: "ec-chip-warn", red: "ec-chip-danger", brand: "ec-chip-hot", neutral: "" } as Record<string, string>)[tone] ?? ""}`;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const statusTone = (s?: string) => {
  const u = (s ?? "").toUpperCase();
  if (u.includes("DISPOS")) return "neutral";
  if (u.includes("PEND") || u.includes("ACTIVE")) return "green";
  return "neutral";
};

// WO-83 · Read-only case-details PREVIEW, reachable by CNR straight from a judge/advocate/lookup
// listing — no tracking required. It mirrors the eCourts record the tracked page shows (details,
// parties, hearings, acts, orders, timeline, provenance) MINUS the AI briefing: the AI summary is
// unlocked only once the case is tracked (the founder's rule). A case already tracked by this tenant
// redirects to its full matter page so that stays the one canonical tracked view.
export default async function CasePreviewPage({ params }: { params: { cnr: string } }) {
  const cnr = normalizeCnr(decodeURIComponent(params.cnr));
  const t = await getTranslations("casePreview");
  const tcd = await getTranslations("caseDetail");
  const tc = await getTranslations("common");

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);

  // Already tracked? → the tracked matter page is canonical (it has the AI briefing + tools).
  if (tenantId && cnr.length >= 6) {
    const { data: existing } = await supabase
      .from("matter")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("cnr", cnr)
      .maybeSingle();
    if (existing) redirect(`/dashboard/cases/${existing.id}`);
  }

  const backLink = (
    <Link href="/dashboard/search/directory" className="inline-flex items-center gap-1.5 text-sm font-medium text-ec-brass-deep hover:text-ec-brass">
      <Icon name="back" className="h-4 w-4" /> {t("back")}
    </Link>
  );

  if (cnr.length < 6) {
    return (
      <div className="space-y-6 text-ec-ink">
        {backLink}
        <div className="ec-card px-6 py-12 text-center">
          <Icon name="alert" className="mx-auto mb-3 h-8 w-8 text-ec-ink-3" />
          <h1 className="font-display text-lg font-medium">{t("notFound.title")}</h1>
          <p className="mt-1 text-sm text-ec-ink-3">{t("notFound.body", { cnr })}</p>
        </div>
      </div>
    );
  }

  const fetched = await getCaseCached(cnr);
  const c = fetched.case;

  if (!c) {
    return (
      <div className="space-y-6 text-ec-ink">
        {backLink}
        <div className="ec-card px-6 py-12 text-center">
          <Icon name="alert" className="mx-auto mb-3 h-8 w-8 text-ec-ink-3" />
          <h1 className="font-display text-lg font-medium">{t("notFound.title")}</h1>
          <p className="mt-1 text-sm text-ec-ink-3">{t("notFound.body", { cnr })}</p>
        </div>
      </div>
    );
  }

  const timelineEvents: TimelineEvent[] = await getTimeline(cnr).catch(() => []);

  const detail = (c.detail ?? {}) as Record<string, unknown>;
  // The preview is only ever reached for a court-sourced case (it came from the provider), so an
  // empty MOBILE-sourced field is truthfully "not on record at eCourts" (BP-24 honest-empty).
  const isCourtSourced = !!c.source && c.source !== "manual";
  const isDisposed = (c.status ?? "").toUpperCase().includes("DISPOSED");
  const detailValues = extractCaseDetailValues(detail, (r) => fmtDate(r));
  const detailLabels: Record<CaseDetailFieldId, string> = {
    registrationNo: tcd("detail.registrationNo"), filingNo: tcd("detail.filingNo"),
    registrationDate: tcd("detail.registrationDate"), filingDate: tcd("detail.filingDate"),
    firstHearingDate: tcd("detail.firstHearingDate"), district: tcd("detail.district"),
    state: tcd("detail.state"), category: tcd("detail.category"), subCategory: tcd("detail.subCategory"),
    subSubCategory: tcd("detail.subSubCategory"),
    benchType: tcd("detail.benchType"), judicialBranch: tcd("detail.judicialBranch"),
    subordinateCourt: tcd("detail.subordinateCourt"), filedBy: tcd("detail.filedBy"),
    decidedOn: tcd("detail.decidedOn"), natureOfDisposal: tcd("detail.natureOfDisposal"),
    firNo: tcd("detail.firNo"), policeStation: tcd("detail.policeStation"),
  };
  const caseDetails = selectCaseDetailRows(detailValues, { isCourtSourced, isDisposed }).map((r) => ({
    label: detailLabels[r.id],
    value: r.value,
    emptyReason: r.emptyReason,
    emptyLabel: r.emptyReason === "not-applicable" ? tcd("empty.notApplicable") : tcd("empty.onRecord"),
  }));
  const coramName = str(detail.coram);
  const advocateBars = (detail.advocateBars ?? {}) as Record<string, string>;

  const parties = (Array.isArray(c.parties) ? c.parties : []) as Party[];
  const acts = (c.acts ?? []) as string[];

  const ct = expandCaseType(c.caseType);
  const caseTypeLabel = ct.full
    ? (ct.known && ct.code.toUpperCase() !== ct.full.toUpperCase() ? `${ct.full} · ${ct.code}` : ct.full)
    : null;
  const hearingJudge = c.judge ?? c.hearings.find((h) => h.judge)?.judge ?? null;
  const emptyOnRecord = tcd("empty.onRecord");
  const info: [string, string | null, string][] = [
    [tcd("info.court"), c.court ?? null, emptyOnRecord],
    [tcd("info.caseType"), caseTypeLabel, emptyOnRecord],
    [tcd("info.stage"), cleanPurpose(c.stage ?? null) || null, emptyOnRecord],
    [tcd("info.next"), fmtDate(c.nextHearingDate ?? null), tcd("empty.scheduled")],
    [tcd("info.judge"), hearingJudge, emptyOnRecord],
  ];

  // Timeline: prefer the live /timeline feed; else derive from the record's hearings + orders so the
  // section reflects what we have rather than a false gap (same rule as the tracked page).
  const dbTimeline: TimelineEvent[] = [
    ...c.hearings.filter((h) => h.date).map((h) => ({ date: h.date, type: "hearing" as const, detail: h.purpose ?? undefined, judge: h.judge ?? undefined })),
    ...c.orders.filter((o) => o.date).map((o) => ({ date: o.date as string, type: "order" as const, detail: o.title ?? undefined })),
  ];
  const effectiveTimeline = timelineEvents.length ? timelineEvents : dbTimeline;

  // Orders → the shared OrdersPanel shape. Untracked cases have no tenant court_order rows, so the
  // durable PDF-stream (raw.order_id) isn't available here; a provider pdfUrl still links out.
  const orderRows = c.orders.map((o) => ({ id: o.id, order_date: o.date ?? null, title: o.title ?? o.id, url: o.pdfUrl ?? null, raw: null }));

  const refreshed = c.fetchedAt ? new Date(c.fetchedAt).toLocaleString("en-IN") : tcd("source.never");

  return (
    <div className="space-y-6 text-ec-ink">
      {backLink}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.7rem] font-medium leading-tight tracking-tight">{maskTitle(c.title, tcd("maskedTitle"))}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`num ${chip("brand")} inline-flex items-center gap-1`}><Icon name="cases" className="h-3 w-3" /> {c.cnr}</span>
            {c.status && <span className={chip(statusTone(c.status))}>{c.status}</span>}
            <span className={`${chip("neutral")} inline-flex items-center gap-1`}><Icon name="alert" className="h-3 w-3" /> {t("untrackedBadge")}</span>
            {c.source && <span className="text-xs text-ec-ink-3">{tcd("via", { source: c.source })}</span>}
          </div>
        </div>
        <TrackCaseCta cnr={c.cnr} />
      </header>

      {/* Track CTA banner — the case is not yet tracked; explain what tracking unlocks. */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-ec-s border border-ec-brass/40 bg-ec-brass-tint/40 px-5 py-4">
        <div className="flex items-start gap-3">
          <Icon name="sparkles" className="mt-0.5 h-5 w-5 shrink-0 text-ec-brass-deep" />
          <div>
            <p className="font-display text-base font-medium text-ec-ink">{t("trackCta.title")}</p>
            <p className="mt-0.5 text-sm text-ec-ink-2">{t("trackCta.body")}</p>
          </div>
        </div>
        <TrackCaseCta cnr={c.cnr} variant="inline" />
      </div>

      {/* AI briefing — LOCKED until tracked (the AI summary is a tracked-case feature). */}
      <div className="ec-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-ec-hair bg-ec-brass-tint/30 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Icon name="sparkles" className="h-4 w-4 text-ec-brass-deep" />
            <h2 className="font-display text-base font-medium">{tcd("ai.title")}</h2>
            <span className={`${chip("neutral")} inline-flex items-center gap-1 text-[11px]`}><Icon name="alert" className="h-3 w-3" /> {t("aiLocked.badge")}</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
          <p className="max-w-md text-sm text-ec-ink-3">{t("aiLocked.body")}</p>
          <TrackCaseCta cnr={c.cnr} variant="inline" />
        </div>
      </div>

      {/* Info grid */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {info.map(([label, value, emptyLabel]) => (
          <div key={label} className="ec-card p-4">
            <p className="ec-label">{label}</p>
            <p className="mt-1.5 text-sm text-ec-ink">
              <CourtField value={value} emptyLabel={emptyLabel} maskedLabel={tcd("masked")} field={label} />
            </p>
          </div>
        ))}
      </section>

      {(caseDetails.length > 0 || coramName) && (
        <div className="ec-card">
          <div className="border-b border-ec-hair px-5 py-4"><h2 className="font-display text-base font-medium">{tcd("details.title")}</h2></div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-3">
            {caseDetails.map(({ label, value, emptyReason, emptyLabel }) => (
              <div key={label}>
                <dt className="ec-label">{label}</dt>
                <dd className="mt-1 text-sm text-ec-ink">
                  <CourtField value={value} emptyReason={emptyReason} emptyLabel={emptyLabel} maskedLabel={tcd("masked")} field={label} />
                </dd>
              </div>
            ))}
            {coramName && (
              <div>
                <dt className="ec-label">{tcd("detail.coram")}</dt>
                <dd className="mt-1 text-sm">
                  {isMaskedName(coramName) ? (
                    <MaskedName value={coramName} label={tcd("masked")} />
                  ) : (
                    <Link href={`/dashboard/search/directory?q=${encodeURIComponent(coramName)}`} className="font-medium text-ec-brass-deep hover:text-ec-brass">
                      {coramName}
                    </Link>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {acts.length > 0 && (
        <div className="ec-card">
          <div className="border-b border-ec-hair px-5 py-4"><h2 className="font-display text-base font-medium">{tcd("acts.title")}</h2></div>
          <div className="flex flex-wrap gap-2 px-5 py-5">
            {acts.map((a, i) => (
              <span key={i} className={chip("brand")}>{a}</span>
            ))}
          </div>
        </div>
      )}

      {/* Parties + hearings */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="ec-card">
          <div className="border-b border-ec-hair px-5 py-4"><h2 className="font-display text-base font-medium">{tcd("parties.title")}</h2></div>
          {parties.length ? (
            <ul className="divide-y divide-ec-hair">
              {parties.map((p, i) => {
                const bar = p.advocate ? advocateBars[p.advocate] : undefined;
                return (
                  <li key={i} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <CourtField value={p.name ?? null} maskedLabel={tcd("masked")} emptyLabel={tcd("parties.empty")} field="party" className="font-medium text-ec-ink" />
                    </span>
                    <span className="shrink-0 text-right text-xs text-ec-ink-3">
                      {p.side}
                      {p.advocate && (bar
                        ? <> · <Link href={`/dashboard/advocate/${bar}`} className="text-ec-brass-deep hover:text-ec-brass">{p.advocate}</Link></>
                        : ` · ${p.advocate}`)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-ec-ink-3">{tcd("parties.empty")}</p>
          )}
        </div>

        <div className="ec-card">
          <div className="border-b border-ec-hair px-5 py-4"><h2 className="font-display text-base font-medium">{tcd("hearings.title")}</h2></div>
          {c.hearings.length ? (
            <ul className="divide-y divide-ec-hair">
              {c.hearings.map((h, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="num w-20 shrink-0 text-ec-ink-3">{fmtDate(h.date)}</span>
                  <span className="flex-1 text-ec-ink">{h.purpose ? cleanPurpose(h.purpose) : tcd("hearings.fallback")}</span>
                  <span className="text-xs text-ec-ink-3">{h.judge ? (isMaskedName(h.judge) ? <MaskedName value={h.judge} label={tcd("masked")} /> : <Link href={`/dashboard/search/directory?q=${encodeURIComponent(h.judge)}`} className="text-ec-brass-deep hover:text-ec-brass">{h.judge}</Link>) : ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-ec-ink-3">{tcd("hearings.empty")}</p>
          )}
        </div>
      </div>

      {/* Timeline */}
      <CaseTimeline events={effectiveTimeline} hasCnr={true} />

      {/* Orders */}
      <OrdersPanel orders={orderRows} />

      {/* Provenance + disclaimer */}
      <div className="ec-card px-5 py-4">
        <p className="num text-sm text-ec-ink-3">{tcd("source.line", { source: c.source ?? "eCourts", time: refreshed })}</p>
        <p className="mt-2 text-xs text-ec-ink-3">{tcd("source.note")} <span className="font-medium text-ec-ink-2">{tcd("source.verify")}</span></p>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-ec-ink-3">
        <Icon name="alert" className="h-3.5 w-3.5" /> {tc("disclaimer")}
      </p>
    </div>
  );
}
