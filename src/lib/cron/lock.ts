import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const CRON_LOCK_TTL = 900;

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
  };
};

const warnedJobs = new Set<string>();

export async function withCronLock(
  jobName: string,
  handler: () => Promise<Response>,
  _client?: CronLockClient,
): Promise<Response> {
  if (process.env.CRON_LOCK !== "1") return handler();

  const holder = crypto.randomUUID();
  if (!_client) {
    try {
      _client = createAdminClient() as unknown as CronLockClient;
    } catch {
      warnOnce(jobName, `createAdminClient failed — pass-through`);
      return handler();
    }
  }
  const c = _client;

  let acquired = false;
  try {
    const { data, error } = await c.rpc("try_acquire_cron_lock", {
      p_job: jobName,
      p_holder: holder,
      p_ttl_seconds: CRON_LOCK_TTL,
    });

    if (error) {
      warnOnce(jobName, `rpc error — pass-through: ${error.message}`);
      return handler();
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
    return await handler();
  } catch (err: unknown) {
    if (acquired) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[cron-lock] error for ${jobName} — pass-through: ${msg}`);
    return handler();
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
