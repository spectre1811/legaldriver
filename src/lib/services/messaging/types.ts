// Messaging Gateway (E1) — versioned contract types. This is a contract-first
// service module (modular monolith): a stable interface, a deterministic mock,
// and a gated live WhatsApp-BSP impl, env-switched. Channels start at WhatsApp
// but the shape is channel-generic so SMS/email can slot in later.

export type MessagingChannel = "whatsapp" | "email" | "sms";

// What the firm sends out. Today only WhatsApp is wired for send; the type is
// pinned to 'whatsapp' so callers can't request an unsupported channel.
export interface OutboundMessage {
  to: string;
  channel: "whatsapp";
  body: string;
  tenantId: string;
}

export interface SendResult {
  externalId?: string;
  status: "sent" | "queued" | "failed";
}

// A media attachment reference on an inbound message. We store the provider's
// reference + metadata; binary fetch/persist is a follow-up (see ingest.ts).
export interface InboundMedia {
  type?: string;
  url?: string;
  id?: string;
  mime?: string;
  filename?: string;
}

// One inbound message, normalized from a provider-specific webhook payload.
export interface InboundMessage {
  channel: MessagingChannel;
  externalId?: string;
  threadKey: string;
  from: string;
  /** Display form of the receiving number. NOT a routing key — see below. */
  to: string;
  // WO-311 · The RECEIVING identity this message arrived on — WhatsApp's stable
  // `phone_number_id`, a telephony DID. This is the ONLY tenant routing key
  // (`messaging_identity`); `from` is caller-controlled and `to` is display
  // text. Optional on purpose: a provider adapter that cannot produce one leaves
  // it undefined, and the webhook then refuses the message (fail closed) instead
  // of guessing a tenant.
  receivingIdentity?: string;
  body: string;
  media?: InboundMedia[];
  receivedAt: string;
}

// Params for the webhook verification handshake (Meta-style GET challenge).
export interface VerifyWebhookParams {
  mode?: string | null;
  token?: string | null;
  challenge?: string | null;
}
