import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader, Card, fmtDate } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { enabledAdvocateProviders } from "@/lib/court/advocate-cases";
import { AdvocateOnboarding } from "./onboarding-ui";
import { AdvocateForm } from "../settings/advocate-form";

export const dynamic = "force-dynamic";
// BP-71: onboarding runs multi-stage server-side (fetch → enrich per-CNR → …). Give the server action
// room so it isn't killed mid-run (Vercel's short default would leave a stuck "running" run + 0 counts).
export const maxDuration = 60;

// WO-84 W2 — ground-up visual redesign of the onboarding page SHELL. W1 rebuilt the live per-advocate
// lifecycle (<AdvocateOnboarding>); this wave gives the page a proper spine: a branded cold-start hero
// with a plain-language "how onboarding works" stepper, a polished practice-payoff, and a clear
// advocates section — so the founder's "redesign the UI ground up, modern, easy, accessible" lands on
// the surface, not just the mechanics. Purely presentational; consumes the same data + client component.

// The three honest steps, rendered in the cold-start hero. Numbered brass markers + one icon each so a
// non-lawyer sees the whole journey (enter → we gather → it comes alive) before committing a bar number.
const STEP_ICONS: IconName[] = ["edit", "search", "calendar"];

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
  const stepKeys = ["one", "two", "three"] as const;

  // The honest "how it works" disclosure — a wall of prose the first time, so it collapses out of the way
  // once the user has advocates (reference), but leads the hero when they're deciding whether to trust us.
  const howItWorks = (
    <Card>
      <details className="group px-5 py-4 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-ink">
          <Icon name="chevron" className="h-4 w-4 text-ink-muted transition group-open:rotate-90 motion-reduce:transition-none" />
          {t("howHeading")}
        </summary>
        <p className="mt-2.5 text-ink-muted">{t.rich("intro1", { b, providers: providerStr })}</p>
        <p className="mt-1.5 text-ink-faint">{t.rich("intro2", { b, i: (c) => <em>{c}</em> })}</p>
      </details>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {hasAdvocates ? (
        <>
          {/* The payoff — WO-61 W3: onboarding used to end at a telemetry grid; show the practice we built. */}
          {matters && matters.length > 0 && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Icon name="check" className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-medium">{t("practice.title")}</p>
                    <p className="text-sm text-ink-muted tabular-nums">{t("practice.count", { n: cases })}</p>
                  </div>
                </div>
                <Link href="/dashboard/cases" className="btn-secondary text-sm">
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

          <Card>
            <div className="border-b border-line px-5 py-4"><p className="font-medium">{t("yourAdvocates")}</p></div>
            <ul className="divide-y divide-line">
              {advocates.map((a) => {
                const run = latestByAdvocate.get(a.id);
                const initialRun = run
                  ? {
                      stage: run.stage, status: run.status,
                      counts: (run.counts ?? {}) as Record<string, number>,
                      message: run.message, updatedAt: run.updated_at,
                      cursor: (run.cursor ?? null) as Record<string, unknown> | null,
                    }
                  : null;
                return (
                  <li key={a.id}>
                    <AdvocateOnboarding
                      advocate={{ id: a.id, name: a.name, bar: a.bar_registration_number, stateCode: a.state_code ? String(a.state_code) : null }}
                      initialRun={initialRun}
                    />
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-line px-5 py-5">
              <p className="mb-3 text-sm font-medium text-ink">{t("addAnother")}</p>
              <AdvocateForm />
            </div>
          </Card>

          {howItWorks}
        </>
      ) : (
        <>
          {/* Cold-start hero — the branded first impression. Value proposition → the honest 3-step journey
              → the primary action (add your first advocate) inline, so there's exactly one thing to do. */}
          <Card className="overflow-hidden">
            <div className="border-b border-line bg-brand-50/40 px-6 py-8 sm:px-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
                <Icon name="sparkles" className="h-6 w-6" />
              </span>
              <h2 className="mt-4 max-w-xl font-serif text-2xl font-semibold leading-tight text-ink sm:text-[1.75rem]">
                {t("hero.title")}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">{t("hero.body")}</p>
            </div>

            <div className="px-6 py-6 sm:px-8">
              <p className="label mb-4">{t("steps.heading")}</p>
              <ol className="grid gap-5 sm:grid-cols-3 sm:gap-6">
                {stepKeys.map((k, i) => (
                  <li key={k} className="flex gap-3 sm:flex-col sm:gap-0">
                    <div className="flex items-center gap-2 sm:mb-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 font-serif text-sm font-semibold tabular-nums text-white">
                        {i + 1}
                      </span>
                      <Icon name={STEP_ICONS[i]} className="h-4 w-4 text-brand-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{t(`steps.${k}.title`)}</p>
                      <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t(`steps.${k}.body`)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="border-t border-line px-6 py-6 sm:px-8">
              <p className="font-medium text-ink">{t("empty.title")}</p>
              <p className="mb-4 mt-1 text-sm text-ink-muted">{t("empty.body")}</p>
              <AdvocateForm />
            </div>
          </Card>

          {howItWorks}
        </>
      )}

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
