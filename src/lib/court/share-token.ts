import { createHmac, timingSafeEqual } from "node:crypto";

// WO-411 · stateless, signed case-share links — no `share_token` table, no migration (this repo
// founder-gates DB/RLS changes; see the WO). The token IS the state:
//   ec-<base64url(payload)>.<base64url(hmac-sha256(payload))>
// scoped to exactly one tenant+case and time-boxed by an embedded `exp`. Signed server-only with
// SHARE_LINK_SECRET when set, else SUPABASE_SERVICE_ROLE_KEY (already required in every real
// deployment for src/lib/supabase/admin.ts) — so it works with no new *required* env var, and can
// be decoupled from the service-role key by setting the dedicated one. Never sent to the browser.
// Mirrors the codebase's existing HMAC-webhook idiom (src/lib/services/messaging/telephony.ts,
// src/app/api/messaging/whatsapp/route.ts): createHmac + timingSafeEqual, fail-closed if unset.
//
// "ec-" prefix (not raw hex): both the payload and the signature are base64url, so nothing in a
// share link is ever a bare hex string.
//
// A real, disclosed limitation of "stateless": there is no server-side revoke. A link works until
// its embedded expiry, full stop, even if the advocate who created it wants it gone sooner — the
// Share dialog says this outright rather than offering a "revoke" that would not actually work.
const TOKEN_PREFIX = "ec-";
export const SHARE_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function signingSecret(): string {
  // Prefer a dedicated, least-privilege secret; fall back to SUPABASE_SERVICE_ROLE_KEY (already
  // required server-side in every deployment) so this works with no new *required* env var. Setting
  // SHARE_LINK_SECRET later decouples share links from the service-role key — so rotating that key
  // (e.g. in an incident) no longer silently invalidates every live link. Fail-closed if BOTH are
  // unset — never sign or verify with an empty secret.
  const s = process.env.SHARE_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("share link signing secret is not configured");
  return s;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", signingSecret()).update(payloadB64).digest("base64url");
}

interface SharePayload { t: string; m: string; exp: number }

export function signShareToken(tenantId: string, matterId: string, ttlSeconds = SHARE_TOKEN_TTL_SECONDS): { token: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payloadB64 = Buffer.from(JSON.stringify({ t: tenantId, m: matterId, exp } satisfies SharePayload), "utf8").toString("base64url");
  return { token: `${TOKEN_PREFIX}${payloadB64}.${sign(payloadB64)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export type ShareTokenResult =
  | { ok: true; tenantId: string; matterId: string; expiresAt: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "unconfigured" };

export function verifyShareToken(token: string): ShareTokenResult {
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

  let payload: SharePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload.t !== "string" || typeof payload.m !== "string" || typeof payload.exp !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (Math.floor(Date.now() / 1000) > payload.exp) return { ok: false, reason: "expired" };
  return { ok: true, tenantId: payload.t, matterId: payload.m, expiresAt: new Date(payload.exp * 1000).toISOString() };
}
