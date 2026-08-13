import { createHmac, timingSafeEqual } from "node:crypto";

// WO-416 · stateless, signed one-click-unsubscribe token — no table, no migration, no new env var.
// Mirrors the WO-411 share-token idiom (src/lib/court/share-token.ts) exactly:
//   uo-<base64url(payload)>.<base64url(hmac-sha256(payload))>
// Payload = { t: tenantId, u: profileId (notification_prefs.id), k: channel }. Signed server-only
// with SHARE_LINK_SECRET when set, else SUPABASE_SERVICE_ROLE_KEY (already required server-side) —
// createHmac + timingSafeEqual, fail-closed if BOTH are unset.
//
// No `exp` (amendment #3): an unsubscribe link must keep working for as long as the email lives in
// an inbox — an expired link returns 400 and the user hits spam instead, the exact damage this WO
// exists to prevent. Trade-off accepted and disclosed: a leaked token's blast radius is "someone
// turns off your notifications", which is recoverable in Settings; a dead unsubscribe link is not.
//
// "uo-" prefix (deliberately distinct from "ec-"): the two token families are NOT interchangeable —
// an ec- share token fails this verifier (wrong prefix ⇒ malformed), and a uo- token fails the
// share verifier. Asserted in tests/wo416_email_headers.ts.
const TOKEN_PREFIX = "uo-";

function signingSecret(): string {
  const s = process.env.SHARE_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("unsubscribe link signing secret is not configured");
  return s;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", signingSecret()).update(payloadB64).digest("base64url");
}

interface UnsubscribePayload { t: string; u: string; k: string }

export function signUnsubscribeToken(tenantId: string, profileId: string, channel: string): string {
  const payloadB64 = Buffer.from(
    JSON.stringify({ t: tenantId, u: profileId, k: channel } satisfies UnsubscribePayload),
    "utf8",
  ).toString("base64url");
  return `${TOKEN_PREFIX}${payloadB64}.${sign(payloadB64)}`;
}

export type UnsubscribeTokenResult =
  | { ok: true; tenantId: string; profileId: string; channel: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "unconfigured" };

export function verifyUnsubscribeToken(token: string): UnsubscribeTokenResult {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return { ok: false, reason: "malformed" };
  const body = token.slice(TOKEN_PREFIX.length);
  const dot = body.lastIndexOf(".");
  if (dot < 0) return { ok: false, reason: "malformed" };
  const payloadB64 = body.slice(0, dot);
  const sig = body.slice(dot + 1);
  if (!payloadB64 || !sig) return { ok: false, reason: "malformed" };

  let expected: string;
  try {
    expected = sign(payloadB64);
  } catch {
    return { ok: false, reason: "unconfigured" };
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };

  let payload: UnsubscribePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload.t !== "string" || typeof payload.u !== "string" || typeof payload.k !== "string") {
    return { ok: false, reason: "malformed" };
  }
  return { ok: true, tenantId: payload.t, profileId: payload.u, channel: payload.k };
}
