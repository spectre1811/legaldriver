import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { PaginableQuery } from "@/lib/paginate";

// One query shape, used by BOTH the first-page server render and the load-more server
// action, so the two can never drift (ship-grade §3 — the list contract is one thing).
// `created_at` is selected because the keyset cursor is minted from it (+ id).

export const NOTICES_PAGE_SIZE = 20;

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

export function noticesQuery(supabase: SupabaseClient<Database>): PaginableQuery<NoticeRow> {
  // RLS scopes this to the caller's tenant; the cast bridges Supabase's inferred join
  // shape to our row type (same pattern the page already used for the matter join).
  return supabase
    .from("notice")
    .select(
      "id, type, response_due, escalation_state, sent_at, next_escalation_at, body_ref, created_at, matter:matter_id (title)",
    ) as unknown as PaginableQuery<NoticeRow>;
}
