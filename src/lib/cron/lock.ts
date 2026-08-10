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

export async function withCronLock(
  jobName: string,
  handler: () => Promise<Response>,
  _client?: CronLockClient,
): Promise<Response> {
  const lockEnabled = process.env.CRON_LOCK;
  if (!lockEnabled) return handler();

  const c: CronLockClient = _client ?? (createAdminClient() as unknown as CronLockClient);
  const holder = crypto.randomUUID();

  let acquired = false;
  try {
    const { data, error } = await c.rpc("try_acquire_cron_lock", {
      p_job: jobName,
      p_holder: holder,
      p_ttl_seconds: CRON_LOCK_TTL,
    });

    if (error) {
      console.warn(
        `[cron-lock] rpc error for ${jobName} — pass-through: ${error.message}`,
      );
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
            provider: "cron-lock",
            ok: true,
            last_error: `lock-skip:${jobName}`,
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
            provider: "cron-lock",
            ok: true,
            last_error: `lease-expiry:${jobName}`,
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
