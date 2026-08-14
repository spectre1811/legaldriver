// WO-373 — sequential same-CNR refresh collapse. Drives the REAL `liveRefreshCase` (the single
// choke point for the cron live lane, the user "Refresh" button, and refreshCasePreview — see
// gateway.ts) against a recording CourtDataClient + an in-memory court_cache, so a bad edit here
// fails for real, not against a re-implementation.
// Asserts: flag OFF (default, env unset) → two sequential refreshes of one CNR = 2 upstream calls
// (today's behaviour, unchanged); flag ON + inside the window → 1 upstream call, and the reused
// result reports the SAME freshness the original call got (stale: false — never the WO-359 B2
// false-"Refreshed" defect); flag ON but OUTSIDE the window → back to 2 calls (an old row is not
// silently treated as fresh forever).
// Run: npx tsx tests/wo373_refresh_collapse.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { liveRefreshCase } from "@/lib/court/gateway";
import { setCourtDataClient, type CourtDataClient } from "@/lib/court/client";
import type { NormalizedCase } from "@/lib/court/types";

let failed = 0;
const ok = (cond: boolean, msg: string) => { if (!cond) { console.error("  FAIL:", msg); failed++; } else console.log("  ✓", msg); };

// ── Recording provider: counts real upstream POST /refresh calls per CNR ──
class RecordingClient implements CourtDataClient {
  readonly source = "mock-recording";
  calls: string[] = [];
  async getCaseByCNR(): Promise<NormalizedCase | null> { return null; }
  async searchByAdvocate() { return []; }
  async getCauseList() { return []; }
  async refreshCases(cnrs: string[]): Promise<NormalizedCase[]> {
    this.calls.push(...cnrs);
    return cnrs.map((cnr) => ({
      cnr, title: `Case ${cnr}`, parties: [], hearings: [], orders: [],
      source: this.source, fetchedAt: new Date().toISOString(), nextHearingDate: null,
    }));
  }
  async getOrder() { return null; }
}

// ── In-memory court_cache + court_provider_health, matching exactly the chain shapes
//    readCache/writeCache/markHealth call (see gateway.ts). ──
type CacheRow = { kind: string; cache_key: string; provider: string; normalized: unknown; fetched_at: string };
function fakeAdmin() {
  const cache: CacheRow[] = [];
  const health: Record<string, unknown>[] = [];
  const admin = {
    from(table: string) {
      if (table === "court_cache") {
        return {
          select: () => ({
            eq: (_c1: string, kind: string) => ({
              eq: (_c2: string, key: string) => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => {
                      const rows = cache.filter((r) => r.kind === kind && r.cache_key === key)
                        .sort((a, b) => Date.parse(b.fetched_at) - Date.parse(a.fetched_at));
                      return { data: rows[0] ?? null, error: null };
                    },
                  }),
                }),
              }),
            }),
          }),
          upsert: (row: CacheRow) => {
            const i = cache.findIndex((r) => r.kind === row.kind && r.cache_key === row.cache_key && r.provider === row.provider);
            if (i >= 0) cache[i] = row; else cache.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "court_provider_health") {
        return { upsert: (row: Record<string, unknown>) => { health.push(row); return Promise.resolve({ error: null }); } };
      }
      throw new Error(`fakeAdmin: unexpected table ${table}`);
    },
  } as unknown as SupabaseClient<Database>;
  return { admin, cache, health };
}

async function main() {
  const provider = new RecordingClient();
  setCourtDataClient(provider);

  // --- Flag OFF (default — env unset): sequential same-CNR refreshes never collapse ---
  {
    const { admin } = fakeAdmin();
    provider.calls = [];
    delete process.env.REFRESH_COLLAPSE_WINDOW_MS;
    await liveRefreshCase("DUPCNR1", admin);
    await liveRefreshCase("DUPCNR1", admin);
    ok(provider.calls.length === 2, `flag off: 2 sequential refreshes = 2 upstream calls (got ${provider.calls.length}) — today's behaviour unchanged`);
  }

  // --- Flag ON (env), inside the window: second refresh reuses the first's cache row ---
  {
    const { admin } = fakeAdmin();
    provider.calls = [];
    process.env.REFRESH_COLLAPSE_WINDOW_MS = "60000"; // 60s — the second call lands well inside it
    const first = await liveRefreshCase("DUPCNR2", admin);
    const second = await liveRefreshCase("DUPCNR2", admin);
    ok(provider.calls.length === 1, `flag on, inside window: 2 sequential refreshes = 1 upstream call (got ${provider.calls.length})`);
    ok(second.cacheHit === true, "flag on, inside window: second call reports cacheHit (reused, not fetched)");
    ok(second.stale === false, "flag on, inside window: second call reports stale:false — same freshness the original call got (never a false 'Refreshed')");
    ok(second.case?.cnr === "DUPCNR2" && second.case?.title === first.case?.title, "flag on, inside window: reused result is the SAME record the first call fetched");
    delete process.env.REFRESH_COLLAPSE_WINDOW_MS;
  }

  // --- Flag ON, but OUTSIDE the window: an old row is not reused forever ---
  {
    const { admin, cache } = fakeAdmin();
    provider.calls = [];
    // Seed a cache row from "10 minutes ago" directly — a real refresh that's simply too old.
    cache.push({
      kind: "case", cache_key: "DUPCNR3", provider: provider.source,
      normalized: { cnr: "DUPCNR3", title: "Old", parties: [], hearings: [], orders: [], source: provider.source, fetchedAt: new Date(Date.now() - 600_000).toISOString() },
      fetched_at: new Date(Date.now() - 600_000).toISOString(),
    });
    process.env.REFRESH_COLLAPSE_WINDOW_MS = "5000"; // 5s window; the seeded row is 10 minutes old
    await liveRefreshCase("DUPCNR3", admin);
    ok(provider.calls.length === 1, `flag on, outside window: a stale-by-the-window row still triggers a real upstream call (got ${provider.calls.length})`);
    delete process.env.REFRESH_COLLAPSE_WINDOW_MS;
  }

  // --- opts.collapseWindowMs overrides the env read (same convention as sync.ts's diffSync) ---
  {
    const { admin } = fakeAdmin();
    provider.calls = [];
    delete process.env.REFRESH_COLLAPSE_WINDOW_MS; // env says off
    await liveRefreshCase("DUPCNR4", admin, { collapseWindowMs: 60_000 }); // opts says on
    await liveRefreshCase("DUPCNR4", admin, { collapseWindowMs: 60_000 });
    ok(provider.calls.length === 1, `opts override: env off + opts on → 1 upstream call (got ${provider.calls.length})`);
  }

  console.log(failed === 0 ? "PASS wo373_refresh_collapse" : `FAIL wo373_refresh_collapse — ${failed}`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
