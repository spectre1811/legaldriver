import type { Database } from "@/lib/db/database.types";

// Canonical voice_recording row/insert/update types (single source = generated DB types).
export type VoiceRecording = Database["public"]["Tables"]["voice_recording"]["Row"];
export type VoiceRecordingInsert = Database["public"]["Tables"]["voice_recording"]["Insert"];
export type VoiceRecordingUpdate = Database["public"]["Tables"]["voice_recording"]["Update"];

export type VoiceSource = "upload" | "telephony" | "native";
export type VoiceStatus = "uploaded" | "transcribing" | "transcribed" | "summarized" | "failed";

// Result of an STT transcription. null means "no STT provider configured" — the
// caller falls back to manual transcript entry; it is NOT an error.
export type TranscriptResult = { text: string; language?: string } | null;

// What the STT provider needs to fetch + transcribe a recording.
export type TranscribeInput = {
  id: string;
  storagePath: string | null;
  language?: string | null;
};
