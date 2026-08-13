import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const CRON_LOCK_TTL = 900;

// WO-378 — the lease is STOLEN, not respected, once it expires (`try_acquire_cron_lock` updates
// where `lease_until < now()`), and nothing stopped the run that was still in flight: it kept
// sending alongside its thief. These two constants make the holder fence itself.
//
// Stop this many ms BEFORE our own lease expires. Must exceed the longest single operation a
// fenced loop can BEGIN (a send is capped at NOTIFY_SEND_TIMEOUT_MS = 10s, plus its two ~215ms
// DB writes), so nothing started inside the lease is still in flight when a thief may acquire.
const LEASE_MARGIN_MS = 30_000;
// How often to re-read the holder from the DB. The deadline above is the actual fence — a thief
// can only acquire AFTER `lease_until`, so stopping before it is sufficient — and this read only
// catches clock skew or an out-of-band lease change. Measured 2026-08-12 from the web box: one
// PostgREST read = ~215ms, so checking per row at 300 rows would be ~65s of pure overhead (+20%
// run time) to re-answer what the deadline already answers. Throttled, not per-row.
const LEASE_CONFIRM_MS = 30_000;

type LeaseRow = { holder?: string | null };

export type CronLockClient = {
  rpc: (fn: string, params: Record<string, unknown>) => Promise<{
    data: unknown;
    error: null | { code?: string; message: string };
  }>;
  from: (table: string) => {
    upsert: (
      values: Record<string, unknown>,
      opts: { onConflict: string },
    ) => Promise<{ error: null }>;
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{ data: LeaseRow | null; error: null | { message: string } }>;
      };
    };
  };
};

/**
 * WO-378: handed to every cron handler. A long-running handler MUST call `ok()` before each
 * unit of externally-visible work (a send, a webhook, a write to a third party); `false` means
 * this run no longer owns its lease and must stop at once — another run has it, or will.
 */
export type CronLease = { ok: () => Promise<boolean> };

// No lock in force (flag off, or the lock system unavailable ⇒ pass-through): the handler runs
// exactly as it did before WO-355, so the fence must not stop it.
const OPEN_LEASE: CronLease = { ok: async () => true };

function makeLease(
  c: CronLockClient,
  jobName: string,
  holder: string,
  expiresAt: number,
): CronLease {
  let confirmedAt = Date.now();
  let stopped = false;
  const stop = (why: string) => {
    if (!stopped) console.warn(`[cron-lock] FENCED ${jobName} — ${why}; stopping this run (holder ${holder.slice(0, 8)})`);
    stopped = true;
    return false;
  };
  return {
    ok: async () => {
      if (stopped) return false;
      const leftMs = expiresAt - Date.now();
      if (leftMs <= LEASE_MARGIN_MS) return stop(`lease expires in ${Math.round(leftMs / 1000)}s`);
      if (Date.now() - confirmedAt < LEASE_CONFIRM_MS) return true;
      try {
        const { data, error } = await c.from("cron_lock").select("holder").eq("job_name", jobName).maybeSingle();
        // Fail CLOSED: an unverifiable lease is not a held lease. Rows stay queued and the next
        // run (5 min) picks them up — cheaper than a duplicate delivery to a real client.
        if (error) return stop(`holder re-read failed: ${error.message}`);
        if (data?.holder !== holder) return stop(`lease taken by another run`);
      } catch (e) {
        return stop(`holder re-read threw: ${e instanceof Error ? e.message : String(e)}`);
      }
      confirmedAt = Date.now();
      return true;
    },
  };
}

const warnedJobs = new Set<string>();

export async function withCronLock(
  jobName: string,
  handler: (lease: CronLease) => Promise<Response>,
  _client?: CronLockClient,
): Promise<Response> {
  if (process.env.CRON_LOCK !== "1") return handler(OPEN_LEASE);

  const holder = crypto.randomUUID();
  if (!_client) {
    try {
      _client = createAdminClient() as unknown as CronLockClient;
    } catch {
      warnOnce(jobName, `createAdminClient failed — pass-through`);
      return handler(OPEN_LEASE);
    }
  }
  const c = _client;

  let acquired = false;
  try {
    // Sampled BEFORE the rpc so our deadline can only be EARLIER than the DB's `lease_until`
    // (= db_now + TTL, and db_now is after this line) — never later. Fencing early is safe;
    // fencing late is the bug.
    const acquiredAt = Date.now();
    const { data, error } = await c.rpc("try_acquire_cron_lock", {
      p_job: jobName,
      p_holder: holder,
      p_ttl_seconds: CRON_LOCK_TTL,
    });

    if (error) {
      warnOnce(jobName, `rpc error — pass-through: ${error.message}`);
      return handler(OPEN_LEASE);
    }

    const row = data as { acquired?: boolean; stale?: boolean } | null;
    const gotLock = row?.acquired === true;
    const isStale = row?.stale === true;

    if (!gotLock) {
      console.log(`[cron-lock] lock-skip ${jobName} — another run active`);
      try {
        await c.from("court_provider_health").upsert(
          {
            provider: `cron-lock:${jobName}`,
            ok: true,
            last_error: `skip`,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "provider" },
        );
      } catch {
        /* best-effort */
      }
      return NextResponse.json({ ok: true, lock_skip: true, job: jobName });
    }

    if (isStale) {
      console.log(
        `[cron-lock] stale-lease steal ${jobName} — previous run likely crashed or overran TTL`,
      );
      try {
        await c.from("court_provider_health").upsert(
          {
            provider: `cron-lock:${jobName}`,
            ok: true,
            last_error: `stale`,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "provider" },
        );
      } catch {
        /* best-effort */
      }
    }

    acquired = true;
    return await handler(makeLease(c, jobName, holder, acquiredAt + CRON_LOCK_TTL * 1000));
  } catch (err: unknown) {
    if (acquired) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[cron-lock] error for ${jobName} — pass-through: ${msg}`);
    return handler(OPEN_LEASE);
  } finally {
    if (acquired) {
      try {
        await c.rpc("release_cron_lock", { p_job: jobName, p_holder: holder });
      } catch {
        /* lease auto-expires */
      }
    }
  }
}

function warnOnce(jobName: string, msg: string) {
  if (warnedJobs.has(jobName)) {
    console.debug(`[cron-lock] ${jobName} — ${msg}`);
    return;
  }
  warnedJobs.add(jobName);
  console.warn(`[cron-lock] ${jobName} — ${msg}`);
}
