import type { MessagingClient } from "./client";
import type {
  InboundMedia,
  InboundMessage,
  OutboundMessage,
  SendResult,
  VerifyWebhookParams,
} from "./types";

export interface WhatsAppBspConfig {
  apiKey: string;
  baseUrl: string;
  phoneNumberId: string;
}

// Gated live WhatsApp impl, modeled on the Meta Cloud API graph shape that most
// BSPs (AiSensy/Wati/Gupshup/Interakt/Twilio-for-WhatsApp) proxy. The selector
// only constructs this when all WHATSAPP_BSP_* keys are present; the constructor
// re-checks and throws a clear "not configured" error as a defensive guard so a
// misconfigured live path fails loudly rather than silently no-op'ing.
export class WhatsAppBspClient implements MessagingClient {
  readonly provider = "whatsapp_bsp";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly phoneNumberId: string;

  constructor(cfg: WhatsAppBspConfig) {
    if (!cfg.apiKey || !cfg.baseUrl || !cfg.phoneNumberId) {
      throw new Error(
        "WhatsApp BSP not configured: set WHATSAPP_BSP_API_KEY, WHATSAPP_BSP_BASE_URL, and WHATSAPP_BSP_PHONE_NUMBER_ID.",
      );
    }
    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, "");
    this.phoneNumberId = cfg.phoneNumberId;
  }

  async send(msg: OutboundMessage): Promise<SendResult> {
    try {
      const res = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: msg.to,
          type: "text",
          text: { body: msg.body },
        }),
        cache: "no-store",
      });
      if (!res.ok) return { status: "failed" };
      const data = (await res.json().catch(() => null)) as { messages?: { id?: string }[] } | null;
      const externalId = data?.messages?.[0]?.id;
      return { externalId, status: externalId ? "sent" : "queued" };
    } catch {
      // Never leak network/PII detail to the caller; surface a failed status.
      return { status: "failed" };
    }
  }

  // Normalize a Meta-style webhook payload:
  //   entry[].changes[].value.messages[] + value.metadata.display_phone_number
  normalizeInbound(payload: unknown): InboundMessage[] {
    const out: InboundMessage[] = [];
    const root = payload as { entry?: unknown[] } | null;
    if (!root || !Array.isArray(root.entry)) return out;

    for (const entry of root.entry) {
      const changes = (entry as { changes?: unknown[] })?.changes;
      if (!Array.isArray(changes)) continue;
      for (const change of changes) {
        const value = (change as { value?: unknown })?.value as
          | {
              metadata?: { display_phone_number?: string; phone_number_id?: string };
              messages?: unknown[];
            }
          | undefined;
        if (!value || !Array.isArray(value.messages)) continue;
        const to = value.metadata?.display_phone_number ?? value.metadata?.phone_number_id ?? this.phoneNumberId;

        for (const raw of value.messages) {
          const m = raw as {
            id?: string;
            from?: string;
            timestamp?: string;
            type?: string;
            text?: { body?: string };
            image?: { id?: string; mime_type?: string };
            document?: { id?: string; mime_type?: string; filename?: string };
            audio?: { id?: string; mime_type?: string };
            video?: { id?: string; mime_type?: string };
          };
          if (!m?.from) continue;

          const media: InboundMedia[] = [];
          for (const key of ["image", "document", "audio", "video"] as const) {
            const att = m[key];
            if (att?.id) media.push({ type: key, id: att.id, mime: att.mime_type, filename: (att as { filename?: string }).filename });
          }

          out.push({
            channel: "whatsapp",
            externalId: m.id,
            threadKey: `whatsapp:${m.from}`,
            from: m.from,
            to,
            body: m.text?.body ?? "",
            media,
            receivedAt: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
          });
        }
      }
    }
    return out;
  }

  // Meta GET verification handshake. Echo hub.challenge iff the token matches.
  verifyWebhook({ mode, token, challenge }: VerifyWebhookParams): string | null {
    const expected = process.env.WHATSAPP_BSP_WEBHOOK_VERIFY_TOKEN;
    if (mode === "subscribe" && challenge && expected && token === expected) return challenge;
    return null;
  }
}
