import { createAdminClient } from "@/lib/supabase/admin";
import { getCourtDataClient } from "./client";
import type { CourtDataClient } from "./client";
import type { NormalizedCase } from "./types";

// ── Court Data Gateway (Phase 3 · E7-v1) ─────────────────────────────────────
// A read-through cache + provider-health layer in front of the CourtDataClient.
// Court records are public, so the cache (court_cache) is SHARED across tenants —
// the single biggest reliability + cost win. The cache is reached only here, via
// the service-role admin client (court_cache has RLS on with no policies).
//
// Resilience model (no scraping, no CAPTCHA): serve from cache when fresh; on a
// provider error, fall back to STALE cache rather than failing the request;
// multi-provider routing + human-in-the-loop refresh build on this seam.

const DEFAULT_TTL_MS = Number(process.env.COURT_CACHE_TTL_MS ?? 1000 * 60 * 60 * 12); // 12h

type Admin = ReturnType<typeof createAdminClient>;

// Exported (WO-289): the console-search health signal (legaldriver-api.ts) writes to the SAME
// `court_provider_health` table/surface via this function, so a search-fetch outage shows up on
// the settings/diagnostics page alongside the case-fetch health it already tracked — one health
// surface, not a second invisible one.
export async function markHealth(admin: Admin, provider: string, ok: boolean, err?: unknown) {
  // No PII in logs/state: store only a short error string, never response bodies.
  const last_error = ok ? null : String(err instanceof Error ? err.message : err ?? "error").slice(0, 200);
  await admin
    .from("court_provider_health")
    .upsert(
      { provider, ok, last_error, ...(ok ? { last_ok_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() },
      { onConflict: "provider" },
    );
}

async function writeCache(admin: Admin, kind: "case" | "causelist" | "search" | "order", key: string, provider: string, normalized: unknown) {
  await admin
    .from("court_cache")
    .upsert(
      { kind, cache_key: key, provider, normalized: normalized as never, fetched_at: new Date().toISOString() },
      { onConflict: "kind,cache_key,provider" },
    );
}

async function readCache(admin: Admin, kind: string, key: string): Promise<{ normalized: NormalizedCase; ageMs: number } | null> {
  const { data } = await admin
    .from("court_cache")
    .select("normalized, fetched_at")
    .eq("kind", kind)
    .eq("cache_key", key)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.normalized || !data.fetched_at) return null;
  return { normalized: data.normalized as unknown as NormalizedCase, ageMs: Date.now() - new Date(data.fetched_at).getTime() };
}

export interface CaseFetch {
  case: NormalizedCase | null;
  cacheHit: boolean;
  stale: boolean; // served from stale cache because the provider failed
  source: string;
}

// Fetch a case by CNR through the cache. `force` bypasses the freshness check and
// hits the provider (still writes through to cache).
export async function getCaseCached(cnr: string, opts?: { maxAgeMs?: number; force?: boolean }): Promise<CaseFetch> {
  const key = cnr.toUpperCase();
  const ttl = opts?.maxAgeMs ?? DEFAULT_TTL_MS;
  const admin = createAdminClient();
  const client = getCourtDataClient();

  if (!opts?.force) {
    const hit = await readCache(admin, "case", key);
    if (hit && hit.ageMs <= ttl) return { case: hit.normalized, cacheHit: true, stale: false, source: hit.normalized.source };
  }

  try {
    const fresh = await client.getCaseByCNR(key);
    await markHealth(admin, client.source, true);
    if (fresh) await writeCache(admin, "case", key, fresh.source, fresh);
    return { case: fresh, cacheHit: false, stale: false, source: client.source };
  } catch (e) {
    await markHealth(admin, client.source, false, e);
    const stale = await readCache(admin, "case", key); // serve stale rather than fail
    if (stale) return { case: stale.normalized, cacheHit: true, stale: true, source: stale.normalized.source };
    return { case: null, cacheHit: false, stale: false, source: client.source };
  }
}

// The core provider→cache write-through loop, extracted so the coalescing wrapper can
// delegate without duplicating the error/stale-handling logic. Accepts injected deps so
// tests can drive it with a fake admin + an instrumented mock provider.
export async function liveRefreshCaseInner(
  key: string,
  admin: Admin,
  client: CourtDataClient,
): Promise<CaseFetch> {
  try {
    const fresh = (await client.refreshCases([key]))[0] ?? null;
    await markHealth(admin, client.source, true);
    if (fresh) {
      await writeCache(admin, "case", key, fresh.source, fresh);
      return { case: fresh, cacheHit: false, stale: false, source: client.source };
    }
    const cached = await readCache(admin, "case", key);
    if (cached) return { case: cached.normalized, cacheHit: true, stale: true, source: cached.normalized.source };
    return { case: null, cacheHit: false, stale: false, source: client.source };
  } catch (e) {
    await markHealth(admin, client.source, false, e);
    const cached = await readCache(admin, "case", key);
    if (cached) return { case: cached.normalized, cacheHit: true, stale: true, source: cached.normalized.source };
    return { case: null, cacheHit: false, stale: false, source: client.source };
  }
}

// ── WO-359 W2: in-flight coalescing ──────────────────────────────────────────
//
// When REFRESH_COALESCE=1, concurrent liveRefreshCase calls for the same CNR
// are gated by a lock-row table. ONE caller becomes the leader (does the live
// eCourts refresh), the rest poll with exponential backoff and reap the leader's
// persisted cache result. The win: one upstream eCourts call instead of N, which
// directly reduces per-IP pressure (the estate's binding constraint — WO-309).
//
// W1's DIFF_SYNC already prevents duplicate notification rows on re-upsert
// (tested), so coalescing is a cost/scaling optimisation, not a correctness
// fix for alerting.
//
// _admin and _client are injection seams for tests — omit in production.
export async function liveRefreshCase(
  cnr: string,
  _admin?: Admin,
  _client?: CourtDataClient,
): Promise<CaseFetch> {
  const key = cnr.toUpperCase();
  const admin = _admin ?? createAdminClient();
  const client = _client ?? getCourtDataClient();

  if (process.env.REFRESH_COALESCE !== "1") {
    return liveRefreshCaseInner(key, admin, client);
  }

  const holder = crypto.randomUUID();
  // Default 20s — below the cron's 25s live-lane deadline (liveDeadlineMs caps at
  // 25s; live-lane.ts:36), so a waiter killed by withDeadline still gets our honest
  // stale:true fallback at the end, not an abrupt thrown error with no return.
  const WAIT_MAX_MS = Number(process.env.REFRESH_COALESCE_WAIT_MS ?? "20000");

  // Lock TTL must be ≥ the wait window so a live leader doesn't get stolen
  // mid-refresh by a waiter whose poll timed out.
  //
  // Orphan rows (crashed leader): the next caller for this CNR steals the lease
  // via ON CONFLICT DO UPDATE WHERE lease_until < now() in try_acquire_refresh_lock.
  // A CNR that is NEVER refreshed again after a crash leaves a permanent row —
  // idx_refresh_lock_expired is pre-placed for a future reaper (W3 or later).
  const REFRESH_LOCK_TTL_S = 30;
  const POLL_BASE_MS = 250;
  const POLL_MAX_MS = 2000;
  const POLL_BACKOFF = 1.6;

  const coalesceWarned = new Set<string>();
  function coalesceWarnOnce(mode: string, msg: string) {
    if (coalesceWarned.has(mode)) {
      console.debug(`[refresh-coalesce] ${mode} — ${msg}`);
      return;
    }
    coalesceWarned.add(mode);
    console.warn(`[refresh-coalesce] ${mode} — ${msg}`);
  }
  function warnRelease(cnrKey: string) {
    coalesceWarnOnce("release-failed", `release_refresh_lock failed for ${cnrKey} — lock will expire at TTL`);
  }

  // ── Fail-soft: try the lock; if the RPC is unreachable, proceed unguarded ──
  // The RPC functions + refresh_lock table are not yet in database.types.ts
  // (types regen happens only after the founder applies the migration), so all
  // calls through the untyped seam below are cast to escape the frozen types.
  const a = admin as unknown as {
    rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: null | { code?: string; message?: string } }>;
    from: (table: string) => {
      select: (cols?: string) => {
        eq: (col: string, val: string) => { maybeSingle: () => Promise<{ data: unknown; error: null | { code?: string; message?: string } }> };
      };
    };
  };

  let lockResult: unknown;
  try {
    const { data, error } = await a.rpc("try_acquire_refresh_lock", {
      p_cnr: key,
      p_holder: holder,
      p_ttl_seconds: REFRESH_LOCK_TTL_S,
    });
    if (error) {
      coalesceWarnOnce("acquire-rpc-error", `try_acquire_refresh_lock rpc error for ${key} — pass-through: ${error.message}`);
      return liveRefreshCaseInner(key, admin, client);
    }
    lockResult = data;
  } catch (e) {
    coalesceWarnOnce("acquire-throw", `try_acquire_refresh_lock unexpected error for ${key} — pass-through: ${String(e)}`);
    return liveRefreshCaseInner(key, admin, client);
  }

  // ── Leader ──
  // try_acquire_refresh_lock also returns `stale: bool` — set to true when we stole
  // an expired lease (previous leader crashed). Not branched on today; surfaced here
  // for observability (a future cron sweep can aggregate stale-theft events).
  if (lockResult && (lockResult as { acquired: boolean; stale?: boolean }).acquired) {
    try {
      return await liveRefreshCaseInner(key, admin, client);
    } finally {
      a.rpc("release_refresh_lock", { p_cnr: key, p_holder: holder }).catch(() => warnRelease(key));
    }
  }

  // ── Waiter: exponential backoff poll ──
  const waitStart = Date.now();
  let pollMs = POLL_BASE_MS;

  while (Date.now() - waitStart < WAIT_MAX_MS) {
    let lockRow: unknown = null;
    let pollErr: unknown = null;
    try {
      const { data, error } = await a.from("refresh_lock").select("lease_until").eq("cnr", key).maybeSingle();
      if (error) pollErr = error;
      else lockRow = data;
    } catch (e) {
      coalesceWarnOnce("poll-throw", `refresh_lock poll error for ${key} — pass-through: ${String(e)}`);
      return liveRefreshCaseInner(key, admin, client);
    }

    if (pollErr) {
      coalesceWarnOnce("table-missing", `refresh_lock table error for ${key} — pass-through: ${String((pollErr as { message?: string }).message ?? pollErr)}`);
      return liveRefreshCaseInner(key, admin, client);
    }

    if (!lockRow) {
      const cached = await readCache(admin, "case", key);
      if (cached) {
        // The cache row must have been written AFTER our wait began — otherwise
        // the leader released without writing (error / no-record paths) and we
        // would be claiming "Refreshed" over a row from hours ago.
        if (cached.ageMs < Date.now() - waitStart) {
          return { case: cached.normalized, cacheHit: true, stale: false, source: cached.normalized.source };
        }
        // Cache predates our wait → treat as stale (leader couldn't refresh).
        return { case: cached.normalized, cacheHit: true, stale: true, source: cached.normalized.source };
      }
      break;
    }

    const leaseUntil = new Date((lockRow as { lease_until: string }).lease_until);
    if (leaseUntil < new Date()) {
      break;
    }

    const remaining = WAIT_MAX_MS - (Date.now() - waitStart);
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(pollMs, remaining)));
    pollMs = Math.min(pollMs * POLL_BACKOFF, POLL_MAX_MS);
  }

  // ── Retry acquire (stale lock or leader finished without writing cache) ──
  try {
    const { data: retryData, error: retryErr } = await a.rpc("try_acquire_refresh_lock", {
      p_cnr: key,
      p_holder: holder,
      p_ttl_seconds: REFRESH_LOCK_TTL_S,
    });
    if (!retryErr && retryData && (retryData as { acquired: boolean }).acquired) {
      try {
        return await liveRefreshCaseInner(key, admin, client);
      } finally {
        a.rpc("release_refresh_lock", { p_cnr: key, p_holder: holder }).catch(() => warnRelease(key));
      }
    }
  } catch {
    coalesceWarnOnce("retry-acquire-failed", `retry acquire failed for ${key} — degrading honestly`);
  }

  // ── Honest degradation: waiter couldn't acquire within the window ──
  const cached = await readCache(admin, "case", key);
  if (cached) {
    return { case: cached.normalized, cacheHit: true, stale: true, source: cached.normalized.source };
  }
  return { case: null, cacheHit: false, stale: false, source: client.source };
}

// Provider-health snapshot for the settings/diagnostics surface.
export async function getProviderHealth() {
  const admin = createAdminClient();
  const { data } = await admin.from("court_provider_health").select("*").order("provider");
  return data ?? [];
}

// Read-only cache stats for the settings surface. The cache is shared across
// tenants and reachable only via the admin client, so this is exposed as an
// aggregate (no per-tenant rows leak). Returns the cached-case count and the
// most-recent fetch timestamp.
export async function getCacheStats(): Promise<{ cases: number; lastFetchedAt: string | null }> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("court_cache")
    .select("*", { count: "exact", head: true })
    .eq("kind", "case");
  const { data: latest } = await admin
    .from("court_cache")
    .select("fetched_at")
    .eq("kind", "case")
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { cases: count ?? 0, lastFetchedAt: latest?.fetched_at ?? null };
}
