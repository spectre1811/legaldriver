import type { MessagingClient } from "./client";
import type {
  InboundMessage,
  OutboundMessage,
  SendResult,
  VerifyWebhookParams,
} from "./types";

// Deterministic mock provider for dev/demo so we never depend on a configured
// BSP or burn credits. send() records-as-sent (the caller persists the row);
// normalizeInbound() accepts a small dev-friendly shape so the webhook + ingest
// pipeline can be exercised end-to-end with a hand-rolled POST body.
export class MockMessagingClient implements MessagingClient {
  readonly provider = "mock";

  async send(msg: OutboundMessage): Promise<SendResult> {
    // No network. A stable synthetic id keeps demo rows idempotent-ish.
    return { externalId: `mock-${msg.tenantId}-${Date.now()}`, status: "sent" };
  }

  normalizeInbound(payload: unknown): InboundMessage[] {
    // Accept either { messages: [...] } or a single message object. Each entry:
    // { from, to, body, externalId?, threadKey?, receivedAt? }.
    const p = payload as { messages?: unknown } | null;
    const raw = Array.isArray((p as { messages?: unknown })?.messages)
      ? ((p as { messages: unknown[] }).messages)
      : payload
        ? [payload]
        : [];

    const out: InboundMessage[] = [];
    for (const item of raw) {
      const m = item as Partial<InboundMessage> & { from?: string; to?: string; body?: string };
      if (!m || typeof m !== "object" || !m.from || !m.to) continue;
      out.push({
        channel: "whatsapp",
        externalId: typeof m.externalId === "string" ? m.externalId : undefined,
        threadKey: typeof m.threadKey === "string" && m.threadKey ? m.threadKey : `whatsapp:${m.from}`,
        from: String(m.from),
        to: String(m.to),
        body: typeof m.body === "string" ? m.body : "",
        media: Array.isArray(m.media) ? m.media : [],
        receivedAt: typeof m.receivedAt === "string" ? m.receivedAt : new Date().toISOString(),
      });
    }
    return out;
  }

  // Mock echoes the challenge whenever the verify token matches (if configured),
  // so the handshake can be exercised locally.
  verifyWebhook({ mode, token, challenge }: VerifyWebhookParams): string | null {
    const expected = process.env.WHATSAPP_BSP_WEBHOOK_VERIFY_TOKEN;
    if (mode === "subscribe" && challenge && (!expected || token === expected)) return challenge;
    return null;
  }
}
