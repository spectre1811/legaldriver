import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, Card, Badge, EmptyState, fmtDate } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { getJudge, ldEnabled } from "@/lib/court/legaldriver-api";
import { TrackCaseButton } from "@/components/track-case-button";

export const dynamic = "force-dynamic";

// Browsable judge dossier ("know your judge") from /judge/{id}: caseload, disposal
// mix, case-type breakdown, and recent decisions — pre-hearing intelligence.
export default async function JudgePage({ params }: { params: { judgeId: string } }) {
  if (!ldEnabled()) notFound();
  const j = await getJudge(params.judgeId);
  if (!j) notFound();

  const disposed = j.cases.filter((c) => (c.status ?? "").toUpperCase() === "DISPOSED");
  const pending = j.cases.length - disposed.length;
  // Case-type mix (top 6) over the returned sample.
  const byType = new Map<string, number>();
  for (const c of j.cases) { const t = (c.case_type ?? "—").split("(")[0].trim(); byType.set(t, (byType.get(t) ?? 0) + 1); }
  const topTypes = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const recent = [...disposed].filter((c) => c.decision_date).sort((a, b) => String(b.decision_date).localeCompare(String(a.decision_date))).slice(0, 15);

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  const cnrs = j.cases.map((c) => c.cnr);
  const { data: tracked } = tenantId && cnrs.length ? await supabase.from("matter").select("id, cnr").eq("tenant_id", tenantId).in("cnr", cnrs) : { data: [] };
  const byCnr = new Map((tracked ?? []).map((m) => [m.cnr, m.id]));

  return (
    <div className="space-y-6">
      <PageHeader title={j.name} subtitle={`Judge dossier · ${j.case_count.toLocaleString("en-IN")} cases on record (analysing latest ${j.returned})`} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><div className="px-4 py-3"><p className="label">Total cases</p><p className="text-2xl font-semibold">{j.case_count.toLocaleString("en-IN")}</p></div></Card>
        <Card><div className="px-4 py-3"><p className="label">Disposed (sample)</p><p className="text-2xl font-semibold">{disposed.length}</p></div></Card>
        <Card><div className="px-4 py-3"><p className="label">Pending (sample)</p><p className="text-2xl font-semibold">{pending}</p></div></Card>
        <Card><div className="px-4 py-3"><p className="label">Disposal rate</p><p className="text-2xl font-semibold">{j.cases.length ? Math.round((disposed.length / j.cases.length) * 100) : 0}%</p></div></Card>
      </section>

      <Card>
        <div className="border-b border-line px-5 py-4"><p className="font-medium">Case-type mix <span className="text-ink-faint">(sample)</span></p></div>
        <ul className="flex flex-wrap gap-2 px-5 py-4">
          {topTypes.map(([t, n]) => <li key={t}><Badge tone="neutral">{t} · {n}</Badge></li>)}
        </ul>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4"><p className="font-medium">Recent decisions</p></div>
        {recent.length > 0 ? (
          <ul className="divide-y divide-line text-sm">
            {recent.map((c) => {
              const mid = byCnr.get(c.cnr);
              return (
                <li key={c.cnr} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span className="min-w-0">
                    <span className="font-mono text-xs">{mid ? <Link href={`/dashboard/cases/${mid}`} className="text-brand-600 hover:underline">{c.cnr}</Link> : c.cnr}</span>
                    <span className="ml-2 text-ink-muted">{c.case_type}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-ink-faint">{fmtDate(c.decision_date)}</span>
                    {!mid && <TrackCaseButton cnr={c.cnr} />}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon="scale" title="No dated decisions in the sample" />
        )}
        <p className="px-5 py-3 text-xs text-ink-faint">Analytics over the latest {j.returned} of {j.case_count.toLocaleString("en-IN")} cases. Source: LegalDriver / eCourts. Indicative only — not legal advice.</p>
      </Card>
    </div>
  );
}
