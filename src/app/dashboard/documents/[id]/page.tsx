import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Card, Badge, Disclaimer, fmtDate, fmtSize } from "@/components/ui";
import { Icon } from "@/components/icons";
import { DocActions } from "@/components/doc-actions";
import { DraftReplyButton } from "@/components/draft-reply-button";
import { DocPreview } from "@/components/doc-preview";
import { CATEGORY_LABEL } from "@/lib/docs/categories";

const TEXT_LIMIT = 5000;

export default async function DocumentDetailPage({ params }: { params: { id: string } }) {
  const t = await getTranslations("documents");
  const SOURCE: Record<string, string> = {
    gmail: t("source.gmail"),
    upload: t("source.upload"),
    court_order: t("source.courtOrder"),
  };
  const supabase = createClient();

  // RLS scopes this to the caller's tenant — they can only see their own docs.
  const { data: doc } = await supabase
    .from("document")
    .select("id, filename, doc_type, category, source, client_id, matter_id, mime, size_bytes, storage_path, parsed_text, extracted, portal_shared, created_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!doc) notFound();

  // Resolve the matter (for its title + its client) and the directly-tagged client.
  const [{ data: matter }, { data: directClient }, { data: allMatters }, { data: allClients }] = await Promise.all([
    doc.matter_id ? supabase.from("matter").select("id, title, client_id").eq("id", doc.matter_id).maybeSingle() : Promise.resolve({ data: null }),
    doc.client_id ? supabase.from("client").select("id, name").eq("id", doc.client_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("matter").select("id, title").order("title"),
    supabase.from("client").select("id, name").order("name"),
  ]);

  // Client-first: a directly-tagged client wins; else resolve via the case's client.
  const resolvedClientId = doc.client_id ?? matter?.client_id ?? null;
  let clientName = directClient?.name ?? null;
  if (!clientName && resolvedClientId) {
    const { data: c } = await supabase.from("client").select("name").eq("id", resolvedClientId).maybeSingle();
    clientName = c?.name ?? null;
  }

  const matterOpts = (allMatters ?? []).map((m) => ({ id: m.id, label: m.title }));
  const clientOpts = (allClients ?? []).map((c) => ({ id: c.id, label: c.name }));

  const extracted = (doc.extracted && typeof doc.extracted === "object" && !Array.isArray(doc.extracted))
    ? (doc.extracted as Record<string, unknown>)
    : {};
  const summary = typeof extracted.summary === "string" && extracted.summary.trim() ? extracted.summary.trim() : null;

  const categoryLabel = doc.category && CATEGORY_LABEL[doc.category] ? CATEGORY_LABEL[doc.category] : t("category.other");
  const fullText = doc.parsed_text ?? "";
  const truncated = fullText.length > TEXT_LIMIT;
  const preview = truncated ? fullText.slice(0, TEXT_LIMIT) : fullText;

  const meta: { label: string; value: React.ReactNode }[] = [
    { label: t("field.category"), value: <Badge tone="brand">{categoryLabel}</Badge> },
    { label: t("field.type"), value: doc.doc_type ? <Badge>{doc.doc_type}</Badge> : <span className="text-ink-faint">—</span> },
    { label: t("field.source"), value: SOURCE[doc.source] ?? doc.source },
    { label: t("field.size"), value: fmtSize(doc.size_bytes) },
    { label: t("field.added"), value: fmtDate(doc.created_at) },
  ];

  return (
    <div className="space-y-7">
      <Link href="/dashboard/documents" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <Icon name="back" className="h-4 w-4" /> {t("back")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 text-[1.6rem] font-semibold leading-tight">
            <Icon name="documents" className="h-6 w-6 shrink-0 text-ink-faint" />
            <span className="break-words">{doc.filename ?? t("untitled")}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="brand">{categoryLabel}</Badge>
            {doc.doc_type && <Badge>{doc.doc_type}</Badge>}
            <span className="text-xs text-ink-faint">{t("via", { source: SOURCE[doc.source] ?? doc.source })}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/documents/${doc.id}/download`} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-sm">
            <Icon name="external" className="h-4 w-4" /> {t("download")}
          </a>
          <DraftReplyButton documentId={doc.id} />
          <DocActions documentId={doc.id} matterId={doc.matter_id} clientId={doc.client_id} matters={matterOpts} clients={clientOpts} shared={doc.portal_shared} docType={doc.doc_type} />
        </div>
      </header>

      {/* Metadata grid */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {meta.map((m) => (
          <div key={m.label} className="card p-4">
            <p className="label">{m.label}</p>
            <p className="mt-1.5 text-sm text-ink">{m.value}</p>
          </div>
        ))}
        <div className="card p-4">
          <p className="label">{t("field.filedUnder")}</p>
          <div className="mt-1.5 space-y-0.5 text-sm">
            {clientName ? (
              resolvedClientId ? (
                <Link href={`/dashboard/clients/${resolvedClientId}`} className="font-medium text-brand-600 hover:underline">{clientName}</Link>
              ) : (
                <span className="font-medium text-ink">{clientName}</span>
              )
            ) : !matter ? (
              <span className="text-amber-600">{t("unfiled")}</span>
            ) : null}
            {matter && (
              <Link href={`/dashboard/cases/${matter.id}`} className="block text-xs text-brand-600 hover:underline">
                {matter.title}
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Inline file preview — the actual document, not just its extracted text. */}
      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-base font-medium">{t("preview.heading")}</h2>
        </div>
        <div className="p-4">
          <DocPreview documentId={doc.id} mime={doc.mime} filename={doc.filename} hasFile={Boolean(doc.storage_path)} />
        </div>
      </Card>

      {/* Summary */}
      {summary && (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line bg-brand-50/40 px-5 py-3.5">
            <Icon name="sparkles" className="h-4 w-4 text-brand-600" />
            <h2 className="text-base font-medium">{t("summaryHeading")}</h2>
          </div>
          <div className="px-5 py-5">
            <p className="text-[0.95rem] leading-relaxed text-ink-soft">{summary}</p>
            <p className="mt-3 text-xs text-ink-faint">{t("summaryDisclaimer")}</p>
          </div>
        </Card>
      )}

      {/* Extracted text */}
      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-base font-medium">{t("extractedHeading")}</h2>
          <p className="mt-0.5 text-xs text-ink-faint">{t("extracted.parsed")}{truncated ? t("extracted.showingFirst", { count: TEXT_LIMIT.toLocaleString("en-IN") }) : ""}.</p>
        </div>
        {preview.trim() ? (
          <div className="px-5 py-5">
            <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-xl bg-paper p-4 font-mono text-xs leading-relaxed text-ink-soft">{preview}{truncated ? "\n\n…" : ""}</pre>
            {truncated && <p className="mt-2 text-xs text-ink-faint">{t("extracted.truncatedNote")}</p>}
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-ink-faint">{t("extracted.empty")}</p>
        )}
      </Card>

      <Card className="px-5 py-4">
        <p className="text-sm text-ink-muted">
          {t("field.source")} <span className="font-medium text-ink-soft">{SOURCE[doc.source] ?? doc.source}</span> · {t("footer.added")}{" "}
          {doc.created_at ? new Date(doc.created_at).toLocaleString("en-IN") : "—"}
        </p>
      </Card>

      <Disclaimer />
    </div>
  );
}
