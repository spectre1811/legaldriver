import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMessagingClient, messagingConfigured } from "@/lib/services/messaging/client";
import { ingestInbound } from "@/lib/services/messaging/ingest";
import type { InboundMessage } from "@/lib/services/messaging/types";
import {
  recordRoutedInbound,
  recordUnroutedInbound,
  resolveTenantByIdentity,
} from "@/lib/services/messaging/identity";

export const dynamic = "force-dynamic";

// Verify Meta's X-Hub-Signature-256 over the raw body. WO-311: on the LIVE path
// the secret is mandatory — the POST handler refuses before reaching here when
// `messagingConfigured()` is true and WHATSAPP_APP_SECRET is unset, so the
// no-secret branch below is only ever the mock/dev lane (which never routes to a
// tenant either, because routing needs a `messaging_identity` row).
function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // dev/mock only — the live path refuses above
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

  // WO-311 · A LIVE provider with no app secret means every "inbound message" is
  // just an unauthenticated POST — anyone who learns a mapped phone_number_id
  // could inject messages into that firm's inbox. Refuse instead of trusting it.
  // (Symmetric with the telephony route; the mock/dev lane is untouched because
  // messagingConfigured() is false there.)
  if (!process.env.WHATSAPP_APP_SECRET) {
    console.error("[whatsapp] MESSAGING_PROVIDER is live but WHATSAPP_APP_SECRET is unset — refusing every inbound.");
    return NextResponse.json(
      { ok: false, error: "signature_verifier_unconfigured" },
      { status: 503, headers: { "Retry-After": "3600" } },
    );
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

  // WO-311 · Tenant attribution. ONE rule: the message belongs to whoever owns
  // the RECEIVING identity it arrived on (Meta's `phone_number_id`), per the
  // stored `messaging_identity` mapping. No env default, no "the sole tenant
  // row", no sender-derived guess — those made a second firm's onboarding
  // silently leak every firm's client messages into one tenant.
  //
  // One delivery can legitimately carry entries for more than one WABA number,
  // so resolve PER receiving identity and route each group independently. An
  // unmapped group is refused whole: nothing is written, and it gets exactly one
  // durable record + one alert.
  const admin = createAdminClient();
  const groups = groupByReceivingIdentity(messages);

  let received = 0;
  let inserted = 0;
  let duplicates = 0;
  let filed = 0;
  let refused = 0;
  let routedGroups = 0;
  const errors: string[] = [];

  for (const [identity, group] of groups) {
    const resolution = await resolveTenantByIdentity(admin, "whatsapp", identity || null);
    if (!resolution.tenantId) {
      refused += group.length;
      await recordUnroutedInbound(admin, {
        channel: "whatsapp",
        identity: resolution.identity,
        reason: resolution.reason,
        messages: group.length,
        provider: client.provider,
        detail: resolution.detail,
      });
      continue;
    }

    routedGroups++;
    try {
      const result = await ingestInbound(admin, resolution.tenantId, group);
      received += result.received;
      inserted += result.inserted;
      duplicates += result.duplicates;
      filed += result.filed;
    } catch (e) {
      // Never echo PII; surface a redacted reason. Still ack 200 so the BSP
      // doesn't retry a batch we've likely partially processed (ingest is
      // idempotent on retry).
      errors.push(e instanceof Error ? e.message : "ingest_failed");
    }
  }

  if (routedGroups > 0 && errors.length === 0) await recordRoutedInbound(admin, "whatsapp");

  // 200 either way: a non-2xx makes Meta retry a payload we will refuse just as
  // hard next time. The refusal is not silent — it is a health row + an alert.
  return NextResponse.json({
    ok: true,
    received,
    inserted,
    duplicates,
    filed,
    ...(refused ? { refused, skipped: "no_tenant_mapping" } : {}),
    ...(errors.length ? { error: errors[0] } : {}),
  });
}

// Group by the receiving identity (""=absent → refused as `no_identity`).
function groupByReceivingIdentity(messages: InboundMessage[]): Map<string, InboundMessage[]> {
  const groups = new Map<string, InboundMessage[]>();
  for (const m of messages) {
    const key = m.receivingIdentity?.trim() ?? "";
    const bucket = groups.get(key);
    if (bucket) bucket.push(m);
    else groups.set(key, [m]);
  }
  return groups;
}
