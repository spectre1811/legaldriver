import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { aiGateway } from "@/lib/ai/gateway";
import { retrieve } from "./retrieve";

type DB = SupabaseClient<Database>;

// Suggested reply to an inbound client message (E1b "chat about cases").
// HARD LINE: the AI NEVER auto-sends. This produces a DRAFT the advocate reviews,
// edits, and sends. Grounded in the client's/matter's corpus + the law pack; if it
// can't answer from context, it defers to the advocate rather than inventing.
const REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string", description: "A short, professional draft reply (2–4 sentences)." },
    grounded: { type: "boolean", description: "true if the reply is supported by the context." },
  },
  required: ["reply", "grounded"],
} as const;

export async function suggestReply(
  sb: DB,
  input: { tenantId: string; question: string; clientId?: string | null; matterId?: string | null },
): Promise<string | null> {
  const hits = await retrieve(sb, input, 6);
  const ctx = hits.map((h, i) => `[${i + 1}] ${h.title}: ${h.snippet}`).join("\n");
  const prompt = `You are drafting a SHORT reply that an Indian advocate's office would send to a client over WhatsApp.
RULES:
- Warm, professional, concise (2–4 sentences). Plain language.
- Use ONLY the CONTEXT below for any case facts. Do NOT invent dates, section numbers, court outcomes, or commitments.
- Do NOT give legal advice or promises. If the client's question can't be answered from the context, say the advocate will review and revert.
- This is a DRAFT for the advocate to review before sending — write it as the firm, not as an AI.

CONTEXT:
${ctx || "(no case context found)"}

CLIENT MESSAGE: ${input.question}`;

  // Client-bot reply — scope is the client's own matters ONLY (04-AI §3.5), computed
  // from the caller's identity; retrieval already ran with it, and the gateway never
  // widens it. Route (cheap model + maxTokens) is config in the route table.
  const { output: raw } = await aiGateway.run({
    task: "agent.reply",
    input: prompt,
    schema: REPLY_SCHEMA as unknown as Record<string, unknown>,
    tenantId: input.tenantId,
    scope: { kind: "client-matter", tenantId: input.tenantId, matterIds: input.matterId ? [input.matterId] : undefined },
  });
  const r = raw as { reply?: string } | null;
  return r?.reply?.trim() || null;
}
