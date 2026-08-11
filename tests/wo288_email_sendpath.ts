// Test: email send-path hardening (WO-288), offline. No live services.
// Run: npx tsx tests/wo288_email_sendpath.ts
// Acceptance drills:
//   (i)  simulated provider 403 → SendResult carries the provider error verbatim +
//        outbound_email row records it + readiness flips "failing" + the
//        email-sendpath dead-man row wiring exists — no ok:true anywhere on the path.
//   (ii) prod-mode with no key → FailMailer: loud (console.error) + ok:false.
//   (iii) retry drill: one logical notification sends at most once successfully —
//        retryPlan bounds + the status-guarded flip/pickup state machine.
// Plus: DEMO_MODE cache-poisoning fix (env change takes effect), the PRE-APPLY
// schema shapes (missing error/attempts column, NULL attempts) degrade to today's
// behavior, and the migration keeps RLS posture untouched.
import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getMailer, getMailerReadiness } from "@/lib/notify/mailer";
import { logOutboundEmail } from "@/lib/notify/log";
import { retryPlan, MAX_SEND_ATTEMPTS } from "@/lib/notify/retry";
import { runPipeline } from "@/lib/notify/pipeline";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type DB = SupabaseClient<Database>;

let ok = true;
const check = (name: string, cond: boolean) => {
  if (!cond) ok = false;
  console.log(`${cond ? "ok  " : "FAIL"}: ${name}`);
};
const src = (p: string) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), "utf8");

const ENV_KEYS = ["RESEND_API_KEY", "FROM_EMAIL", "DEMO_MODE", "VERCEL_ENV"] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const setEnv = (vals: Partial<Record<(typeof ENV_KEYS)[number], string>>) => {
  for (const k of ENV_KEYS) {
    if (vals[k] === undefined) delete process.env[k];
    else process.env[k] = vals[k];
  }
};

const realFetch = globalThis.fetch;
const realError = console.error;
let fetchCalls = 0;
let errorCalls = 0;
const mockFetch = (status: number, body: unknown) => {
  globalThis.fetch = (async () => {
    fetchCalls++;
    return { ok: status < 400, status, json: async () => body };
  }) as unknown as typeof fetch;
};
console.error = (...args: unknown[]) => {
  errorCalls++;
  void args;
};

async function main() {
try {
  // ── (a)/(i): provider 403 → honest failure, provider error verbatim, error-logged ──
  setEnv({ RESEND_API_KEY: "re_test", FROM_EMAIL: "notify@mukadma.in" });
  mockFetch(403, { message: "You can only send testing emails to your own email address" });
  errorCalls = 0;
  const r403 = await getMailer().send("someone@example.com", "s", "<p>h</p>");
  check("403: ok is false (never ok:true on a failed send)", r403.ok === false);
  check("403: provider error carried verbatim", r403.error === "You can only send testing emails to your own email address");
  check("403: failure is error-logged (loud, not silent)", errorCalls >= 1);

  mockFetch(200, { id: "em_123" });
  const rOk = await getMailer().send("someone@example.com", "s", "<p>h</p>");
  check("200: ok with provider id", rOk.ok === true && rOk.id === "em_123");

  globalThis.fetch = (async () => {
    fetchCalls++;
    throw new Error("network down");
  }) as unknown as typeof fetch;
  errorCalls = 0;
  const rThrow = await getMailer().send("someone@example.com", "s", "<p>h</p>");
  check("network throw: ok false + error captured + logged", rThrow.ok === false && rThrow.error === "network down" && errorCalls >= 1);

  // ── (b)/(ii): prod-mode boot with no key = LOUD FailMailer, never ok:true ──
  setEnv({ VERCEL_ENV: "production" });
  errorCalls = 0;
  const rProd = await getMailer().send("someone@example.com", "s", "<p>h</p>");
  check("prod+no-key: ok false", rProd.ok === false);
  check("prod+no-key: error names the missing key", /RESEND_API_KEY/.test(rProd.error ?? ""));
  check("prod+no-key: console.error fired (loud)", errorCalls >= 1);
  // dev without a key keeps the silent-success ConsoleMailer (dev/demo only)
  setEnv({});
  const rDev = await getMailer().send("someone@example.com", "s", "<p>h</p>");
  check("dev+no-key: ConsoleMailer still succeeds (id 'console')", rDev.ok === true && rDev.id === "console");

  // ── (c): no module cache — an env change takes effect on the NEXT getMailer() ──
  setEnv({ DEMO_MODE: "1", RESEND_API_KEY: "re_test" });
  mockFetch(200, { id: "em_x" });
  fetchCalls = 0;
  const rDemo = await getMailer().send("someone@example.com", "s", "<p>h</p>");
  check("demo: never hits the provider even with a key", rDemo.id === "console" && fetchCalls === 0);
  setEnv({ RESEND_API_KEY: "re_test" }); // DEMO_MODE off, same process — the old cache kept ConsoleMailer here
  const rAfter = await getMailer().send("someone@example.com", "s", "<p>h</p>");
  check("demo off: next resolve is the REAL mailer (cache poisoning fixed)", rAfter.id === "em_x" && fetchCalls === 1);

  // ── (d): readiness = env shape + real outcomes; scoped-key gotcha respected ──
  setEnv({ VERCEL_ENV: "production" });
  check("readiness prod+no-key → misconfigured", (await getMailerReadiness()).status === "misconfigured");
  setEnv({});
  check("readiness dev+no-key → unconfigured", (await getMailerReadiness()).status === "unconfigured");
  setEnv({ RESEND_API_KEY: "re_test" });
  check("readiness key+resend.dev from → restricted", (await getMailerReadiness()).status === "restricted");
  setEnv({ RESEND_API_KEY: "re_test", FROM_EMAIL: "notify@mukadma.in" });
  check("readiness key+custom from → ready", (await getMailerReadiness()).status === "ready");

  const sbWith = (rows: { status: string }[] | null, error?: { message: string }) =>
    ({
      from: () => ({
        select: () => ({
          order: () => ({ limit: async () => ({ data: rows, error: error ?? null }) }),
        }),
      }),
    }) as unknown as DB;
  const failing = await getMailerReadiness(sbWith([{ status: "failed" }, { status: "failed" }, { status: "failed" }, { status: "failed" }, { status: "failed" }]));
  check("readiness: latest sends all failed → failing (drill i)", failing.status === "failing");
  const mixed = await getMailerReadiness(sbWith([{ status: "failed" }, { status: "sent" }, { status: "failed" }]));
  check("readiness: mixed outcomes → env shape (ready)", mixed.status === "ready");
  const twoOnly = await getMailerReadiness(sbWith([{ status: "failed" }, { status: "failed" }]));
  check("readiness: <3 outcomes never flips failing (no flap on thin data)", twoOnly.status === "ready");
  const preApply = await getMailerReadiness(sbWith(null, { message: 'column "created_at" does not exist' }));
  check("readiness: query error (pre-apply shape) → env shape, no crash", preApply.status === "ready");
  const mailerSrc = src("src/lib/notify/mailer.ts");
  check("readiness: NO domains probe (sending-scoped key returns empty /domains)", !mailerSrc.includes("api.resend.com/domains"));

  // ── (a) log path: error column carried; pre-apply shapes degrade, never throw ──
  {
    const inserts: Record<string, unknown>[] = [];
    const sbLog = { from: () => ({ insert: async (row: Record<string, unknown>) => (inserts.push(row), { error: null }) }) } as unknown as DB;
    await logOutboundEmail(sbLog, { tenantId: "t1", to: "a@b.com", subject: "s", ok: false, error: "resend 403" });
    check("log: failed send row carries the provider error", inserts.length === 1 && inserts[0].error === "resend 403" && inserts[0].status === "failed");

    // pre-apply: first insert rejects the unknown `error` column → legacy retry
    const legacyInserts: Record<string, unknown>[] = [];
    let first = true;
    const sbPre = {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          if (first) {
            first = false;
            return { error: { message: "column \"error\" of relation \"outbound_email\" does not exist" } };
          }
          legacyInserts.push(row);
          return { error: null };
        },
      }),
    } as unknown as DB;
    await logOutboundEmail(sbPre, { tenantId: "t1", to: "a@b.com", ok: true, providerId: "em_1", error: null });
    check("log pre-apply: degrades to the legacy row shape (no `error` key)", legacyInserts.length === 1 && !("error" in legacyInserts[0]));

    // pre-apply + system send (NULL tenant): both shapes impossible → swallowed loudly, no throw
    errorCalls = 0;
    const sbFail = { from: () => ({ insert: async () => ({ error: { message: "null value in column \"tenant_id\"" } }) }) } as unknown as DB;
    await logOutboundEmail(sbFail, { tenantId: null, to: "a@b.com", ok: false, error: "x" });
    check("log pre-apply: NULL-tenant row lost → error-logged, never thrown", errorCalls >= 1);
  }

  // ── (e)/(iii): bounded retry — plan + one-successful-send state machine ──
  const p1 = retryPlan(null);
  check("retryPlan: NULL attempts (pre-apply shape) = first recorded attempt", p1.status === "failed" && p1.attempts === 1 && !!p1.scheduled_for);
  const p2 = retryPlan(1);
  check("retryPlan: backoff grows (2^n hours)", !!p1.scheduled_for && !!p2.scheduled_for && p2.scheduled_for > p1.scheduled_for);
  check("retryPlan: attempt MAX-1 → terminal dead", retryPlan(MAX_SEND_ATTEMPTS - 1).status === "dead");
  check("retryPlan: far past the cap stays dead (never resurrects)", retryPlan(99).status === "dead");
  check("retryPlan: bound is finite and small", MAX_SEND_ATTEMPTS <= 10);

  // Retry drill (iii): mirror the route's pickup predicates + status-guarded flip.
  // One logical notification, provider fails once then succeeds: exactly ONE
  // successful send ever happens, and a 'sent'/'dead' row is never picked up again.
  {
    const pickedForSend = (row: { status: string; attempts: number }) =>
      row.status === "pending" || (row.status === "failed" && row.attempts < MAX_SEND_ATTEMPTS);
    const guardedFlip = (row: { status: string }, to: string) => {
      if (row.status === "pending" || row.status === "failed") row.status = to; // .in("status", ["pending","failed"])
    };
    const row = { status: "pending", attempts: 0 };
    let successfulSends = 0;
    const outcomes = [false, true, true]; // fail once, then provider healthy
    for (const willSucceed of outcomes) {
      if (!pickedForSend(row)) continue; // cron pass skips settled rows
      if (willSucceed) {
        successfulSends++;
        guardedFlip(row, "sent");
      } else {
        const plan = retryPlan(row.attempts);
        row.attempts = plan.attempts;
        guardedFlip(row, plan.status);
      }
    }
    check("retry drill: exactly one successful send across retries", successfulSends === 1 && row.status === "sent");
    const deadRow = { status: "dead", attempts: MAX_SEND_ATTEMPTS };
    check("retry drill: dead/sent rows are never picked again", !pickedForSend(deadRow) && !pickedForSend(row));
  }

  // ── WO-358 migrated wiring checks: the 8 invariants previously pinned to
  // route.ts now live in extracted lib/notify/ modules. Each check carries
  // a comment naming the original WO-288 check it replaces. See EVIDENCE for
  // the full mapping table.
  {
    // (1) retry pickup: bounded, picks up failed email rows
    // Replaces — "route: retry pickup exists and is bounded"
    const pickup = src("src/lib/notify/pickup.ts");
    check("pickup: retry pickup exists and is bounded",
      pickup.includes('.eq("status", "failed")') && pickup.includes('.lt("attempts", MAX_SEND_ATTEMPTS)'));

    // (2) retry pickup is email-only — WhatsApp seam untouched
    // Replaces — "route: retry pickup is email-only (WhatsApp seam untouched)"
    check("pickup: retry pickup is email-only (WhatsApp seam untouched)",
      pickup.includes('.eq("channel", "email")'));

    // (3) terminal dead flip with pre-apply fallback to "failed"
    // Replaces — "route: terminal dead flip with pre-apply fallback to 'failed'"
    const deadRefs = src("src/lib/notify/filter/dead-refs.ts");
    check("filter/dead-refs: terminal dead flip with pre-apply fallback to 'failed'",
      deadRefs.includes('status: "dead"') && deadRefs.includes("if (deadErr)"));

    // (4) failure flip fail-soft: pre-apply DB rejection of 'attempts' column
    // Replaces — "route: failure flip fail-soft (pre-apply plain 'failed')"
    const deliverEmail = src("src/lib/notify/deliver/email.ts");
    check("deliver/email: failure flip fail-soft (pre-apply plain 'failed')",
      deliverEmail.includes("if (upErr)"));

    // (5) flips are status-guarded (idempotent) — checked across deliver modules
    // Replaces — "route: flips are status-guarded (idempotent)"
    const deliverWhatsapp = src("src/lib/notify/deliver/whatsapp.ts");
    const deliverInapp = src("src/lib/notify/deliver/inapp.ts");
    check("deliver/email: flips are status-guarded (idempotent)",
      deliverEmail.includes('.in("status", ["pending", "failed"])'));
    check("deliver/whatsapp: flips are idempotent (eq status pending)",
      deliverWhatsapp.includes('.eq("status", "pending")'));
    check("deliver/inapp: flips are status-guarded (idempotent)",
      deliverInapp.includes('.in("status", ["pending", "failed"])'));

    // (6) send outcome logged WITH the provider error
    // Replaces — "route: send outcome logged WITH the provider error"
    check("deliver/email: send outcome logged WITH the provider error",
      deliverEmail.includes("error: res.error"));

    // (7) dead-man row on court_provider_health
    // Replaces — "route: dead-man row on court_provider_health (drill i)"
    const healthMod = src("src/lib/notify/health.ts");
    check("health: dead-man row on court_provider_health (drill i)",
      healthMod.includes('provider: "email-sendpath"') && healthMod.includes("court_provider_health"));

    // (8) retryPlan drives the failure transition
    // Replaces — "route: retryPlan drives the failure transition"
    check("deliver/email: retryPlan drives the failure transition",
      deliverEmail.includes("retryPlan(row.attempts)"));
  }

  // ── access paths (a): no silent swallow left ──
  {
    const approve = src("src/app/dashboard/access-requests/actions.ts");
    check("approve: credentials email outcome logged", approve.includes("logOutboundEmail"));
    check("approve: no silent .catch(() => {}) anywhere", !approve.includes(".catch(() => {})"));
    const intake = src("src/app/request-access/actions.ts");
    check("intake: founder-notify outcome logged (tenantId null system send)", intake.includes("logOutboundEmail") && intake.includes("tenantId: null"));
  }

  // ── i18n: new readiness statuses EN+HI ──
  {
    const en = JSON.parse(src("src/i18n/messages/en.json"));
    const hi = JSON.parse(src("src/i18n/messages/hi.json"));
    const mailKeys = ["misconfigured", "misconfiguredHint", "failing", "failingHint"];
    check("i18n: settings.court.mail new statuses EN+HI", mailKeys.every((k) => en.settings?.court?.mail?.[k] && hi.settings?.court?.mail?.[k]));
  }

  // ── migration: inert-safe additions only, RLS posture untouched ──
  {
    const migDir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
    const mig = readdirSync(migDir).find((f) => f.includes("wo288"));
    check("migration: wo288 file exists", !!mig);
    if (mig) {
      const sql = readFileSync(migDir + mig, "utf8");
      check("migration: outbound_email gains error + nullable tenant", sql.includes("add column if not exists error") && sql.includes("drop not null"));
      check("migration: notification gains attempts + dead status", sql.includes("attempts") && sql.includes("'dead'"));
      check("migration: NO RLS policy changes (posture preserved)", !/create policy|alter policy|drop policy/i.test(sql));
    }
  }
  // ── WO-358 behavioral assertion: every picked-up email row produces a
  // notification mutation (no row silently left pending), and a throwing mailer
  // writes the email-sendpath health row with ok:false.
  // Drives runPipeline directly — catches BLOCKER 1 (early-return skips retry
  // flip, row stays pending) and BLOCKER 2 (catch sets attempt:false → dead-man
  // short-circuits). Must be impossible to pass vacuously.
  {
    // ── Mock helpers (minimal — only the paths this test reaches) ──
    function chain(): any {
      const self: any = {};
      self.eq = () => self; self.neq = () => self; self.in = () => self;
      self.is = () => self; self.lt = () => self; self.lte = () => self;
      self.contains = () => self; self.order = () => self;
      self.select = () => self; self.update = () => self;
      self.insert = async () => ({ error: null });
      self.limit = () => self;
      self.maybeSingle = async () => ({ data: null, error: null });
      self.upsert = async () => ({ error: null });
      self.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
      return self;
    }

    function mk(overrides?: Record<string, unknown>): any {
      return Object.assign(chain(), overrides ?? {});
    }

    const notifMuts: { id: string; status: string; attempts?: number }[] = [];
    const healthMutations: { provider: string; ok: boolean; last_error?: string | null }[] = [];

    type PendingRow = { id: string; tenant_id: string; user_id: string | null; channel: string; kind: string; payload: Record<string, unknown> };
    let currentPending: PendingRow[] = [];

    function makeDB(getUserReturnsEmail: boolean) {
      notifMuts.length = 0;
      healthMutations.length = 0;
      return {
        from: (table: string) => {
          if (table === "notification") {
            const n = mk();
            n.select = () => n;
            n.update = (vals: Record<string, unknown>) => {
              n.then = (resolve: (v: unknown) => void) => {
                // Track mutations by matching eq("id", ...) that was called
                resolve({ error: null });
              };
              // Track idVal from eq("id", ...)
              let idVal = "";
              n.eq = (c: string, v: string) => { if (c === "id") idVal = String(v); return n; };
              n.in = () => n;
              const origThen = n.then;
              n.then = (resolve: (v: unknown) => void) => {
                if (idVal) notifMuts.push({ id: idVal, status: vals.status as string, attempts: vals.attempts as number | undefined });
                resolve({ error: null });
              };
              return n;
            };
            n.then = (resolve: (v: unknown) => void) => resolve({ data: currentPending, error: null });
            return n;
          }
          if (table === "matter") {
            const m = mk();
            m.then = (resolve: (v: unknown) => void) => resolve({ data: [{ id: "m1" }], error: null });
            return m;
          }
          if (table === "outbound_email") {
            return mk({ insert: async () => ({ error: null }) });
          }
          if (table === "court_provider_health") {
            return mk({
              upsert: async (row: Record<string, unknown>) => {
                healthMutations.push({
                  provider: (row as any).provider,
                  ok: (row as any).ok,
                  last_error: (row as any).last_error,
                });
                return { error: null };
              },
            });
          }
          if (table === "profile") {
            return mk({ then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }) });
          }
          return mk();
        },
        auth: { admin: { getUserById: async () => ({ data: { user: getUserReturnsEmail ? { email: "test@test.com" } : null }, error: null }) } },
        rpc: async () => ({ data: null, error: null }),
      } as any;
    }

    class ThrowingMailer {
      readonly channel = "email";
      async send() { throw new Error("simulated provider crash"); }
    }

    class OkMailer {
      readonly channel = "email";
      async send() { return { ok: true, id: "em_ok" }; }
    }

    // ── (a) Unresolvable recipient → flipFailed writes the row out of pending ──
    {
      const row: PendingRow = {
        id: "r-a", tenant_id: "t1", user_id: "u1",
        channel: "email", kind: "case_update",
        payload: { matterId: "m1", title: "A v. B", change: "New order", court: "HC", cnr: "CNR1" },
      };
      currentPending = [row];
      setEnv({ RESEND_API_KEY: "re_test", FROM_EMAIL: "test@mukadma.in" });
      const { error: pipeErr } = await runPipeline(makeDB(false /* no user */), getMailer(), new Date("2026-08-11T10:00:00Z"));
      check("behavioral: unresolvable recipient → pipeline did not error", !pipeErr);
      const rowMut = notifMuts.find((m) => m.id === "r-a");
      check("behavioral: unresolvable recipient → row produced a mutation (not left pending)", !!rowMut);
      check("behavioral: unresolvable recipient → mutation status is 'failed'", rowMut?.status === "failed");
      check("behavioral: unresolvable recipient → attempts incremented", (rowMut?.attempts ?? 0) >= 1);
    }

    // ── (b) Throwing mailer → catch runs flipFailed + dead-man fires ──
    {
      const row: PendingRow = {
        id: "r-b", tenant_id: "t1", user_id: "u1",
        channel: "email", kind: "case_update",
        payload: { matterId: "m1", title: "B v. C", change: "New order", court: "HC", cnr: "CNR2" },
      };
      currentPending = [row];
      notifMuts.length = 0;
      healthMutations.length = 0;
      setEnv({ RESEND_API_KEY: "re_test", FROM_EMAIL: "test@mukadma.in" });
      const { error: pipeErr } = await runPipeline(makeDB(true /* user has email */), new ThrowingMailer() as any, new Date("2026-08-11T10:00:00Z"));
      check("behavioral: throwing mailer → pipeline did not error", !pipeErr);
      const rowMut = notifMuts.find((m) => m.id === "r-b");
      check("behavioral: throwing mailer → row produced a mutation (not left pending)", !!rowMut);
      check("behavioral: throwing mailer → mutation status is 'failed'", rowMut?.status === "failed");
      check("behavioral: throwing mailer → attempts incremented", (rowMut?.attempts ?? 0) >= 1);
      const dm = healthMutations.find((m) => m.provider === "email-sendpath");
      check("behavioral: throwing mailer → email-sendpath health row written", !!dm);
      check("behavioral: throwing mailer → health row ok is false", dm?.ok === false);
    }
  }
} finally {
  globalThis.fetch = realFetch;
  console.error = realError;
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
}

if (!ok) process.exit(1);
console.log("wo288_email_sendpath: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
