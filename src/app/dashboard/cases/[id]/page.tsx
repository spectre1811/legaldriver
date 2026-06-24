import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RefreshButton } from "./refresh-button";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type Party = { name?: string; side?: string; advocate?: string };

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: matter } = await supabase
    .from("matter")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!matter) notFound();

  const { data: hearings } = await supabase
    .from("hearing")
    .select("id, date, purpose, court_no, judge")
    .eq("matter_id", matter.id)
    .order("date", { ascending: false });

  const parties = (Array.isArray(matter.parties) ? matter.parties : []) as Party[];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/cases" className="text-sm text-accent hover:underline">
          ← Cases
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-ink">{matter.title}</h1>
        <p className="mt-1 font-mono text-xs text-slate-500">{matter.cnr}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Info label="Court" value={matter.court} />
        <Info label="Case type" value={matter.case_type} />
        <Info label="Stage" value={matter.stage} />
        <Info label="Status" value={matter.status} />
        <Info label="Next hearing" value={fmtDate(matter.next_hearing_date)} />
        <Info label="Judge" value={(matter.parties as unknown as { judge?: string })?.judge ?? "—"} />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium text-ink">Provenance</h2>
          <RefreshButton matterId={matter.id} />
        </div>
        <p className="text-sm text-slate-500">
          Source: <span className="font-medium text-slate-700">{matter.source ?? "manual"}</span> ·
          last refreshed {matter.last_synced_at ? new Date(matter.last_synced_at).toLocaleString("en-IN") : "never"}
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-medium text-ink">Parties</h2>
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
          {parties.length ? (
            <ul className="space-y-1">
              {parties.map((p, i) => (
                <li key={i} className="text-slate-700">
                  <span className="font-medium">{p.name}</span>
                  {p.side ? <span className="text-slate-400"> · {p.side}</span> : null}
                  {p.advocate ? <span className="text-slate-400"> · {p.advocate}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-400">No party details.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-medium text-ink">Hearing history</h2>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {hearings && hearings.length ? (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Purpose</th>
                  <th className="px-4 py-2">Court</th>
                  <th className="px-4 py-2">Judge</th>
                </tr>
              </thead>
              <tbody>
                {hearings.map((h) => (
                  <tr key={h.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 text-slate-700">{fmtDate(h.date)}</td>
                    <td className="px-4 py-2 text-slate-600">{h.purpose ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-600">{h.court_no ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-600">{h.judge ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-4 text-sm text-slate-400">No hearings recorded.</p>
          )}
        </div>
      </section>

      <p className="text-xs text-slate-400">
        Not legal advice. Verify against the official record.
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-700">{value ?? "—"}</p>
    </div>
  );
}
