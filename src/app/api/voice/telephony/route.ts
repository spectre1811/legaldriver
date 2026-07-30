import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseTelephonyBody,
  readTelephonySignature,
  verifyTelephonySignature,
} from "@/lib/services/messaging/telephony";
import {
  UNROUTED_PROVIDER,
  recordRoutedInbound,
  recordUnroutedInbound,
  resolveTenantByIdentity,
} from "@/lib/services/messaging/identity";

export const dynamic = "force-dynamic";

// Telephony recording webhook (Exotel / Knowlarity / etc.) — GATED.
// Disabled by default: with no TELEPHONY_PROVIDER set we 200 quickly so providers
// don't retry, and nothing is stored. Wiring a provider is a follow-up.
//
// Security/PII notes: this runs with the service role (no user session), so we
// scope every write by tenant_id explicitly. Never log recording bodies/transcripts.
//
// WO-311 hardening — two holes closed while this was still a stub:
//   1. NO AUTHENTICATION. The route had zero signature verification, so the day a
//      provider was configured, anyone could POST `voice_recording` rows. Now:
//      HMAC-SHA256 over the raw body, or a hard 503 refusal when no verifier is
//      configured. There is no "trust the internet" branch.
//   2. TENANT GUESSING. `resolveTenantByDid()` was a `return null` placeholder
//      destined to grow the same env-default heuristic the WhatsApp webhook had.
//      It now reads the `messaging_identity` mapping on the DIALED DID, and a
//      miss writes nothing, records, and alerts.
export async function POST(request: NextRequest) {
  const provider = process.env.TELEPHONY_PROVIDER;
  if (!provider) {
    // Not configured — acknowledge and do nothing.
    return NextResponse.json({ ok: true, configured: false });
  }

  // Raw body first: the HMAC is computed over the exact bytes the provider sent.
  const rawBody = await request.text();
  const verdict = verifyTelephonySignature(rawBody, readTelephonySignature(request.headers));

  if (verdict.reason === "no_secret") {
    // A provider is wired but we cannot authenticate its calls. Refuse LOUDLY and
    // durably (bounded: one health row, not one alert per request — a
    // misconfigured deploy would otherwise storm the alert channel), and tell the
    // provider to come back later rather than pretending success.
    console.error("[telephony] TELEPHONY_PROVIDER is set but TELEPHONY_WEBHOOK_SECRET is not — refusing every call.");
    try {
      const admin = createAdminClient();
      await admin.from("court_provider_health").upsert(
        {
          provider: UNROUTED_PROVIDER.telephony,
          ok: false,
          last_error: `telephony webhook refused: TELEPHONY_WEBHOOK_SECRET unset for provider ${provider}`.slice(0, 200),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "provider" },
      );
    } catch {
      // The 503 + the server log are still an honest signal.
    }
    return NextResponse.json(
      { ok: false, error: "telephony_verifier_unconfigured" },
      { status: 503, headers: { "Retry-After": "3600" } },
    );
  }
  if (!verdict.ok) {
    // Unauthenticated caller. No DB write and no alert: the signature is
    // attacker-controlled, so alerting here would be free amplification.
    return NextResponse.json({ ok: false, error: "bad_signature" }, { status: 401 });
  }

  // Providers post either form-encoded or JSON; both are decoded from the raw text.
  const payload = parseTelephonyBody(rawBody, request.headers.get("content-type"));

  const str = (k: string) => {
    const v = payload[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  // Common field names across Exotel/Knowlarity. Adjust per provider when wiring.
  const recordingUrl = str("RecordingUrl") ?? str("recording_url") ?? str("recordingUrl");
  const fromNumber = str("From") ?? str("from") ?? str("caller_id_number");
  const toNumber = str("To") ?? str("to") ?? str("call_to_number");
  const externalId = str("CallSid") ?? str("call_id") ?? str("uuid");
  const durationRaw = str("RecordingDuration") ?? str("duration");
  const duration = durationRaw ? Math.round(Number(durationRaw)) || null : null;

  const admin = createAdminClient();

  // WO-311 · The DIALED DID (the firm's line the caller rang) is the routing key
  // — never the caller's own number, which is both PII and caller-controlled. A
  // miss stores nothing and is recorded + alerted like the WhatsApp path.
  const resolution = await resolveTenantByIdentity(admin, "telephony", toNumber);
  if (!resolution.tenantId) {
    await recordUnroutedInbound(admin, {
      channel: "telephony",
      identity: resolution.identity,
      reason: resolution.reason,
      messages: 1,
      provider,
      detail: resolution.detail,
    });
    // 200: the call already happened; retrying will not make the mapping appear.
    return NextResponse.json({ ok: true, stored: false, reason: "no_tenant_mapping" });
  }
  const tenantId = resolution.tenantId;

  // Resolve client by caller number within the tenant (best-effort auto-tag).
  let clientId: string | null = null;
  if (fromNumber) {
    const { data: client } = await admin
      .from("client")
      .select("id")
      .eq("tenant_id", tenantId)
      .contains("phones", [fromNumber])
      .limit(1)
      .maybeSingle();
    clientId = client?.id ?? null;
  }

  // Note: recordingUrl is the provider's URL. A follow-up job should download the
  // audio into our private 'documents' bucket under voice/ and set storage_path.
  // For now we record external_id + provider so the recording is tracked.
  const { error } = await admin.from("voice_recording").insert({
    tenant_id: tenantId,
    source: "telephony",
    provider,
    external_id: externalId,
    from_number: fromNumber,
    to_number: toNumber,
    duration_sec: duration,
    client_id: clientId,
    // Telephony recordings carry recorded-line consent obligations; provider-side
    // IVR disclosure is assumed. Mark disclosed; revisit per provider config.
    consent_disclosed: true,
    status: "uploaded",
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await recordRoutedInbound(admin, "telephony");
  return NextResponse.json({ ok: true, stored: true, recorded: Boolean(recordingUrl) });
}
