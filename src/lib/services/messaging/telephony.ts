import { createHmac, timingSafeEqual } from "node:crypto";

// WO-311 · Telephony webhook verification.
//
// The state this replaced: `/api/voice/telephony` had NO signature check at all
// (the WhatsApp route has had HMAC since day one). It was survivable only
// because the route was a no-op stub — but the moment TELEPHONY_PROVIDER is set,
// an unauthenticated POST could write `voice_recording` rows. So: verify, or
// hard-refuse. There is no third option, and there is no "open in dev" hole —
// the route is inert until a provider is configured, and once it is configured
// the secret is mandatory.
//
// Shape: HMAC-SHA256 over the RAW request body, hex, compared timing-safely.
// Exotel/Knowlarity do not all ship a native HMAC, so the shared secret is ours:
// configure the provider to send it (a signing webhook, or a proxy in front),
// and until that exists the route refuses rather than trusting the internet.

/** Header names we accept the signature on, in priority order. */
export const TELEPHONY_SIGNATURE_HEADERS = [
  "x-telephony-signature",
  "x-webhook-signature",
  "x-hub-signature-256",
] as const;

export type TelephonyVerifyReason = "ok" | "no_secret" | "missing_signature" | "bad_signature";

export interface TelephonyVerifyResult {
  ok: boolean;
  reason: TelephonyVerifyReason;
}

/** Read the signature off whichever accepted header carries it. */
export function readTelephonySignature(headers: Headers): string | null {
  for (const h of TELEPHONY_SIGNATURE_HEADERS) {
    const v = headers.get(h);
    if (v && v.trim()) return v.trim();
  }
  return null;
}

export function verifyTelephonySignature(
  rawBody: string,
  signature: string | null,
  secret = process.env.TELEPHONY_WEBHOOK_SECRET,
): TelephonyVerifyResult {
  // NO silent-open branch. Unlike the WhatsApp route (whose HMAC is skipped when
  // WHATSAPP_APP_SECRET is unset so the mock/dev path stays usable), telephony
  // has no mock lane — an unconfigured secret means the caller cannot be
  // authenticated, and the route must refuse.
  if (!secret) return { ok: false, reason: "no_secret" };
  if (!signature) return { ok: false, reason: "missing_signature" };

  const provided = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(provided.toLowerCase());
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return { ok, reason: ok ? "ok" : "bad_signature" };
}

/**
 * Parse a verified telephony body. Providers post JSON or form-urlencoded; we
 * read the RAW text first (the HMAC is over the raw bytes), so the form path is
 * decoded here rather than via request.formData().
 */
export function parseTelephonyBody(rawBody: string, contentType: string | null): Record<string, unknown> {
  if ((contentType ?? "").includes("application/json")) {
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  // Default to urlencoded (Exotel/Knowlarity's usual shape). Multipart is not
  // supported on purpose: no provider we integrate posts it, and it cannot be
  // parsed from raw text without pulling in a parser.
  const out: Record<string, unknown> = {};
  for (const [k, v] of new URLSearchParams(rawBody).entries()) out[k] = v;
  return out;
}
