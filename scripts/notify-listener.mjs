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
// WO-360 W2 exception: this connection bypasses TRANSACTION pooling and speaks either direct
// on 5432 or through the SESSION-mode pooler on 5432 (round 3.2, below — mukadma-web has no
// IPv6 egress and the direct host is AAAA-only, so session mode is the reachable option in
// practice). Do NOT "optimise" this onto transaction-mode pooling (6432/6543) — that is the one
// substitution this refusal exists to prevent.
const POOLER_PORTS = new Set(["6432", "6543"]);

// WO-358 review decision (a): a port check alone is NOT sufficient. Supabase's Supavisor
// SESSION-mode pooler also listens on 5432 — same port as the direct connection, DIFFERENT
// hostname (`aws-0-<region>.pooler.supabase.com` vs `db.<ref>.supabase.co`). Session mode
// does support LISTEN, so that DSN would not misbehave — but it is a policy deviation
// ("direct connection, never the pooler") that the port check alone lets through SILENTLY.
//
// ALLOWLIST, not a denylist: a `.pooler.supabase.com` suffix denylist was tried first and
// round-3-re-reviewed past — a trailing-dot FQDN (`....pooler.supabase.com.`, which DNS
// resolves identically), a CNAME, or a raw IP all reach the same endpoint while failing
// `endsWith`. Matching the genuine direct-connection shape instead means there is nothing to
// evade for that shape.
const DIRECT_HOST_RE = /^db\.[^.]+\.supabase\.co$/;

// Round 3.2 — measured, not assumed, on the actual box (`mukadma-web`, 2026-08-13):
// `ip -6 addr show scope global` = 0 addresses, `curl -6` egress FAILED. Separately, the
// project's direct host (`db.<ref>.supabase.co`) is AAAA-only on newer Supabase projects — no
// A record at all. So DIRECT_HOST_RE, while the right policy in principle, describes a host
// this box can never actually reach: NOTIFY_PG_URL pointed at it would connect to nothing, and
// preflight() would still pass it, deferring the failure to pgListen()'s connection attempt —
// which is a worse failure mode than refusing it here (see park(), below, for why "parks and
// says nothing again" is the shape this WO exists to eliminate).
//
// The narrow, machine-checked exception: allow the Supavisor SESSION-mode pooler, but ONLY on
// port 5432 (session mode) — 6543 (transaction mode) and 6432 stay refused on ANY host via
// POOLER_PORTS above, unchanged. Session-mode pooling holds one fixed backend connection for
// the client's session lifetime (no reset-and-return between statements), so a LISTEN
// registered through it survives — verified locally (2026-08-13, not assumed and not against
// the real Supabase endpoint, which needs prod credentials this session doesn't have): a real
// PgBouncer 1.25 proxy in `pool_mode = session` in front of a throwaway Postgres 16 delivered a
// NOTIFY sent on a separate direct connection to a client LISTENing through the pooled
// connection. The identical setup with `pool_mode = transaction` (and Supavisor's own documented
// `DISCARD ALL` reset between transactions) did NOT deliver it — the negative control needed
// `server_reset_query` set explicitly; PgBouncer's default is a no-op with no contention, which
// is a caveat about that control's rigor, not about Supabase's actual (well-documented)
// transaction-pooling behaviour, which this WO does not revisit.
//
// Two heavier alternatives were considered and rejected, not silently: (a) give the box real
// IPv6 egress (VPC/subnet + egress-only-IGW change) — infra-apply, founder-gated, and solves a
// problem this narrow exception already solves for $0 and no infra change; (b) Supabase's paid
// IPv4 add-on — recurring cost for the same outcome. Neither is warranted while (b-of-the-two,
// i.e. this exception) exists and is machine-checked. Don't reopen this without a reason IPv6
// egress or the add-on is now cheaper or otherwise necessary.
// The `aws-<N>-<region>` prefix is NOT fixed, and hardcoding `aws-0-` was a real bug: this project's
// pooler is `aws-1-ap-southeast-2.pooler.supabase.com` (read from the Management API's
// `/config/database/pooler`, 2026-08-15), so the allowlist REFUSED the only host the listener can
// actually use — it would have parked on every start. The earlier `aws-0-ap-south-1` in this file's
// history was assumed from a DNS lookup that resolved because Supabase runs a pooler in every region;
// resolving is not the same as being THIS project's. Match the shape, not one instance of it —
// `aws-<digits>-<region>` — and keep the port check as the thing that distinguishes session mode.
const POOLER_SESSION_HOST_RE = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/;
const POOLER_SESSION_PORT = "5432";

/**
 * Decide whether this process may run, from env alone. Fails CLOSED: anything unclear parks the
 * process (idle, LOUD — see park() below, not just one line at boot) rather than half-running.
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
    return { ok: false, reason: `NOTIFY_PG_URL points at a transaction pooler (port ${url.port}) — LISTEN is silently dropped there; use the direct :5432 DSN or the session-mode pooler DSN` };
  const host = url.hostname.toLowerCase();
  const isDirect = DIRECT_HOST_RE.test(host);
  const isPoolerSession = POOLER_SESSION_HOST_RE.test(host) && url.port === POOLER_SESSION_PORT;
  if (!isDirect && !isPoolerSession)
    return { ok: false, reason: `NOTIFY_PG_URL host ${url.hostname} on port ${url.port || "5432"} is neither the direct db.<ref>.supabase.co host nor the Supavisor session-mode pooler host on port 5432 — refused rather than guessed at (a trailing-dot FQDN, a CNAME, or a raw IP are all refused this way too; WO-358 review decision (a), round 3.2)` };
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
  console.log(`[notify-listener] LISTEN ${CHANNEL} on ${new URL(dsn).hostname} — up`);

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

/**
 * Idle forever without exiting: Restart=always would turn a clean exit into a 5s log loop.
 *
 * Round 3.2: a single log line at boot and then silence is indistinguishable, from
 * `systemctl is-active`, from a working listener — that IS the 14-day-dead-monitor shape F2 was
 * raised to eliminate, arriving through a different door. So this repeats the reason on the
 * SAME cadence as the live heartbeat (HEARTBEAT_MS): `journalctl -u ld-notify-listener` always
 * shows a recent PARKED line, and the pattern is fixed/greppable for the W3 dead-man to alarm on
 * once it exists (W3 itself is not built by this WO — see the WO file).
 */
export function park(reason, { intervalMs = HEARTBEAT_MS, log = console.error } = {}) {
  const say = () => log(`[notify-listener] PARKED — ${reason} (still not running; this repeats every ${Math.round(intervalMs / 1000)}s)`);
  say();
  const timer = setInterval(say, intervalMs);
  return () => clearInterval(timer); // main() never calls this — parking is permanent by design; tests do
}

async function main() {
  const pre = preflight(process.env);
  if (!pre.ok) {
    return park(pre.reason);
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
