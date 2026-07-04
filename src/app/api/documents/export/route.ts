import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/court/sync";
import { buildZip, type ZipEntry } from "@/lib/docs/zip";
import { buildManifestCsv, type ManifestRow } from "@/lib/docs/manifest";
import { CATEGORY_LABEL } from "@/lib/docs/categories";

export const dynamic = "force-dynamic";

// WO-27 Wave 3 — export selected documents as ONE zip (files + an index.csv register), replacing
// the old "open a signed URL per file in a new tab" bulk download (popup-blocker-broken past one
// file). Caps keep a serverless function from OOMing on a huge selection; anything skipped is
// reported in the manifest so a truncated export is never presented as complete.
const MAX_FILES = 100;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100 MB across the whole archive

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tenantId = await getTenantId(supabase);
  if (!tenantId) return NextResponse.json({ error: "no tenant" }, { status: 403 });

  let ids: string[] = [];
  try {
    const body = await request.json();
    ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown): x is string => typeof x === "string") : [];
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!ids.length) return NextResponse.json({ error: "nothing selected" }, { status: 400 });

  // RLS scopes this to the caller's tenant — they can only export their own documents.
  const { data: docs } = await supabase
    .from("document")
    .select("id, filename, storage_path, mime, size_bytes, doc_type, category, source, created_at, client_id, matter_id")
    .in("id", ids);
  if (!docs?.length) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Resolve client + case names once for the manifest (tenant-scoped via RLS).
  const clientIds = [...new Set(docs.map((d) => d.client_id).filter(Boolean))] as string[];
  const matterIds = [...new Set(docs.map((d) => d.matter_id).filter(Boolean))] as string[];
  const [{ data: clients }, { data: matters }] = await Promise.all([
    clientIds.length ? supabase.from("client").select("id, name").in("id", clientIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    matterIds.length ? supabase.from("matter").select("id, title").in("id", matterIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const matterName = new Map((matters ?? []).map((m) => [m.id, m.title]));

  const admin = createAdminClient();
  const entries: ZipEntry[] = [];
  const manifest: ManifestRow[] = [];
  let totalBytes = 0;
  let skippedCap = 0;
  let skippedMissing = 0;

  for (const d of docs) {
    // Always record the row in the manifest — even skipped ones — so the register is honest.
    manifest.push({
      filename: d.filename ?? "document",
      docType: d.doc_type,
      category: d.category ? CATEGORY_LABEL[d.category] ?? d.category : null,
      client: d.client_id ? clientName.get(d.client_id) ?? null : null,
      matter: d.matter_id ? matterName.get(d.matter_id) ?? null : null,
      source: d.source,
      sizeBytes: d.size_bytes,
      added: d.created_at,
    });

    if (!d.storage_path) { skippedMissing++; continue; }
    if (entries.length >= MAX_FILES) { skippedCap++; continue; }

    const { data: blob, error } = await admin.storage.from("documents").download(d.storage_path);
    if (error || !blob) { skippedMissing++; continue; }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (totalBytes + bytes.length > MAX_TOTAL_BYTES) { skippedCap++; continue; }
    totalBytes += bytes.length;
    entries.push({ name: d.filename ?? `document-${d.id}`, data: bytes });
  }

  if (!entries.length) return NextResponse.json({ error: "no files to export" }, { status: 404 });

  const noteParts: string[] = [];
  if (skippedCap) noteParts.push(`${skippedCap} document(s) not included — export is capped at ${MAX_FILES} files / ${MAX_TOTAL_BYTES / (1024 * 1024)} MB. Refine your selection to export the rest.`);
  if (skippedMissing) noteParts.push(`${skippedMissing} document(s) had no stored file and were listed but not included.`);
  const csv = buildManifestCsv(manifest, noteParts.join(" "));
  entries.unshift({ name: "index.csv", data: new TextEncoder().encode(csv) });

  const zip = buildZip(entries, new Date());

  await supabase.from("audit_event").insert({
    tenant_id: tenantId,
    action: "document.export",
    entity: "document",
    after: { requested: ids.length, exported: entries.length - 1, skippedCap, skippedMissing, bytes: totalBytes },
  });

  return new NextResponse(new Blob([zip], { type: "application/zip" }), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="documents-export.zip"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "no-store",
    },
  });
}
