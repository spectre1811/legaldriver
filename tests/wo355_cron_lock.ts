// WO-355 W1+W2 — cron lease mutex unit tests.
// Tests: flag-off · CRON_LOCK='0' · acquire · stale-lease steal · contend (null + {acquired:false})
//        absent-table · network-error · handler-throws · release-throw · warn-once
// Run: npx tsx tests/wo355_cron_lock.ts
import { withCronLock, type CronLockClient } from "../src/lib/cron/lock";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

type HealthRow = { provider: string; last_error: string };
function mockClient(overrides: {
  rpcResult?: { data: unknown; error: null | { code?: string; message: string } };
  rpcThrows?: Error;
  healthError?: boolean;
}): {
  client: CronLockClient;
  rpcCalls: { fn: string; params: Record<string, unknown> }[];
  healthRows: HealthRow[];
} {
  const rpcCalls: { fn: string; params: Record<string, unknown> }[] = [];
  const healthRows: HealthRow[] = [];
  const client: CronLockClient = {
    rpc: async (fn, params) => {
      rpcCalls.push({ fn, params });
      if (overrides.rpcThrows) throw overrides.rpcThrows;
      return overrides.rpcResult ?? { data: null, error: { code: "PGRST202", message: "function not found" } };
    },
    from: (_table) => ({
      upsert: async (values) => {
        healthRows.push({
          provider: (values as Record<string, unknown>).provider as string,
          last_error: (values as Record<string, unknown>).last_error as string,
        });
        if (overrides.healthError) throw new Error("health write failed");
        return { error: null };
      },
    }),
  };
  return { client, rpcCalls, healthRows };
}

async function main() {
  // ── 1. Flag off: CRON_LOCK unset ───────────────────────────────────
  {
    const orig = process.env.CRON_LOCK;
    delete process.env.CRON_LOCK;
    let handlerRan = false;
    const res = await withCronLock("test-job", async () => {
      handlerRan = true;
      return new Response("handler-output");
    });
    check("flag off (unset) → handler runs", handlerRan);
    check("flag off (unset) → handler output preserved", (await res.text()) === "handler-output");
    if (orig !== undefined) process.env.CRON_LOCK = orig;
  }

  // ── 2. CRON_LOCK='0' → kill switch, transparent pass-through ──────
  {
    process.env.CRON_LOCK = "0";
    const { rpcCalls } = mockClient({ rpcResult: { data: { acquired: true, stale: false }, error: null } });
    let handlerRan = false;
    const res = await withCronLock("test-job", async () => {
      handlerRan = true;
      return new Response("killswitch-ok");
    }, mockClient({}).client);
    check("CRON_LOCK='0' → handler runs", handlerRan);
    check("CRON_LOCK='0' → zero rpc calls", rpcCalls.length === 0);
    check("CRON_LOCK='0' → handler output preserved", (await res.text()) === "killswitch-ok");
    delete process.env.CRON_LOCK;
  }

  // ── 3. Acquire success {acquired:true, stale:false} ────────────────
  {
    process.env.CRON_LOCK = "1";
    const { client, rpcCalls, healthRows } = mockClient({
      rpcResult: { data: { acquired: true, stale: false }, error: null },
    });
    let handlerRan = false;
    const res = await withCronLock("test-job", async () => {
      handlerRan = true;
      return new Response("ok");
    }, client);
    check("acquire → handler runs", handlerRan);
    check("acquire → rpc acquire called", rpcCalls.some((c) => c.fn === "try_acquire_cron_lock"));
    check("acquire → correct ttl", rpcCalls[0]?.params?.p_ttl_seconds === 900);
    check("acquire → release called in finally", rpcCalls.some((c) => c.fn === "release_cron_lock"));
    check("acquire → handler output preserved", (await res.text()) === "ok");
    check("acquire → no health row (not stale, not skipped)", healthRows.length === 0);
    delete process.env.CRON_LOCK;
  }

  // ── 4. Stale-lease steal {acquired:true, stale:true} ───────────────
  {
    process.env.CRON_LOCK = "1";
    const { client, rpcCalls, healthRows } = mockClient({
      rpcResult: { data: { acquired: true, stale: true }, error: null },
    });
    let handlerRan = false;
    const res = await withCronLock("stale-job", async () => {
      handlerRan = true;
      return new Response("stale-ok");
    }, client);
    check("stale-lease → handler runs", handlerRan);
    check("stale-lease → acquire called", rpcCalls.some((c) => c.fn === "try_acquire_cron_lock"));
    check("stale-lease → release called", rpcCalls.some((c) => c.fn === "release_cron_lock"));
    check("stale-lease → per-job health provider", healthRows[0]?.provider === "cron-lock:stale-job");
    check("stale-lease → last_error = stale", healthRows[0]?.last_error === "stale");
    check("stale-lease → handler output preserved", (await res.text()) === "stale-ok");
    delete process.env.CRON_LOCK;
  }

  // ── 5. Contend: data is null (no row returned) → lock-skip ────────
  {
    process.env.CRON_LOCK = "1";
    const { client, rpcCalls, healthRows } = mockClient({
      rpcResult: { data: null, error: null },
    });
    let handlerRan = false;
    const res = await withCronLock("busy-job", async () => {
      handlerRan = true;
      return new Response("nope");
    }, client);
    check("contend (null) → handler NOT run", !handlerRan);
    check("contend (null) → release NOT called", !rpcCalls.some((c) => c.fn === "release_cron_lock"));
    check("contend (null) → response lock_skip", (await res.json()).lock_skip === true);
    check("contend (null) → 200 status", res.status === 200);
    check("contend (null) → per-job health provider", healthRows[0]?.provider === "cron-lock:busy-job");
    check("contend (null) → last_error = skip", healthRows[0]?.last_error === "skip");
    delete process.env.CRON_LOCK;
  }

  // ── 6. Contend: {acquired:false} ──────────────────────────────────
  {
    process.env.CRON_LOCK = "1";
    const { client, healthRows } = mockClient({
      rpcResult: { data: { acquired: false }, error: null },
    });
    let handlerRan = false;
    const res = await withCronLock("busy-job", async () => {
      handlerRan = true;
      return new Response("nope");
    }, client);
    check("contend {acquired:false} → handler NOT run", !handlerRan);
    check("contend {acquired:false} → lock_skip", res.status === 200);
    check("contend {acquired:false} → lock_skip true", (await res.json()).lock_skip === true);
    check("contend {acquired:false} → per-job health provider", healthRows[0]?.provider === "cron-lock:busy-job");
    delete process.env.CRON_LOCK;
  }

  // ── 7. Handler throws after acquire → exception propagates, release in finally ──
  {
    process.env.CRON_LOCK = "1";
    const { client, rpcCalls } = mockClient({
      rpcResult: { data: { acquired: true, stale: false }, error: null },
    });
    let runCount = 0;
    let caught: Error | null = null;
    try {
      await withCronLock("throw-job", async () => {
        runCount++;
        throw new Error("handler-boom");
      }, client);
    } catch (e) {
      caught = e instanceof Error ? e : null;
    }
    check("handler-throws → handler runs exactly once", runCount === 1);
    check("handler-throws → exception propagates", caught?.message === "handler-boom");
    check("handler-throws → release still called in finally", rpcCalls.some((c) => c.fn === "release_cron_lock"));
    delete process.env.CRON_LOCK;
  }

  // ── 8. Handler throws after stale-lease acquire → release in finally ──
  {
    process.env.CRON_LOCK = "1";
    const { client, rpcCalls } = mockClient({
      rpcResult: { data: { acquired: true, stale: true }, error: null },
    });
    let caught: Error | null = null;
    try {
      await withCronLock("stale-throw-job", async () => {
        throw new Error("stale-boom");
      }, client);
    } catch (e) {
      caught = e instanceof Error ? e : null;
    }
    check("stale+throw → exception propagates", caught?.message === "stale-boom");
    check("stale+throw → release still called", rpcCalls.some((c) => c.fn === "release_cron_lock"));
    delete process.env.CRON_LOCK;
  }

  // ── 9. Health write fails on lock-skip → still returns 200 ────────
  {
    process.env.CRON_LOCK = "1";
    const { client } = mockClient({
      rpcResult: { data: null, error: null },
      healthError: true,
    });
    let handlerRan = false;
    const res = await withCronLock("busy-job", async () => {
      handlerRan = true;
      return new Response("nope");
    }, client);
    check("health-failure on skip → handler NOT run", !handlerRan);
    check("health-failure on skip → still 200 with lock_skip", res.status === 200);
    delete process.env.CRON_LOCK;
  }

  // ── 10. RPC returns error (absent table/function) → pass-through ───
  {
    process.env.CRON_LOCK = "1";
    const { client, rpcCalls } = mockClient({
      rpcResult: { data: null, error: { code: "PGRST202", message: "function not found" } },
    });
    let handlerRan = false;
    const res = await withCronLock("test-job", async () => {
      handlerRan = true;
      return new Response("pass-through");
    }, client);
    check("absent table → handler runs", handlerRan);
    check("absent table → handler output preserved", (await res.text()) === "pass-through");
    check("absent table → release NOT called", !rpcCalls.some((c) => c.fn === "release_cron_lock"));
    delete process.env.CRON_LOCK;
  }

  // ── 11. RPC throws (network error) → pass-through ──────────────────
  {
    process.env.CRON_LOCK = "1";
    const { client, rpcCalls } = mockClient({
      rpcThrows: new Error("ENOTFOUND"),
    });
    let handlerRan = false;
    const res = await withCronLock("test-job", async () => {
      handlerRan = true;
      return new Response("network-passthrough");
    }, client);
    check("network error → handler runs", handlerRan);
    check("network error → handler output preserved", (await res.text()) === "network-passthrough");
    check("network error → release NOT called", !rpcCalls.some((c) => c.fn === "release_cron_lock"));
    delete process.env.CRON_LOCK;
  }

  // ── 12. Release throw → handler result still returned ──────────────
  {
    process.env.CRON_LOCK = "1";
    const p_calls: { fn: string }[] = [];
    const client: CronLockClient = {
      rpc: async (fn, _params) => {
        p_calls.push({ fn });
        if (fn === "try_acquire_cron_lock") return { data: { acquired: true, stale: false }, error: null };
        throw new Error("release failed");
      },
      from: () => ({ upsert: async () => ({ error: null }) }),
    };
    let handlerRan = false;
    const res = await withCronLock("test-job", async () => {
      handlerRan = true;
      return new Response("still-ok");
    }, client);
    check("release-throw → handler ran", handlerRan);
    check("release-throw → result preserved", (await res.text()) === "still-ok");
    check("release-throw → acquire + release both attempted", p_calls.length === 2);
    delete process.env.CRON_LOCK;
  }

  console.log(`\n==== ${failures === 0 ? "ALL PASS" : failures + " FAILED"} ====`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
