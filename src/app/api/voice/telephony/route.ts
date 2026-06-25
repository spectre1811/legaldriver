import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Telephony recording webhook (Exotel / Knowlarity / etc.) — GATED.
// Disabled by default: with no TELEPHONY_PROVIDER set we 200 quickly so providers
// don't retry, and nothing is stored. Wiring a provider is a follow-up.
//
// Security/PII notes: this runs with the service role (no user session), so we
// scope every write by tenant_id explicitly. Never log recording bodies/transcripts.
export async function POST(request: NextRequest) {
  const provider = process.env.TELEPHONY_PROVIDER;
  if (!provider) {
    // Not configured — acknowledge and do nothing.
    return NextResponse.json({ ok: true, configured: false });
  }

  // Providers post either form-encoded or JSON; accept both.
  let payload: Record<string, unknown> = {};
  const ct = request.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      payload = (await request.json()) as Record<string, unknown>;
    } else {
      const form = await request.formData();
      payload = Object.fromEntries([...form.entries()].map(([k, v]) => [k, typeof v === "string" ? v : ""]));
    }
  } catch {
    return NextResponse.json({ ok: false, error: "bad payload" }, { status: 400 });
  }

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

  // TODO(follow-up): number→tenant mapping. We need a lookup from the dialed/DID
  // number (to_number) to a tenant before this can file correctly. Until that
  // exists we cannot safely attribute the call to a tenant, so we no-op. When the
  // mapping table lands, resolve tenantId here, then resolve client by from_number
  // within that tenant and set client_id.
  const tenantId = await resolveTenantByDid(admin, toNumber);
  if (!tenantId) {
    return NextResponse.json({ ok: true, stored: false, reason: "no tenant mapping" });
  }

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

  return NextResponse.json({ ok: true, stored: true });
}

// Placeholder for the number→tenant mapping (follow-up). Returns null until a
// real mapping table exists, which keeps the webhook a safe no-op.
async function resolveTenantByDid(
  _admin: ReturnType<typeof createAdminClient>,
  _did: string | null,
): Promise<string | null> {
  // TODO(follow-up): SELECT tenant_id FROM telephony_number WHERE did = _did.
  return null;
}
