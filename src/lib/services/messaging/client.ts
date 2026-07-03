import type {
  InboundMessage,
  OutboundMessage,
  SendResult,
  VerifyWebhookParams,
} from "./types";
import { isDemoMode } from "@/lib/demo";

// The single seam for all messaging I/O. Swapping providers = swapping the impl
// returned by getMessagingClient(). Mirrors the CourtDataClient seam: an
// interface + a selector that env-switches and lazily requires the live adapter,
// with a deterministic mock fallback so dev never depends on a configured BSP.
export interface MessagingClient {
  readonly provider: string;

  /** Send an outbound message via the provider. Mock just reports 'sent'. */
  send(msg: OutboundMessage): Promise<SendResult>;

  /** Normalize a raw provider webhook payload into 0+ inbound messages. */
  normalizeInbound(payload: unknown): InboundMessage[];

  /** Webhook verification handshake (Meta GET challenge). Returns the challenge
   *  to echo on success, or null to reject. Optional: mock has no handshake. */
  verifyWebhook?(params: VerifyWebhookParams): string | null;
}

let cached: MessagingClient | null = null;

// Provider selection. Defaults to the free mock unless MESSAGING_PROVIDER is set
// to "whatsapp_bsp" AND all required BSP keys are present. Missing config falls
// back to the mock so local dev / unconfigured deploys never crash.
export function getMessagingClient(): MessagingClient {
  // DEMO_MODE first (before the cache) — force the mock client, never the live
  // BSP, regardless of configured keys or a runtime toggle (WO-08).
  if (isDemoMode()) {
    const { MockMessagingClient } = require("./mock") as typeof import("./mock");
    cached = new MockMessagingClient();
    return cached;
  }
  if (cached) return cached;

  const provider = process.env.MESSAGING_PROVIDER ?? "mock";
  const apiKey = process.env.WHATSAPP_BSP_API_KEY;
  const baseUrl = process.env.WHATSAPP_BSP_BASE_URL;
  const phoneNumberId = process.env.WHATSAPP_BSP_PHONE_NUMBER_ID;

  if (provider === "whatsapp_bsp" && apiKey && baseUrl && phoneNumberId) {
    // Lazy require so the mock path has zero dependency on the live adapter.
    const { WhatsAppBspClient } = require("./whatsapp") as typeof import("./whatsapp");
    cached = new WhatsAppBspClient({ apiKey, baseUrl, phoneNumberId });
  } else {
    const { MockMessagingClient } = require("./mock") as typeof import("./mock");
    cached = new MockMessagingClient();
  }
  return cached;
}

// Is a live (non-mock) provider fully configured? Webhooks use this to no-op
// quickly when the BSP isn't wired up yet.
export function messagingConfigured(): boolean {
  return (
    (process.env.MESSAGING_PROVIDER ?? "mock") === "whatsapp_bsp" &&
    Boolean(process.env.WHATSAPP_BSP_API_KEY) &&
    Boolean(process.env.WHATSAPP_BSP_BASE_URL) &&
    Boolean(process.env.WHATSAPP_BSP_PHONE_NUMBER_ID)
  );
}

// For tests / explicit overrides.
export function setMessagingClient(client: MessagingClient | null) {
  cached = client;
}
