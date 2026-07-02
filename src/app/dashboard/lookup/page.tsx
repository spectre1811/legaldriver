import Link from "next/link";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { searchAdvocates, searchJudges, ldEnabled } from "@/lib/court/legaldriver-api";

export const dynamic = "force-dynamic";

// Search advocates + judges across the live court corpus → their dossier pages.
export default async function LookupPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? "").trim();
  const enabled = ldEnabled();
  const [advocates, judges] = enabled && q.length >= 2
    ? await Promise.all([searchAdvocates(q).catch(() => []), searchJudges(q).catch(() => [])])
    : [[], []];

  return (
    <div className="space-y-6">
      <PageHeader title="Judges & advocates" subtitle="Search the live court corpus for any advocate (bar-wise caseload) or judge (dossier + disposal patterns)." />

      <Card className="p-5">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-line px-3">
            <Icon name="search" className="h-4 w-4 text-ink-faint" />
            <input name="q" defaultValue={q} placeholder="e.g. Prajapati, Pinto, Mangukiya…" className="min-w-40 flex-1 bg-transparent py-2.5 text-sm outline-none" autoFocus />
          </div>
          <button type="submit" className="btn-primary">Search</button>
        </form>
        {!enabled && <p className="mt-3 text-xs text-amber-700">Live court API not configured (LD_API_KEY).</p>}
      </Card>

      {q.length >= 2 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <div className="border-b border-line px-5 py-4"><h2 className="text-base font-medium">Advocates <span className="text-ink-faint">({advocates.length})</span></h2></div>
            {advocates.length ? (
              <ul className="divide-y divide-line">
                {advocates.slice(0, 25).map((a, i) => (
                  <li key={(a.bar_id ?? "") + i} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    {a.bar_id ? <Link href={`/dashboard/advocate/${a.bar_id}`} className="min-w-0 flex-1 truncate font-medium text-brand-600 hover:underline">{a.name_raw}</Link> : <span className="min-w-0 flex-1 truncate text-ink">{a.name_raw}</span>}
                    <span className="shrink-0 text-xs text-ink-faint">{a.cases} cases{a.bar_id ? ` · bar ${a.bar_id}` : " · no bar id"}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon="scale" title="No advocates found" />}
          </Card>

          <Card>
            <div className="border-b border-line px-5 py-4"><h2 className="text-base font-medium">Judges <span className="text-ink-faint">({judges.length})</span></h2></div>
            {judges.length ? (
              <ul className="divide-y divide-line">
                {judges.slice(0, 25).map((j) => (
                  <li key={j.judge_id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <Link href={`/dashboard/judge/${j.judge_id}`} className="min-w-0 flex-1 truncate font-medium text-brand-600 hover:underline">{j.name_raw}</Link>
                    <span className="shrink-0 text-xs text-ink-faint">{j.cases} cases</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon="scale" title="No judges found" />}
          </Card>
        </div>
      )}
      {q.length >= 2 && <p className="text-xs text-ink-faint">Source: LegalDriver / eCourts (Gujarat, expanding). A judge can appear under multiple bench combinations; advocates without a bar id can’t be opened. Not legal advice.</p>}
    </div>
  );
}
