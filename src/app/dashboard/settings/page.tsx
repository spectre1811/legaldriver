import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, fmtAgo, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AdvocateForm } from "./advocate-form";
import { FirmBillingForm } from "../invoices/invoices-ui";
import { CourtRefreshForms } from "./court-gateway";
import { CaptureTool } from "./capture-tool";
import { DeleteButton } from "@/components/delete-button";
import { deleteAdvocate } from "./actions";
import { getProviderHealth, getCacheStats } from "@/lib/court/gateway";
import { getTranslations } from "next-intl/server";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const te = await getTranslations("enum");
  const st = (v: string) =>
    te.has(`status.${v}`) ? te(`status.${v}`) : t.has(`refreshStatus.${v}`) ? t(`refreshStatus.${v}`) : v;
  const supabase = createClient();
  const { data: advocates } = await supabase
    .from("advocate")
    .select("id, name, bar_registration_number, state_code")
    .order("name");

  const { data: firmBilling } = await supabase.from("firm_billing").select("*").maybeSingle();

  // Active capture token (HITL bookmarklet). baseUrl for the bookmarklet target.
  const { data: tok } = await supabase
    .from("capture_token")
    .select("token")
    .eq("revoked", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const captureBaseUrl = process.env.APP_BASE_URL?.startsWith("http") ? process.env.APP_BASE_URL : "https://legaldriver.vercel.app";

  // Cache + provider health come from the shared gateway (admin/service-role).
  // Refresh-request rows are tenant-scoped via RLS through createClient().
  const [health, stats, recent] = await Promise.all([
    getProviderHealth(),
    getCacheStats(),
    supabase
      .from("court_refresh_request")
      .select("id, cnr, status, note, created_at, fulfilled_at")
      .order("created_at", { ascending: false })
      .limit(8)
      .then((r) => r.data ?? []),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card className="p-5">
        <h2 className="mb-4 text-base font-medium">{t("advocates.heading")}</h2>
        <AdvocateForm />
        {advocates && advocates.length > 0 && (
          <ul className="mt-5 divide-y divide-line">
            {advocates.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3 text-sm">
                <span className="flex items-center gap-2.5 font-medium text-ink">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {a.name.slice(0, 1)}
                  </span>
                  {a.name}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-mono text-xs text-ink-faint">
                    {a.bar_registration_number ?? "—"}{a.state_code ? ` · ${a.state_code}` : ""}
                  </span>
                  <DeleteButton onDelete={deleteAdvocate.bind(null, a.id)} label={t("advocates.remove")} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-base font-medium">{t("billing.heading")}</h2>
        <p className="mb-4 text-sm text-ink-muted">{t("billing.desc")}</p>
        <FirmBillingForm firm={firmBilling ?? null} />
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-start gap-2.5">
          <Icon name="scale" className="mt-0.5 h-5 w-5 text-ink-faint" />
          <div>
            <h2 className="text-base font-medium">{t("court.heading")}</h2>
            <p className="mt-0.5 text-sm text-ink-muted">{t("court.desc")}</p>
          </div>
        </div>

        {/* Provider health */}
        <div className="rounded-xl border border-line">
          <div className="flex items-center justify-between px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-faint">
            <span>{t("court.providerCol")}</span>
            <span>{t("court.statusCol")}</span>
          </div>
          {health.length === 0 ? (
            <p className="border-t border-line px-4 py-3 text-sm text-ink-faint">
              {t("court.noActivity")}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {health.map((h) => (
                <li key={h.provider} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="flex items-center gap-2 font-mono text-ink">
                    <Icon name={h.ok ? "check" : "alert"} className={`h-4 w-4 ${h.ok ? "text-emerald-600" : "text-red-600"}`} />
                    {h.provider}
                  </span>
                  <span className="flex items-center gap-2.5 text-right">
                    {h.last_error && !h.ok && (
                      <span className="hidden max-w-[16rem] truncate text-xs text-ink-faint sm:inline" title={h.last_error}>
                        {h.last_error}
                      </span>
                    )}
                    <span className="text-xs text-ink-faint">
                      <Icon name="clock" className="mr-1 inline h-3 w-3" />
                      {t("court.okAgo", { ago: fmtAgo(h.last_ok_at) })}
                    </span>
                    <Badge tone={h.ok ? "green" : "red"}>{h.ok ? t("court.ok") : t("court.down")}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Cache stats */}
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-ink-muted">
          <span>
            <span className="font-semibold text-ink">{stats.cases}</span> {t("court.cachedCases", { count: stats.cases })}
          </span>
          <span className="flex items-center gap-1.5">
            <Icon name="refresh" className="h-3.5 w-3.5" />
            {t("court.lastRefresh")} <span className="text-ink">{fmtAgo(stats.lastFetchedAt)}</span>
          </span>
        </div>

        {/* Refresh controls (provider button + HITL) */}
        <div className="mt-5">
          <CourtRefreshForms />
        </div>

        {/* Recent refresh requests */}
        {recent.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">{t("court.recentHeading")}</p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="flex flex-col">
                    <span className="font-mono text-ink">{r.cnr}</span>
                    {r.note && <span className="text-xs text-ink-faint">{r.note}</span>}
                  </span>
                  <span className="flex items-center gap-2.5">
                    <span className="text-xs text-ink-faint">{fmtDate(r.created_at)}</span>
                    <Badge tone={r.status === "fulfilled" ? "green" : r.status === "cancelled" ? "neutral" : "amber"}>
                      {st(r.status)}
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 flex items-center gap-1.5 text-xs text-ink-faint">
          <Icon name="alert" className="h-3.5 w-3.5" />
          {t("court.provenance")}
        </p>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Icon name="scale" className="h-4 w-4 text-brand-600" />
          <h2 className="text-base font-medium">{t("capture.heading")}</h2>
        </div>
        <CaptureTool token={tok?.token ?? null} baseUrl={captureBaseUrl} />
      </Card>

      <Card className="flex items-start gap-3 p-5">
        <Icon name="gmail" className="mt-0.5 h-5 w-5 text-ink-faint" />
        <div className="text-sm text-ink-muted">
          <p className="font-medium text-ink">{t("connections.heading")}</p>
          <p className="mt-0.5">{t.rich("connections.desc", { b: (c) => <span className="text-brand-600">{c}</span> })}</p>
        </div>
      </Card>
    </div>
  );
}
