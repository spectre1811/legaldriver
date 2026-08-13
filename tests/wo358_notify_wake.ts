// WO-358 W2 — event-driven wake-up: gating, coalescing, and the no-duplicate-delivery race.
// Run: npx tsx tests/wo358_notify_wake.ts
//
// What is proven here, and what is NOT:
//   A  preflight fails CLOSED — the pooler-DSN trap (LISTEN is silently dropped on a
//      transaction pooler) and the CRON_LOCK precondition both park the process. Decision (a):
//      NOTIFY_PG_URL's host must match the direct db.<ref>.supabase.co shape, OR — round 3.2 —
//      the Supavisor SESSION-mode pooler host on port 5432 specifically (measured: mukadma-web
//      has no IPv6 egress and the direct host is AAAA-only, so direct-only would park forever;
//      session mode genuinely holds a LISTEN, verified locally against a real PgBouncer
//      session-mode proxy, not assumed — see the WO file). Transaction-mode ports (6543, 6432)
//      stay refused on ANY host; a trailing-dot FQDN, a CNAME, or a raw IP are refused too — an
//      ALLOWLIST of the two legitimate shapes, not a denylist of the illegitimate ones.
//   A' park() itself — round 3.2: parking must be LOUD (repeats on the heartbeat cadence), not
//      one line at boot that scrolls away while `systemctl is-active` still reads healthy.
//   B  the waker coalesces a NOTIFY burst into one pipeline run and never runs two at once,
//      but never strands a row inserted mid-run.
//   C  THE RACE. Two concurrent runs — "listener-triggered" and "cron-triggered" — over ONE
//      shared notification store, driving the REAL runPipeline and the REAL withCronLock:
//      exactly one email is sent. The same scenario with the lease disabled sends TWICE,
//      which is the deletion-proof that the shared lease is what closes the duplicate class
//      (the pipeline flips rows AFTER sending, so its state guard alone cannot).
//   D  the migration's trigger predicate mirrors the pickup predicate and its NOTIFY payload
//      carries the row id only. This is a TEXT assertion on the .sql file — it proves the
//      shipped SQL says what the design says, not that Postgres behaves that way. The
//      transport-level proof (real LISTEN, measured latency) needs a live Postgres and is
//      run out-of-band; see scripts/notify-listener-verify.mjs. D also checks the F3 guard
//      is present — CORRECTED after review: it catches only a SYNCHRONOUS pg_notify failure,
//      not a full queue (that fails at COMMIT, after this function has returned — proven with
//      a deferred-constraint structural analog, recorded in the WO-358 file, not re-run here).

import { readFileSync } from "node:fs";
import { withCronLock, type CronLockClient } from "@/lib/cron/lock";
import { runPipeline } from "@/lib/notify/pipeline";
import type { Mailer, SendResult } from "@/lib/notify/mailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { createWaker, preflight, park } from "../scripts/notify-listener.mjs";

let ok = true;
const check = (name: string, cond: boolean) => {
  if (!cond) ok = false;
  console.log(`${cond ? "ok  " : "FAIL"}: ${name}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────────────────────────
// A · preflight fails closed
// ─────────────────────────────────────────────────────────────────────────────────
function A() {
  const base = {
    NOTIFY_PUSH: "1",
    CRON_LOCK: "1",
    CRON_SECRET: "s3cret",
    NOTIFY_PG_URL: "postgres://u:p@db.abcxyz.supabase.co:5432/postgres?sslmode=require",
  };
  check("A: a complete direct-DSN env passes preflight", preflight(base).ok === true);
  check("A: NOTIFY_PUSH unset → parked (rollback path)", preflight({ ...base, NOTIFY_PUSH: undefined }).ok === false);
  check("A: NOTIFY_PUSH=0 → parked", preflight({ ...base, NOTIFY_PUSH: "0" }).ok === false);
  check("A: CRON_LOCK not '1' → parked (no shared lease ⇒ a race would double-send)",
    preflight({ ...base, CRON_LOCK: "0" }).ok === false);
  check("A: CRON_SECRET unset → parked (every wake would 401)", preflight({ ...base, CRON_SECRET: "" }).ok === false);
  check("A: NOTIFY_PG_URL unset → parked", preflight({ ...base, NOTIFY_PG_URL: undefined }).ok === false);

  // The trap this whole file exists to prevent: a pooler DSN LISTENs "successfully" and
  // then receives nothing, forever, with no error anywhere.
  for (const port of ["6432", "6543"]) {
    const r = preflight({ ...base, NOTIFY_PG_URL: `postgres://u:p@db.abcxyz.supabase.co:${port}/postgres?sslmode=require` });
    check(`A: pooler port ${port} refused with a reason naming the pooler`,
      r.ok === false && /pooler/i.test(r.reason ?? ""));
  }
  check("A: DSN without sslmode → parked (TLS must be a decision, not a default)",
    preflight({ ...base, NOTIFY_PG_URL: "postgres://u:p@db.abcxyz.supabase.co:5432/postgres" }).ok === false);

  // Review decision (a), round 3 → 3.1: a denylist (`endsWith(".pooler.supabase.com")`) was
  // tried first and got past — a trailing-dot FQDN, a CNAME, or a raw IP all reach the same
  // kind of endpoint while failing `endsWith`. Switched to an ALLOWLIST of the legitimate
  // shapes instead of a denylist of the illegitimate ones — these three are still refused,
  // unchanged by round 3.2.
  const stillRefused: Array<[string, string]> = [
    ["a trailing-dot FQDN of the pooler host (DNS-identical to the non-dotted form, `endsWith` says no)",
      "aws-0-ap-south-1.pooler.supabase.com."],
    ["a raw IP address (no hostname to pattern-match against at all)", "203.0.113.10"],
    ["a CNAME-shaped host that is not either legitimate shape", "some-cname-pointing-elsewhere.example.net"],
  ];
  for (const [label, host] of stillRefused) {
    const r = preflight({ ...base, NOTIFY_PG_URL: `postgres://u:p@${host}:5432/postgres?sslmode=require` });
    check(`A: ${label} refused (decision (a) — allowlist, not a denylist)`,
      r.ok === false && /neither the direct/i.test(r.reason ?? ""));
  }
  check("A: a direct db.<ref>.supabase.co host on 5432 still passes (the allowlist doesn't over-match)",
    preflight({ ...base, NOTIFY_PG_URL: "postgres://u:p@db.abcxyz.supabase.co:5432/postgres?sslmode=require" }).ok === true);
  check("A: an uppercase direct host still passes (case-insensitive match)",
    preflight({ ...base, NOTIFY_PG_URL: "postgres://u:p@DB.ABCXYZ.SUPABASE.CO:5432/postgres?sslmode=require" }).ok === true);

  // Round 3.2: measured on the actual box — mukadma-web has no IPv6 egress and the direct host
  // is AAAA-only, so DIRECT_HOST_RE alone would park forever. The narrow exception: the
  // Supavisor SESSION-mode pooler host, but ONLY on port 5432 — verified locally (see the WO
  // file) that session mode genuinely preserves a LISTEN; port 5432 vs 6543 is how Supavisor
  // itself distinguishes session mode from transaction mode.
  check("A: the session-mode pooler host on port 5432 is ACCEPTED (round 3.2 — the reachable option)",
    preflight({ ...base, NOTIFY_PG_URL: "postgres://postgres:p@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require" }).ok === true);
  check("A: the SAME pooler host on port 6543 (transaction mode) is still refused — port, not host, decides the mode",
    preflight({ ...base, NOTIFY_PG_URL: "postgres://postgres:p@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require" }).ok === false);
  check("A: the SAME pooler host on port 6432 is still refused too",
    preflight({ ...base, NOTIFY_PG_URL: "postgres://postgres:p@aws-0-ap-south-1.pooler.supabase.com:6432/postgres?sslmode=require" }).ok === false);
  check("A: an uppercase pooler-session host on 5432 still passes (case-insensitive, same as direct)",
    preflight({ ...base, NOTIFY_PG_URL: "postgres://postgres:p@AWS-0-AP-SOUTH-1.POOLER.SUPABASE.COM:5432/postgres?sslmode=require" }).ok === true);
  // Supavisor's username form differs on the pooler (`postgres.<ref>` vs plain `postgres`) —
  // nothing in preflight() inspects the username (checked: only .hostname/.port/sslmode-presence
  // are read), so this must pass exactly like the plain-username case above.
  check("A: the pooler-style username form (postgres.<ref>) doesn't trip anything — preflight never reads it",
    preflight({ ...base, NOTIFY_PG_URL: "postgres://postgres.abcxyz:p@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require" }).ok === true);
}

// ─────────────────────────────────────────────────────────────────────────────────
// A' · park() is LOUD — repeats, doesn't log once and go silent
// ─────────────────────────────────────────────────────────────────────────────────
async function Aprime() {
  const lines: string[] = [];
  const stop = park("test reason", { intervalMs: 20, log: (s: string) => lines.push(s) });
  await sleep(75); // ~3-4 intervals at 20ms
  stop();
  const countAtStop = lines.length;
  await sleep(60); // stopped — no further lines should appear
  check("A': park() logs immediately, not just eventually", lines.length >= 1 && lines[0].includes("test reason"));
  check("A': park() REPEATS the reason (not one line at boot that then goes silent)", countAtStop >= 3);
  check("A': every parked line names the reason (greppable, not a generic 'parked')",
    lines.every((l) => l.includes("test reason") && l.includes("PARKED")));
  check("A': stopping the interval actually stops it (test hygiene, not a park() requirement — main() never stops it)",
    lines.length === countAtStop);
}

// ─────────────────────────────────────────────────────────────────────────────────
// B · waker: coalesce a burst, single-flight, never strand a mid-run insert
// ─────────────────────────────────────────────────────────────────────────────────
async function B() {
  {
    const w = createWaker({ run: async () => {}, coalesceMs: 5, log: () => {} });
    w.wake();
    await w.idle();
    check("B: one NOTIFY → one pipeline run", w.stats.runs === 1);
  }

  {
    const w = createWaker({ run: async () => {}, coalesceMs: 20, log: () => {} });
    for (let i = 0; i < 10; i++) w.wake(); // one sync writes several rows ⇒ several NOTIFYs
    await w.idle();
    check("B: a burst of 10 NOTIFYs coalesces into ONE run", w.stats.runs === 1);
    check("B: the coalesced wakes are counted, not lost", w.stats.wakes === 10 && w.stats.coalesced === 9);
  }

  {
    // A NOTIFY that lands mid-run must produce exactly one follow-up run — not zero (the row
    // would wait for the cron tick) and not ten (a stampede on the route).
    let runs = 0;
    const w = createWaker({
      run: async () => {
        runs++;
        if (runs === 1) {
          for (let i = 0; i < 5; i++) w.wake();
          await sleep(30);
        }
      },
      coalesceMs: 5,
      log: () => {},
    });
    w.wake();
    await w.idle();
    check("B: 5 NOTIFYs during an in-flight run → exactly one follow-up run", runs === 2);
  }

  {
    let runs = 0;
    const w = createWaker({
      run: async () => {
        runs++;
        if (runs === 1) throw new Error("route 500");
      },
      coalesceMs: 5,
      log: () => {},
    });
    w.wake();
    await w.idle();
    w.wake();
    await w.idle();
    check("B: a failing run is loud but not fatal — the listener still serves the next wake",
      runs === 2 && w.stats.errors === 1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────────
// C · THE RACE — listener-triggered run vs cron-triggered run, one shared store
// ─────────────────────────────────────────────────────────────────────────────────
type Row = {
  id: string; tenant_id: string; user_id: string | null; channel: string; kind: string;
  payload: Record<string, unknown>; status: string; scheduled_for: string; attempts: number;
};
type Filter = { fn: string; col: string; val: unknown };
type Q = { op: string; cols: string; values: Record<string, unknown>; filters: Filter[] };

class RecordingMailer implements Mailer {
  readonly channel = "email" as const;
  sends: string[] = [];
  constructor(private latencyMs = 20) {}
  async send(to: string, subject: string): Promise<SendResult> {
    // Real provider latency is what makes the two runs genuinely overlap rather than
    // serialise by accident — without it the race would not be a race.
    await sleep(this.latencyMs);
    this.sends.push(`${to}|${subject}`);
    return { ok: true, id: `msg-${this.sends.length}` };
  }
}

/** Shared fake store + cron-lease RPC, modelling the two guards that matter. */
function makeStore(rows: Row[]) {
  const store = new Map(rows.map((r) => [r.id, { ...r }]));
  const leases = new Map<string, { until: number; holder: string }>();
  const lockOutcomes: string[] = [];

  const find = (q: Q, fn: string, col: string) => q.filters.find((f) => f.fn === fn && f.col === col)?.val;

  async function exec(table: string, q: Q): Promise<{ data?: unknown; error: null | { message: string } }> {
    if (table === "notification") {
      if (q.op === "select") {
        const status = find(q, "eq", "status") as string | undefined;
        const dueBy = find(q, "lte", "scheduled_for") as string | undefined;
        let out = [...store.values()].filter((r) => r.status === status);
        if (status === "failed") {
          const chan = find(q, "eq", "channel") as string | undefined;
          const maxAttempts = find(q, "lt", "attempts") as number | undefined;
          out = out.filter((r) => (!chan || r.channel === chan) && (maxAttempts === undefined || r.attempts < maxAttempts));
        }
        // PostgREST .lte() excludes NULLs — a NULL scheduled_for is never picked up.
        if (dueBy) out = out.filter((r) => !!r.scheduled_for && r.scheduled_for <= dueBy);
        return { data: out.map((r) => ({ ...r })), error: null };
      }
      if (q.op === "update") {
        // THE STATE-TRANSITION GUARD, modelled exactly: `.in("status", [...])` means the row
        // only moves if it is still in one of those states.
        const allowed = (find(q, "in", "status") as string[] | undefined) ?? [find(q, "eq", "status") as string];
        const idIn = q.filters.find((f) => f.col === "id");
        const ids = idIn?.fn === "in" ? (idIn.val as string[]) : idIn ? [idIn.val as string] : [];
        for (const id of ids) {
          const r = store.get(id);
          if (r && allowed.includes(r.status)) Object.assign(r, q.values);
        }
        return { error: null };
      }
    }
    if (table === "profile") return { data: [{ id: "u1" }], error: null };
    if (table === "matter") return { data: [], error: null };
    return { data: [], error: null };
  }

  function chain(table: string) {
    const q: Q = { op: "select", cols: "", values: {}, filters: [] };
    const self: Record<string, unknown> = {};
    for (const fn of ["eq", "neq", "in", "is", "lt", "lte", "gt", "gte", "contains", "order"]) {
      self[fn] = (col: string, val: unknown) => { q.filters.push({ fn, col, val }); return self; };
    }
    self.select = (c: string) => { q.op = "select"; q.cols = c; return self; };
    self.update = (v: Record<string, unknown>) => { q.op = "update"; q.values = v; return self; };
    self.insert = async () => ({ error: null });
    self.upsert = async () => ({ error: null });
    self.limit = () => self;
    self.maybeSingle = async () => {
      const r = await exec(table, q);
      return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
    };
    self.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      exec(table, q).then(resolve, reject);
    return self;
  }

  const client = {
    from: (table: string) => chain(table),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "advocate@test.invalid" } }, error: null }) } },
    // Faithful model of try_acquire_cron_lock: insert-or-steal-only-if-expired, returning a
    // row ONLY when the lease was actually taken. JS is single-threaded, so this map read+write
    // is atomic exactly like the SQL statement it stands in for.
    rpc: async (fn: string, params: Record<string, unknown>) => {
      const job = params.p_job as string;
      if (fn === "try_acquire_cron_lock") {
        const cur = leases.get(job);
        if (cur && cur.until > Date.now()) { lockOutcomes.push("skip"); return { data: null, error: null }; }
        leases.set(job, { until: Date.now() + (params.p_ttl_seconds as number) * 1000, holder: params.p_holder as string });
        lockOutcomes.push("acquired");
        return { data: { acquired: true, stale: !!cur }, error: null };
      }
      if (fn === "release_cron_lock") {
        if (leases.get(job)?.holder === params.p_holder) leases.delete(job);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    },
  };

  return { client, store, lockOutcomes };
}

function pendingEmailRow(): Row {
  return {
    id: "n-race-1", tenant_id: "t1", user_id: "u1", channel: "email", kind: "cause_list_alert",
    payload: { title: "Listed tomorrow", body: "Item 12 · Court 4" },
    status: "pending", scheduled_for: "2026-08-11T09:59:00Z", attempts: 0,
  };
}

async function raceOnce(useLock: boolean) {
  const { client, store, lockOutcomes } = makeStore([pendingEmailRow()]);
  const mailer = new RecordingMailer();
  const now = new Date("2026-08-11T10:00:00Z");
  const db = client as unknown as SupabaseClient<Database>;

  if (useLock) process.env.CRON_LOCK = "1";
  else delete process.env.CRON_LOCK;

  const run = () =>
    withCronLock(
      "notify",
      async () => {
        const { result } = await runPipeline(db, mailer, now);
        return new Response(JSON.stringify(result));
      },
      client as unknown as CronLockClient,
    );

  // "listener wake" and "cron tick" land at the same instant.
  const [a, b] = await Promise.all([run(), run()]);
  const bodies = [await a.json(), await b.json()];
  return { mailer, store, lockOutcomes, bodies };
}

async function C() {
  {
    const { mailer, store, lockOutcomes, bodies } = await raceOnce(true);
    check("C: listener+cron race under the shared lease → the email is sent EXACTLY ONCE",
      mailer.sends.length === 1);
    check("C: the notification row ends 'sent'", store.get("n-race-1")?.status === "sent");
    check("C: exactly one run acquired the lease, one skipped",
      lockOutcomes.filter((o) => o === "acquired").length === 1 && lockOutcomes.filter((o) => o === "skip").length === 1);
    check("C: the loser returns lock_skip rather than pretending to have delivered",
      bodies.some((x) => (x as { lock_skip?: boolean }).lock_skip === true));
  }

  {
    // Deletion-proof: take the lease away and the SAME scenario double-sends. This is why
    // the listener refuses to start unless CRON_LOCK=1 (scripts/notify-listener.mjs preflight).
    const { mailer, store } = await raceOnce(false);
    check("C: WITHOUT the shared lease the same race double-sends (the guard is load-bearing)",
      mailer.sends.length === 2);
    check("C: …and the row still ends 'sent' exactly once — the flip guard alone does NOT stop the second email",
      store.get("n-race-1")?.status === "sent");
  }
  delete process.env.CRON_LOCK;
}

// ─────────────────────────────────────────────────────────────────────────────────
// D · the shipped SQL says what the design says
// ─────────────────────────────────────────────────────────────────────────────────
function D() {
  const sql = readFileSync("supabase/migrations/20260811120000_wo358_notify_wake.sql", "utf8").toLowerCase();
  check("D: trigger fires AFTER INSERT on notification", /after insert on public\.notification/.test(sql));
  check("D: WHEN mirrors pickup — pending only", /new\.status = 'pending'/.test(sql));
  check("D: WHEN mirrors pickup — due now only (a future reminder is the cron's job)",
    /new\.scheduled_for <= now\(\)/.test(sql) && /new\.scheduled_for is not null/.test(sql));
  check("D: the NOTIFY payload is the row id and nothing else (no PII on the channel)",
    /pg_notify\('notify_wake', new\.id::text\)/.test(sql));
  // Review finding F3, CORRECTED after an independent review caught the first pass overclaiming
  // (full record in the WO-358 file). This text check proves ONLY that the shipped SQL wraps
  // the pg_notify call in begin/exception/end — it does NOT prove, and the guard does NOT
  // provide, blanket protection against every pg_notify failure. What is actually true, each
  // proven live on a throwaway local PG 16 (neither re-run in CI — no live PG in the offline
  // group):
  //   • SYNCHRONOUS failures (permission denied, bad argument — an error at the `perform`
  //     call site itself, exception scope still on the stack) ARE caught: unguarded, the
  //     INSERT aborted (row count unchanged); guarded, it logs a WARNING and the row lands.
  //   • A FULL QUEUE is NOT caught and cannot be by this shape: Postgres defers the queue
  //     write (where the 8GB limit is enforced) to PreCommit_Notify() at COMMIT, after this
  //     function has already returned — nothing is on the stack to catch it there. Confirmed
  //     with a structural analog (a DEFERRABLE INITIALLY DEFERRED unique-violation inside the
  //     identically-shaped guard): the exception branch never ran, and COMMIT rolled back the
  //     whole transaction, including the row the guard existed to protect.
  // The full-queue case is mitigated by listener liveness (heartbeat + Restart=always), not by
  // this guard — see the migration's own header comment. Do not read a green check here as
  // "F3 fully closed."
  check("D: a SYNCHRONOUS pg_notify failure inside notify_wake() is caught (does not, and cannot, cover a full-queue failure — that surfaces at COMMIT; review F3, corrected)",
    /begin\s+perform pg_notify\('notify_wake', new\.id::text\);\s+exception when others then\s+raise warning/.test(sql));

  const pickup = readFileSync("src/lib/notify/pickup.ts", "utf8");
  check("D: pickup still selects status=pending + scheduled_for<=now (the predicate the trigger mirrors)",
    /\.eq\("status", "pending"\)/.test(pickup) && /\.lte\("scheduled_for", nowIso\)/.test(pickup));

  // The 5-min backstop must survive this WO: NOTIFY is at-most-once and is lost while the
  // listener is down. If this ever fails, someone deleted the durable path.
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons?: { path: string; schedule: string }[] };
  const notifyCron = (vercel.crons ?? []).find((c) => c.path.endsWith("/api/cron/notify"));
  check("D: the 5-min notify cron backstop is still declared (WO-355 cadence untouched)",
    notifyCron?.schedule === "*/5 * * * *");
}

async function main() {
  const savedAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://app.mukadma.in";

  A();
  await Aprime();
  await B();
  await C();
  D();

  if (savedAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = savedAppUrl;

  console.log(ok ? "\nWO358 NOTIFY WAKE-UP: PASS" : "\nWO358 NOTIFY WAKE-UP: FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
