"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/court/sync";
import { logActivity } from "@/lib/activity";
import { aiGateway } from "@/lib/ai/gateway";
import { getVoiceService } from "@/lib/services/voice/service";
import type { Database } from "@/lib/db/database.types";

export type ActionResult = { ok: boolean; message: string };

const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB

// Schema for the optional AI summary of a call transcript.
const CALL_SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "2-3 sentence summary of the call" },
    action_items: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "action_items"],
} as const;

// Upload an audio recording to the private 'documents' bucket under voice/.
// Consent is REQUIRED before anything is stored.
export async function uploadRecording(formData: FormData): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  // Consent gate — refuse to store audio without disclosed consent (one-party
  // consent + DPDP). The checkbox must be checked.
  const consent = String(formData.get("consent_disclosed") ?? "");
  if (consent !== "on" && consent !== "true") {
    return { ok: false, message: "Consent is required: confirm the recording was made with disclosed consent before uploading." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose an audio file to upload." };
  if (!(file.type || "").startsWith("audio/")) return { ok: false, message: "Only audio files are accepted." };
  if (file.size > MAX_AUDIO_BYTES) return { ok: false, message: "File too large (max 50 MB)." };

  const clientId = String(formData.get("client_id") ?? "").trim() || null;
  const fromNumber = String(formData.get("from_number") ?? "").trim() || null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createAdminClient();
  const path = `${tenantId}/voice/${Date.now()}_${file.name}`;
  const { error: upErr } = await admin.storage
    .from("documents")
    .upload(path, buffer, { contentType: file.type || "audio/mpeg", upsert: true });
  if (upErr) return { ok: false, message: `Upload failed: ${upErr.message}` };

  const { error: insErr } = await admin.from("voice_recording").insert({
    tenant_id: tenantId,
    source: "upload",
    storage_path: path,
    consent_disclosed: true,
    status: "uploaded",
    client_id: clientId,
    from_number: fromNumber,
  });
  if (insErr) return { ok: false, message: `Could not save recording: ${insErr.message}` };

  await logActivity(supabase, tenantId, { type: "voice.uploaded", summary: `Recording “${file.name}” uploaded` });
  revalidatePath("/dashboard/voice");
  return { ok: true, message: `Uploaded “${file.name}”.` };
}

// Transcribe a recording via the configured STT provider. If none is configured
// the service returns null → status 'failed' with a clear, actionable message
// (manual transcript entry still works). On success, optionally summarize.
export async function transcribeRecording(id: string): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  // RLS scopes this read to the caller's tenant.
  const { data: rec } = await supabase
    .from("voice_recording")
    .select("id, storage_path, language")
    .eq("id", id)
    .maybeSingle();
  if (!rec) return { ok: false, message: "Recording not found." };

  const admin = createAdminClient();
  await admin.from("voice_recording").update({ status: "transcribing" }).eq("id", id).eq("tenant_id", tenantId);

  const result = await getVoiceService().transcribe({ id: rec.id, storagePath: rec.storage_path, language: rec.language });

  if (!result) {
    await admin
      .from("voice_recording")
      .update({ status: "failed" })
      .eq("id", id)
      .eq("tenant_id", tenantId);
    revalidatePath("/dashboard/voice");
    return { ok: false, message: "No STT provider configured — enter the transcript manually instead." };
  }

  // transcript is sensitive PII — store it, never log it.
  await admin
    .from("voice_recording")
    .update({ transcript: result.text, language: result.language ?? rec.language, status: "transcribed" })
    .eq("id", id)
    .eq("tenant_id", tenantId);

  // Optional: short AI summary of the call (LLM infers, code files it).
  const { output: raw } = await aiGateway.run({
    task: "classify.voice",
    input: `Summarize this phone call transcript for a legal practice. Be concise and factual.\n\nTRANSCRIPT:\n${result.text}`,
    schema: CALL_SUMMARY_SCHEMA as unknown as Record<string, unknown>,
    tenantId,
    scope: { kind: "tenant", tenantId },
  });
  if (raw) {
    await admin
      .from("voice_recording")
      .update({ summary: raw as Database["public"]["Tables"]["voice_recording"]["Update"]["summary"], status: "summarized" })
      .eq("id", id)
      .eq("tenant_id", tenantId);
  }

  await logActivity(supabase, tenantId, { type: "voice.transcribed", summary: "Recording transcribed" });
  revalidatePath("/dashboard/voice");
  return { ok: true, message: raw ? "Transcribed and summarized." : "Transcribed." };
}

// Re-file a recording onto a client and/or matter.
export async function tagRecording(id: string, clientId: string | null, matterId: string | null): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  // RLS lets the caller update only their own tenant's rows.
  const { error } = await supabase
    .from("voice_recording")
    .update({ client_id: clientId, matter_id: matterId })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };

  await logActivity(supabase, tenantId, { matterId, type: "voice.tagged", summary: "Recording re-filed" });
  revalidatePath("/dashboard/voice");
  return { ok: true, message: "Recording tagged." };
}

// Save a manually-typed transcript (the keyless path when no STT is configured).
export async function saveManualTranscript(id: string, transcript: string): Promise<ActionResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const text = transcript.trim();
  if (!text) return { ok: false, message: "Enter a transcript." };

  // transcript is PII — saved, never logged.
  const { error } = await supabase
    .from("voice_recording")
    .update({ transcript: text, status: "transcribed" })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };

  await logActivity(supabase, tenantId, { type: "voice.transcribed", summary: "Transcript entered manually" });
  revalidatePath("/dashboard/voice");
  return { ok: true, message: "Transcript saved." };
}
