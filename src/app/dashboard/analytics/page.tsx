import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Stat, EmptyState, fmtMoney, fmtHours, fmtSize } from "@/components/ui";

export const dynamic = "force-dynamic";

type Summary = Record<string, number | Record<string, number>>;
const n = (s: Summary, k: string) => (typeof s[k] === "number" ? (s[k] as number) : 0);
const obj = (s: Summary, k: string) => (s[k] && typeof s[k] === "object" ? (s[k] as Record<string, number>) : {});

function Breakdown({ title, data }: { title: string; data: Record<string, number> }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <Card className="p-5">
      <p className="label mb-3">{title}</p>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map(([k, v]) => (
            <li key={k} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-ink-soft">{k}</span>
                <span className="shrink-0 font-medium text-ink">{v}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-paper"><div className="h-1.5 rounded-full bg-brand-400" style={{ width: `${(v / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-faint">No data yet.</p>
      )}
    </Card>
  );
}

export default async function AnalyticsPage() {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("analytics_summary");
  const s = (data ?? {}) as Summary;

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Analytics" subtitle="Practice, billing, and data overview." />
        <EmptyState icon="alert" title="Couldn't load analytics" body={error.message} />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader title="Analytics" subtitle="Your caseload, billing, and everything Legaldriver has ingested and stored for you." />

      {/* Caseload */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink-soft">Caseload</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Cases" value={n(s, "cases_total")} />
          <Stat label="Active" value={n(s, "cases_active")} />
          <Stat label="Hearings · 7d" value={n(s, "hearings_7d")} />
          <Stat label="Hearings · 30d" value={n(s, "hearings_30d")} />
          <Stat label="Deadlines open" value={n(s, "deadlines_open")} />
          <Stat label="Overdue" value={n(s, "deadlines_overdue")} hint={n(s, "deadlines_overdue") > 0 ? "needs attention" : undefined} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Breakdown title="Cases by stage" data={obj(s, "cases_by_stage")} />
          <Breakdown title="Cases by court" data={obj(s, "cases_by_court")} />
        </div>
      </section>

      {/* Time & billing */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink-soft">Time &amp; billing</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Hours logged" value={fmtHours(n(s, "time_minutes"))} />
          <Stat label="Billable hours" value={fmtHours(n(s, "time_billable_minutes"))} />
          <Stat label="Unbilled (time)" value={fmtMoney(n(s, "unbilled_minor"))} hint="work-in-progress" />
          <Stat label="Expenses" value={fmtMoney(n(s, "expense_minor"))} />
          <Stat label="Unbilled expenses" value={fmtMoney(n(s, "expense_unbilled_minor"))} />
        </div>
        <p className="text-xs text-ink-faint">Receivables/invoicing analytics fill in once invoice assembly ships (keyless, in the backlog).</p>
      </section>

      {/* Clients & documents */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink-soft">Clients &amp; documents</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Clients" value={n(s, "clients_total")} />
          <Stat label="Documents" value={n(s, "documents_total")} />
          <Stat label="Unfiled docs" value={n(s, "documents_unfiled")} hint={n(s, "documents_unfiled") > 0 ? "to triage" : undefined} />
          <Stat label="Storage used" value={fmtSize(n(s, "storage_bytes"))} />
        </div>
      </section>

      {/* Your data / ingestion */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink-soft">Your data — ingested &amp; stored</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Cases tracked" value={n(s, "cases_total")} hint="matter" />
          <Stat label="Hearings" value={n(s, "hearings_total")} hint="hearing" />
          <Stat label="Court orders" value={n(s, "orders_total")} hint="court_order" />
          <Stat label="Emails ingested" value={n(s, "emails_total")} hint="email_message" />
          <Stat label="Doc embeddings" value={n(s, "chunks_total")} hint="document_chunk" />
          <Stat label="Messages" value={n(s, "messages_total")} hint="msg_message" />
          <Stat label="Voice notes" value={n(s, "voice_total")} hint="voice_recording" />
          <Stat label="IP assets" value={n(s, "ip_total")} hint="ip_asset" />
          <Stat label="Deadline rules" value={n(s, "deadline_rules")} hint="deadline_rule" />
          <Stat label="Law-pack entries" value={n(s, "law_pack")} hint="shared · legal_reference" />
        </div>
        <Card className="p-4">
          <p className="text-xs leading-relaxed text-ink-faint">
            Stored in Supabase Postgres (RLS-isolated to your tenant). Document files live in a private Storage bucket; their
            semantic embeddings in <code className="text-ink-soft">document_chunk</code> (pgvector). Court records are cached in a
            shared <code className="text-ink-soft">court_cache</code> ({n(s, "cached_cases")} cases cached) and copied into your matters.
            Court-data ingestion health + cache stats are on <span className="text-ink-soft">Settings → Court data</span>.
          </p>
        </Card>
      </section>
    </div>
  );
}
