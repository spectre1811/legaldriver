import Link from "next/link";
import { PageHeader, Card, Badge, EmptyState, Stat, fmtDate } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { enabledAdvocateProviders } from "@/lib/court/advocate-cases";
import { RunOnboardingButton } from "./onboarding-ui";

export const dynamic = "force-dynamic";

interface Counts { causelist?: number; cases_fetched?: number; matters_seeded?: number; enriched?: number; deadlines_proposed?: number; inbox_filed?: number; docs_attached?: number; closed_found?: number; summaries_queued?: number }

const PROVIDER_LABEL: Record<string, string> = { corpus: "open corpus (free)", indiankanoon: "Indian Kanoon", vakeel360: "Vakeel360" };

export default async function OnboardingPage() {
  const supabase = createClient();
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

  return (
    <div className="space-y-6">
      <PageHeader title="Advocate onboarding" subtitle="Enter once, and we assemble your practice: cases on the calendar, inbox filed, closed cases by name, and AI briefings." />

      <Card>
        <div className="px-5 py-4 text-sm text-ink-soft">
          <p className="font-medium text-ink">How this works — honestly</p>
          <p className="mt-1.5 text-ink-muted">
            We <strong>auto-fetch your cases by your name</strong> from compliant sources — no manual upload. Active sources:{" "}
            <strong>{providers.map((p) => PROVIDER_LABEL[p] ?? p).join(", ") || "none configured"}</strong>. The free <strong>open judgments corpus</strong> covers
            High Courts + the Supreme Court (mostly decided cases); adding a licensed key (Indian Kanoon / Vakeel360) broadens coverage to live orders automatically.
          </p>
          <p className="mt-1.5 text-ink-faint">
            What we <em>don’t</em> do: scrape eCourts or solve its CAPTCHA. India has no compliant API for an advocate’s full live open-case roster by bar number, so for live status we also use your <strong>cause list</strong>, cases you <strong>add by CNR</strong>, and <strong>HITL refresh</strong>. Everything is marked with its source; <strong>not legal advice</strong>.
          </p>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4"><p className="font-medium">Your advocates</p></div>
        {advocates && advocates.length > 0 ? (
          <ul className="divide-y divide-line">
            {advocates.map((a) => {
              const run = latestByAdvocate.get(a.id);
              const c = (run?.counts ?? {}) as Counts;
              return (
                <li key={a.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-ink-muted">{a.bar_registration_number ? `Bar ${a.bar_registration_number}` : "no bar number"}{a.state_code ? ` · ${a.state_code}` : ""}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {run && <Badge tone={run.status === "done" ? "green" : run.status === "error" ? "red" : "amber"}>{run.status === "running" ? run.stage : run.status}</Badge>}
                      <RunOnboardingButton advocateId={a.id} label={run ? "Re-run" : "Run onboarding"} />
                    </div>
                  </div>
                  {run && (
                    <>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-9">
                        <Stat label="Cause-list" value={String(c.causelist ?? 0)} />
                        <Stat label="Cases fetched" value={String(c.cases_fetched ?? 0)} />
                        <Stat label="Matters seeded" value={String(c.matters_seeded ?? 0)} />
                        <Stat label="Enriched" value={String(c.enriched ?? 0)} />
                        <Stat label="Deadlines proposed" value={String(c.deadlines_proposed ?? 0)} />
                        <Stat label="Emails filed" value={String(c.inbox_filed ?? 0)} />
                        <Stat label="Docs auto-filed" value={String(c.docs_attached ?? 0)} />
                        <Stat label="Closed found" value={String(c.closed_found ?? 0)} />
                        <Stat label="Briefings queued" value={String(c.summaries_queued ?? 0)} />
                      </div>
                      <p className="mt-2 text-xs text-ink-faint">Last run {fmtDate(run.updated_at)}{run.message ? ` · ${run.message}` : ""}</p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon="scale" title="No advocates yet" body="Add an advocate (with their bar number) in Settings, then run onboarding here.">
            <Link href="/dashboard/settings" className="btn-primary">Go to Settings</Link>
          </EmptyState>
        )}
      </Card>

      <p className="text-xs text-ink-faint">
        After a run: open cases (with hearings + reminders) are on your <Link href="/dashboard/calendar" className="text-brand-600 hover:underline">Calendar</Link>,
        matters are in <Link href="/dashboard/cases" className="text-brand-600 hover:underline">Cases</Link> with AI briefings, and closed cases by name are in <Link href="/dashboard/research" className="text-brand-600 hover:underline">Research</Link>.
      </p>
    </div>
  );
}
