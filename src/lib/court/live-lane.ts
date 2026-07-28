// WO-286: pure decision helpers for the cron live-refresh lane. Next.js route files may only
// export handlers/config, so everything the offline test needs to assert lives here.
// The lane itself: a pre-pass over `orderForRefresh().ordered` (cross-tenant round-robin
// priority) doing REAL provider POST /refresh calls under a count cap + elapsed-time budget,
// each call deadline-capped by the remaining budget so a hung provider request can never
// blow the route's maxDuration and get it killed mid-write.

/** Parse the lane size env: default when unset, floor+clamp at 0, NaN/garbage → 0 (lane off). */
export function liveLaneSize(raw: string | undefined, fallback = 8): number {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** True while the lane may start another call. NaN budget compares false → lane never runs. */
export function liveBudgetOpen(liveLeft: number, elapsedMs: number, budgetMs: number): boolean {
  return liveLeft > 0 && elapsedMs < budgetMs;
}

/** Per-call deadline: the remaining budget, clamped to [1s, 15s] — never 0/negative (a call
 *  admitted at the budget edge still gets a beat), never the adapter's own 60s worst case. */
export function liveDeadlineMs(budgetMs: number, elapsedMs: number): number {
  return Math.max(1_000, Math.min(15_000, budgetMs - elapsedMs));
}

/** Group the rows the live lane did NOT handle by tenant, preserving priority order —
 *  the cached bulk path's input. Skipping by identity: `done` holds the exact objects
 *  consumed from `ordered` (orderForRefresh round-robins the caller's objects, no clones). */
export function groupRemaining<T extends { tenant_id: string }>(
  ordered: readonly T[],
  done: ReadonlySet<T>,
): Map<string, T[]> {
  const byTenant = new Map<string, T[]>();
  for (const m of ordered) {
    if (done.has(m)) continue;
    const list = byTenant.get(m.tenant_id) ?? byTenant.set(m.tenant_id, []).get(m.tenant_id)!;
    list.push(m);
  }
  return byTenant;
}
