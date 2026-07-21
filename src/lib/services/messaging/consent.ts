import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeE164 } from "@/lib/phone";

// WO-144 W2 — the ONE consent seam (DPDP). Every WhatsApp send is gated here
// (fail closed: no open 'service' grant ⇒ no send) and every STOP lands here.
//
// NUMBERS: every `number` argument is normalized to E.164 INSIDE this seam —
// callers may pass raw provider ids (Meta's wa_id is bare digits, no "+"); the
// ledger always stores and matches canonical E.164. Unparseable ⇒ fail closed
// (checkConsent false, record* no-op).
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
  const n = normalizeE164(number);
  if (!n) return false;
  const { data } = await db
    .from("consent_ledger")
    .select("id")
    .eq("number", n)
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
  const n = normalizeE164(opts.number);
  if (!n) return;
  if (await checkConsent(db, n, opts.purpose)) return;
  await db.from("consent_ledger").insert({
    tenant_id: opts.tenantId,
    number: n,
    purpose: opts.purpose,
    source: opts.source,
    wording_version: opts.wordingVersion ?? "v1",
  });
}

// Close open grants for the number. Default (no purpose) = ALL purposes —
// STOP is global + instant. Pass a purpose for a scoped revoke (e.g. settings
// turning the service channel off must not touch a marketing grant).
export async function recordOptOut(db: DB, number: string, purpose?: ConsentPurpose): Promise<void> {
  const n = normalizeE164(number);
  if (!n) return;
  let q = db
    .from("consent_ledger")
    .update({ opt_out_at: new Date().toISOString() })
    .eq("number", n)
    .is("opt_out_at", null);
  if (purpose) q = q.eq("purpose", purpose);
  await q;
}

// The send gate: outbound WhatsApp requires an open 'service' grant.
export async function canSendWhatsApp(db: DB, to: string): Promise<boolean> {
  return checkConsent(db, to, "service");
}
