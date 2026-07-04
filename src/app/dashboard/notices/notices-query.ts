import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import { rangeFor } from "@/lib/paginate";

// Notices list (WO-39), numbered-page pagination by created_at (newest first). Was an
// unbounded fetch-all of every notice.

export interface NoticeRow {
  id: string;
  type: string;
  response_due: string | null;
  escalation_state: string;
  sent_at: string | null;
  next_escalation_at: string | null;
  body_ref: string | null;
  created_at: string;
  matter: { title?: string } | null;
}

export interface NoticesPageResult {
  rows: NoticeRow[];
  total: number;
}

export async function fetchNoticesPage(
  supabase: SupabaseClient<Database>,
  page: number,
  per: number,
): Promise<NoticesPageResult> {
  const { from, to } = rangeFor(page, per);
  const { data, count, error } = await supabase
    .from("notice")
    .select(
      "id, type, response_due, escalation_state, sent_at, next_escalation_at, body_ref, created_at, matter:matter_id (title)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw new Error(`fetchNoticesPage: ${error.message}`);
  return { rows: (data ?? []) as unknown as NoticeRow[], total: count ?? 0 };
}
