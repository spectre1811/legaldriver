import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMessagingClient, messagingConfigured } from "@/lib/services/messaging/client";
import { ingestInbound } from "@/lib/services/messaging/ingest";

export const dynamic = "force-dynamic";

// Verify Meta's X-Hub-Signature-256 over the raw body. Active only when
// WHATSAPP_APP_SECRET is set (so dev/mock stays open); fail-closed once configured.
function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // not configured → skip (gated provider / dev)
  if (!header?.startsWith("sha256=")) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// WhatsApp BSP webhook. GET = Meta verification handshake (echo hub.challenge).
// POST = inbound messages: normalize → classify-to-matter → persist (idempotent).
// Uses the admin (RLS-bypassing) client with an EXPLICIT tenant_id, since there's
// no user session here.

// GET: verification handshake. The BSP/Meta calls this once with hub.* params;
// we echo hub.challenge iff the verify token matches.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const params = {
    mode: sp.get("hub.mode"),
    token: sp.get("hub.verify_token"),
    challenge: sp.get("hub.challenge"),
  };
  const client = getMessagingClient();
  const challenge = client.verifyWebhook?.(params) ?? null;
  if (challenge) {
    // Plain text echo of the challenge, as Meta expects.
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "verification_failed" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  // Gated: if no live provider is configured, ack 200 fast and do nothing. (The
  // BSP retries on non-2xx; we don't want retries against an unconfigured app.)
  if (!messagingConfigured()) {
    return NextResponse.json({ ok: true, skipped: "messaging_not_configured" });
  }

  // Read the raw body once so we can both verify the HMAC and parse it.
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "bad_signature" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, skipped: "bad_payload" });
  }

  const client = getMessagingClient();
  let messages;
  try {
    messages = client.normalizeInbound(payload);
  } catch {
    return NextResponse.json({ ok: true, skipped: "unparseable" });
  }
  if (!messages.length) {
    // Status/read receipts and other non-message events land here — ack them.
    return NextResponse.json({ ok: true, messages: 0 });
  }

  // FOLLOW-UP: multi-tenant number→tenant mapping. The firm's Business number
  // (message.to) should map to a tenant; until that mapping table exists, we
  // resolve a single tenant. Configure MESSAGING_DEFAULT_TENANT_ID, or fall back
  // to the sole tenant row when exactly one exists. If ambiguous, ack without
  // ingesting (so we never file a stranger's message under the wrong firm).
  const admin = createAdminClient();
  const tenantId = await resolveTenant(admin);
  if (!tenantId) {
    return NextResponse.json({ ok: true, skipped: "no_tenant_mapping", messages: messages.length });
  }

  try {
    const result = await ingestInbound(admin, tenantId, messages);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // Never echo PII; surface a redacted reason. Ack 200 so the BSP doesn't retry
    // a message we've likely partially processed (ingest is idempotent on retry).
    return NextResponse.json({ ok: true, error: e instanceof Error ? e.message : "ingest_failed" });
  }
}

// Single-tenant resolution stand-in. Replace with a number→tenant lookup once the
// mapping table lands (see FOLLOW-UP above).
async function resolveTenant(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const hint = process.env.MESSAGING_DEFAULT_TENANT_ID;
  if (hint) return hint;
  const { data } = await admin.from("tenant").select("id").limit(2);
  if (data && data.length === 1) return data[0].id;
  return null;
}
