import type { TranscribeInput, TranscriptResult } from "./types";
import { transcribe as sttTranscribe } from "./stt";

// The single seam for voice/call handling (modular monolith). Day-to-day
// ingest + tagging live in the server actions; the only provider-swappable
// concern here is speech-to-text, which is gated behind STT_PROVIDER.
//
// Manual path is KEYLESS: with no STT_PROVIDER set, transcribe() returns null
// and users enter a transcript by hand — the feature still works end to end.
export interface VoiceService {
  readonly provider: string;
  /** Transcribe a stored recording. Returns null when no STT is configured. */
  transcribe(rec: TranscribeInput): Promise<TranscriptResult>;
}

class ConfiguredVoiceService implements VoiceService {
  constructor(readonly provider: string) {}
  transcribe(rec: TranscribeInput): Promise<TranscriptResult> {
    return sttTranscribe(rec);
  }
}

let cached: VoiceService | null = null;

// Provider selection mirrors getCourtDataClient(): read an env var, default to
// the keyless "manual" provider whose transcribe() always returns null.
export function getVoiceService(): VoiceService {
  if (cached) return cached;
  const provider = process.env.STT_PROVIDER ?? "manual";
  cached = new ConfiguredVoiceService(provider);
  return cached;
}

// For tests / explicit overrides.
export function setVoiceService(service: VoiceService | null) {
  cached = service;
}
