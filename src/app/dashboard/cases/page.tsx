import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AddCaseForm } from "./add-case-form";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtAgo(ts: string | null) {
  if (!ts) return "never";
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default async function CasesPage() {
  const supabase = createClient();
  const { data: matters } = await supabase
    .from("matter")
    .select("id, cnr, title, court, stage, status, next_hearing_date, last_synced_at, source")
    .order("next_hearing_date", { ascending: true, nullsFirst: false });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Cases</h1>
        <p className="mt-1 text-sm text-slate-500">
          Add a case by CNR; we fetch its details and keep it fresh on a nightly sync.
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <AddCaseForm />
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {matters && matters.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Case</th>
                <th className="px-4 py-3">CNR</th>
                <th className="px-4 py-3">Court</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Next hearing</th>
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {matters.map((m) => (
                <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-ink">
                    <Link href={`/dashboard/cases/${m.id}`} className="hover:underline">
                      {m.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{m.cnr ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{m.court ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{m.stage ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(m.next_hearing_date)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {m.source ?? "—"} · {fmtAgo(m.last_synced_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">
            No cases yet. Add one by CNR above.
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400">
        Not legal advice. Court data is sourced from a licensed court-data API and is
        informational only — verify against the official record.
      </p>
    </div>
  );
}
