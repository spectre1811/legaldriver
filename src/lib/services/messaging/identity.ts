import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeE164 } from "@/lib/phone";
import { sendOpsAlert, type OpsAlertResult } from "@/lib/ops/alert";

// WO-311 · Receiving-identity → tenant resolution for UNAUTHENTICATED inbound
// webhooks. This is the whole tenancy boundary for inbound messaging.
//
// The rule: an inbound message is attributed to a tenant by a STORED MAPPING of
// the identity it arrived ON — never defaulted, never guessed, never derived
// from the sender. What it replaced — an env-named default tenant, else "the
// sole tenant row" — was safe only while exactly one tenant existed; the day
// firm #2 onboarded, every firm's client messages would have filed into one
// tenant's `msg_message` with nobody the wiser (tenancy audit 2026-07-30 §3
// row 1). The env name is deliberately not repeated anywhere in src/ so a grep
// for it stays the acceptance proof that the lever is gone.
//
// EVERY failure mode returns null. A miss, a malformed identity, a DB error, a
// table that doesn't exist yet (the migration is founder-gated and ships inert)
// — all of them mean "we do not know whose message this is", and the only safe
// answer to that is to write nothing and shout.

export type MessagingIdentityChannel = "whatsapp" | "telephony";

export type TenantResolutionReason =
  | "mapped" // a live mapping row exists
  | "no_identity" // the payload carried no usable receiving identity
  | "unmapped" // identity is real but no active mapping row exists (seed one)
  | "lookup_failed"; // the mapping table is unreachable / not yet applied

export interface TenantResolution {
  tenantId: string | null;
  reason: TenantResolutionReason;
  /** The normalized identity we looked up (PII-free: a business number/id). */
  identity: string | null;
  /** Short, PII-free diagnostic for the health row / alert. */
  detail?: string;
}

/** Health-surface key per channel — the durable record when routing fails. */
export const UNROUTED_PROVIDER: Record<MessagingIdentityChannel, string> = {
  whatsapp: "messaging-inbound",
  telephony: "telephony-inbound",
};

// Canonical form of a receiving identity.
//   whatsapp  — Meta's `phone_number_id`: an opaque, stable numeric id. Kept
//               verbatim (trimmed); it is NOT a phone number and must not be
//               coerced into E.164.
//   telephony — the dialed DID, a real number → E.164, so a mapping seeded as
//               "+919876543210" matches a provider posting "919876543210".
export function normalizeIdentity(
  channel: MessagingIdentityChannel,
  raw: string | null | undefined,
): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if (channel === "telephony") return normalizeE164(s) ?? s;
  return s;
}

// The mapping table is founder-gated (ships inert), so it is NOT in the
// generated `Database` types until it is applied and `npm run db:types` reruns.
// Reach it through an untyped view of the same client rather than hand-editing
// the generated file (repo rule: database.types.ts is generated, never edited).
type UntypedClient = SupabaseClient;
const untyped = (admin: unknown) => admin as UntypedClient;

export async function resolveTenantByIdentity(
  admin: unknown,
  channel: MessagingIdentityChannel,
  rawIdentity: string | null | undefined,
): Promise<TenantResolution> {
  const identity = normalizeIdentity(channel, rawIdentity);
  if (!identity) {
    return { tenantId: null, reason: "no_identity", identity: null, detail: "payload carried no receiving identity" };
  }

  try {
    const { data, error } = await untyped(admin)
      .from("messaging_identity")
      .select("tenant_id")
      .eq("channel", channel)
      .eq("identity", identity)
      .eq("active", true)
      .maybeSingle();

    if (error) {
      // Pre-apply this is "relation does not exist"; later it could be a real
      // outage. Both mean the same thing to us: we cannot prove ownership.
      return {
        tenantId: null,
        reason: "lookup_failed",
        identity,
        detail: `messaging_identity lookup failed: ${String(error.message ?? error).slice(0, 120)}`,
      };
    }
    const tenantId = typeof data?.tenant_id === "string" ? data.tenant_id : null;
    if (!tenantId) {
      return { tenantId: null, reason: "unmapped", identity, detail: "no active mapping for this receiving identity" };
    }
    return { tenantId, reason: "mapped", identity };
  } catch (e) {
    return {
      tenantId: null,
      reason: "lookup_failed",
      identity,
      detail: `messaging_identity lookup threw: ${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`,
    };
  }
}

export interface UnroutedInbound {
  channel: MessagingIdentityChannel;
  /** The receiving identity we could not map — a BUSINESS id, never a sender. */
  identity: string | null;
  reason: TenantResolutionReason;
  /** How many inbound messages were refused (they were NOT stored). */
  messages: number;
  /** Wire provider name, for the operator ("whatsapp_bsp", "exotel", …). */
  provider?: string;
  detail?: string;
}

export interface UnroutedRecord {
  /** Did the durable record land? */
  recorded: boolean;
  alert: OpsAlertResult;
  /** The health-surface key the record was written under. */
  providerKey: string;
}

// The fail-closed landing pad: ONE durable record + ONE alert, per unroutable
// receiving identity per delivery.
//
// Durable record = a `court_provider_health` row, the estate's established
// dead-man surface (WO-63 deploy-freshness, WO-288 email-sendpath, WO-286
// refresh-cron all use it, and the settings diagnostics screen already renders
// it). Reusing it beats a new table: the operator's question is "is inbound
// messaging healthy, and which identity needs seeding?", which is exactly one
// row's worth of state, bounded forever — an unrouted-message ledger would grow
// with attacker/provider traffic and need its own retention owner.
//
// Alert = the shared GChat forwarder, so a mis-routed client message is loud at
// 3am rather than discovered months later. Best-effort by design: the record is
// the source of truth, the alert is the notification.
//
// PII: `identity` is the FIRM's own number/id. The sender's number and the
// message body never leave the request.
export async function recordUnroutedInbound(admin: unknown, u: UnroutedInbound): Promise<UnroutedRecord> {
  const providerKey = UNROUTED_PROVIDER[u.channel];
  const summary = {
    channel: u.channel,
    identity: u.identity,
    reason: u.reason,
    messages: u.messages,
    provider: u.provider ?? null,
    at: new Date().toISOString(),
  };

  let recorded = false;
  try {
    const { error } = await untyped(admin)
      .from("court_provider_health")
      .upsert(
        {
          provider: providerKey,
          ok: false,
          last_error: JSON.stringify(summary).slice(0, 200),
          updated_at: summary.at,
        },
        { onConflict: "provider" },
      );
    recorded = !error;
  } catch {
    recorded = false;
  }

  const alert = await sendOpsAlert({
    source: providerKey,
    severity: "critical",
    summary:
      `Inbound ${u.channel} message refused: no tenant mapping for receiving identity ` +
      `${u.identity ?? "(none)"} (${u.reason}). ${u.messages} message(s) NOT stored.`,
    detail: {
      channel: u.channel,
      identity: u.identity,
      reason: u.reason,
      messages: u.messages,
      provider: u.provider ?? null,
      durable_record: recorded ? `court_provider_health/${providerKey}` : "FAILED to write health row",
      action: "seed messaging_identity (channel, identity) → tenant_id, then the provider's retry/resend will file correctly",
      ...(u.detail ? { detail: u.detail.slice(0, 160) } : {}),
    },
  });

  return { recorded, alert, providerKey };
}

// Mark the channel healthy again after a delivery that DID route. Keeps the
// health surface honest (an old failure must not read as a live outage forever)
// and gives the operator a "last good inbound" timestamp. Best-effort.
export async function recordRoutedInbound(admin: unknown, channel: MessagingIdentityChannel): Promise<void> {
  const now = new Date().toISOString();
  try {
    await untyped(admin)
      .from("court_provider_health")
      .upsert(
        {
          provider: UNROUTED_PROVIDER[channel],
          ok: true,
          last_error: null,
          last_ok_at: now,
          updated_at: now,
        },
        { onConflict: "provider" },
      );
  } catch {
    // best-effort: the response payload still carries the honest counters.
  }
}
