import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/db/database.types";
import { extractText } from "./extract";
import { classifyDocument } from "./classify";
import { classificationFromCache } from "./classification-cache";
import { sha256Hex } from "./hash";
import { decideFiling } from "./filing-decision";

// WO-27 · The ONE path a human-uploaded file takes — extract → classify → file — so a manual upload
// gets the SAME auto-filing intelligence as an inbound email (previously only mail/ingest did this).
// Factored out of mail/ingest so the hub, case, and client upload actions all share it.
//
// Guardrail (WO-27 / product-depth §4): auto-file = SUGGEST with confidence, never force. So:
//  - an explicit context (a case/client upload already knows its matter/client) is RESPECTED, never
//    overridden by the classifier;
//  - a hub upload with no context links only to an EXISTING high-confidence match, and otherwise is
//    left unfiled + marked `needs_review` for the triage view — we NEVER silently spawn a new
//    client/matter from a human upload.

const BUCKET = "documents";

export type FileUploadResult =
  | { ok: true; documentId: string; status: "filed" | "needs_review" | "duplicate"; docType: string; needsOcr: boolean }
  | { ok: false; error: string };

export async function fileUploadedDocument(opts: {
  tenantId: string;
  buffer: Buffer;
  mime: string;
  filename: string;
  pathPrefix: string; // "hub" | "client/<id>" | "cases/<id>" — namespaces the storage object
  source?: string; // document.source; default "upload"
  context?: { clientId?: string | null; matterId?: string | null }; // explicit link — wins over the classifier
}): Promise<FileUploadResult> {
  const { tenantId, buffer, mime, filename, pathPrefix, source = "upload", context } = opts;
  const admin = createAdminClient();

  // Dedup on content (sha256) — the same file uploaded twice is skipped, not re-stored. Scoped to
  // the tenant; within an explicit case/client context, scoped to that link so the same PDF can sit
  // under two matters intentionally.
  const contentHash = await sha256Hex(buffer);
  let dupQ = admin.from("document").select("id").eq("tenant_id", tenantId).eq("content_hash", contentHash);
  if (context?.matterId) dupQ = dupQ.eq("matter_id", context.matterId);
  else if (context?.clientId) dupQ = dupQ.eq("client_id", context.clientId);
  const { data: dup } = await dupQ.limit(1).maybeSingle();
  if (dup) return { ok: true, documentId: dup.id, status: "duplicate", docType: "", needsOcr: false };

  const storagePath = `${tenantId}/${pathPrefix}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${filename}`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mime || "application/octet-stream", upsert: true });
  if (upErr) return { ok: false, error: upErr.message };

  const { text, needsOcr, error: extractError } = await extractText(buffer, mime || "", filename);

  // Classifier shortlists — the tenant's clients + matters (admin client is tenant-filtered manually).
  const [{ data: clients }, { data: matters }] = await Promise.all([
    admin.from("client").select("id, name").eq("tenant_id", tenantId).limit(500),
    admin.from("matter").select("id, title, cnr").eq("tenant_id", tenantId).limit(500),
  ]);

  // Classification cache (WO-33): if this EXACT content was already read for the tenant, reuse the
  // extraction and SKIP the paid LLM call — the biggest AI-cost lever (research §7). The stale
  // client/matter MATCH is deliberately NOT reused (it was for another time/context); the filing is
  // re-decided from `context` below, so a case/client upload still files correctly.
  const { data: cached } = await admin
    .from("document")
    .select("doc_type, category, extracted")
    .eq("tenant_id", tenantId)
    .eq("content_hash", contentHash)
    .not("doc_type", "is", null)
    .limit(1)
    .maybeSingle();

  const cls = cached?.doc_type
    ? classificationFromCache(cached)
    : await classifyDocument({
        filename,
        docTextOrSnippet: text || filename,
        clients: (clients ?? []).map((c) => ({ id: c.id, name: c.name })),
        matters: (matters ?? []).map((m) => ({ id: m.id, title: m.title, cnr: m.cnr })),
        tenantId,
      });

  const { clientId, matterId, status } = decideFiling(cls, context);

  const { data: inserted, error: insErr } = await admin
    .from("document")
    .insert({
      tenant_id: tenantId,
      source,
      storage_path: storagePath,
      filename,
      mime: mime || "application/octet-stream",
      size_bytes: buffer.length,
      parsed_text: text || null,
      doc_type: cls.doc_type,
      category: cls.category,
      client_id: clientId,
      matter_id: matterId,
      content_hash: contentHash,
      // Everything the audit called "stored but hidden" lives here for the triage/detail views to surface.
      extracted: {
        ...cls.extracted,
        summary: cls.summary,
        needsOcr: needsOcr ?? false,
        confidence: cls.confidence,
        isLegal: cls.is_legal,
        status,
        ...(cls.suggested_client_name ? { suggestedClientName: cls.suggested_client_name } : {}),
        ...(cls.suggested_matter_title ? { suggestedMatterTitle: cls.suggested_matter_title } : {}),
        ...(extractError ? { extractError } : {}),
      } as Database["public"]["Tables"]["document"]["Insert"]["extracted"],
    })
    .select("id")
    .single();
  if (insErr || !inserted) return { ok: false, error: insErr?.message ?? "insert failed" };

  return { ok: true, documentId: inserted.id, status, docType: cls.doc_type, needsOcr: needsOcr ?? false };
}
