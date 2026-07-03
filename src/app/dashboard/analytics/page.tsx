import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Stat, EmptyState, fmtMoney, fmtHours, fmtSize } from "@/components/ui";

export const dynamic = "force-dynamic";

type Summary = Record<string, number | Record<string, number>>;
const num = (s: Summary, k: string) => (typeof s[k] === "number" ? (s[k] as number) : 0);
const obj = (s: Summary, k: string) => (s[k] && typeof s[k] === "object" ? (s[k] as Record<string, number>) : {});

function Breakdown({ title, empty, data }: { title: string; empty: string; data: Record<string, number> }) {
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
        <p className="text-sm text-ink-faint">{empty}</p>
      )}
    </Card>
  );
}

export default async function AnalyticsPage() {
  const supabase = createClient();
  const t = await getTranslations("analytics");
  const { data, error } = await supabase.rpc("analytics_summary");
  const s = (data ?? {}) as Summary;

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} subtitle={t("errorSubtitle")} />
        <EmptyState icon="alert" title={t("errorTitle")} body={error.message} />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink-soft">{t("section.caseload")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label={t("stat.cases")} value={num(s, "cases_total")} />
          <Stat label={t("stat.active")} value={num(s, "cases_active")} />
          <Stat label={t("stat.hearings7d")} value={num(s, "hearings_7d")} />
          <Stat label={t("stat.hearings30d")} value={num(s, "hearings_30d")} />
          <Stat label={t("stat.deadlinesOpen")} value={num(s, "deadlines_open")} />
          <Stat label={t("stat.overdue")} value={num(s, "deadlines_overdue")} hint={num(s, "deadlines_overdue") > 0 ? t("hint.needsAttention") : undefined} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Breakdown title={t("breakdown.byStage")} empty={t("breakdown.noData")} data={obj(s, "cases_by_stage")} />
          <Breakdown title={t("breakdown.byCourt")} empty={t("breakdown.noData")} data={obj(s, "cases_by_court")} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink-soft">{t("section.billing")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label={t("stat.hoursLogged")} value={fmtHours(num(s, "time_minutes"))} />
          <Stat label={t("stat.billableHours")} value={fmtHours(num(s, "time_billable_minutes"))} />
          <Stat label={t("stat.unbilledTime")} value={fmtMoney(num(s, "unbilled_minor"))} hint={t("hint.wip")} />
          <Stat label={t("stat.expenses")} value={fmtMoney(num(s, "expense_minor"))} />
          <Stat label={t("stat.unbilledExpenses")} value={fmtMoney(num(s, "expense_unbilled_minor"))} />
        </div>
        <p className="text-xs text-ink-faint">{t("receivablesNote")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink-soft">{t("section.clientsDocs")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t("stat.clients")} value={num(s, "clients_total")} />
          <Stat label={t("stat.documents")} value={num(s, "documents_total")} />
          <Stat label={t("stat.unfiledDocs")} value={num(s, "documents_unfiled")} hint={num(s, "documents_unfiled") > 0 ? t("hint.toTriage") : undefined} />
          <Stat label={t("stat.storageUsed")} value={fmtSize(num(s, "storage_bytes"))} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink-soft">{t("section.yourData")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label={t("stat.casesTracked")} value={num(s, "cases_total")} hint="matter" />
          <Stat label={t("stat.hearingsTotal")} value={num(s, "hearings_total")} hint="hearing" />
          <Stat label={t("stat.courtOrders")} value={num(s, "orders_total")} hint="court_order" />
          <Stat label={t("stat.emailsIngested")} value={num(s, "emails_total")} hint="email_message" />
          <Stat label={t("stat.docEmbeddings")} value={num(s, "chunks_total")} hint="document_chunk" />
          <Stat label={t("stat.messages")} value={num(s, "messages_total")} hint="msg_message" />
          <Stat label={t("stat.voiceNotes")} value={num(s, "voice_total")} hint="voice_recording" />
          <Stat label={t("stat.ipAssets")} value={num(s, "ip_total")} hint="ip_asset" />
          <Stat label={t("stat.deadlineRules")} value={num(s, "deadline_rules")} hint="deadline_rule" />
          <Stat label={t("stat.lawPack")} value={num(s, "law_pack")} hint="shared · legal_reference" />
        </div>
        <Card className="p-4">
          <p className="text-xs leading-relaxed text-ink-faint">{t("storageNote", { cached: num(s, "cached_cases") })}</p>
        </Card>
      </section>
    </div>
  );
}
