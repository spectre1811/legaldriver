"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { extractText } from "@/lib/docs/extract";
import { logActivity } from "@/lib/activity";
import { parseCauseList } from "@/lib/court/causelist-parse";

// One row in the result table the page renders.
export type CauseListResultEntry = {
  cnr: string;
  date?: string;
  itemNo?: string;
  court?: string;
  matched: boolean;
  matterId?: string;
  matterTitle?: string;
  updated: boolean; // next_hearing_date actually changed
};

export type CauseListResult = {
  ok: boolean;
  message: string;
  matched: number; // CNRs that are one of the firm's cases
  updated: number; // matters whose next_hearing_date we changed
  unmatched: number; // parsed CNRs not in the firm's cases
  entries: CauseListResultEntry[];
};

const SOURCE_NOTE = "cause-list (advocate upload)";

// Advocate uploads the daily cause list they legitimately received from the court.
// We extract its text, parse out CNR + hearing date, match to the tenant's cases
// (RLS-scoped), and update next_hearing_date. Keyless + compliant: the user supplies
// the file; no scraping. Assistive only — verify against the official record.
export async function uploadCauseList(formData: FormData): Promise<CauseListResult> {
  const empty = { matched: 0, updated: 0, unmatched: 0, entries: [] as CauseListResultEntry[] };

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant — please sign in again.", ...empty };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a cause-list PDF to upload.", ...empty };
  if (file.size > 25 * 1024 * 1024) return { ok: false, message: "File too large (max 25 MB).", ...empty };
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return { ok: false, message: "Please upload the cause list as a PDF.", ...empty };

  const buffer = Buffer.from(await file.arrayBuffer());
  const { text, needsOcr, error } = await extractText(buffer, file.type || "application/pdf", file.name);
  if (error) return { ok: false, message: "Could not read that PDF. Please try a different export of the cause list.", ...empty };
  if (needsOcr || !text.trim()) {
    return { ok: false, message: "This looks like a scanned (image-only) cause list — no text could be extracted. Upload a text PDF.", ...empty };
  }

  const parsed = parseCauseList(text);
  if (!parsed.length) {
    return { ok: false, message: "No case numbers (CNRs) found in this document. Is it the daily cause list?", ...empty };
  }

  const todayIso = new Date().toISOString();
  const entries: CauseListResultEntry[] = [];
  let matched = 0;
  let updated = 0;

  for (const e of parsed) {
    // RLS scopes this to the caller's tenant; we match on the stable CNR token.
    const { data: matter } = await supabase
      .from("matter")
      .select("id, title, next_hearing_date, source")
      .eq("cnr", e.cnr)
      .maybeSingle();

    if (!matter) {
      entries.push({ ...e, matched: false, updated: false });
      continue;
    }
    matched++;

    const dateChanged = Boolean(e.date) && e.date !== matter.next_hearing_date;
    if (dateChanged) {
      await supabase
        .from("matter")
        .update({
          next_hearing_date: e.date,
          last_synced_at: todayIso,
          source: matter.source ?? SOURCE_NOTE, // mark provenance only if unset
        })
        .eq("id", matter.id);
      updated++;
      await logActivity(supabase, tenantId, {
        matterId: matter.id,
        type: "case.causelist_update",
        summary: `Next hearing set to ${e.date} from uploaded cause list${e.court ? ` (${e.court})` : ""}`,
        meta: { cnr: e.cnr, item_no: e.itemNo ?? null, court: e.court ?? null },
      });
    }

    entries.push({
      ...e,
      matched: true,
      matterId: matter.id,
      matterTitle: matter.title,
      updated: dateChanged,
    });
  }

  const unmatched = entries.length - matched;
  revalidatePath("/dashboard/cause-list");
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/calendar");

  return {
    ok: true,
    message:
      `Parsed ${parsed.length} entr${parsed.length === 1 ? "y" : "ies"} — ` +
      `matched ${matched} of your case${matched === 1 ? "" : "s"}, updated ${updated} hearing date${updated === 1 ? "" : "s"}` +
      `${unmatched ? `, ${unmatched} not in your cases` : ""}. Verify against the official record.`,
    matched,
    updated,
    unmatched,
    entries,
  };
}
