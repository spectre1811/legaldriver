// WO-355 W1+W2 — cron lease mutex unit tests.
// Tests: flag-off · CRON_LOCK='0' · acquire · stale-lease steal · contend (null + {acquired:false})
//        absent-table · network-error · handler-throws · release-throw · warn-once
// WO-378 §13/§14 — OVERRUN. The WO-355 acceptance ("N concurrent starts → one proceeds") only
// covered concurrent STARTS. `try_acquire_cron_lock` STEALS an expired lease, and nothing stopped
// the run still in flight, so an overrunning run raced its own successor over the same still-
// `pending` rows — and delivery sends BEFORE it flips, so the `.in("status", …)` flip guard
// prevented a double flip, never a double SEND. §13/§14 drive the REAL withCronLock and the REAL
// runPipeline against a faithful in-memory implementation of the acquire SQL (steal iff
// lease_until < now, `stale` = the conflict-update path) — not a mock that just returns false.
// Run: npx tsx tests/wo355_cron_lock.ts
import { withCronLock, type CronLockClient } from "../src/lib/cron/lock";
import { runPipeline } from "../src/lib/notify/pipeline";
import type { Mailer, SendResult } from "../src/lib/notify/mailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/db/database.types";

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
      // WO-378: the lease fence re-reads cron_lock.holder. These cases never run long enough
      // to reach a confirm, so a null row is fine — §13 below drives the real thing.
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  };
  return { client, rpcCalls, healthRows };
}

// ─────────────────────────────────────────────────────────────────────────────
// WO-378 harness: one in-memory estate that is BOTH the CronLockClient and the
// admin Supabase client — exactly as prod, where both are the same createAdminClient().
// Filters are really applied, so a row already flipped 'sent' is really not picked
// up again: the double-send below is not something the harness could fake.
// ─────────────────────────────────────────────────────────────────────────────
type Notif = {
  id: string; tenant_id: string; user_id: string | null; channel: string; kind: string;
  payload: Record<string, unknown>; status: string; attempts: number; scheduled_for: string;
  sent_at?: string | null;
};
type Filter = { op: string; col: string; val: unknown };

function fakeEstate(seed: Notif[]) {
  const notif: Notif[] = seed.map((r) => ({ ...r }));
  let lock: { job_name: string; lease_until: number; holder: string } | null = null;
  const sends = new Map<string, number>(); // recipient → send count
  const acquires: string[] = [];
  let onFlip: ((id: string, status: string) => Promise<void>) | null = null;

  const matches = (row: Record<string, unknown>, fs: Filter[]) =>
    fs.every((f) => {
      const v = row[f.col];
      if (f.op === "eq") return String(v) === String(f.val);
      if (f.op === "in") return (f.val as unknown[]).map(String).includes(String(v));
      if (f.op === "lt") return Number(v) < Number(f.val);
      if (f.op === "lte") return String(v) <= String(f.val);
      if (f.op === "is") return v === null || v === undefined;
      return true;
    });

  const node = (table: string) => {
    const fs: Filter[] = [];
    let op = "select";
    let setVals: Record<string, unknown> = {};
    const run = async (): Promise<{ data: unknown; error: null }> => {
      if (table === "cron_lock") return { data: lock ? [{ holder: lock.holder }] : [], error: null };
      if (table !== "notification") return { data: [], error: null };
      const hits = notif.filter((r) => matches(r as unknown as Record<string, unknown>, fs));
      if (op === "update") {
        for (const r of hits) Object.assign(r, setVals);
        // Fire AFTER the flip lands, so the interleave point is a fully-completed row.
        for (const r of hits) if (onFlip) await onFlip(r.id, String(setVals.status));
        return { data: null, error: null };
      }
      return { data: hits.map((r) => ({ ...r })), error: null };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const self: any = {
      select: () => { op = "select"; return self; },
      update: (v: Record<string, unknown>) => { op = "update"; setVals = v; return self; },
      insert: async () => ({ error: null }),
      upsert: async () => ({ error: null }),
      eq: (c: string, v: unknown) => { fs.push({ op: "eq", col: c, val: v }); return self; },
      in: (c: string, v: unknown) => { fs.push({ op: "in", col: c, val: v }); return self; },
      lt: (c: string, v: unknown) => { fs.push({ op: "lt", col: c, val: v }); return self; },
      lte: (c: string, v: unknown) => { fs.push({ op: "lte", col: c, val: v }); return self; },
      is: (c: string, v: unknown) => { fs.push({ op: "is", col: c, val: v }); return self; },
      not: () => self,
      order: () => self,
      limit: () => self,
      maybeSingle: async () => {
        const { data } = await run();
        return { data: Array.isArray(data) ? (data[0] ?? null) : data, error: null };
      },
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) => run().then(res, rej),
    };
    return self;
  };

  const client = {
    from: node,
    auth: { admin: { getUserById: async (id: string) => ({ data: { user: { email: `${id}@test.invalid` } }, error: null }) } },
    // Faithful to 20260811090000_wo355_cron_lock.sql:35-41 — insert, or update ONLY where
    // lease_until < now(); `stale` = xmax<>0 = the conflict-update (steal) path ran.
    rpc: async (fn: string, p: Record<string, unknown>) => {
      if (fn === "try_acquire_cron_lock") {
        const now = Date.now();
        if (!lock || lock.lease_until < now) {
          const stale = !!lock;
          lock = { job_name: String(p.p_job), lease_until: now + Number(p.p_ttl_seconds) * 1000, holder: String(p.p_holder) };
          acquires.push(stale ? "stale-steal" : "acquired");
          return { data: { acquired: true, stale }, error: null };
        }
        acquires.push("skip");
        return { data: null, error: null }; // live lease ⇒ no row
      }
      if (fn === "release_cron_lock") {
        if (lock?.holder === String(p.p_holder)) lock = null; // holder-guarded
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  };

  return {
    client,
    sends,
    acquires,
    notif,
    setOnFlip: (fn: typeof onFlip) => { onFlip = fn; },
    stealLeaseOutOfBand: (holder: string) => { if (lock) lock.holder = holder; },
  };
}

class CountingMailer implements Mailer {
  readonly channel = "email" as const;
  constructor(private readonly sends: Map<string, number>) {}
  async send(to: string): Promise<SendResult> {
    this.sends.set(to, (this.sends.get(to) ?? 0) + 1);
    return { ok: true, id: "fake" };
  }
}

const PIPE_NOW = new Date("2026-08-12T10:00:00Z");
const seedRows = (): Notif[] =>
  ["r1", "r2", "r3"].map((id, i) => ({
    id,
    tenant_id: `t${i + 1}`,
    user_id: `u${i + 1}`,
    channel: "email",
    kind: "deadline_reminder", // fallback notice: one email per row, never a roundup
    payload: { title: `Case ${id}`, body: "Filing due", eventDate: "2026-09-01" },
    status: "pending",
    attempts: 0,
    scheduled_for: "2026-08-12T09:00:00Z",
  }));

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
      from: () => ({
        upsert: async () => ({ error: null }),
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
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

  // ── 13. WO-378 OVERRUN: a lease shorter than the run ⇒ exactly ONE send per row ──
  // The run outlives its own lease; the next cron invocation legitimately STEALS it and
  // drains the rows this run had not reached. Pre-fence, BOTH runs sent those rows.
  {
    process.env.CRON_LOCK = "1";
    const realNow = Date.now;
    let clock = realNow();
    Date.now = () => clock; // TTL is 900s; step the clock instead of waiting it out
    try {
      const est = fakeEstate(seedRows());
      const db = est.client as unknown as SupabaseClient<Database>;
      const lockClient = est.client as unknown as CronLockClient;
      const mailer = new CountingMailer(est.sends);
      let stolen = false;

      // Interleave at the only point that matters: run A has FULLY completed row r1
      // (sent + flipped) when its lease expires and its successor fires.
      est.setOnFlip(async (id, status) => {
        if (stolen || id !== "r1" || status !== "sent") return;
        stolen = true;
        clock += 910_000; // A's 900s lease has now expired mid-run
        // Run B — the next 5-minute cron invocation. Real withCronLock, real pipeline.
        await withCronLock("notify", async (lease) => {
          const { result } = await runPipeline(db, new CountingMailer(est.sends), PIPE_NOW, lease);
          return new Response(JSON.stringify(result));
        }, lockClient);
      });

      const resA = await withCronLock("notify", async (lease) => {
        const { result } = await runPipeline(db, mailer, PIPE_NOW, lease);
        return new Response(JSON.stringify(result));
      }, lockClient);
      const a = (await resA.json()) as { sent: number; fenced: boolean };

      const per = (id: string) => est.sends.get(`u${id.slice(1)}@test.invalid`) ?? 0;
      const maxSends = Math.max(per("r1"), per("r2"), per("r3"));
      console.log(`      [overrun] sends r1=${per("r1")} r2=${per("r2")} r3=${per("r3")} outcomes=${JSON.stringify(est.acquires)}`);

      check("overrun → successor really STOLE the expired lease", est.acquires.includes("stale-steal"));
      check("overrun → every row sent EXACTLY once (no double send)", maxSends === 1);
      check("overrun → every row was delivered (nothing dropped)", per("r1") === 1 && per("r2") === 1 && per("r3") === 1);
      check("overrun → the overrunning run reports fenced", a.fenced === true);
      check("overrun → the overrunning run stopped after its one row", a.sent === 1);
      check("overrun → no row left pending", est.notif.every((r) => r.status === "sent"));
    } finally {
      Date.now = realNow;
      delete process.env.CRON_LOCK;
    }
  }

  // ── 14. WO-378 ownership: lease taken out-of-band while the clock says we're fine ──
  // Clock skew / a manual lease change is invisible to the deadline, so the fence also
  // re-reads cron_lock.holder (throttled — see LEASE_CONFIRM_MS).
  {
    process.env.CRON_LOCK = "1";
    const realNow = Date.now;
    let clock = realNow();
    Date.now = () => clock;
    try {
      const est = fakeEstate(seedRows());
      const db = est.client as unknown as SupabaseClient<Database>;
      let taken = false;
      est.setOnFlip(async (id, status) => {
        if (taken || id !== "r1" || status !== "sent") return;
        taken = true;
        clock += 60_000; // past the confirm throttle, still 840s inside the lease
        est.stealLeaseOutOfBand("some-other-run");
      });

      const res = await withCronLock("notify", async (lease) => {
        const { result } = await runPipeline(db, new CountingMailer(est.sends), PIPE_NOW, lease);
        return new Response(JSON.stringify(result));
      }, est.client as unknown as CronLockClient);
      const r = (await res.json()) as { sent: number; fenced: boolean };

      check("holder-lost → run fenced despite a live deadline", r.fenced === true);
      check("holder-lost → stopped at the next row", r.sent === 1 && est.sends.size === 1);
      check("holder-lost → unreached rows stay pending for the real holder", est.notif.filter((x) => x.status === "pending").length === 2);
    } finally {
      Date.now = realNow;
      delete process.env.CRON_LOCK;
    }
  }

  // ── 15. WO-378 W1: a hung provider is BOUNDED, on both send paths ──
  // Both senders used a bare fetch with no AbortSignal: undici's default headers timeout is
  // 300s, so two hung sends alone were 600s of a 900s lease. Asserted behaviourally against a
  // provider that never answers — delete either `signal:` and these hang instead of failing.
  {
    const realFetch = globalThis.fetch;
    const savedKey = process.env.RESEND_API_KEY;
    const savedTimeout = process.env.NOTIFY_SEND_TIMEOUT_MS;
    const signals: (AbortSignal | undefined)[] = [];
    globalThis.fetch = ((_url: string, init?: RequestInit) => {
      signals.push(init?.signal ?? undefined);
      return new Promise((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(new DOMException("The operation was aborted", "TimeoutError")));
      });
    }) as typeof fetch;
    process.env.RESEND_API_KEY = "re_test";
    process.env.NOTIFY_SEND_TIMEOUT_MS = "60";
    // AbortSignal.timeout's timer is unref'd: with a stubbed fetch holding no socket, node would
    // exit before it fires. A real send holds one, so this is harness-only.
    const keepAlive = setInterval(() => {}, 20);
    try {
      const { getMailer } = await import("../src/lib/notify/mailer");
      const { WhatsAppBspClient } = await import("../src/lib/services/messaging/whatsapp");

      // Bounded race so DELETING a `signal:` fails this test in 2s instead of hanging CI.
      const orHung = <T>(p: Promise<T>) =>
        Promise.race([p, new Promise<"HUNG">((r) => setTimeout(() => r("HUNG"), 2000))]);

      const started = Date.now();
      const mailRes = await orHung(getMailer().send("a@b.test", "s", "<p>h</p>"));
      const waRes = await orHung(
        new WhatsAppBspClient({ apiKey: "k", baseUrl: "http://bsp.test", phoneNumberId: "p" })
          .send({ to: "+919876543210", channel: "whatsapp", body: "b", tenantId: "t1" }),
      );

      check("send timeout → email send aborted, not hung", mailRes !== "HUNG" && mailRes.ok === false);
      check("send timeout → whatsapp send aborted, not hung", waRes !== "HUNG" && waRes.status === "failed");
      check("send timeout → both fetches carried an AbortSignal", signals.length === 2 && signals.every((s) => !!s));
      check("send timeout → bounded by the env knob (<2s at 60ms)", Date.now() - started < 2000);
    } finally {
      clearInterval(keepAlive);
      globalThis.fetch = realFetch;
      if (savedKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = savedKey;
      if (savedTimeout === undefined) delete process.env.NOTIFY_SEND_TIMEOUT_MS; else process.env.NOTIFY_SEND_TIMEOUT_MS = savedTimeout;
    }
  }

  console.log(`\n==== ${failures === 0 ? "ALL PASS" : failures + " FAILED"} ====`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
