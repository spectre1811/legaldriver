"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantId, upsertCase } from "@/lib/court/sync";
import { getCaseCached } from "@/lib/court/gateway";

export type CourtActionResult = { ok: boolean; message: string };

// HITL refresh: the user opens the official eCourts portal, solves any CAPTCHA
// themselves, and pastes back the JSON/text it returned. We NEVER auto-solve a
// CAPTCHA or scrape — we only store what the user brings back, tenant-scoped via
// RLS. Parsing the pasted payload into the matter is a deliberate follow-up; for
// now we record the request so it can be fulfilled.
export async function submitRefreshRequest(
  cnr: string,
  pastedPayload: string,
  note: string,
): Promise<CourtActionResult> {
  const key = cnr.trim().toUpperCase();
  if (!key) return { ok: false, message: "Enter a CNR." };

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const { data: auth } = await supabase.auth.getUser();

  // Store the pasted payload as JSON if it parses, else wrap the raw text.
  let payload: unknown = null;
  const trimmed = pastedPayload.trim();
  if (trimmed) {
    try {
      payload = JSON.parse(trimmed);
    } catch {
      payload = { text: trimmed };
    }
  }

  const { error } = await supabase.from("court_refresh_request").insert({
    tenant_id: tenantId,
    cnr: key,
    requested_by: auth.user?.id ?? null,
    status: "pending",
    pasted_payload: payload as never,
    note: note.trim() || null,
  });
  if (error) return { ok: false, message: error.message };

  revalidatePath("/dashboard/settings");
  return {
    ok: true,
    message: `Saved a pending refresh request for ${key}. Parsing the pasted payload into the matter is a follow-up — it's stored for now.`,
  };
}

// A normal provider-backed refresh button: go through the gateway (force-fetch +
// write-through cache) and upsert the result into the tenant's matter set.
export async function requestServerRefresh(cnr: string): Promise<CourtActionResult> {
  const key = cnr.trim().toUpperCase();
  if (!key) return { ok: false, message: "Enter a CNR." };

  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };

  const fetched = await getCaseCached(key, { force: true });
  if (!fetched.case) {
    return { ok: false, message: `No data returned for ${key}. Provider may be unavailable — try a HITL refresh.` };
  }

  const { isNew, hearingCount } = await upsertCase(supabase, tenantId, fetched.case);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/cases");
  revalidatePath("/dashboard/calendar");
  const provenance = fetched.stale ? " (served from stale cache — provider errored)" : "";
  return {
    ok: true,
    message: `${isNew ? "Added" : "Refreshed"} ${key}: ${hearingCount} hearing(s), source ${fetched.source}${provenance}.`,
  };
}
