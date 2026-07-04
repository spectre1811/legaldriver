"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { askAgent } from "@/lib/services/agent/agent";

export type AskResult =
  | { ok: true; threadId: string; pending: boolean }
  | { ok: false; message: string };

// Ask the Lawyer Agent. The agent core records the user turn, retrieves grounding,
// and either answers now or queues a pending assistant turn for the worker.
// Everything is RLS/tenant-scoped via the server client — never log PII here.
export async function askAgentAction(formData: FormData): Promise<AskResult> {
  const t = await getTranslations("copilot");
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { ok: false, message: t("errorTypeQuestion") };

  const matterId = (String(formData.get("matterId") ?? "").trim() || null) as string | null;
  const clientId = (String(formData.get("clientId") ?? "").trim() || null) as string | null;
  const threadId = (String(formData.get("threadId") ?? "").trim() || null) as string | null;

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: t("errorNoTenant") };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { threadId: tid, answer } = await askAgent(supabase, {
    tenantId,
    question,
    matterId,
    clientId,
    userId: user?.id ?? null,
    threadId,
  });

  revalidatePath("/dashboard/assistant/ask");
  return { ok: true, threadId: tid, pending: Boolean(answer.pending) };
}
