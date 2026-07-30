// WO-286: pure decision helpers for the cron live-refresh lane. Next.js route files may only
// export handlers/config, so everything the offline test needs to assert lives here.
// The lane itself: a pre-pass over `orderForRefresh().ordered` (cross-tenant round-robin
// priority) doing REAL provider POST /refresh calls under a count cap + elapsed-time budget,
// each call deadline-capped by the remaining budget so a hung provider request can never
// blow the route's maxDuration and get it killed mid-write.
// WO-286 W2: lane shrunk to 3 slots × up to 25s (was 8 × [1s,15s]) — a real live refresh takes
// 5-30s under eCourts WAF pacing, so 8 short-deadlined slots mostly just deadlined out burning
// the budget for nothing. Also adds `persistOne` — the fetch+upsert+audit primitive shared by
// BOTH the live lane and the cached tail, so every case STREAMS straight to the DB the instant
// its own fetch resolves (never collect-a-batch-then-write — the W1 prod incident's root cause:
// a maxDuration kill mid-batch persisted nothing despite most of the batch having succeeded).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { upsertCase } from "./sync";
import type { RefreshCandidate } from "./refresh-priority";
import type { CaseFetch } from "./gateway";

type Admin = SupabaseClient<Database>;

/** Parse the lane size env: default when unset, floor+clamp at 0, NaN/garbage → 0 (lane off). */
export function liveLaneSize(raw: string | undefined, fallback = 3): number {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** True while the lane may start another call. NaN budget compares false → lane never runs. */
export function liveBudgetOpen(liveLeft: number, elapsedMs: number, budgetMs: number): boolean {
  return liveLeft > 0 && elapsedMs < budgetMs;
}

/** Per-call deadline: the remaining budget, clamped to [1s, 25s] — never 0/negative (a call
 *  admitted at the budget edge still gets a beat), never the adapter's own 60s worst case. */
export function liveDeadlineMs(budgetMs: number, elapsedMs: number): number {
  return Math.max(1_000, Math.min(25_000, budgetMs - elapsedMs));
}

/** Fetch ONE candidate and persist it immediately — STREAM, never batch-fetch-then-write (see
 *  header comment). Shared by both lanes so live + cached rows get identical, honest accounting:
 *  a `stale` result (provider reached but returned no fresh record, or served from the last-
 *  synced cache after a provider error) still upserts — idempotent, keeps reminders/next-hearing
 *  correct off the last-known data — but counts as `failed`, not `refreshed`: "refreshed" means
 *  genuinely new data landed, not just that a row was touched. */
export async function persistOne(
  supabase: Admin,
  m: RefreshCandidate,
  fetchCase: () => Promise<CaseFetch>,
): Promise<{ outcome: "refreshed" | "failed"; changed: boolean }> {
  let r: CaseFetch;
  try {
    r = await fetchCase();
  } catch (e) {
    console.error("cron/refresh: fetch failed:", m.cnr, e); // one bad case never sinks the run
    return { outcome: "failed", changed: false };
  }
  if (!r.case) return { outcome: "failed", changed: false };
  await upsertCase(supabase, m.tenant_id, r.case); // <- persists NOW, before the next candidate's fetch even starts
  const changed = (r.case.nextHearingDate ?? null) !== (m.next_hearing_date ?? null);
  if (changed) {
    await supabase.from("audit_event").insert({
      tenant_id: m.tenant_id,
      action: "case.hearing_changed",
      entity: "matter",
      after: { cnr: r.case.cnr, next_hearing_date: r.case.nextHearingDate, source: r.case.source },
    });
  }
  return { outcome: r.stale ? "failed" : "refreshed", changed };
}
