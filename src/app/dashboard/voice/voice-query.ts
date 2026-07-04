import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { rangeFor } from "@/lib/paginate";

// Voice recordings (WO-39), numbered-page pagination by created_at. Signing playback URLs
// is the expensive bit — the old page eagerly signed up to 200 URLs on EVERY load (most
// never clicked). Paging signs only the current page (≤ page size), so the work scales
// with what's shown, not the whole corpus (ship-grade §4).

interface RawVoice {
  id: string;
  source: string;
  from_number: string | null;
  client_id: string | null;
  matter_id: string | null;
  storage_path: string | null;
  duration_sec: number | null;
  status: string;
  transcript: string | null;
  created_at: string;
}

export interface VoiceRow {
  id: string;
  source: string;
  from_number: string | null;
  client_id: string | null;
  matter_id: string | null;
  duration_sec: number | null;
  status: string;
  hasTranscript: boolean;
  created_at: string;
  signedUrl: string | null;
}

export interface VoicePageResult {
  rows: VoiceRow[];
  total: number;
}

export async function fetchVoicePage(
  supabase: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  page: number,
  per: number,
): Promise<VoicePageResult> {
  const { from, to } = rangeFor(page, per);
  const { data, count, error } = await supabase
    .from("voice_recording")
    .select(
      "id, source, from_number, client_id, matter_id, storage_path, duration_sec, status, transcript, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error(`fetchVoicePage: ${error.message}`);
  const raw = (data ?? []) as RawVoice[];

  // Sign only this page's URLs (private bucket, service role). Bounded to page size.
  const signed = new Map<string, string>();
  await Promise.all(
    raw
      .filter((r) => r.storage_path)
      .map(async (r) => {
        const { data: s } = await admin.storage.from("documents").createSignedUrl(r.storage_path as string, 120);
        if (s?.signedUrl) signed.set(r.id, s.signedUrl);
      }),
  );

  return {
    rows: raw.map((r) => ({
      id: r.id,
      source: r.source,
      from_number: r.from_number,
      client_id: r.client_id,
      matter_id: r.matter_id,
      duration_sec: r.duration_sec,
      status: r.status,
      hasTranscript: Boolean(r.transcript), // don't ship transcript text to the client
      created_at: r.created_at,
      signedUrl: signed.get(r.id) ?? null,
    })),
    total: count ?? 0,
  };
}
