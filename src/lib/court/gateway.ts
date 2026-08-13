import { createAdminClient } from "@/lib/supabase/admin";
import { getCourtDataClient } from "./client";
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

// WO-373: a short "just-refreshed" window — read-at-call-time (DIFF_SYNC's pattern, sync.ts:248)
// so tests can override per-call without an env/module-reload dance. Default OFF (0 disables;
// NaN/garbage also disables — fail-safe, same convention as liveLaneSize).
const REFRESH_COLLAPSE_WINDOW_MS = () => Number(process.env.REFRESH_COLLAPSE_WINDOW_MS ?? 0);

// Force a LIVE re-scrape of ONE case (the user-clicked "Refresh" button) via the provider's
// POST /refresh — NOT the cached GET. This is what makes "Refresh" actually go to eCourts, and
// lets us tell the user the truth: on a live hit we write through + report "Refreshed"; when the
// provider is reached but returns no live record (e.g. eCourts serves a null history — WO-191) or
// errors, we fall back to the last-synced copy and flag `stale` so the caller can say "couldn't
// get an update" instead of a false "Refreshed". The nightly cron stays on the cached bulk path.
//
// WO-373: the cron live lane is strictly sequential (`await` inside the loop) — two matters on
// different tenants tracking the same CNR, drained back-to-back in one run, used to each pay a
// real upstream call. `readCache`'s `ageMs` already tells us whether SOMEONE just fetched this
// CNR moments ago; `writeCache` is only ever called on a genuinely fresh provider response (never
// on a stale fallback — see both call sites below and in getCaseCached), so a row inside the
// window is exactly as fresh as the call that wrote it. Reusing it and reporting `stale: false` is
// the SAME freshness guarantee the original caller got — never a false "Refreshed" over a row this
// call didn't itself fetch (the WO-359 B2 defect this WO exists to avoid). `admin` is injectable
// (defaults to a real client) purely so offline tests can drive this function for real.
export async function liveRefreshCase(cnr: string, admin: Admin = createAdminClient(), opts?: { collapseWindowMs?: number }): Promise<CaseFetch> {
  const key = cnr.toUpperCase();
  const client = getCourtDataClient();
  const windowMs = opts?.collapseWindowMs ?? REFRESH_COLLAPSE_WINDOW_MS();
  if (windowMs > 0) {
    const recent = await readCache(admin, "case", key);
    if (recent && recent.ageMs <= windowMs) {
      return { case: recent.normalized, cacheHit: true, stale: false, source: recent.normalized.source };
    }
  }
  try {
    const fresh = (await client.refreshCases([key]))[0] ?? null;
    await markHealth(admin, client.source, true);
    if (fresh) {
      await writeCache(admin, "case", key, fresh.source, fresh);
      return { case: fresh, cacheHit: false, stale: false, source: client.source };
    }
    const cached = await readCache(admin, "case", key); // reached eCourts but no fresh record
    if (cached) return { case: cached.normalized, cacheHit: true, stale: true, source: cached.normalized.source };
    return { case: null, cacheHit: false, stale: false, source: client.source };
  } catch (e) {
    await markHealth(admin, client.source, false, e);
    const cached = await readCache(admin, "case", key); // provider error → serve last-synced
    if (cached) return { case: cached.normalized, cacheHit: true, stale: true, source: cached.normalized.source };
    return { case: null, cacheHit: false, stale: false, source: client.source };
  }
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
