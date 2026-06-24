import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState, Disclaimer, fmtDate, fmtAgo } from "@/components/ui";
import { Icon } from "@/components/icons";
import { AddCaseForm } from "./add-case-form";

export default async function CasesPage() {
  const supabase = createClient();
  const { data: matters } = await supabase
    .from("matter")
    .select("id, cnr, title, court, stage, status, next_hearing_date, last_synced_at, source")
    .order("next_hearing_date", { ascending: true, nullsFirst: false });

  return (
    <div className="space-y-7">
      <PageHeader title="Cases" subtitle="Add a case by CNR; we fetch its details and keep it fresh on a nightly sync." />

      <Card className="p-5">
        <AddCaseForm />
      </Card>

      {matters && matters.length > 0 ? (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-3 label">Case</th>
                <th className="px-5 py-3 label">CNR</th>
                <th className="hidden px-5 py-3 label md:table-cell">Court</th>
                <th className="hidden px-5 py-3 label sm:table-cell">Stage</th>
                <th className="px-5 py-3 label">Next hearing</th>
                <th className="hidden px-5 py-3 label lg:table-cell">Source</th>
              </tr>
            </thead>
            <tbody>
              {matters.map((m) => (
                <tr key={m.id} className="group border-b border-line last:border-0 transition hover:bg-paper">
                  <td className="px-5 py-3.5">
                    <Link href={`/dashboard/cases/${m.id}`} className="font-medium text-ink group-hover:text-brand-600">
                      {m.title}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-xs text-ink-faint">{m.cnr ?? "—"}</td>
                  <td className="hidden px-5 py-3.5 text-ink-muted md:table-cell">{m.court ?? "—"}</td>
                  <td className="hidden px-5 py-3.5 sm:table-cell">{m.stage ? <Badge>{m.stage}</Badge> : <span className="text-ink-faint">—</span>}</td>
                  <td className="px-5 py-3.5 text-ink-soft">{fmtDate(m.next_hearing_date)}</td>
                  <td className="hidden px-5 py-3.5 text-xs text-ink-faint lg:table-cell">{m.source ?? "—"} · {fmtAgo(m.last_synced_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState icon="cases" title="No cases yet" body="Add your first case by CNR above — its hearings, parties and orders will sync automatically." />
      )}

      <Disclaimer />
    </div>
  );
}
