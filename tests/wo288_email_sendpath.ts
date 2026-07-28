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

  // ── route wiring (source): retry lane, terminal dead, fail-soft fallbacks, dead-man ──
  {
    const route = src("src/app/api/cron/notify/route.ts");
    check("route: retry pickup exists and is bounded", route.includes('.eq("status", "failed")') && route.includes('.lt("attempts", MAX_SEND_ATTEMPTS)'));
    check("route: retry pickup is email-only (WhatsApp seam untouched)", /eq\("status", "failed"\)\s*\n?\s*\.eq\("channel", "email"\)/.test(route.replace(/\s+/g, " ")) || route.includes('.eq("channel", "email")'));
    check("route: terminal dead flip with pre-apply fallback to 'failed'", route.includes('status: "dead"') && route.includes("if (deadErr)"));
    check("route: failure flip fail-soft (pre-apply plain 'failed')", route.includes("if (upErr)"));
    check("route: flips are status-guarded (idempotent)", route.includes('.in("status", ["pending", "failed"])'));
    check("route: send outcome logged WITH the provider error", route.includes("error: res.error"));
    check("route: dead-man row on court_provider_health (drill i)", route.includes('provider: "email-sendpath"') && route.includes("court_provider_health"));
    check("route: retryPlan drives the failure transition", route.includes("retryPlan(n.attempts)"));
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
