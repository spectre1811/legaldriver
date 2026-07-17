import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, fmtAgo } from "@/components/ui";
import { formatCourtDate } from "@/components/court";
import { Icon, type IconName } from "@/components/icons";
import { AdvocateForm } from "./advocate-form";
import { FirmBillingForm } from "../invoices/invoices-ui";
import { CourtRefreshForms } from "./court-gateway";
import { CaptureTool } from "./capture-tool";
import { DeleteButton } from "@/components/delete-button";
import { deleteAdvocate } from "./actions";
import { getProviderHealth, getCacheStats } from "@/lib/court/gateway";
import { getMailerReadiness } from "@/lib/notify/mailer";
import { causeListAlertsSupported } from "@/lib/court/client";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SettingsTabs, SettingsPanel } from "./settings-tabs";
import { ProfileForm } from "./profile-form";
import { PhotoBlock } from "./photo-block";
import { signAvatar } from "@/lib/profile/avatar";
import { NotificationForm } from "./notification-form";
import { getTranslations } from "next-intl/server";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const te = await getTranslations("enum");
  const st = (v: string) =>
    te.has(`status.${v}`) ? te(`status.${v}`) : t.has(`refreshStatus.${v}`) ? t(`refreshStatus.${v}`) : v;
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: tenant } = await supabase.from("tenant").select("name").maybeSingle();
  const { data: profile } = await supabase
    .from("profile")
    .select("full_name, phone, designation, chamber, photo_url")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const avatarUrl = await signAvatar(profile?.photo_url);
  const { data: notif } = await supabase
    .from("notification_prefs")
    .select("whatsapp_number, channel_whatsapp, channel_email, channel_sms, quiet_start, quiet_end, cause_list_time")
    .eq("id", user?.id ?? "")
    .maybeSingle();
  const { data: advocates } = await supabase
    .from("advocate")
    .select("id, name, bar_registration_number, state_code")
    .order("name");
  const { data: firmBilling } = await supabase.from("firm_billing").select("*").maybeSingle();

  // Team members (RLS scopes to the tenant) + recent activity log (audit_event, already written).
  const { data: members } = await supabase.from("profile").select("id, full_name, role, created_at").order("created_at");
  const { data: auditLog } = await supabase
    .from("audit_event")
    .select("id, action, entity, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  // Active capture token (HITL bookmarklet). baseUrl for the bookmarklet target.
  const { data: tok } = await supabase
    .from("capture_token")
    .select("token")
    .eq("revoked", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const captureBaseUrl = process.env.APP_BASE_URL?.startsWith("http") ? process.env.APP_BASE_URL : "https://app.mukadma.in";

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
  const mailer = getMailerReadiness();
  const causeListOk = causeListAlertsSupported();

  const SECTIONS: { id: string; label: string; icon: IconName }[] = [
    { id: "profile", label: t("nav.profile"), icon: "clients" },
    { id: "practice", label: t("nav.practice"), icon: "scale" },
    { id: "billing", label: t("nav.billing"), icon: "invoice" },
    { id: "integrations", label: t("nav.integrations"), icon: "gmail" },
    { id: "team", label: t("nav.team"), icon: "clients" },
    { id: "preferences", label: t("nav.preferences"), icon: "settings" },
    { id: "privacy", label: t("nav.privacy"), icon: "bulb" },
    { id: "admin", label: t("nav.admin"), icon: "alert" },
  ];

  return (
    <div className="space-y-7">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <SettingsTabs sections={SECTIONS}>
        {/* ── Profile: account identity (read-only; editable fields need the profile migration) ── */}
        <SettingsPanel id="profile">
          <Card className="p-5">
            {/* Identity lead — real photo (WO-147 W4) with initials fallback (honesty rule §7b:
                never a fabricated/silhouette image). Stored in the `documents` bucket, shown via a
                signed URL; upload/remove handled client-side by <PhotoBlock>. */}
            <PhotoBlock
              photoUrl={avatarUrl}
              initial={(profile?.full_name?.trim()?.[0] ?? user?.email?.[0] ?? "?").toUpperCase()}
              name={profile?.full_name?.trim() || user?.email || "—"}
              designation={profile?.designation ?? null}
            />
            <dl className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
              <div>
                <dt className="ec-label">{t("profile.email")}</dt>
                <dd className="mt-1 text-sm text-ink">{user?.email ?? "—"}</dd>
              </div>
              <div>
                <dt className="ec-label">{t("profile.workspace")}</dt>
                <dd className="mt-1 text-sm text-ink">{tenant?.name ?? "—"}</dd>
              </div>
            </dl>
            <ProfileForm profile={profile ?? { full_name: null, phone: null, designation: null, chamber: null }} />
            <p className="mt-5 border-t border-line pt-4 text-xs text-ink-faint">{t("profile.residency")}</p>
          </Card>
        </SettingsPanel>

        {/* ── Practice: advocates ── */}
        <SettingsPanel id="practice">
          <Card className="p-5">
            <h2 className="mb-1 text-base font-medium">{t("advocates.heading")}</h2>
            <p className="mb-4 text-sm text-ink-muted">{t("advocates.desc")}</p>
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
        </SettingsPanel>

        {/* ── Billing: firm GST / invoicing settings ── */}
        <SettingsPanel id="billing">
          <Card className="p-5">
            <h2 className="mb-1 text-base font-medium">{t("billing.heading")}</h2>
            <p className="mb-4 text-sm text-ink-muted">{t("billing.desc")}</p>
            <FirmBillingForm firm={firmBilling ?? null} />
          </Card>
        </SettingsPanel>

        {/* ── Integrations: connected services ── */}
        <SettingsPanel id="integrations">
          <Card className="flex items-start gap-3 p-5">
            <Icon name="gmail" className="mt-0.5 h-5 w-5 text-ink-faint" />
            <div className="text-sm text-ink-muted">
              <p className="font-medium text-ink">{t("connections.heading")}</p>
              <p className="mt-0.5">{t.rich("connections.desc", { b: (c) => <span className="text-brand-600">{c}</span> })}</p>
            </div>
          </Card>
        </SettingsPanel>

        {/* ── Team & members (read-only today; invite needs the multi-member flow) ── */}
        <SettingsPanel id="team">
          <Card className="p-5">
            <h2 className="mb-1 text-base font-medium">{t("team.heading")}</h2>
            <p className="mb-4 text-sm text-ink-muted">{t("team.desc")}</p>
            <ul className="divide-y divide-line">
              {(members ?? []).map((m) => (
                <li key={m.id} className="flex items-center justify-between py-3 text-sm">
                  <span className="flex items-center gap-2.5 font-medium text-ink">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                      {(m.full_name ?? "?").slice(0, 1).toUpperCase()}
                    </span>
                    {m.full_name ?? t("team.unnamed")}
                    {m.id === user?.id && <span className="text-xs font-normal text-ink-faint">{t("team.you")}</span>}
                  </span>
                  <span className="ec-chip capitalize">{m.role}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-line px-4 py-3 text-sm">
              <Icon name="clients" className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
              <p className="text-xs text-ink-muted">{t("team.inviteSoon")}</p>
            </div>
          </Card>
        </SettingsPanel>

        {/* ── Preferences: language + notifications ── */}
        <SettingsPanel id="preferences">
          <Card className="p-5">
            <h2 className="mb-1 text-base font-medium">{t("preferences.heading")}</h2>
            <p className="mb-4 text-sm text-ink-muted">{t("preferences.language")}</p>
            <LanguageSwitcher />
          </Card>
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <Icon name="bell" className="h-4 w-4 text-ink-faint" />
              <h2 className="text-base font-medium">{t("preferences.notifications")}</h2>
            </div>
            <NotificationForm
              prefs={notif ?? { whatsapp_number: null, channel_whatsapp: false, channel_email: true, channel_sms: false, quiet_start: null, quiet_end: null, cause_list_time: null }}
            />
          </Card>
        </SettingsPanel>

        {/* ── Data & privacy: activity log + export + account deletion ── */}
        <SettingsPanel id="privacy">
          <Card className="p-5">
            <div className="mb-1 flex items-center gap-2">
              <Icon name="documents" className="h-4 w-4 text-ink-faint" />
              <h2 className="text-base font-medium">{t("privacy.exportHeading")}</h2>
            </div>
            <p className="mb-4 text-sm text-ink-muted">{t("privacy.exportDesc")}</p>
            <a href="/api/export" className="btn-primary inline-flex w-fit items-center gap-2" download>
              <Icon name="external" className="h-4 w-4" /> {t("privacy.exportButton")}
            </a>
          </Card>

          <Card className="p-5">
            <h2 className="mb-1 text-base font-medium">{t("privacy.activityHeading")}</h2>
            <p className="mb-4 text-sm text-ink-muted">{t("privacy.activityDesc")}</p>
            {auditLog && auditLog.length ? (
              <ul className="divide-y divide-line">
                {auditLog.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="text-ink">
                      <span className="font-mono text-xs text-ec-brass-deep">{a.action}</span>
                      {a.entity ? <span className="text-ink-faint"> · {a.entity}</span> : null}
                    </span>
                    <span className="shrink-0 text-xs text-ink-faint">{fmtAgo(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-ink-faint">{t("privacy.activityEmpty")}</p>
            )}
          </Card>

          <Card className="flex items-start gap-3 p-5">
            <Icon name="alert" className="mt-0.5 h-5 w-5 text-red-600" />
            <div className="text-sm text-ink-muted">
              <p className="font-medium text-ink">{t("privacy.deleteHeading")}</p>
              <p className="mt-0.5">{t("privacy.deleteDesc")}</p>
            </div>
          </Card>
        </SettingsPanel>

        {/* ── Admin & diagnostics: operational tools (relocated out of user prefs) ── */}
        <SettingsPanel id="admin">
          <div className="flex items-start gap-2.5 rounded-ec-m border border-ec-hair bg-ec-paper-3/40 px-4 py-3">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-ec-ink-3" />
            <p className="text-xs text-ink-muted">{t("admin.desc")}</p>
          </div>

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
                <p className="border-t border-line px-4 py-3 text-sm text-ink-faint">{t("court.noActivity")}</p>
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

            {/* Email delivery readiness (WO-35 #6) — so silent no-ops / owner-only restriction are visible */}
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-line px-4 py-3 text-sm">
              <Icon
                name={mailer.status === "ready" ? "check" : "alert"}
                className={`mt-0.5 h-4 w-4 shrink-0 ${mailer.status === "ready" ? "text-emerald-600" : "text-amber-600"}`}
              />
              <div className="min-w-0">
                <p className="font-medium text-ink">{t(`court.mail.${mailer.status}`)}</p>
                <p className="mt-0.5 text-xs text-ink-faint">{t(`court.mail.${mailer.status}Hint`, { from: mailer.from })}</p>
              </div>
            </div>

            {/* Cause-list alert capability (WO-35 #4) — flagship "listed tomorrow" alert needs a provider that supports it */}
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-line px-4 py-3 text-sm">
              <Icon
                name={causeListOk ? "check" : "alert"}
                className={`mt-0.5 h-4 w-4 shrink-0 ${causeListOk ? "text-emerald-600" : "text-amber-600"}`}
              />
              <div className="min-w-0">
                <p className="font-medium text-ink">{t(causeListOk ? "court.causeList.on" : "court.causeList.off")}</p>
                <p className="mt-0.5 text-xs text-ink-faint">{t(causeListOk ? "court.causeList.onHint" : "court.causeList.offHint")}</p>
              </div>
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
                        <span className="text-xs text-ink-faint">{(formatCourtDate(r.created_at) ?? "—")}</span>
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
        </SettingsPanel>
      </SettingsTabs>
    </div>
  );
}
