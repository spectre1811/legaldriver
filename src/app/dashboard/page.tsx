import { createClient } from "@/lib/supabase/server";

// Tenant-scoped overview. Counts come back RLS-filtered to the user's tenant,
// so an empty workspace shows zeros (the P0 "empty dashboard" milestone).
async function counts() {
  const supabase = createClient();
  const tables = ["matter", "hearing", "deadline", "notice"] as const;
  const entries = await Promise.all(
    tables.map(async (t) => {
      const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
      return [t, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<(typeof tables)[number], number>;
}

export default async function OverviewPage() {
  const c = await counts();
  const cards = [
    { label: "Tracked cases", value: c.matter, hint: "Add a case by CNR (P1)" },
    { label: "Upcoming hearings", value: c.hearing, hint: "Synced nightly (P1)" },
    { label: "Open deadlines", value: c.deadline, hint: "Jurisdiction-aware (P2)" },
    { label: "Active notices", value: c.notice, hint: "With escalation timers (P2)" },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          Everything on your plate, in one place.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-slate-200 bg-white p-5"
          >
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold text-ink">{card.value}</p>
            <p className="mt-2 text-xs text-slate-400">{card.hint}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <h2 className="text-lg font-medium text-ink">Your workspace is ready</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          This is your private, tenant-isolated workspace. Case tracking, the cause-list
          calendar, notices and Gmail ingest arrive in the next build phases.
        </p>
      </section>

      <footer className="border-t border-slate-200 pt-4 text-xs text-slate-400">
        Not legal advice. Court data is sourced from a licensed court-data API and is
        informational only — always verify against the official record.
      </footer>
    </div>
  );
}
