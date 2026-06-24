import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { Classification } from "./classify-core";

type DB = SupabaseClient<Database>;

export interface FilingResult {
  clientId: string | null;
  matterId: string | null;
  createdClient: boolean;
  createdMatter: boolean;
}

// Resolve where a classified document/email should be filed — matching an existing
// client/matter, or AUTO-CREATING one from the parsed content when it's clearly a
// legal matter. Safe by design: only creates when is_legal is true; a CNR is the
// strongest signal (an auto-created matter with a CNR gets enriched later by the
// nightly court refresh cron). Used by both Gmail ingest and the self-hosted worker.
export async function resolveFiling(sb: DB, tenantId: string, c: Classification): Promise<FilingResult> {
  let clientId = c.client_id;
  let matterId = c.matter_id;
  let createdClient = false;
  let createdMatter = false;

  // Matter: prefer an existing match; else create from a CNR or suggested title.
  if (!matterId && c.is_legal) {
    const cnr = c.extracted.cnrs?.[0]?.trim().toUpperCase();
    if (cnr) {
      const { data: found } = await sb
        .from("matter")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("cnr", cnr)
        .maybeSingle();
      if (found) {
        matterId = found.id;
      } else {
        const { data } = await sb
          .from("matter")
          .insert({ tenant_id: tenantId, cnr, title: c.suggested_matter_title ?? `Case ${cnr}`, status: "active", source: "gmail" })
          .select("id")
          .single();
        matterId = data?.id ?? null;
        createdMatter = !!data;
      }
    } else if (c.suggested_matter_title) {
      const { data: found } = await sb
        .from("matter")
        .select("id")
        .eq("tenant_id", tenantId)
        .ilike("title", c.suggested_matter_title)
        .maybeSingle();
      if (found) {
        matterId = found.id;
      } else {
        const { data } = await sb
          .from("matter")
          .insert({ tenant_id: tenantId, title: c.suggested_matter_title, status: "active", source: "gmail" })
          .select("id")
          .single();
        matterId = data?.id ?? null;
        createdMatter = !!data;
      }
    }
  }

  // Client: prefer an existing match; else create from suggested name.
  if (!clientId && c.is_legal && c.suggested_client_name) {
    const name = c.suggested_client_name;
    const { data: found } = await sb
      .from("client")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("name", name)
      .maybeSingle();
    if (found) {
      clientId = found.id;
    } else {
      const { data } = await sb
        .from("client")
        .insert({ tenant_id: tenantId, name, type: "individual" })
        .select("id")
        .single();
      clientId = data?.id ?? null;
      createdClient = !!data;
    }
  }

  // Link a newly-created matter to the resolved client.
  if (matterId && clientId && createdMatter) {
    await sb.from("matter").update({ client_id: clientId }).eq("id", matterId);
  }

  return { clientId, matterId, createdClient, createdMatter };
}
