import type { SupabaseClient } from "@supabase/supabase-js";

// WO-144 W2 — the ONE consent seam (DPDP). Every WhatsApp send is gated here
// (fail closed: no open 'service' grant ⇒ no send) and every STOP lands here.
//
// TYPE NOTE: consent_ledger is deliberately NOT in the generated Database types —
// the W2 migration is written but founder-gated and unapplied, and `npm run
// db:types` regenerates only from the LIVE schema. So this module (and ONLY this
// module) treats the client as untyped for consent_ledger queries; callers keep
// passing their normally-typed clients. After the founder-approved apply +
// db:types regen, drop this cast and use the generated row types.
type DB = SupabaseClient<any>;

export type ConsentPurpose = "service" | "marketing";

// Pure STOP detector: the trimmed body is exactly "stop" or "unsubscribe"
// (case-insensitive), optionally with a trailing "." or "!". Anything longer
// ("please stop calling") is a real message, not an opt-out.
export function isStopMessage(body: string | null | undefined): boolean {
  if (!body) return false;
  return /^(stop|unsubscribe)[.!]?$/i.test(body.trim());
}

// Is there an open (not opted-out) grant for this number+purpose?
export async function checkConsent(db: DB, number: string, purpose: ConsentPurpose): Promise<boolean> {
  const { data } = await (db as DB)
    .from("consent_ledger")
    .select("id")
    .eq("number", number)
    .eq("purpose", purpose)
    .is("opt_out_at", null)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

// Record a consent grant. Dedupe: when an open grant for (number, purpose)
// already exists, this is a no-op — the ledger stays one-row-per-grant.
export async function recordConsent(
  db: DB,
  opts: { tenantId: string | null; number: string; purpose: ConsentPurpose; source: string; wordingVersion?: string },
): Promise<void> {
  if (await checkConsent(db, opts.number, opts.purpose)) return;
  await db.from("consent_ledger").insert({
    tenant_id: opts.tenantId,
    number: opts.number,
    purpose: opts.purpose,
    source: opts.source,
    wording_version: opts.wordingVersion ?? "v1",
  });
}

// STOP is global + instant: close ALL open grants for the number, every purpose.
export async function recordOptOut(db: DB, number: string): Promise<void> {
  await db
    .from("consent_ledger")
    .update({ opt_out_at: new Date().toISOString() })
    .eq("number", number)
    .is("opt_out_at", null);
}

// The send gate: outbound WhatsApp requires an open 'service' grant.
export async function canSendWhatsApp(db: DB, to: string): Promise<boolean> {
  return checkConsent(db, to, "service");
}
