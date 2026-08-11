#!/usr/bin/env node
// WO-358 W2 — event-driven notification wake-up listener.
//
// WHAT IT IS: a long-lived process that holds one Postgres LISTEN connection and, when the
// `notify_wake` trigger fires (migration 20260811120000_wo358_notify_wake.sql — fired inside
// the transaction that inserts the notification row), calls the EXISTING notify cron route.
// It is a WAKER, not a second pipeline: zero delivery logic lives here, so every invariant
// the pipeline already has (channel isolation, retry plan, dead-man, state-transition
// idempotency) applies unchanged to a push-triggered run.
//
// WHY THIS SHAPE:
//   • Calling the route (not the pipeline) means the listener goes through `withCronLock`,
//     so it CONTENDS FOR THE SAME LEASE as the 5-min timer (WO-355). That is the entire
//     no-duplicate-delivery argument — see preflight()'s CRON_LOCK check.
//   • The 5-min cron stays untouched. NOTIFY is at-most-once and is lost while this process
//     is down; the timer is the durable backstop that makes that safe. Never remove it.
//   • Behind NOTIFY_PUSH=1. Rollback = unset it in SSM (/mukadma/web/legaldriver/NOTIFY_PUSH),
//     re-pull env, restart → this process parks and delivery is pure cron cadence.
//
// RUNTIME: /opt/web/ld-notify-listener/ on the web box, started by ld-notify-listener.service
// (provisioned by WO-355 W3; entrypoint run.sh + this file's install step live in
// mukadma-infra/web/). Env comes from /etc/web/legaldriver.env, which is materialised from
// SSM Parameter Store — set NOTIFY_PUSH / NOTIFY_PG_URL there, never by hand on the box.
//
// Run:  node scripts/notify-listener.mjs

import { pathToFileURL } from "node:url";

const CHANNEL = "notify_wake"; // constant — never interpolate user input into LISTEN
const DEFAULT_WAKE_URL = "http://127.0.0.1:3000/api/cron/notify";
const RUN_TIMEOUT_MS = 70_000; // route's maxDuration is 60s
const HEARTBEAT_MS = 60_000;
const COALESCE_MS = 150;

// Transaction-pooling ports. A LISTEN registered through a transaction pooler is bound to
// whatever backend served that one transaction and is then silently discarded — the listener
// connects, subscribes, and receives NOTHING, forever, with no error. This is the documented
// WO-360 W2 exception: this one connection bypasses the pooler and speaks to Postgres direct
// on 5432. Do NOT "optimise" it onto the pooler. (Session-mode pooling would work, but the
// direct DSN is the thing we can state and verify, so that is what we require.)
const POOLER_PORTS = new Set(["6432", "6543"]);

/**
 * Decide whether this process may run, from env alone. Fails CLOSED: anything unclear
 * parks the process (idle, one loud log line) rather than half-running.
 */
export function preflight(env) {
  if (env.NOTIFY_PUSH !== "1") return { ok: false, reason: "NOTIFY_PUSH is not '1' — push wake-up disabled, cron cadence only" };

  // The no-duplicate-delivery guarantee is the shared cron lease, nothing else: the pipeline
  // flips rows AFTER sending, so two concurrent runs would both send before either flips.
  // Without CRON_LOCK=1 a listener-triggered run and a timer-triggered run can overlap and
  // double-send. Refuse rather than take that risk.
  if (env.CRON_LOCK !== "1")
    return { ok: false, reason: "CRON_LOCK is not '1' — the listener and the cron timer share that lease; without it a race double-sends" };

  const secret = env.CRON_SECRET;
  if (!secret) return { ok: false, reason: "CRON_SECRET unset — the notify route would 401 every wake" };

  const dsn = env.NOTIFY_PG_URL;
  if (!dsn) return { ok: false, reason: "NOTIFY_PG_URL unset — no direct Postgres DSN to LISTEN on" };

  let url;
  try {
    url = new URL(dsn);
  } catch {
    return { ok: false, reason: "NOTIFY_PG_URL is not a parseable postgres:// URL" };
  }
  if (POOLER_PORTS.has(url.port))
    return { ok: false, reason: `NOTIFY_PG_URL points at a transaction pooler (port ${url.port}) — LISTEN is silently dropped there; use the direct :5432 DSN` };
  if (!/[?&]sslmode=/.test(dsn))
    return { ok: false, reason: "NOTIFY_PG_URL must state sslmode explicitly (sslmode=require in prod) — TLS is a decision, not a default" };

  return {
    ok: true,
    config: { dsn, secret, wakeUrl: env.NOTIFY_WAKE_URL || DEFAULT_WAKE_URL },
  };
}

/**
 * Coalescing single-flight waker. A burst of NOTIFYs (one sync writes several rows) becomes
 * ONE pipeline run; a NOTIFY that arrives while a run is in flight schedules exactly one
 * follow-up run, so a row inserted mid-run is never stranded until the next cron tick.
 */
export function createWaker({ run, coalesceMs = COALESCE_MS, log = console.log, now = Date.now }) {
  const stats = { wakes: 0, runs: 0, coalesced: 0, errors: 0, lastLatencyMs: 0 };
  let timer = null;
  let inFlight = false;
  let pending = false;
  let firstWakeAt = 0;
  const idleWaiters = [];

  const settleIdle = () => {
    if (timer || inFlight) return;
    for (const resolve of idleWaiters.splice(0)) resolve();
  };

  async function drain() {
    if (inFlight) {
      pending = true; // a run is already going; make sure one more follows it
      return;
    }
    inFlight = true;
    try {
      do {
        pending = false;
        const wokeAt = firstWakeAt || now();
        firstWakeAt = 0;
        stats.runs++;
        try {
          await run();
          stats.lastLatencyMs = now() - wokeAt;
          log(`[notify-listener] wake→run complete in ${stats.lastLatencyMs}ms`);
        } catch (e) {
          // Loud, not fatal: a transient 500 from the route must not kill the listener, and
          // the row is still pending so the 5-min backstop will pick it up regardless.
          stats.errors++;
          console.error(`[notify-listener] run failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      } while (pending);
    } finally {
      inFlight = false;
      settleIdle();
    }
  }

  return {
    stats,
    wake() {
      stats.wakes++;
      if (!firstWakeAt) firstWakeAt = now();
      if (timer) {
        stats.coalesced++;
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        void drain();
      }, coalesceMs);
    },
    /** Resolves once no run is scheduled or in flight (tests; also handy for a drain-on-exit). */
    idle() {
      if (!timer && !inFlight) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
  };
}

/** One wake = one authenticated GET of the existing notify route (which holds the cron lease). */
async function callPipeline({ wakeUrl, secret }) {
  const res = await fetch(wakeUrl, {
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
  });
  const body = (await res.text()).slice(0, 300);
  if (!res.ok) throw new Error(`notify route ${res.status}: ${body}`);
  console.log(`[notify-listener] pipeline ${res.status} ${body}`);
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// TRANSPORT SEAM. pgListen is the only Postgres-aware function in this file: it converts a
// stream of messages into onWake() calls. Swapping the transport — Redis Streams is the named
// escalation in WO-358 if multi-consumer fan-out or replay ever becomes real — means replacing
// this ONE function; the waker, the coalescing and the HTTP path are transport-agnostic.
// ─────────────────────────────────────────────────────────────────────────────────────────
async function pgListen({ dsn, onWake, onFatal }) {
  const { default: pg } = await import("pg"); // dynamic: importing this module must not need pg
  const client = new pg.Client({
    connectionString: dsn, // TLS is governed by the DSN's sslmode (preflight requires one)
    application_name: "ld-notify-listener",
    keepAlive: true,
  });
  client.on("notification", (msg) => {
    if (msg.channel === CHANNEL) onWake(msg.payload);
  });
  client.on("error", (e) => onFatal(e));

  await client.connect();
  await client.query(`LISTEN ${CHANNEL}`);
  console.log(`[notify-listener] LISTEN ${CHANNEL} on a direct connection — up`);

  // A TCP connection can die silently (NAT/idle reaper) and a dead LISTEN looks exactly like
  // "nothing happened". Heartbeat so a dead socket becomes a crash, and systemd's
  // Restart=always reconnects — that is the reconnect strategy, deliberately not hand-rolled.
  const heartbeat = setInterval(() => {
    client.query("select 1").catch((e) => onFatal(e));
  }, HEARTBEAT_MS);

  return () => {
    clearInterval(heartbeat);
    return client.end();
  };
}

/** Idle forever without exiting: Restart=always would turn a clean exit into a 5s log loop. */
function park() {
  setInterval(() => {}, 1 << 30);
}

async function main() {
  const pre = preflight(process.env);
  if (!pre.ok) {
    console.error(`[notify-listener] PARKED — ${pre.reason}`);
    return park();
  }
  const { dsn, secret, wakeUrl } = pre.config;
  const waker = createWaker({ run: () => callPipeline({ wakeUrl, secret }) });

  await pgListen({
    dsn,
    onWake: (id) => {
      console.log(`[notify-listener] wake ${id}`);
      waker.wake();
    },
    onFatal: (e) => {
      console.error(`[notify-listener] connection lost: ${e instanceof Error ? e.message : String(e)} — exiting for systemd restart`);
      process.exit(1);
    },
  });

  // Sweep once on start: anything inserted while this process was down got no NOTIFY.
  waker.wake();
}

// Only run when executed directly — tests import preflight/createWaker.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`[notify-listener] fatal: ${e instanceof Error ? e.stack : String(e)}`);
    process.exit(1);
  });
}
