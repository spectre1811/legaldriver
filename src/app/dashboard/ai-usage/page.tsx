import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";

// AI usage / cost panel (WO-02 Wave 3, 04-AI §5). Reads the per-tenant metering
// ledger written by the gateway. RLS-scoped: the server client sees ONLY the
// caller's tenant rows (ai_usage_event RLS + the security_invoker rollup view).
export const dynamic = "force-dynamic";

function monthStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

const nf = new Intl.NumberFormat("en-IN");
const usd = (n: number) => `$${n.toFixed(n < 1 ? 4 : 2)}`;

export default async function AiUsagePage() {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return <EmptyState title="No tenant" body="Sign in to view AI usage." />;

  const since = monthStartIso();
  // RLS scopes both reads to this tenant automatically.
  const [{ data: roll }, { data: events }] = await Promise.all([
    supabase.from("ai_usage_monthly").select("calls, tokens_in, tokens_out, cost_usd, cache_hits, month").order("month", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("ai_usage_event").select("task, tokens_in, tokens_out, cost_usd, estimated").gte("created_at", since),
  ]);

  const totals = {
    calls: Number(roll?.calls ?? 0),
    tokensIn: Number(roll?.tokens_in ?? 0),
    tokensOut: Number(roll?.tokens_out ?? 0),
    cost: Number(roll?.cost_usd ?? 0),
    cacheHits: Number(roll?.cache_hits ?? 0),
  };

  const byTask = new Map<string, { calls: number; tokens: number; cost: number; estimated: boolean }>();
  for (const e of events ?? []) {
    const row = byTask.get(e.task) ?? { calls: 0, tokens: 0, cost: 0, estimated: false };
    row.calls += 1;
    row.tokens += Number(e.tokens_in ?? 0) + Number(e.tokens_out ?? 0);
    row.cost += Number(e.cost_usd ?? 0);
    row.estimated = row.estimated || Boolean(e.estimated);
    byTask.set(e.task, row);
  }
  const tasks = [...byTask.entries()].sort((a, b) => b[1].cost - a[1].cost);

  return (
    <div className="space-y-6">
      <PageHeader title="AI usage" subtitle="This month · token metering across every AI feature (via the gateway). Costs are indicative — verify against provider billing." />

      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label="Calls" value={nf.format(totals.calls)} />
          <Stat label="Tokens in" value={nf.format(totals.tokensIn)} />
          <Stat label="Tokens out" value={nf.format(totals.tokensOut)} />
          <Stat label="Est. cost" value={usd(totals.cost)} />
          <Stat label="Cache hits" value={nf.format(totals.cacheHits)} />
        </div>
      </Card>

      {tasks.length === 0 ? (
        <EmptyState title="No AI usage yet this month" body="Case summaries, drafting, classification and the assistant all meter here once used." />
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="pb-2">Task</th>
                <th className="pb-2 text-right">Calls</th>
                <th className="pb-2 text-right">Tokens</th>
                <th className="pb-2 text-right">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(([task, r]) => (
                <tr key={task} className="border-t border-neutral-100">
                  <td className="py-2">
                    <span className="font-mono">{task}</span>{" "}
                    {r.estimated && <Badge tone="neutral">estimated</Badge>}
                  </td>
                  <td className="py-2 text-right">{nf.format(r.calls)}</td>
                  <td className="py-2 text-right">{nf.format(r.tokens)}</td>
                  <td className="py-2 text-right">{usd(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}
