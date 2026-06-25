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

async function markHealth(admin: Admin, provider: string, ok: boolean, err?: unknown) {
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

// Refresh many CNRs through the cache (used by the scheduled refresh + worker).
export async function refreshCasesCached(cnrs: string[]): Promise<NormalizedCase[]> {
  const out: NormalizedCase[] = [];
  for (const cnr of cnrs.slice(0, 50)) {
    const r = await getCaseCached(cnr, { force: true });
    if (r.case) out.push(r.case);
  }
  return out;
}

// Provider-health snapshot for the settings/diagnostics surface.
export async function getProviderHealth() {
  const admin = createAdminClient();
  const { data } = await admin.from("court_provider_health").select("*").order("provider");
  return data ?? [];
}
