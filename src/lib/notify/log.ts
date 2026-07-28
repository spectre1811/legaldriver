import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

type DB = SupabaseClient<Database>;

// Record an outbound email so it shows in the Communications timeline (two-way)
// and, per WO-288 (a), so EVERY send attempt leaves a queryable row — including
// failures (provider error captured verbatim) and system sends with no tenant
// (tenantId: null, e.g. the request-access founder notify; service-role only).
// No PII beyond subject + recipient. Never throws into the send path — but a lost
// log line is itself error-logged (silent loss is how the 2026-07-26 outage hid).
export async function logOutboundEmail(
  sb: DB,
  opts: {
    tenantId: string | null;
    to: string;
    subject?: string | null;
    kind?: string;
    matterId?: string | null;
    clientId?: string | null;
    ok: boolean;
    providerId?: string | null;
    error?: string | null;
  },
): Promise<void> {
  const legacy = {
    tenant_id: opts.tenantId,
    to_addr: opts.to,
    subject: opts.subject ?? null,
    kind: opts.kind ?? "other",
    matter_id: opts.matterId ?? null,
    client_id: opts.clientId ?? null,
    status: opts.ok ? "sent" : "failed",
    provider_id: opts.providerId ?? null,
  };
  try {
    let { error } = await sb.from("outbound_email").insert({ ...legacy, error: opts.error ?? null });
    // Pre-migration schema (no `error` column): degrade to the legacy row shape so
    // the merge stays inert-safe. (A NULL tenantId also needs the migration; skip.)
    if (error && opts.tenantId) ({ error } = await sb.from("outbound_email").insert(legacy));
    if (error) {
      console.error(
        `[mailer] outbound_email log failed (${error.message}) — ${legacy.status} to *@${opts.to.split("@")[1] ?? "?"}${opts.error ? ` err=${opts.error}` : ""}`,
      );
    }
  } catch (e) {
    console.error(`[mailer] outbound_email log threw — ${legacy.status} to *@${opts.to.split("@")[1] ?? "?"}`, e);
  }
}
