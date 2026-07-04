import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { paginate, type Page, type PaginableQuery } from "@/lib/paginate";

// Voice recordings, keyset-paginated by created_at (WO-39). Signing playback URLs is
// the expensive bit — the old page eagerly signed up to 200 URLs on EVERY load (most
// never clicked). Paging signs only the current page (≤ page size), so the work scales
// with what's shown, not the whole corpus (ship-grade §4).

export const VOICE_PAGE_SIZE = 25;

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

export async function fetchVoicePage(
  supabase: SupabaseClient<Database>,
  admin: SupabaseClient<Database>,
  cursor?: string | null,
): Promise<Page<VoiceRow>> {
  const base = supabase
    .from("voice_recording")
    .select(
      "id, source, from_number, client_id, matter_id, storage_path, duration_sec, status, transcript, created_at",
    ) as unknown as PaginableQuery<RawVoice>;

  const page = await paginate<RawVoice>(base, {
    column: "created_at",
    ascending: false,
    limit: VOICE_PAGE_SIZE,
    cursor,
  });

  // Sign only this page's URLs (private bucket, service role). Bounded to page size.
  const signed = new Map<string, string>();
  await Promise.all(
    page.rows
      .filter((r) => r.storage_path)
      .map(async (r) => {
        const { data } = await admin.storage.from("documents").createSignedUrl(r.storage_path as string, 120);
        if (data?.signedUrl) signed.set(r.id, data.signedUrl);
      }),
  );

  return {
    rows: page.rows.map((r) => ({
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
    nextCursor: page.nextCursor,
  };
}
