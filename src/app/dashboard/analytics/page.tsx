import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icons";
import { fmtMoney, fmtHours, fmtSize } from "@/components/ui";

export const dynamic = "force-dynamic";

type Summary = Record<string, number | Record<string, number>>;
const num = (s: Summary, k: string) => (typeof s[k] === "number" ? (s[k] as number) : 0);
const obj = (s: Summary, k: string) => (s[k] && typeof s[k] === "object" ? (s[k] as Record<string, number>) : {});

// DS-v2 §6 stat card: small-cap label on top, serif-mono numeral below, one-line hint.
// Local per-page helper (the W1–W4 idiom — no shared kit; ui.tsx's Stat is legacy brand-*).
function StatCard({ label, value, hint, attention }: { label: string; value: React.ReactNode; hint?: string; attention?: boolean }) {
  return (
    <div className="ec-card p-4">
      <p className="ec-label">{label}</p>
      <p className={`num mt-2 font-display text-[1.75rem] font-medium leading-none ${attention ? "text-ec-danger" : "text-ec-ink"}`}>{value}</p>
      {hint && <p className={`mt-1.5 text-xs ${attention ? "text-ec-danger" : "text-ec-ink-3"}`}>{hint}</p>}
    </div>
  );
}

// Horizontal bar breakdown — sand well, bronze bars (DS-v2 §2: one gold accent, richness from
// layered warm sand, not saturated color).
function Breakdown({ title, empty, data }: { title: string; empty: string; data: Record<string, number> }) {
  const rows = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return (
    <div className="ec-card overflow-hidden">
      <div className="border-b border-ec-hair bg-ec-paper-3 px-5 py-3"><p className="ec-label">{title}</p></div>
      <div className="p-5">
        {rows.length ? (
          <ul className="space-y-2.5">
            {rows.map(([k, v]) => (
              <li key={k} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-ec-ink-2">{k}</span>
                  <span className="num shrink-0 font-medium text-ec-ink">{v}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-ec-paper-3"><div className="h-1.5 rounded-full bg-ec-bronze" style={{ width: `${(v / max) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ec-ink-3">{empty}</p>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="ec-label">{title}</h2>
      {children}
    </section>
  );
}

export default async function AnalyticsPage() {
  const supabase = createClient();
  const t = await getTranslations("analytics");
  const { data, error } = await supabase.rpc("analytics_summary");
  const s = (data ?? {}) as Summary;

  const header = (subtitle: string) => (
    <header>
      <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ec-ink">{t("title")}</h1>
      <p className="mt-1 text-sm text-ec-ink-2">{subtitle}</p>
    </header>
  );

  if (error) {
    return (
      <div className="space-y-6">
        {header(t("errorSubtitle"))}
        <div className="ec-card flex flex-col items-center justify-center px-6 py-14 text-center">
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-ec-s bg-ec-danger-t text-ec-danger">
            <Icon name="alert" className="h-5 w-5" />
          </span>
          <h3 className="font-display text-lg font-medium text-ec-ink">{t("errorTitle")}</h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ec-ink-2">{error.message}</p>
        </div>
      </div>
    );
  }

  const overdue = num(s, "deadlines_overdue");
  const unfiled = num(s, "documents_unfiled");

  return (
    <div className="space-y-7">
      {header(t("subtitle"))}

      <Section title={t("section.caseload")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label={t("stat.cases")} value={num(s, "cases_total")} />
          <StatCard label={t("stat.active")} value={num(s, "cases_active")} />
          <StatCard label={t("stat.hearings7d")} value={num(s, "hearings_7d")} />
          <StatCard label={t("stat.hearings30d")} value={num(s, "hearings_30d")} />
          <StatCard label={t("stat.deadlinesOpen")} value={num(s, "deadlines_open")} />
          <StatCard label={t("stat.overdue")} value={overdue} hint={overdue > 0 ? t("hint.needsAttention") : undefined} attention={overdue > 0} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Breakdown title={t("breakdown.byStage")} empty={t("breakdown.noData")} data={obj(s, "cases_by_stage")} />
          <Breakdown title={t("breakdown.byCourt")} empty={t("breakdown.noData")} data={obj(s, "cases_by_court")} />
        </div>
      </Section>

      <Section title={t("section.billing")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label={t("stat.hoursLogged")} value={fmtHours(num(s, "time_minutes"))} />
          <StatCard label={t("stat.billableHours")} value={fmtHours(num(s, "time_billable_minutes"))} />
          <StatCard label={t("stat.unbilledTime")} value={fmtMoney(num(s, "unbilled_minor"))} hint={t("hint.wip")} />
          <StatCard label={t("stat.expenses")} value={fmtMoney(num(s, "expense_minor"))} />
          <StatCard label={t("stat.unbilledExpenses")} value={fmtMoney(num(s, "expense_unbilled_minor"))} />
        </div>
        <p className="text-xs text-ec-ink-3">{t("receivablesNote")}</p>
      </Section>

      <Section title={t("section.clientsDocs")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t("stat.clients")} value={num(s, "clients_total")} />
          <StatCard label={t("stat.documents")} value={num(s, "documents_total")} />
          <StatCard label={t("stat.unfiledDocs")} value={unfiled} hint={unfiled > 0 ? t("hint.toTriage") : undefined} attention={unfiled > 0} />
          <StatCard label={t("stat.storageUsed")} value={fmtSize(num(s, "storage_bytes"))} />
        </div>
      </Section>

      <Section title={t("section.yourData")}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label={t("stat.casesTracked")} value={num(s, "cases_total")} hint="matter" />
          <StatCard label={t("stat.hearingsTotal")} value={num(s, "hearings_total")} hint="hearing" />
          <StatCard label={t("stat.courtOrders")} value={num(s, "orders_total")} hint="court_order" />
          <StatCard label={t("stat.emailsIngested")} value={num(s, "emails_total")} hint="email_message" />
          <StatCard label={t("stat.docEmbeddings")} value={num(s, "chunks_total")} hint="document_chunk" />
          <StatCard label={t("stat.messages")} value={num(s, "messages_total")} hint="msg_message" />
          <StatCard label={t("stat.voiceNotes")} value={num(s, "voice_total")} hint="voice_recording" />
          <StatCard label={t("stat.ipAssets")} value={num(s, "ip_total")} hint="ip_asset" />
          <StatCard label={t("stat.deadlineRules")} value={num(s, "deadline_rules")} hint="deadline_rule" />
          <StatCard label={t("stat.lawPack")} value={num(s, "law_pack")} hint="shared · legal_reference" />
        </div>
        <div className="ec-card p-4">
          <p className="text-xs leading-relaxed text-ec-ink-3">{t("storageNote", { cached: num(s, "cached_cases") })}</p>
        </div>
      </Section>
    </div>
  );
}
