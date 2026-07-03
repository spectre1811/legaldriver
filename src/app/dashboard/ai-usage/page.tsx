import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Stat, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

// AI usage & cost — the metered-gateway panel (WO-02 ledger, surfaced for WO-08's
// investor cut). Read-only over ai_usage_event (RLS-scoped to the tenant).
type Ev = {
  backend: string | null; model: string | null; task: string | null;
  tokens_in: number | null; tokens_out: number | null; cost_usd: number | null;
  cache_hit: boolean | null; ok: boolean | null; created_at: string;
};

const usd = (n: number) => `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
const int = (n: number) => n.toLocaleString("en-IN");

export default async function AiUsagePage() {
  const supabase = createClient();
  const t = await getTranslations("aiUsage");
  const { data } = await supabase
    .from("ai_usage_event")
    .select("backend, model, task, tokens_in, tokens_out, cost_usd, cache_hit, ok, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  const events = (data ?? []) as Ev[];

  const sum = (f: (e: Ev) => number) => events.reduce((a, e) => a + f(e), 0);
  const totalCost = sum((e) => e.cost_usd ?? 0);
  const tokensIn = sum((e) => e.tokens_in ?? 0);
  const tokensOut = sum((e) => e.tokens_out ?? 0);
  const calls = events.length;
  const cacheHits = events.filter((e) => e.cache_hit).length;
  const cacheRate = calls ? Math.round((cacheHits / calls) * 100) : 0;

  // by model
  const byModel = new Map<string, { calls: number; tokens: number; cost: number }>();
  for (const e of events) {
    const k = e.model ?? e.backend ?? "—";
    const m = byModel.get(k) ?? { calls: 0, tokens: 0, cost: 0 };
    m.calls++; m.tokens += (e.tokens_in ?? 0) + (e.tokens_out ?? 0); m.cost += e.cost_usd ?? 0;
    byModel.set(k, m);
  }
  const models = [...byModel.entries()].sort((a, b) => b[1].cost - a[1].cost);
  const fmtTime = (ts: string) => new Date(ts).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  if (!calls) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <EmptyState icon="sparkles" title={t("empty.title")} body={t("empty.body")} />
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("stat.cost")} value={usd(totalCost)} />
        <Stat label={t("stat.calls")} value={int(calls)} />
        <Stat label={t("stat.tokens")} value={int(tokensIn + tokensOut)} hint={t("stat.tokensHint", { in: int(tokensIn), out: int(tokensOut) })} />
        <Stat label={t("stat.cacheRate")} value={`${cacheRate}%`} hint={t("stat.cacheHint")} />
      </div>

      <Card>
        <div className="border-b border-line px-5 py-4"><h2 className="text-base font-medium">{t("byModel")}</h2></div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-5 py-3 label">{t("col.model")}</th>
              <th className="px-5 py-3 label">{t("col.calls")}</th>
              <th className="hidden px-5 py-3 label sm:table-cell">{t("col.tokens")}</th>
              <th className="px-5 py-3 label text-right">{t("col.cost")}</th>
            </tr>
          </thead>
          <tbody>
            {models.map(([m, v]) => (
              <tr key={m} className="border-b border-line last:border-0">
                <td className="px-5 py-3 font-mono text-xs text-ink">{m}</td>
                <td className="px-5 py-3 text-ink-soft">{int(v.calls)}</td>
                <td className="hidden px-5 py-3 text-ink-soft sm:table-cell">{int(v.tokens)}</td>
                <td className="px-5 py-3 text-right font-medium text-ink">{usd(v.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <div className="border-b border-line px-5 py-4"><h2 className="text-base font-medium">{t("recent")}</h2></div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="px-5 py-3 label">{t("col.task")}</th>
              <th className="hidden px-5 py-3 label md:table-cell">{t("col.model")}</th>
              <th className="hidden px-5 py-3 label sm:table-cell">{t("col.tokens")}</th>
              <th className="px-5 py-3 label text-right">{t("col.cost")}</th>
              <th className="px-5 py-3 label text-right">{t("col.when")}</th>
            </tr>
          </thead>
          <tbody>
            {events.slice(0, 20).map((e, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="px-5 py-3">
                  {e.task ?? "—"}
                  {e.cache_hit && <span className="ml-2 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[0.65rem] font-medium text-emerald-700">{t("cached")}</span>}
                  {e.ok === false && <span className="ml-2 rounded-full bg-red-50 px-1.5 py-0.5 text-[0.65rem] font-medium text-red-600">{t("failed")}</span>}
                </td>
                <td className="hidden px-5 py-3 font-mono text-xs text-ink-faint md:table-cell">{e.model ?? e.backend ?? "—"}</td>
                <td className="hidden px-5 py-3 text-ink-soft sm:table-cell">{int((e.tokens_in ?? 0) + (e.tokens_out ?? 0))}</td>
                <td className="px-5 py-3 text-right text-ink-soft">{usd(e.cost_usd ?? 0)}</td>
                <td className="px-5 py-3 text-right text-xs text-ink-faint">{fmtTime(e.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-ink-faint">{t("footer")}</p>
    </div>
  );
}
