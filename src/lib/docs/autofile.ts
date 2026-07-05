import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { Classification } from "./classify-core";
import { bestMatch } from "./name-match";

type DB = SupabaseClient<Database>;

export interface FilingResult {
  clientId: string | null;
  matterId: string | null;
  createdClient: boolean;
  createdMatter: boolean;
  matchedClientByContact: boolean; // matched a known client by sender email/phone
  // Match provenance (WO-33 W4) — did the resolved client/matter come from a STRONG
  // deterministic signal (LLM shortlist id, sender contact, exact name/CNR/title) vs a
  // weak fuzzy party match? The audit re-scan uses this to decide auto-file (strong) vs
  // suggest-in-review (fuzzy), mirroring `decideFiling`'s structural-confidence rule.
  clientStrong: boolean;
  matterStrong: boolean;
}

// Pull the bare address out of "Name <a@b.com>" and normalise.
export function parseEmailAddr(from: string | null | undefined): string | null {
  if (!from) return null;
  const m = from.match(/<([^>]+)>/);
  const addr = (m ? m[1] : from).trim().toLowerCase();
  return /\S+@\S+\.\S+/.test(addr) ? addr : null;
}

// Strongest, deterministic client signal: the sender's email/phone matched against
// a client's stored contacts. This is what makes filing CLIENT-FIRST — a document
// from a known client lands in their library even when there is no case at all.
export async function matchClientByContact(
  sb: DB,
  tenantId: string,
  opts: { email?: string | null; phone?: string | null },
): Promise<string | null> {
  const email = parseEmailAddr(opts.email);
  if (email) {
    const { data } = await sb
      .from("client")
      .select("id")
      .eq("tenant_id", tenantId)
      .contains("emails", [email])
      .limit(1)
      .maybeSingle();
    if (data) return data.id;
  }
  const digits = opts.phone?.replace(/[^\d]/g, "") ?? "";
  if (digits.length >= 7) {
    // Stored numbers vary in format (+91…, 91…, bare 10-digit). Probe the common
    // normalised variants so a saved client matches regardless of how it was typed.
    const variants = [...new Set([digits, `+${digits}`, digits.slice(-10)])].filter((v) => v.length >= 7);
    const ors = variants.map((v) => `phones.cs.{${v}}`).join(",");
    const { data } = await sb.from("client").select("id").eq("tenant_id", tenantId).or(ors).limit(1).maybeSingle();
    if (data) return data.id;
  }
  return null;
}

// Resolve where a classified document/email/message should be filed. CLIENT-FIRST:
// we always try to attach it to a client (matched by sender contact → LLM id →
// suggested name), independent of whether it's a "legal" matter. A CASE is an
// optional, later tag — auto-created only on a strong legal signal (a CNR or a
// clear suggested title). Creating a NEW client is kept conservative (is_legal)
// so stray mail never spawns junk clients; matching an EXISTING client always runs.
// Used by Gmail ingest, the self-hosted worker, and the messaging gateway.
export async function resolveFiling(
  sb: DB,
  tenantId: string,
  c: Classification,
  opts?: { email?: string | null; phone?: string | null; matchOnly?: boolean },
): Promise<FilingResult> {
  let clientId = c.client_id;
  let matterId = c.matter_id;
  let createdClient = false;
  let createdMatter = false;
  let matchedClientByContact = false;
  // A shortlist id from the classifier is already a concrete existing record → strong.
  let clientStrong = Boolean(c.client_id);
  let matterStrong = Boolean(c.matter_id);
  // matchOnly (WO-33 W4): link to EXISTING clients/cases only — never insert. Used by the
  // unattended audit re-scan so a re-run can't spawn junk clients/matters without a human.
  const matchOnly = opts?.matchOnly === true;

  // 1) Client — match a known client by sender contact (deterministic, strongest).
  if (!clientId && opts) {
    const byContact = await matchClientByContact(sb, tenantId, opts);
    if (byContact) {
      clientId = byContact;
      matchedClientByContact = true;
      clientStrong = true;
    }
  }
  // 2) Client — else by suggested name; create only when it's clearly legal.
  if (!clientId && c.suggested_client_name) {
    const name = c.suggested_client_name;
    const { data: found } = await sb
      .from("client")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("name", name)
      .maybeSingle();
    if (found) {
      clientId = found.id;
      clientStrong = true;
    } else if (c.is_legal && !matchOnly) {
      const email = parseEmailAddr(opts?.email);
      const { data } = await sb
        .from("client")
        .insert({ tenant_id: tenantId, name, type: "individual", emails: email ? [email] : [] })
        .select("id")
        .single();
      clientId = data?.id ?? null;
      createdClient = !!data;
    }
  }

  // 2b) Client — fuzzy-match the document's PARTY names against existing clients (WO-33 W2, JS
  //     trigram, no LLM). Match-only: a fuzzy party is too weak to spawn a NEW client (that would
  //     risk a wrong file), but it's a strong enough signal to derive an EXISTING one.
  if (!clientId && c.extracted.parties?.length) {
    const { data: cands } = await sb.from("client").select("id, name").eq("tenant_id", tenantId).limit(500);
    const id = bestMatch(c.extracted.parties, (cands ?? []).map((x) => ({ id: x.id, name: x.name })), 0.55);
    if (id) clientId = id;
  }

  // 3) Matter — optional, later tag. Only on a strong legal signal (CNR or title).
  if (!matterId && c.is_legal) {
    const cnr = c.extracted.cnrs?.[0]?.trim().toUpperCase();
    if (cnr) {
      const { data: found } = await sb.from("matter").select("id").eq("tenant_id", tenantId).eq("cnr", cnr).maybeSingle();
      if (found) {
        matterId = found.id;
        matterStrong = true; // exact CNR → existing case
      } else if (!matchOnly) {
        const { data } = await sb
          .from("matter")
          .insert({ tenant_id: tenantId, client_id: clientId, cnr, title: c.suggested_matter_title ?? `Case ${cnr}`, status: "active", source: "gmail" })
          .select("id")
          .single();
        matterId = data?.id ?? null;
        createdMatter = !!data;
        matterStrong = !!data; // a CNR is a deterministic key → strong
      }
    } else if (c.suggested_matter_title) {
      const { data: found } = await sb.from("matter").select("id").eq("tenant_id", tenantId).ilike("title", c.suggested_matter_title).maybeSingle();
      if (found) {
        matterId = found.id;
        matterStrong = true; // exact title → existing case
      } else if (!matchOnly) {
        const { data } = await sb
          .from("matter")
          .insert({ tenant_id: tenantId, client_id: clientId, title: c.suggested_matter_title, status: "active", source: "gmail" })
          .select("id")
          .single();
        matterId = data?.id ?? null;
        createdMatter = !!data;
      }
    } else if (c.extracted.parties?.length) {
      // Fuzzy-match party names against existing cases' party_names[] (WO-33 W2, match-only — never
      // create a case from a fuzzy party; that needs a CNR or an explicit title).
      const { data: matters } = await sb.from("matter").select("id, title, party_names").eq("tenant_id", tenantId).limit(500);
      const cands = (matters ?? []).flatMap((m) => {
        const names = (m.party_names && m.party_names.length ? m.party_names : [m.title]).filter(Boolean) as string[];
        return names.map((n) => ({ id: m.id as string, name: n }));
      });
      const id = bestMatch(c.extracted.parties, cands, 0.55);
      if (id) matterId = id;
    }
  }

  // If a matter was created/matched and a client resolved, ensure they're linked.
  if (matterId && clientId && createdMatter) {
    await sb.from("matter").update({ client_id: clientId }).eq("id", matterId);
  }

  return { clientId, matterId, createdClient, createdMatter, matchedClientByContact, clientStrong, matterStrong };
}
