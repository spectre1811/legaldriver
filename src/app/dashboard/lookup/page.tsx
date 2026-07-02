import Link from "next/link";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { TrackCaseButton } from "@/components/track-case-button";
import { searchAdvocates, searchJudges, searchParties, getStats, ldEnabled } from "@/lib/court/legaldriver-api";

export const dynamic = "force-dynamic";

// Search the live court corpus by name — advocates (bar-wise caseload), judges (dossier),
// and parties/litigants (the cases they appear in, with the side they're on).
export default async function LookupPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = (searchParams.q ?? "").trim();
  const enabled = ldEnabled();
  const [advocates, judges, parties, stats] = enabled && q.length >= 2
    ? await Promise.all([searchAdvocates(q).catch(() => []), searchJudges(q).catch(() => []), searchParties(q).catch(() => []), getStats().catch(() => null)])
    : [[], [], [], enabled ? await getStats().catch(() => null) : null];

  const coverage = stats ? `Searching ${stats.cases_total.toLocaleString("en-IN")} cases across Gujarat (${(stats.by_tier?.DISTRICT ?? 0).toLocaleString("en-IN")} district · ${(stats.by_tier?.HIGH ?? 0).toLocaleString("en-IN")} High Court).` : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title="Judges, advocates & parties" subtitle="Search the live court corpus for any advocate (bar-wise caseload), judge (dossier + disposal patterns), or party (their cases + the side they’re on)." />

      <Card className="p-5">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-line px-3">
            <Icon name="search" className="h-4 w-4 text-ink-faint" />
            <input name="q" defaultValue={q} placeholder="Advocate, judge, or party name — e.g. Prajapati, Pinto, Patel…" className="min-w-40 flex-1 bg-transparent py-2.5 text-sm outline-none" autoFocus />
          </div>
          <button type="submit" className="btn-primary">Search</button>
        </form>
        {!enabled ? <p className="mt-3 text-xs text-amber-700">Live court API not configured (LD_API_KEY).</p>
          : coverage && <p className="mt-3 text-xs text-ink-faint">{coverage}</p>}
      </Card>

      {q.length >= 2 && (
        <>
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

          {/* Parties / litigants → the cases they appear in (with side + a one-click track). */}
          <Card>
            <div className="border-b border-line px-5 py-4"><h2 className="text-base font-medium">Parties / litigants <span className="text-ink-faint">({parties.length})</span></h2></div>
            {parties.length ? (
              <ul className="divide-y divide-line">
                {parties.slice(0, 30).map((p, i) => (
                  <li key={p.cnr + i} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-ink">{p.name}</span>
                      <span className="ml-2 font-mono text-[0.7rem] text-ink-faint">{p.cnr}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {p.side && <Badge tone={/pet|appl|compl/i.test(p.side) ? "green" : "neutral"}>{p.side.toLowerCase()}</Badge>}
                      <span className="hidden text-xs text-ink-faint sm:inline">{p.case_type}</span>
                      <TrackCaseButton cnr={p.cnr} />
                    </span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon="search" title="No parties found" hint="Try a surname (fuzzy match across litigants)." />}
          </Card>
        </>
      )}
      {q.length >= 2 && <p className="text-xs text-ink-faint">Source: LegalDriver / eCourts (Gujarat, expanding). A judge can appear under multiple bench combinations; advocates without a bar id can’t be opened; party matches are fuzzy. Not legal advice — verify against the official record.</p>}
    </div>
  );
}
