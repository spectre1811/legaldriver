import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader, Card, Badge, Stat, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { enabledAdvocateProviders } from "@/lib/court/advocate-cases";
import { RunOnboardingButton, DeleteOnboardingButton, OnboardingBackground } from "./onboarding-ui";
import { AdvocateForm } from "../settings/advocate-form";
import { isGathering } from "@/lib/services/onboarding/progress";

export const dynamic = "force-dynamic";
// BP-71: onboarding runs multi-stage server-side (fetch → enrich per-CNR → …). Give the server action
// room so it isn't killed mid-run (Vercel's short default would leave a stuck "running" run + 0 counts).
export const maxDuration = 60;

interface Counts { causelist?: number; cases_fetched?: number; matters_seeded?: number; enriched?: number; deadlines_proposed?: number; inbox_filed?: number; docs_attached?: number; closed_found?: number; summaries_queued?: number; roster_total?: number }

export default async function OnboardingPage() {
  const supabase = createClient();
  const t = await getTranslations("onboarding");
  const tenantId = await getTenantId(supabase);

  const [{ data: advocates }, { data: runs }, { data: matters, count: matterCount }] = tenantId
    ? await Promise.all([
        supabase.from("advocate").select("id, name, bar_registration_number, state_code").order("created_at", { ascending: true }),
        supabase.from("onboarding_run").select("id, advocate_id, stage, status, counts, message, updated_at, cursor").order("updated_at", { ascending: false }).limit(10),
        supabase.from("matter").select("id, title, cnr, court, next_hearing_date, status", { count: "exact" }).is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
      ])
    : [{ data: [] }, { data: [] }, { data: [], count: 0 }];

  const latestByAdvocate = new Map<string, NonNullable<typeof runs>[number]>();
  for (const r of runs ?? []) if (r.advocate_id && !latestByAdvocate.has(r.advocate_id)) latestByAdvocate.set(r.advocate_id, r);

  const providers = enabledAdvocateProviders();
  const providerStr = providers.map((p) => (t.has(`provider.${p}`) ? t(`provider.${p}`) : p)).join(", ") || t("providersNone");
  const b = (c: React.ReactNode) => <strong>{c}</strong>;
  const hasAdvocates = !!advocates && advocates.length > 0;
  const cases = (matterCount ?? 0) > 0 ? matterCount ?? 0 : (matters?.length ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* The payoff — WO-61 W3: onboarding used to end at a telemetry grid; show the practice we built. */}
      {hasAdvocates && matters && matters.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <p className="font-medium">{t("practice.title")}</p>
              <p className="text-sm text-ink-muted">{t("practice.count", { n: cases })}</p>
            </div>
            <Link href="/dashboard/cases" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
              {t("practice.viewAll")} <Icon name="chevron" className="h-4 w-4" />
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {matters.map((m) => (
              <li key={m.id}>
                <Link href={`/dashboard/cases/${m.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-paper">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.title}</p>
                    <p className="truncate text-xs text-ink-muted">{m.court || m.cnr || ""}</p>
                  </div>
                  <span className="shrink-0 text-xs text-ink-faint">
                    {m.next_hearing_date ? t("practice.nextHearing", { date: fmtDate(m.next_hearing_date) }) : t("practice.noHearing")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* "How it works" — condensed to a collapsible so the page leads with action, not a wall of prose. */}
      <Card>
        <details className="group px-5 py-4 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-ink">
            <Icon name="chevron" className="h-4 w-4 text-ink-muted transition group-open:rotate-90" />
            {t("howHeading")}
          </summary>
          <p className="mt-2.5 text-ink-muted">{t.rich("intro1", { b, providers: providerStr })}</p>
          <p className="mt-1.5 text-ink-faint">{t.rich("intro2", { b, i: (c) => <em>{c}</em> })}</p>
        </details>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4"><p className="font-medium">{t("yourAdvocates")}</p></div>
        {hasAdvocates ? (
          <>
          <ul className="divide-y divide-line">
            {advocates.map((a) => {
              const run = latestByAdvocate.get(a.id);
              const c = (run?.counts ?? {}) as Counts;
              return (
                <li key={a.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-ink-muted">{a.bar_registration_number ? t("bar", { n: a.bar_registration_number }) : t("noBar")}{a.state_code ? ` · ${a.state_code}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {run && <Badge tone={run.status === "done" ? "green" : run.status === "error" ? "red" : "amber"}>{run.status === "running" ? run.stage : (t.has(`runStatus.${run.status}`) ? t(`runStatus.${run.status}`) : run.status)}</Badge>}
                      <RunOnboardingButton advocateId={a.id} label={run ? t("rerun") : t("run")} />
                      <DeleteOnboardingButton advocateId={a.id} label={t("remove")} confirmText={t("removeConfirm", { name: a.name })} />
                    </div>
                  </div>
                  {run && (
                    <>
                      {run.status === "error" && run.message && (
                        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{run.message}</p>
                      )}
                      {isGathering({ cursor: run.cursor as Record<string, unknown> | null, updatedAt: run.updated_at }, Date.now()) && (
                        <OnboardingBackground advocateId={a.id} />
                      )}
                      <p className="mt-3 text-xs text-ink-faint">{t("lastRun", { date: fmtDate(run.updated_at) })}{run.status !== "error" && run.message ? ` · ${run.message}` : ""}</p>
                      <details className="group mt-2 text-xs">
                        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-ink-muted hover:text-ink">
                          <Icon name="chevron" className="h-3.5 w-3.5 transition group-open:rotate-90" />
                          {t("runDetails")}
                        </summary>
                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                          <Stat label={t("stat.rosterTotal")} value={String(c.roster_total ?? c.cases_fetched ?? 0)} />
                          <Stat label={t("stat.casesFetched")} value={String(c.cases_fetched ?? 0)} />
                          <Stat label={t("stat.mattersSeeded")} value={String(c.matters_seeded ?? 0)} />
                          <Stat label={t("stat.causelist")} value={String(c.causelist ?? 0)} />
                          <Stat label={t("stat.enriched")} value={String(c.enriched ?? 0)} />
                          <Stat label={t("stat.deadlinesProposed")} value={String(c.deadlines_proposed ?? 0)} />
                          <Stat label={t("stat.emailsFiled")} value={String(c.inbox_filed ?? 0)} />
                          <Stat label={t("stat.docsFiled")} value={String(c.docs_attached ?? 0)} />
                          <Stat label={t("stat.closedFound")} value={String(c.closed_found ?? 0)} />
                          <Stat label={t("stat.briefingsQueued")} value={String(c.summaries_queued ?? 0)} />
                        </div>
                      </details>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line px-5 py-5">
            <p className="mb-3 text-sm font-medium text-ink">{t("addAnother")}</p>
            <AdvocateForm />
          </div>
          </>
        ) : (
          <div className="px-5 py-6">
            <p className="font-medium text-ink">{t("empty.title")}</p>
            <p className="mb-4 mt-1 text-sm text-ink-muted">{t("empty.body")}</p>
            <AdvocateForm />
          </div>
        )}
      </Card>

      <p className="text-xs text-ink-faint">
        {t.rich("footer", {
          calendar: (c) => <Link href="/dashboard/calendar" className="text-brand-600 hover:underline">{c}</Link>,
          cases: (c) => <Link href="/dashboard/cases" className="text-brand-600 hover:underline">{c}</Link>,
          research: (c) => <Link href="/dashboard/search/judgments" className="text-brand-600 hover:underline">{c}</Link>,
        })}
      </p>
    </div>
  );
}
