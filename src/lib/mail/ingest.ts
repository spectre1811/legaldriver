import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { MailClient } from "./client";
import { extractText } from "@/lib/docs/extract";
import { classifyDocument, type Classification } from "@/lib/docs/classify";
import { resolveFiling } from "@/lib/docs/autofile";
import { sha256Hex } from "@/lib/docs/hash";

type DB = SupabaseClient<Database>;
const THRESHOLD = Number(process.env.CONFIDENCE_THRESHOLD ?? "0.7");
const BUCKET = "documents";

export interface IngestSummary {
  fetched: number;
  filed: number;
  needsReview: number;
  documents: number;
  newHistoryId?: string;
}

// Fetch new mail and run the file-and-parse pipeline for one tenant/user.
// LLM classifies; deterministic code files. Low confidence → needs_review.
export async function ingestMail(
  supabase: DB,
  tenantId: string,
  userId: string | null,
  mail: MailClient,
  sinceHistoryId?: string | null,
  backfillCount?: number,
): Promise<IngestSummary> {
  // Backfill mode loads the most recent N messages regardless of the cursor (for
  // "load earlier emails"); otherwise incremental fetch since the last historyId.
  const { emails, newHistoryId } = backfillCount
    ? await mail.fetchBackfill(backfillCount)
    : await mail.fetchNew(sinceHistoryId);

  // Tenant shortlist for classification (bounded).
  const [{ data: clients }, { data: matters }] = await Promise.all([
    supabase.from("client").select("id, name").eq("tenant_id", tenantId).limit(100),
    supabase.from("matter").select("id, title, cnr").eq("tenant_id", tenantId).limit(100),
  ]);
  const clientList = clients ?? [];
  const matterList = matters ?? [];

  let filed = 0;
  let needsReview = 0;
  let documents = 0;

  for (const email of emails) {
    // Dedupe on (tenant, provider id).
    const { data: existing } = await supabase
      .from("email_message")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("gmail_id", email.providerId)
      .maybeSingle();
    if (existing) continue;

    const { data: emailRow, error: emailErr } = await supabase
      .from("email_message")
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        gmail_id: email.providerId,
        gmail_history_id: email.historyId ?? null,
        from_addr: email.from,
        subject: email.subject,
        received_at: email.receivedAt,
        snippet: email.snippet,
        status: "pending",
      })
      .select("id")
      .single();
    if (emailErr || !emailRow) continue;
    const emailId = emailRow.id;

    // Extract + upload + classify each attachment (defer the document insert until
    // we know the resolved filing, so the doc rows get the matched/created ids).
    type Pending = { att: (typeof email.attachments)[number]; path: string; text: string; needsOcr?: boolean; extractError?: string; cls: Classification; contentHash: string };
    const pending: Pending[] = [];
    for (const att of email.attachments) {
      const path = `${tenantId}/${emailId}/${att.filename}`;
      await supabase.storage.from(BUCKET).upload(path, att.data, { contentType: att.mime, upsert: true });
      const contentHash = await sha256Hex(att.data);
      const { text, needsOcr, error: extractError } = await extractText(att.data, att.mime, att.filename);
      const cls = await classifyDocument({
        filename: att.filename,
        docTextOrSnippet: text || `${email.subject}\n${email.snippet}`,
        clients: clientList,
        matters: matterList,
        tenantId,
      });
      pending.push({ att, path, text, needsOcr, extractError, cls, contentHash });
    }

    // Email-level classification, then pick the highest-confidence signal overall.
    const emailCls = await classifyDocument({
      filename: `email:${email.subject}`,
      docTextOrSnippet: `${email.subject}\n${email.body}`,
      clients: clientList,
      matters: matterList,
      tenantId,
    });
    const best = [emailCls, ...pending.map((p) => p.cls)].sort((a, b) => b.confidence - a.confidence)[0];

    // Client-first: pass the sender address so a known client is matched
    // deterministically — the document files to that client even with no case.
    const filing = await resolveFiling(supabase, tenantId, best, { email: email.from });
    if (filing.createdClient || filing.createdMatter) {
      // Refresh the shortlist so later emails in this run can match the new entities.
      if (filing.createdClient && best.suggested_client_name) clientList.push({ id: filing.clientId!, name: best.suggested_client_name });
      if (filing.createdMatter) matterList.push({ id: filing.matterId!, title: best.suggested_matter_title ?? `Case`, cnr: best.extracted.cnrs?.[0] ?? null });
    }

    const fileable = Boolean(filing.clientId || filing.matterId);
    // A known-client contact match is itself high-confidence filing, even if the
    // text classifier was unsure and even when there's no case to attach.
    const confident = best.confidence >= THRESHOLD || filing.createdClient || filing.createdMatter || filing.matchedClientByContact;
    const status: "filed" | "needs_review" = fileable && confident ? "filed" : "needs_review";
    if (status === "filed") filed++;
    else needsReview++;

    // Now insert the documents, filed under the resolved ids when we're confident.
    // Skip exact dupes (same tenant + content_hash) so re-ingested attachments don't
    // pile up duplicate document rows; the email_message itself is still recorded.
    for (const p of pending) {
      const { data: dupe } = await supabase
        .from("document")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("content_hash", p.contentHash)
        .limit(1)
        .maybeSingle();
      if (dupe) continue;
      const { error: docErr } = await supabase.from("document").insert({
        tenant_id: tenantId,
        source: "gmail",
        storage_path: p.path,
        filename: p.att.filename,
        mime: p.att.mime,
        size_bytes: p.att.data.length,
        parsed_text: p.text || null,
        doc_type: p.cls.doc_type,
        category: p.cls.category,
        client_id: status === "filed" ? filing.clientId : p.cls.client_id,
        matter_id: status === "filed" ? filing.matterId : p.cls.matter_id,
        content_hash: p.contentHash,
        extracted: { ...p.cls.extracted, summary: p.cls.summary, needsOcr: p.needsOcr ?? false, ...(p.extractError ? { extractError: p.extractError } : {}) } as Database["public"]["Tables"]["document"]["Insert"]["extracted"],
        email_message_id: emailId,
      });
      if (docErr) continue; // skip this attachment, don't miscount; never throw the run
      documents++;
    }

    await supabase
      .from("email_message")
      .update({
        classified_client_id: filing.clientId,
        classified_matter_id: filing.matterId,
        confidence: best.confidence,
        status,
      })
      .eq("id", emailId);

    await supabase.from("audit_event").insert({
      tenant_id: tenantId,
      action: status === "filed" ? "email.filed" : "email.needs_review",
      entity: "email_message",
      entity_id: emailId,
      after: {
        from: email.from,
        confidence: best.confidence,
        doc_type: best.doc_type,
        createdClient: filing.createdClient,
        createdMatter: filing.createdMatter,
      },
    });
  }

  return { fetched: emails.length, filed, needsReview, documents, newHistoryId };
}
