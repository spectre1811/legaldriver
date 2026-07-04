import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader, Card, Badge, Stat, fmtDate } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { enabledAdvocateProviders } from "@/lib/court/advocate-cases";
import { RunOnboardingButton, DeleteOnboardingButton } from "./onboarding-ui";
import { AdvocateForm } from "../settings/advocate-form";

export const dynamic = "force-dynamic";

interface Counts { causelist?: number; cases_fetched?: number; matters_seeded?: number; enriched?: number; deadlines_proposed?: number; inbox_filed?: number; docs_attached?: number; closed_found?: number; summaries_queued?: number }

export default async function OnboardingPage() {
  const supabase = createClient();
  const t = await getTranslations("onboarding");
  const tenantId = await getTenantId(supabase);

  const [{ data: advocates }, { data: runs }] = tenantId
    ? await Promise.all([
        supabase.from("advocate").select("id, name, bar_registration_number, state_code").order("created_at", { ascending: true }),
        supabase.from("onboarding_run").select("id, advocate_id, stage, status, counts, message, updated_at").order("updated_at", { ascending: false }).limit(10),
      ])
    : [{ data: [] }, { data: [] }];

  const latestByAdvocate = new Map<string, NonNullable<typeof runs>[number]>();
  for (const r of runs ?? []) if (r.advocate_id && !latestByAdvocate.has(r.advocate_id)) latestByAdvocate.set(r.advocate_id, r);

  const providers = enabledAdvocateProviders();
  const providerStr = providers.map((p) => (t.has(`provider.${p}`) ? t(`provider.${p}`) : p)).join(", ") || t("providersNone");
  const b = (c: React.ReactNode) => <strong>{c}</strong>;

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card>
        <div className="px-5 py-4 text-sm text-ink-soft">
          <p className="font-medium text-ink">{t("howHeading")}</p>
          <p className="mt-1.5 text-ink-muted">{t.rich("intro1", { b, providers: providerStr })}</p>
          <p className="mt-1.5 text-ink-faint">{t.rich("intro2", { b, i: (c) => <em>{c}</em> })}</p>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4"><p className="font-medium">{t("yourAdvocates")}</p></div>
        {advocates && advocates.length > 0 ? (
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
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-9">
                        <Stat label={t("stat.causelist")} value={String(c.causelist ?? 0)} />
                        <Stat label={t("stat.casesFetched")} value={String(c.cases_fetched ?? 0)} />
                        <Stat label={t("stat.mattersSeeded")} value={String(c.matters_seeded ?? 0)} />
                        <Stat label={t("stat.enriched")} value={String(c.enriched ?? 0)} />
                        <Stat label={t("stat.deadlinesProposed")} value={String(c.deadlines_proposed ?? 0)} />
                        <Stat label={t("stat.emailsFiled")} value={String(c.inbox_filed ?? 0)} />
                        <Stat label={t("stat.docsFiled")} value={String(c.docs_attached ?? 0)} />
                        <Stat label={t("stat.closedFound")} value={String(c.closed_found ?? 0)} />
                        <Stat label={t("stat.briefingsQueued")} value={String(c.summaries_queued ?? 0)} />
                      </div>
                      <p className="mt-2 text-xs text-ink-faint">{t("lastRun", { date: fmtDate(run.updated_at) })}{run.message ? ` · ${run.message}` : ""}</p>
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
