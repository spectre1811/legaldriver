import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";
import type { MailClient } from "./client";
import { extractText } from "@/lib/docs/extract";
import { classifyDocument, type Classification } from "@/lib/docs/classify";

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
): Promise<IngestSummary> {
  const { emails, newHistoryId } = await mail.fetchNew(sinceHistoryId);

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

    // Classify each attachment (extract text first), upload to storage, file.
    const classifications: Classification[] = [];
    for (const att of email.attachments) {
      const path = `${tenantId}/${emailId}/${att.filename}`;
      await supabase.storage.from(BUCKET).upload(path, att.data, {
        contentType: att.mime,
        upsert: true,
      });

      const { text, needsOcr } = await extractText(att.data, att.mime, att.filename);
      const cls = await classifyDocument({
        filename: att.filename,
        docTextOrSnippet: text || `${email.subject}\n${email.snippet}`,
        clients: clientList,
        matters: matterList,
      });
      classifications.push(cls);

      await supabase.from("document").insert({
        tenant_id: tenantId,
        source: "gmail",
        storage_path: path,
        filename: att.filename,
        mime: att.mime,
        parsed_text: text || null,
        doc_type: cls.doc_type,
        client_id: cls.client_id,
        matter_id: cls.matter_id,
        extracted: { ...cls.extracted, summary: cls.summary, needsOcr: needsOcr ?? false } as Database["public"]["Tables"]["document"]["Insert"]["extracted"],
        email_message_id: emailId,
      });
      documents++;
    }

    // Email-level classification: from the email body, plus the best attachment.
    const emailCls = await classifyDocument({
      filename: `email:${email.subject}`,
      docTextOrSnippet: `${email.subject}\n${email.body}`,
      clients: clientList,
      matters: matterList,
    });
    const best = [emailCls, ...classifications].sort((a, b) => b.confidence - a.confidence)[0];

    const status = best.confidence >= THRESHOLD && (best.client_id || best.matter_id) ? "filed" : "needs_review";
    if (status === "filed") filed++;
    else needsReview++;

    await supabase
      .from("email_message")
      .update({
        classified_client_id: best.client_id,
        classified_matter_id: best.matter_id,
        confidence: best.confidence,
        status,
      })
      .eq("id", emailId);

    await supabase.from("audit_event").insert({
      tenant_id: tenantId,
      action: status === "filed" ? "email.filed" : "email.needs_review",
      entity: "email_message",
      entity_id: emailId,
      after: { from: email.from, confidence: best.confidence, doc_type: best.doc_type },
    });
  }

  return { fetched: emails.length, filed, needsReview, documents, newHistoryId };
}
