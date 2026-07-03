// Watermark-aware refresh ordering for the nightly case-refresh cron (WO-01 Wave 2).
// Pure + side-effect-free so it unit-tests with no DB. The cron has a bounded time budget
// (Vercel maxDuration), so within a run we refresh the cases that matter most FIRST and, on
// overflow, defer the rest to the next run — ordering by staleness (the "watermark") so the
// deferred tail rotates to the front next time instead of being starved forever.

export interface RefreshCandidate {
  id: string;
  cnr: string;
  tenant_id: string;
  next_hearing_date: string | null;
  last_synced_at: string | null;
  status: string | null;
}

const DAY_MS = 86_400_000;
const URGENT_DAYS = 3; // next hearing within 3 days (or overdue) = most time-sensitive

// A case is "settled" (rarely changes) when disposed/decided/closed — lowest priority.
function isSettled(status: string | null): boolean {
  return /dispos|decid|closed|withdraw/i.test(status ?? "");
}

// Priority tier: 0 = urgent (active + imminent/overdue/undated), 1 = active future-dated,
// 2 = settled. "Pending cases + watched CNRs first" (WO-01) = tiers 0 then 1 before 2.
export function refreshTier(m: RefreshCandidate, nowMs: number): 0 | 1 | 2 {
  if (isSettled(m.status)) return 2;
  const next = m.next_hearing_date ? Date.parse(m.next_hearing_date) : NaN;
  if (Number.isNaN(next)) return 0; // active, no known next date → refresh to discover one
  const daysToNext = (next - nowMs) / DAY_MS;
  return daysToNext <= URGENT_DAYS ? 0 : 1; // overdue or ≤3 days out = urgent
}

// Order candidates for refresh: global tier order (urgent-first across ALL tenants), and WITHIN
// each tier round-robin across tenants (stalest-first per tenant). The round-robin prevents a
// single high-volume tenant — e.g. a firm that just bulk-imported 500 never-synced cases (all
// tier-0) — from consuming the whole run cap and starving other tenants' urgent cases, while
// still refreshing everyone's most time-sensitive cases before anyone's low-priority ones.
// Returns the slice to refresh THIS run (`ordered`, capped) + how many were `deferred` (reported,
// never silently dropped — protocol §6).
export function orderForRefresh(
  candidates: RefreshCandidate[],
  nowMs: number,
  cap: number,
): { ordered: RefreshCandidate[]; deferred: number } {
  const watermark = (m: RefreshCandidate) => (m.last_synced_at ? Date.parse(m.last_synced_at) : -Infinity);
  // Bucket by tier → tenant.
  const byTier: Map<string, RefreshCandidate[]>[] = [new Map(), new Map(), new Map()];
  for (const m of candidates) {
    const byTenant = byTier[refreshTier(m, nowMs)];
    (byTenant.get(m.tenant_id) ?? byTenant.set(m.tenant_id, []).get(m.tenant_id)!).push(m);
  }
  const ordered: RefreshCandidate[] = [];
  for (const byTenant of byTier) {
    // stalest-first within each tenant, then round-robin across tenants for this tier
    const queues = [...byTenant.values()].map((list) => list.sort((a, b) => watermark(a) - watermark(b)));
    for (let i = 0, any = true; any; i++) {
      any = false;
      for (const q of queues) if (i < q.length) { ordered.push(q[i]); any = true; }
    }
  }
  const limit = cap > 0 ? cap : ordered.length;
  return { ordered: ordered.slice(0, limit), deferred: Math.max(0, ordered.length - limit) };
}
