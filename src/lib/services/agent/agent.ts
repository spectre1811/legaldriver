import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { completeJson } from "@/lib/ai/complete";
import { retrieve } from "./retrieve";
import { buildAgentPrompt, AGENT_SCHEMA } from "./prompt";
import type { AgentAnswer, AskInput, Citation, RetrievalHit } from "./types";

type DB = SupabaseClient<Database>;
type Json = Database["public"]["Tables"]["agent_turn"]["Insert"]["meta"];

// The Lawyer Agent deserves stronger reasoning than the haiku classifier default.
const AGENT_MODEL = process.env.AGENT_MODEL ?? "claude-sonnet-4-6";

function toCitations(hits: RetrievalHit[], used: number[]): Citation[] {
  const idx = used?.length ? used : hits.map((_, i) => i + 1);
  return [...new Set(idx)]
    .filter((n) => n >= 1 && n <= hits.length)
    .map((n) => {
      const h = hits[n - 1];
      return { n, source: h.source, ref: h.ref, title: h.title, url: h.url };
    });
}

// Synthesize a grounded answer from retrieved hits. Returns null ONLY when no AI
// backend is available (e.g. Vercel without a key) — the caller then queues the
// turn for the self-hosted worker. Empty retrieval yields an explicit abstention.
export async function synthesize(
  question: string,
  hits: RetrievalHit[],
  history?: { role: string; content: string }[],
): Promise<AgentAnswer | null> {
  if (!hits.length) {
    return {
      answer:
        "I don't have grounded sources for that yet. Add the case (by CNR) or its documents, or ask about a specific matter, and I'll answer with citations.\n\nNot legal advice — verify against the official record and the bare act.",
      citations: [],
      abstained: true,
    };
  }
  // Reasoning LLM selection: DeepSeek (when AGENT_BACKEND=deepseek + key) answers
  // synchronously via HTTP — no worker queue needed; otherwise the AI router
  // (Claude API, or the keyless CLI/worker) handles it.
  const useDeepseek = process.env.AGENT_BACKEND === "deepseek" && Boolean(process.env.DEEPSEEK_API_KEY);
  const raw = await completeJson(
    buildAgentPrompt(question, hits, history),
    AGENT_SCHEMA as unknown as Record<string, unknown>,
    useDeepseek ? { backend: "deepseek", maxTokens: 1500 } : { model: AGENT_MODEL, maxTokens: 1500 },
  );
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { answer?: string; used?: number[]; abstained?: boolean };
  if (typeof r.answer !== "string" || !r.answer.trim()) return null;
  return { answer: r.answer, citations: toCitations(hits, r.used ?? []), abstained: Boolean(r.abstained) };
}

// Full interactive ask: ensures a thread, records the user turn, retrieves, and
// either answers now or queues a pending assistant turn for the worker.
export async function askAgent(sb: DB, input: AskInput): Promise<{ threadId: string; answer: AgentAnswer }> {
  let threadId = input.threadId ?? null;
  let boundMatterId = input.matterId ?? null;
  let boundClientId = input.clientId ?? null;
  if (!threadId) {
    const { data, error } = await sb
      .from("agent_thread")
      .insert({
        tenant_id: input.tenantId,
        user_id: input.userId ?? null,
        matter_id: input.matterId ?? null,
        client_id: input.clientId ?? null,
        title: input.question.slice(0, 80),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`askAgent: thread insert failed: ${error?.message}`);
    threadId = data.id;
  } else {
    // Carry the thread's pinned case/client into this turn so follow-ups stay grounded.
    const { data: th } = await sb.from("agent_thread").select("matter_id, client_id").eq("id", threadId).maybeSingle();
    boundMatterId = boundMatterId ?? th?.matter_id ?? null;
    boundClientId = boundClientId ?? th?.client_id ?? null;
  }

  await sb.from("agent_turn").insert({ thread_id: threadId, tenant_id: input.tenantId, role: "user", content: input.question });

  const { data: hist } = await sb
    .from("agent_turn")
    .select("role, content")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(12);

  const effective = { ...input, matterId: boundMatterId, clientId: boundClientId };
  const hits = await retrieve(sb, effective);

  // If the thread isn't pinned to a case yet but this turn resolved exactly one,
  // pin it so later follow-ups ("what's the next step?") keep the context.
  if (!boundMatterId) {
    const matterIds = [...new Set(hits.map((h) => h.matterId).filter(Boolean))] as string[];
    if (matterIds.length === 1) await sb.from("agent_thread").update({ matter_id: matterIds[0] }).eq("id", threadId);
  }
  const ans = await synthesize(input.question, hits, (hist ?? []).map((h) => ({ role: h.role, content: h.content })));

  if (ans) {
    await sb.from("agent_turn").insert({
      thread_id: threadId,
      tenant_id: input.tenantId,
      role: "assistant",
      content: ans.answer,
      citations: ans.citations as unknown as Json,
      meta: { abstained: ans.abstained } as unknown as Json,
    });
    return { threadId, answer: ans };
  }

  // No synchronous backend → queue for the self-hosted worker. Stash the question
  // and retrieved hits so the worker can synthesize without re-running retrieval.
  await sb.from("agent_turn").insert({
    thread_id: threadId,
    tenant_id: input.tenantId,
    role: "assistant",
    content: "",
    citations: [] as unknown as Json,
    meta: { pending: true, question: input.question, hits } as unknown as Json,
  });
  return { threadId, answer: { answer: "", citations: [], abstained: false, pending: true } };
}
