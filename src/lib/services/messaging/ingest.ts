import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { InboundMessage } from "./types";
import { completeJson } from "@/lib/ai/complete";
import {
  buildClassifyPrompt,
  CLASSIFY_SCHEMA,
  FALLBACK,
  normalizeClassification,
} from "@/lib/docs/classify-core";
import { resolveFiling } from "@/lib/docs/autofile";
import { logActivity } from "@/lib/activity";

type DB = SupabaseClient<Database>;

export interface IngestResult {
  received: number;
  inserted: number;
  duplicates: number;
  filed: number;
}

// Normalize inbound → classify-to-matter → persist msg_message. Mirrors the
// Gmail file-and-parse pipeline (LLM infers, deterministic code files): we reuse
// the SAME classify → resolveFiling routing so a WhatsApp message gets linked to
// the right client/case (matching or auto-creating only when it's clearly legal).
//
// Callers MUST pass an explicit tenantId. Under the admin (RLS-bypassing) client
// used by webhooks, every query/insert is scoped by tenant_id by hand.
// NEVER log message bodies (DPDP / PII).
export async function ingestInbound(
  admin: DB,
  tenantId: string,
  messages: InboundMessage[],
): Promise<IngestResult> {
  let inserted = 0;
  let duplicates = 0;
  let filed = 0;

  if (!messages.length) return { received: 0, inserted, duplicates, filed };

  // Bounded tenant shortlist for classification (same shape as mail ingest).
  const [{ data: clients }, { data: matters }] = await Promise.all([
    admin.from("client").select("id, name").eq("tenant_id", tenantId).limit(100),
    admin.from("matter").select("id, title, cnr").eq("tenant_id", tenantId).limit(100),
  ]);
  const clientList = clients ?? [];
  const matterList = matters ?? [];

  for (const msg of messages) {
    // Idempotency: dedupe on (tenant, channel, external_id). Skip when we have an
    // external id and a row already exists; messages without an id can't be deduped.
    if (msg.externalId) {
      const { data: existing } = await admin
        .from("msg_message")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("channel", msg.channel)
        .eq("external_id", msg.externalId)
        .maybeSingle();
      if (existing) {
        duplicates++;
        continue;
      }
    }

    // Classify the body to route it. Empty body (e.g. media-only) → fallback.
    const input = {
      filename: `whatsapp:${msg.from}`,
      docTextOrSnippet: msg.body || "(media message, no text)",
      clients: clientList,
      matters: matterList,
    };
    const raw = msg.body
      ? await completeJson(buildClassifyPrompt(input), CLASSIFY_SCHEMA as unknown as Record<string, unknown>)
      : null;
    const cls = raw ? normalizeClassification(raw, input) : FALLBACK;

    // Route to a client/case. Client-first: match a known client by the sender's
    // phone number (msg.from), so a message from a saved client files to them even
    // with no case and an empty/media-only body.
    const filing = await resolveFiling(admin, tenantId, cls, { phone: msg.from });
    if (filing.createdClient && cls.suggested_client_name) clientList.push({ id: filing.clientId!, name: cls.suggested_client_name });
    if (filing.createdMatter) matterList.push({ id: filing.matterId!, title: cls.suggested_matter_title ?? "Case", cnr: cls.extracted.cnrs?.[0] ?? null });

    const { data: row, error } = await admin
      .from("msg_message")
      .insert({
        tenant_id: tenantId,
        channel: msg.channel,
        direction: "in",
        provider: process.env.MESSAGING_PROVIDER ?? "mock",
        external_id: msg.externalId ?? null,
        thread_key: msg.threadKey,
        from_addr: msg.from,
        to_addr: msg.to,
        client_id: filing.clientId,
        matter_id: filing.matterId,
        body: msg.body || null,
        media: (msg.media ?? []) as Database["public"]["Tables"]["msg_message"]["Insert"]["media"],
        status: "received",
        classified: { ...cls } as Database["public"]["Tables"]["msg_message"]["Insert"]["classified"],
        confidence: cls.confidence,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      // Partial-unique race → treat as duplicate; never throw the whole batch.
      duplicates++;
      continue;
    }
    if (!row) continue;
    inserted++;
    if (filing.clientId || filing.matterId) filed++;

    // Best-effort activity log. No PII / message body in the summary or meta.
    await logActivity(admin, tenantId, {
      matterId: filing.matterId,
      type: "message.received",
      summary: `Inbound ${msg.channel} message filed`,
      meta: { channel: msg.channel, confidence: cls.confidence, filed: Boolean(filing.clientId || filing.matterId) },
    });
  }

  return { received: messages.length, inserted, duplicates, filed };
}
