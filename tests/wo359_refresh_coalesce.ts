// WO-359 W2 · in-flight refresh coalescing
// Drives the REAL liveRefreshCase through injected deps (fake admin + instrumented mock
// provider). The deletion experiment: remove the coalescing guard → duplicate upstream calls.
//
// Run: npx tsx tests/wo359_refresh_coalesce.ts
import { liveRefreshCase, liveRefreshCaseInner } from "@/lib/court/gateway";
import { upsertCase } from "@/lib/court/sync";
import { setCourtDataClient } from "@/lib/court/client";
import type { CourtDataClient } from "@/lib/court/client";
import type { NormalizedCase } from "@/lib/court/types";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); failed++; }
  else { console.log("  \u2713", msg); }
}

// ── Helpers ───────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function baseResult(cnr: string): NormalizedCase {
  return {
    cnr, title: "Test v. Test", court: "Test Court", caseType: "Civil Suit",
    stage: "Pending", status: "active",
    parties: [{ name: "P", side: "petitioner", advocate: "Adv. A" }],
    judge: "J", judges: ["J"],
    nextHearingDate: "2026-08-15", hearings: [{ date: "2026-08-15", purpose: "Hearing" }],
    orders: [{ id: "ORD-1", date: "2026-07-01", title: "Order" }],
    acts: ["NI Act 138"], detail: { registrationNumber: "1/2026" },
    source: "test", fetchedAt: new Date().toISOString(),
  };
}

// A fixture that triggers actual changes vs the OLD state pre-seeded in
// makeRecordingDb, so upsertCase + DIFF_SYNC writes notifications.
function changedResult(cnr: string): NormalizedCase {
  return {
    cnr, title: "Test v. Test", court: "Test Court", caseType: "Civil Suit",
    stage: "Arguments", status: "active",
    parties: [{ name: "P", side: "petitioner", advocate: "Adv. A" }],
    judge: "New Judge", judges: ["New Judge"],
    nextHearingDate: "2026-08-15",
    hearings: [{ date: "2026-08-15", purpose: "Arguments", courtNo: "C2", judge: "New Judge" }],
    orders: [
      { id: "CO-OLD-1", date: "2026-06-01", title: "Old Order" },
      { id: "CO-NEW-1", date: "2026-07-20", title: "New Order" },
    ],
    acts: ["NI Act 138"], detail: { registrationNumber: "1/2026" },
    source: "test", fetchedAt: new Date().toISOString(),
  };
}

class CountingMockProvider implements CourtDataClient {
  readonly source = "test";
  refreshCalls = 0;
  delayMs: number;
  result: NormalizedCase | null;
  constructor(result: NormalizedCase | null, delayMs = 0) { this.result = result; this.delayMs = delayMs; }
  async getCaseByCNR(_cnr: string): Promise<NormalizedCase | null> { return null; }
  async searchByAdvocate(_q: any): Promise<any[]> { return []; }
  async getCauseList(_q: any): Promise<any[]> { return []; }
  async getOrder(_cnr: string, _id: string): Promise<any> { return null; }
  async refreshCases(_cnrs: string[]): Promise<NormalizedCase[]> {
    this.refreshCalls++;
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.result === null) return [];
    return [this.result];
  }
}

// ── Fake admin for liveRefreshCase (coalescing operations) ──────────────
// Stores a separate fetched_at per cache entry (not hardcoded) so the B2
// stale-cache age check can be tested.

function makeFakeAdmin() {
  const locks = new Map<string, { leaseUntil: number; holder: string }>();
  const cache: Record<string, { normalized: NormalizedCase; fetchedAt: string }> = {};
  const rpcLog: { fn: string; params: Record<string, unknown> }[] = [];

  const admin = {
    rpc: async (fn: string, params: Record<string, unknown>) => {
      rpcLog.push({ fn, params });
      if (fn === "try_acquire_refresh_lock") {
        const cnr = params.p_cnr as string;
        const holder = params.p_holder as string;
        const ttlMs = (params.p_ttl_seconds as number) * 1000;
        const existing = locks.get(cnr);
        if (!existing || existing.leaseUntil < Date.now()) {
          locks.set(cnr, { leaseUntil: Date.now() + ttlMs, holder });
          return { data: { acquired: true, stale: !!existing }, error: null };
        }
        return { data: null, error: null };
      }
      if (fn === "release_refresh_lock") {
        const cnr = params.p_cnr as string;
        const holder = params.p_holder as string;
        const existing = locks.get(cnr);
        if (existing && existing.holder === holder) locks.delete(cnr);
        return { data: null, error: null };
      }
      return { data: null, error: { message: `unknown rpc: ${fn}` } };
    },

    from: (table: string) => {
      const b: any = {
        _table: table, _eqs: [] as [string, unknown][],
        select: (cols?: string) => { b._cols = cols; return b; },
        eq: (col: string, val: unknown) => { b._eqs.push([col, val]); return b; },
        order: () => b,
        limit: () => b,
        maybeSingle: async () => {
          if (table === "refresh_lock") {
            const cnr = b._eqs.find((e: [string, unknown]) => e[0] === "cnr")?.[1] as string | undefined;
            const lock = cnr ? locks.get(cnr.toUpperCase()) : undefined;
            return { data: lock ? { lease_until: new Date(lock.leaseUntil).toISOString() } : null, error: null };
          }
          if (table === "court_cache") {
            const ckey = b._eqs.find((e: [string, unknown]) => e[0] === "cache_key")?.[1] as string | undefined;
            const entry = ckey ? cache[ckey.toUpperCase()] : undefined;
            return { data: entry ? { normalized: entry.normalized, fetched_at: entry.fetchedAt } : null, error: null };
          }
          return { data: null, error: null };
        },
        upsert: async (row: Row) => {
          if (table === "court_cache" && row.cache_key) {
            const k = (row.cache_key as string).toUpperCase();
            cache[k] = { normalized: row.normalized as NormalizedCase, fetchedAt: (row.fetched_at as string) ?? new Date().toISOString() };
          }
          return { error: null };
        },
      };
      return b;
    },
  };

  return { admin, state: { locks, cache, rpcLog } };
}

// ── Recording fake DB for upsertCase ────────────────────────────────────

type RowSet = { table: string; rows: Row[] };

function makeRecordingDb(oldFixture: {
  tenantId: string;
  matterId: string;
  cnr: string;
}) {
  const { tenantId, matterId, cnr } = oldFixture;
  const mid = matterId;
  const tid = tenantId;

  const store: Record<string, Row[]> = {
    tenant: [{ id: tid }],
    matter: [
      { id: mid, cnr, tenant_id: tid, next_hearing_date: "2026-07-15", judge_names: ["Old Judge"] },
    ],
    hearing: [
      { id: "h-old-1", tenant_id: tid, matter_id: mid, date: "2026-07-15", purpose: "Old", court_no: "C1", judge: "Old Judge", raw: {} },
    ],
    court_order: [
      { id: "co-old-1", tenant_id: tid, matter_id: mid, order_date: "2026-06-01", title: "Old Order", raw: { order_id: "CO-OLD-1", has_pdf: false } },
    ],
    notification: [],
    activity_event: [],
  };

  function getRows(table: string): Row[] {
    return store[table] ?? (store[table] = []);
  }

  function matchRows(rows: Row[], eqs: [string, unknown][], containsPayload?: Record<string, unknown> | null): Row[] {
    return rows.filter((r) => {
      for (const [col, val] of eqs) {
        if (r[col] !== val) return false;
      }
      if (containsPayload) {
        const p = r.payload as Record<string, unknown> | undefined;
        if (!p) return false;
        for (const [k, v] of Object.entries(containsPayload)) {
          if (p[k] !== v) return false;
        }
      }
      return true;
    });
  }

  function from(table: string) {
    const rows = getRows(table);
    const b: any = {
      _table: table,
      _op: "select" as string,
      _eqs: [] as [string, unknown][],
      _containsPayload: null as Record<string, unknown> | null,
      _updatePatch: {} as Row,
      _insertRows: [] as Row[],

      select: (cols?: string) => { b._op = "select"; return b; },
      insert: (r: Row | Row[]) => { b._op = "insert"; b._insertRows = Array.isArray(r) ? r : [r]; return b; },
      update: (p: Row) => { b._op = "update"; b._updatePatch = p; return b; },
      delete: () => { b._op = "delete"; return b; },
      upsert: () => { b._op = "upsert"; return b; },
      eq: (col: string, val: unknown) => { b._eqs.push([col, val]); return b; },
      is: (col: string, val: unknown) => { b._eqs.push([col, val]); return b; },
      contains: (col: string, val: unknown) => {
        if (col === "payload") b._containsPayload = val as Record<string, unknown>;
        return b;
      },
      order: () => b,
      limit: () => b,
      maybeSingle: async () => {
        const filtered = matchRows(rows, b._eqs, b._containsPayload);
        return { data: filtered[0] ?? null, error: null };
      },
      single: async () => {
        if (b._op === "insert") {
          for (const r of b._insertRows) {
            rows.push({ ...r, id: r.id ?? `g-${Math.random().toString(36).slice(2, 9)}` });
          }
          return { data: null, error: null };
        }
        const filtered = matchRows(rows, b._eqs, b._containsPayload);
        return { data: filtered[0] ?? null, error: null };
      },
      then: (resolve: (v: any) => void) => {
        if (b._op === "insert") {
          for (const r of b._insertRows) {
            rows.push({ ...r, id: r.id ?? `g-${Math.random().toString(36).slice(2, 9)}` });
          }
          resolve({ data: null, error: null, count: b._insertRows.length });
          return;
        }
        if (b._op === "update") {
          const matches = matchRows(rows, b._eqs, b._containsPayload);
          for (const m of matches) Object.assign(m, b._updatePatch);
          resolve({ data: null, error: null, count: matches.length });
          return;
        }
        if (b._op === "delete") {
          const toRemove = matchRows(rows, b._eqs, b._containsPayload);
          const ids = new Set(toRemove.map((r) => r.id as string));
          store[table] = rows.filter((r) => !ids.has(r.id as string));
          resolve({ data: null, error: null, count: toRemove.length });
          return;
        }
        if (b._op === "upsert") {
          for (const r of b._insertRows) rows.push({ ...r });
          resolve({ data: null, error: null });
          return;
        }
        const filtered = matchRows(rows, b._eqs, b._containsPayload);
        resolve({ data: filtered, error: null, count: filtered.length });
      },
    };
    return b;
  }

  function rowSignature(r: Row, table: string): string {
    if (table === "notification") {
      return `notification::${r.kind ?? "-"}::${r.channel ?? "-"}::${(r.payload as Record<string,unknown> | null)?.ref ?? "-"}::${(r.scheduled_for as string ?? "").slice(0, 16)}`;
    }
    if (table === "activity_event") {
      return `activity_event::${r.type ?? "-"}::${String(r.summary ?? "").slice(0, 50)}`;
    }
    return `${table}::?`;
  }

  function signatures(): string[] {
    const out: string[] = [];
    for (const r of getRows("notification")) out.push(rowSignature(r, "notification"));
    for (const r of getRows("activity_event")) out.push(rowSignature(r, "activity_event"));
    out.sort();
    return out;
  }

  function totalRows(): number {
    return getRows("notification").length + getRows("activity_event").length;
  }

  return { sb: { from } as any, store, signatures, totalRows };
}

// ── Test helpers ───────────────────────────────────────────────────────────

function envSave(key: string) {
  const saved = process.env[key];
  return () => { if (saved === undefined) delete process.env[key]; else process.env[key] = saved; };
}

async function main() {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Deletion experiment: coalescing OFF → two upstream calls
  // ─────────────────────────────────────────────────────────────────────────
  {
    const restore = envSave("REFRESH_COALESCE");
    delete process.env.REFRESH_COALESCE;

    const cnr = "DELTEST1";
    const provider = new CountingMockProvider(baseResult(cnr), 80);
    setCourtDataClient(provider);
    const { admin } = makeFakeAdmin();

    const [r1, r2] = await Promise.all([
      liveRefreshCase(cnr, admin as any, provider),
      liveRefreshCase(cnr, admin as any, provider),
    ]);

    assert(provider.refreshCalls === 2, `deletion experiment: flag off → two upstream calls (got ${provider.refreshCalls})`);
    assert(r1.cacheHit === false, "caller 1 hit provider");
    assert(r2.cacheHit === false, "caller 2 also hit provider");
    setCourtDataClient(null);
    restore();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Coalescing ON → ONE upstream call, waiter reaps leader's result
  // ─────────────────────────────────────────────────────────────────────────
  {
    const restoreCoalesce = envSave("REFRESH_COALESCE");
    const restoreWait = envSave("REFRESH_COALESCE_WAIT_MS");
    process.env.REFRESH_COALESCE = "1";
    process.env.REFRESH_COALESCE_WAIT_MS = "10000";

    const cnr = "COALTEST1";
    const provider = new CountingMockProvider(baseResult(cnr), 100);
    setCourtDataClient(provider);
    const { admin, state } = makeFakeAdmin();

    const [r1, r2] = await Promise.all([
      liveRefreshCase(cnr, admin as any, provider),
      liveRefreshCase(cnr, admin as any, provider),
    ]);

    assert(provider.refreshCalls === 1, `coalescing: ONE upstream call (got ${provider.refreshCalls})`);
    assert(r1.case?.cnr === cnr, "leader has result");
    assert(r2.case?.cnr === cnr, "waiter reaped leader's result");
    assert(r2.cacheHit === true, "waiter got cache hit");
    assert(r2.stale === false, "waiter result is NOT stale");
    assert(state.locks.size === 0, "lock released after both finished");
    setCourtDataClient(null);
    restoreCoalesce();
    restoreWait();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Single caller → exactly one upstream call, lock acquired + released
  // ─────────────────────────────────────────────────────────────────────────
  {
    const restore = envSave("REFRESH_COALESCE");
    process.env.REFRESH_COALESCE = "1";
    const cnr = "SINGLE1";
    const provider = new CountingMockProvider(baseResult(cnr), 0);
    setCourtDataClient(provider);
    const { admin, state } = makeFakeAdmin();

    const r = await liveRefreshCase(cnr, admin as any, provider);

    assert(provider.refreshCalls === 1, `single caller: one upstream call (got ${provider.refreshCalls})`);
    assert(r.cacheHit === false, "single caller hit provider");
    assert(state.locks.size === 0, "lock released after single call");
    setCourtDataClient(null);
    restore();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Honest timeout: waiter hits ceiling → returns stale (not "Refreshed")
  // ─────────────────────────────────────────────────────────────────────────
  {
    const restoreCoalesce = envSave("REFRESH_COALESCE");
    const restoreWait = envSave("REFRESH_COALESCE_WAIT_MS");
    process.env.REFRESH_COALESCE = "1";
    process.env.REFRESH_COALESCE_WAIT_MS = "300";

    const cnr = "TIMEOUT1";
    const provider = new CountingMockProvider(baseResult(cnr), 800);
    setCourtDataClient(provider);
    const { admin, state } = makeFakeAdmin();

    const oldResult = { ...baseResult(cnr), fetchedAt: new Date(Date.now() - 3600_000).toISOString() };
    state.cache[cnr] = { normalized: oldResult, fetchedAt: oldResult.fetchedAt };

    const results = await Promise.all([
      liveRefreshCase(cnr, admin as any, provider),
      liveRefreshCase(cnr, admin as any, provider),
    ]);

    const leader = results.find((r) => !r.cacheHit);
    const waiter = results.find((r) => r.cacheHit);

    assert(!!leader, "one caller was the leader (provider hit)");
    assert(!!waiter, "one caller was the waiter (cache hit)");
    assert(waiter!.stale === true, "waiter returned stale (honest timeout, not 'Refreshed')");
    assert(provider.refreshCalls >= 1, `leader did upstream call (got ${provider.refreshCalls})`);
    setCourtDataClient(null);
    restoreCoalesce();
    restoreWait();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4b. B2: leader returns stale (provider error), waiter must also return
  //     stale, NOT stale:false — the cache predates the wait.
  // ─────────────────────────────────────────────────────────────────────────
  {
    const restoreCoalesce = envSave("REFRESH_COALESCE");
    process.env.REFRESH_COALESCE = "1";

    const cnr = "STALECACHE1";
    // Provider returns nothing — simulates eCourts down / no-record path.
    const provider = new CountingMockProvider(null, 0);
    setCourtDataClient(provider);
    const { admin, state } = makeFakeAdmin();

    // Pre-seed an OLD cache entry (fetched 1 hour ago).
    const oldResult = { ...baseResult(cnr), fetchedAt: new Date(Date.now() - 3600_000).toISOString() };
    state.cache[cnr] = { normalized: oldResult, fetchedAt: oldResult.fetchedAt };

    const results = await Promise.all([
      liveRefreshCase(cnr, admin as any, provider),
      liveRefreshCase(cnr, admin as any, provider),
    ]);

    // Leader gets stale (no fresh record). Waiter gers cache — but since it
    // predates the wait, it must be flagged stale too, not stale:false.
    const leader = results.find((r) => r.cacheHit && r.stale);
    const waiter = results.find((r) => r !== leader);

    assert(!!leader, "leader returned stale (provider gave no record)");
    assert(leader!.stale === true, "leader stale flag is true");
    assert(waiter!.stale === true || waiter!.case === null,
      `B2: waiter must NOT claim fresh (stale=${waiter!.stale}, case=${waiter!.case?.cnr ?? "null"}) — leader had no fresh data`);
    assert(provider.refreshCalls === 1, `stale-cache: ONE upstream call (got ${provider.refreshCalls})`);

    setCourtDataClient(null);
    restoreCoalesce();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Fail-soft: RPC error → pass through unguarded
  // ─────────────────────────────────────────────────────────────────────────
  {
    const restore = envSave("REFRESH_COALESCE");
    process.env.REFRESH_COALESCE = "1";
    const cnr = "RPCERR1";
    const provider = new CountingMockProvider(baseResult(cnr), 0);
    setCourtDataClient(provider);

    const { admin } = makeFakeAdmin();
    const brokenAdmin = { ...admin, rpc: async () => ({ data: null, error: { message: "function does not exist" } }) };

    const r = await liveRefreshCase(cnr, brokenAdmin as any, provider);

    assert(provider.refreshCalls >= 1, `rpc error: pass-through → upstream call happened (got ${provider.refreshCalls})`);
    assert(r.case?.cnr === cnr, "call received result despite rpc failure");
    setCourtDataClient(null);
    restore();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 6. Fail-soft: refresh_lock table missing → poll error → pass through
  // ─────────────────────────────────────────────────────────────────────────
  {
    const restore = envSave("REFRESH_COALESCE");
    process.env.REFRESH_COALESCE = "1";
    const cnr = "TBLERR1";
    const provider = new CountingMockProvider(baseResult(cnr), 0);
    setCourtDataClient(provider);

    const { admin, state } = makeFakeAdmin();
    let rpcCount = 0;
    const waiterAdmin = {
      ...admin,
      rpc: async (fn: string, params: Record<string, unknown>) => {
        if (fn === "try_acquire_refresh_lock") {
          rpcCount++;
          if (rpcCount === 1) {
            state.locks.set(params.p_cnr as string, { leaseUntil: Date.now() + 30_000, holder: params.p_holder as string });
            return { data: { acquired: true, stale: false }, error: null };
          }
          return { data: null, error: null };
        }
        if (fn === "release_refresh_lock") return { data: null, error: null };
        return { data: null, error: { message: "unknown" } };
      },
      from: (table: string) => {
        if (table === "refresh_lock") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { message: "relation \"refresh_lock\" does not exist" },
                }),
              }),
            }),
            upsert: async () => ({ error: null }),
          };
        }
        return admin.from(table);
      },
    };

    const results = await Promise.all([
      liveRefreshCase(cnr, waiterAdmin as any, provider),
      liveRefreshCase(cnr, waiterAdmin as any, provider),
    ]);

    assert(provider.refreshCalls >= 2, `table error: both callers passed through (got ${provider.refreshCalls})`);
    assert(results.every((r) => r.case?.cnr === cnr), "all callers got results");
    setCourtDataClient(null);
    restore();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 7. Poll count under contention: exponential backoff, not flat-poll
  // ─────────────────────────────────────────────────────────────────────────
  {
    const restoreCoalesce = envSave("REFRESH_COALESCE");
    const restoreWait = envSave("REFRESH_COALESCE_WAIT_MS");
    process.env.REFRESH_COALESCE = "1";
    process.env.REFRESH_COALESCE_WAIT_MS = "5000";

    const cnr = "POLLCT1";
    const provider = new CountingMockProvider(baseResult(cnr), 500);
    setCourtDataClient(provider);

    const { admin } = makeFakeAdmin();
    let tableProbeCount = 0;
    const measuredAdmin = {
      ...admin,
      from: (table: string) => {
        const base = admin.from(table);
        if (table === "refresh_lock") {
          const origMaybeSingle = base.maybeSingle;
          base.maybeSingle = async () => { tableProbeCount++; return origMaybeSingle(); };
        }
        return base;
      },
    };

    await Promise.all([
      liveRefreshCase(cnr, measuredAdmin as any, provider),
      liveRefreshCase(cnr, measuredAdmin as any, provider),
    ]);

    assert(tableProbeCount <= 3, `exponential backoff: ≤3 table probes (got ${tableProbeCount}) — NOT 150 flat polls`);
    assert(provider.refreshCalls === 1, `poll count test: one upstream call`);
    setCourtDataClient(null);
    restoreCoalesce();
    restoreWait();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 8. liveRefreshCaseInner is the same contract (direct call skips coalescing)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const cnr = "INNER1";
    const provider = new CountingMockProvider(baseResult(cnr), 0);
    const { admin } = makeFakeAdmin();

    const r = await liveRefreshCaseInner(cnr, admin as any, provider);
    assert(provider.refreshCalls === 1, "inner: one upstream call");
    assert(r.case?.cnr === cnr, "inner: result returned");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. NOTIFICATION-NEUTRAL: coalescing is a cost optimisation, not an alert
  //    fix. W1's DIFF_SYNC already ensures re-upsert produces the same rows.
  // ═══════════════════════════════════════════════════════════════════════════

  const FIXTURE_CNR = "NOTIFY1";
  const TENANT = "tn-nfy";
  const MATTER = "m-nfy";
  const FIXTURE = changedResult(FIXTURE_CNR);

  // (a) BASELINE: single refresh → record notification/activity_event rows
  {
    const restore = envSave("REFRESH_COALESCE");
    delete process.env.REFRESH_COALESCE;

    const db = makeRecordingDb({ tenantId: TENANT, matterId: MATTER, cnr: FIXTURE_CNR });
    const provider = new CountingMockProvider(FIXTURE, 0);
    setCourtDataClient(provider);
    const { admin } = makeFakeAdmin();

    const fetched = await liveRefreshCase(FIXTURE_CNR, admin as any, provider);
    assert(!!fetched.case, "baseline: got case from provider");
    await upsertCase(db.sb as any, TENANT, fetched.case!, null, { diffSync: true });

    const baselineSigs = db.signatures();
    const baselineCount = db.totalRows();
    console.log(`\n  9a BASELINE (single refresh): ${baselineCount} rows (${baselineSigs.length} sigs)`);
    for (const s of baselineSigs) console.log(`     ${s}`);
    assert(baselineCount > 0, "baseline produced notification/activity rows (fixture triggers changes)");

    setCourtDataClient(null);
    restore();

    // (b) COALESCED: two refreshes, same shared DB → IDENTICAL rows, 1 upstream call
    {
      const restoreC = envSave("REFRESH_COALESCE");
      process.env.REFRESH_COALESCE = "1";

      const db2 = makeRecordingDb({ tenantId: TENANT, matterId: MATTER, cnr: FIXTURE_CNR });
      const provider2 = new CountingMockProvider(FIXTURE, 50);
      setCourtDataClient(provider2);
      const { admin: admin2 } = makeFakeAdmin();

      const [f1, f2] = await Promise.all([
        liveRefreshCase(FIXTURE_CNR, admin2 as any, provider2),
        liveRefreshCase(FIXTURE_CNR, admin2 as any, provider2),
      ]);

      assert(provider2.refreshCalls === 1, `coalesced: ONE upstream call (got ${provider2.refreshCalls})`);
      assert(!!(f1.case && f2.case), "both callers got cases");

      for (const f of [f1, f2]) {
        if (f.case && !f.stale) {
          await upsertCase(db2.sb as any, TENANT, f.case, null, { diffSync: true });
        }
      }

      const coalSigs = db2.signatures();
      const coalCount = db2.totalRows();
      console.log(`\n  9b COALESCED (flag on, shared DB): ${coalCount} rows (${coalSigs.length} sigs), ${provider2.refreshCalls} upstream call(s)`);
      for (const s of coalSigs) console.log(`     ${s}`);

      const identical =
        coalSigs.length === baselineSigs.length &&
        coalSigs.every((s, i) => s === baselineSigs[i]) &&
        coalCount === baselineCount;
      assert(identical, `coalesced: rows IDENTICAL to baseline (baseline=${baselineCount}, coalesced=${coalCount})`);

      setCourtDataClient(null);
      restoreC();
    }

    // (c) NEGATIVE CONTROL: coalescing OFF, shared DB, two callers on same CNR.
    //     Same notification rows (DIFF_SYNC deduplicates), but 2 upstream calls.
    {
      const restoreC = envSave("REFRESH_COALESCE");
      delete process.env.REFRESH_COALESCE;

      const db3 = makeRecordingDb({ tenantId: TENANT, matterId: MATTER, cnr: FIXTURE_CNR });
      const provider3 = new CountingMockProvider(FIXTURE, 0);
      setCourtDataClient(provider3);
      const { admin: admin3 } = makeFakeAdmin();

      const [fa, fb] = await Promise.all([
        liveRefreshCase(FIXTURE_CNR, admin3 as any, provider3),
        liveRefreshCase(FIXTURE_CNR, admin3 as any, provider3),
      ]);

      assert(provider3.refreshCalls === 2, `flag-off: TWO upstream calls (got ${provider3.refreshCalls})`);

      // Both run upsertCase on the SAME shared DB, sequentially. DIFF_SYNC on
      // the second run sees the first's writes → zero changes → no new alerts.
      for (const f of [fa, fb]) {
        if (f.case && !f.stale) {
          await upsertCase(db3.sb as any, TENANT, f.case, null, { diffSync: true });
        }
      }

      const ctrlSigs = db3.signatures();
      const ctrlCount = db3.totalRows();
      console.log(`\n  9c FLAG-OFF (shared DB): ${ctrlCount} rows (${ctrlSigs.length} sigs), ${provider3.refreshCalls} upstream call(s)`);
      for (const s of ctrlSigs) console.log(`     ${s}`);

      assert(ctrlCount === baselineCount,
        `flag-off: rows MATCH baseline (${ctrlCount} vs ${baselineCount}) — DIFF_SYNC prevents duplicates`);

      setCourtDataClient(null);
      restoreC();
    }
  }

  console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
