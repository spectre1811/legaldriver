import { createAdminClient } from "@/lib/supabase/admin";
import type { TranscribeInput, TranscriptResult } from "./types";

// Speech-to-text — GATED. Returns null (not an error) whenever no provider is
// wired, so the manual-transcript path keeps working with zero config.
//
// Wiring a real provider (e.g. Sarvam/Bhashini for Indian languages, Deepgram,
// or OpenAI Whisper) is a follow-up: set STT_PROVIDER + STT_API_KEY and add a
// branch below that signs a URL for the audio and POSTs it to the provider.
//
// Note: transcript text is sensitive PII — never log it, never log audio bytes.
export async function transcribe(rec: TranscribeInput): Promise<TranscriptResult> {
  const provider = process.env.STT_PROVIDER;
  const apiKey = process.env.STT_API_KEY;

  // Gate: missing provider or key → manual entry. This is the expected default.
  if (!provider || provider === "manual" || !apiKey) return null;

  if (!rec.storagePath) return null;

  // Mint a short-lived signed URL for the audio so the provider can fetch it.
  // (Kept here so providers that pull-by-URL and providers that need the bytes
  // can both be added without re-plumbing.)
  const admin = createAdminClient();
  const { data: signed } = await admin.storage
    .from("documents")
    .createSignedUrl(rec.storagePath, 300);
  if (!signed?.signedUrl) return null;

  // TODO(follow-up): implement provider branches, e.g.:
  //   if (provider === "sarvam")   return sarvamTranscribe(signed.signedUrl, apiKey, rec.language);
  //   if (provider === "deepgram") return deepgramTranscribe(signed.signedUrl, apiKey, rec.language);
  // Until a branch is added, treat as not-configured (manual entry).
  return null;
}
