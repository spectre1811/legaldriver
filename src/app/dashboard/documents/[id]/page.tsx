import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fmtSize } from "@/components/ui";
import { formatCourtDate } from "@/components/court";
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
  // AI brief = the document summary the ingest pipeline extracted, when present. Honestly bound —
  // no summary → the panel drops (never fabricated).
  const summary = typeof extracted.summary === "string" && extracted.summary.trim() ? extracted.summary.trim() : null;

  const categoryLabel = doc.category && CATEGORY_LABEL[doc.category] ? CATEGORY_LABEL[doc.category] : t("category.other");
  const fullText = doc.parsed_text ?? "";
  const truncated = fullText.length > TEXT_LIMIT;
  const preview = truncated ? fullText.slice(0, TEXT_LIMIT) : fullText;

  const meta: { label: string; value: React.ReactNode }[] = [
    { label: t("field.category"), value: <span className="ec-chip ec-chip-hot">{categoryLabel}</span> },
    { label: t("field.type"), value: doc.doc_type ? <span className="ec-chip">{doc.doc_type}</span> : <span className="text-ec-ink-3">—</span> },
    { label: t("field.source"), value: <span className="ec-chip">{SOURCE[doc.source] ?? doc.source}</span> },
    { label: t("field.size"), value: <span className="num text-ec-ink">{fmtSize(doc.size_bytes)}</span> },
    { label: t("field.added"), value: <span className="num text-ec-ink">{formatCourtDate(doc.created_at) ?? "—"}</span> },
  ];

  return (
    <div className="space-y-7">
      <Link href="/dashboard/documents" className="inline-flex items-center gap-1.5 text-sm font-medium text-ec-bronze hover:underline">
        <Icon name="back" className="h-4 w-4" /> {t("back")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2.5 font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ec-ink">
            <Icon name="documents" className="h-6 w-6 shrink-0 text-ec-ink-3" />
            <span className="break-words">{doc.filename ?? t("untitled")}</span>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="ec-chip ec-chip-hot">{categoryLabel}</span>
            {doc.doc_type && <span className="ec-chip">{doc.doc_type}</span>}
            <span className="text-xs text-ec-ink-3">{t("via", { source: SOURCE[doc.source] ?? doc.source })}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/api/documents/${doc.id}/download`} target="_blank" rel="noopener noreferrer" className="ec-btn ec-btn-ink text-sm">
            <Icon name="external" className="h-4 w-4" /> {t("download")}
          </a>
          <DraftReplyButton documentId={doc.id} />
          <DocActions documentId={doc.id} matterId={doc.matter_id} clientId={doc.client_id} matters={matterOpts} clients={clientOpts} shared={doc.portal_shared} docType={doc.doc_type} />
        </div>
      </header>

      {/* Metadata grid */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {meta.map((m) => (
          <div key={m.label} className="ec-card px-4 py-3.5">
            <p className="ec-label">{m.label}</p>
            <p className="mt-1.5 text-sm text-ec-ink">{m.value}</p>
          </div>
        ))}
        <div className="ec-card px-4 py-3.5">
          <p className="ec-label">{t("field.filedUnder")}</p>
          <div className="mt-1.5 space-y-0.5 text-sm">
            {clientName ? (
              resolvedClientId ? (
                <Link href={`/dashboard/clients/${resolvedClientId}`} className="font-medium text-ec-bronze hover:underline">{clientName}</Link>
              ) : (
                <span className="font-medium text-ec-ink">{clientName}</span>
              )
            ) : !matter ? (
              <span className="ec-chip ec-chip-warn">{t("unfiled")}</span>
            ) : null}
            {matter && (
              <Link href={`/dashboard/cases/${matter.id}`} className="block text-xs text-ec-bronze hover:underline">
                {matter.title}
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* AI brief — the extracted summary, when the ingest pipeline produced one. Honey-ruled panel:
          the one accent that marks the read-by-the-AI layer. Drops entirely when there is no summary. */}
      {summary && (
        <section className="ec-card overflow-hidden border-l-2 border-l-ec-honey">
          <div className="flex items-center gap-2 border-b border-ec-hair bg-ec-bronze-tint/40 px-5 py-3.5">
            <Icon name="sparkles" className="h-4 w-4 text-ec-bronze" />
            <h2 className="ec-label !tracking-normal text-[13px] normal-case text-ec-ink">{t("summaryHeading")}</h2>
          </div>
          <div className="px-5 py-5">
            <p className="text-[0.95rem] leading-relaxed text-ec-ink-2">{summary}</p>
            <p className="mt-3 text-xs text-ec-ink-3">{t("summaryDisclaimer")}</p>
          </div>
        </section>
      )}

      {/* Inline file preview — the actual document, not just its extracted text. */}
      <section className="ec-card overflow-hidden">
        <div className="border-b border-ec-hair bg-ec-paper-3 px-5 py-3.5">
          <h2 className="ec-label !tracking-normal text-[13px] normal-case text-ec-ink">{t("preview.heading")}</h2>
        </div>
        <div className="p-4">
          <DocPreview documentId={doc.id} mime={doc.mime} filename={doc.filename} hasFile={Boolean(doc.storage_path)} />
        </div>
      </section>

      {/* Extracted text */}
      <section className="ec-card overflow-hidden">
        <div className="border-b border-ec-hair bg-ec-paper-3 px-5 py-3.5">
          <h2 className="ec-label !tracking-normal text-[13px] normal-case text-ec-ink">{t("extractedHeading")}</h2>
          <p className="mt-0.5 text-xs text-ec-ink-3">{t("extracted.parsed")}{truncated ? t("extracted.showingFirst", { count: TEXT_LIMIT.toLocaleString("en-IN") }) : ""}.</p>
        </div>
        {preview.trim() ? (
          <div className="px-5 py-5">
            <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-ec-s bg-ec-paper-3 p-4 font-mono text-xs leading-relaxed text-ec-ink-2">{preview}{truncated ? "\n\n…" : ""}</pre>
            {truncated && <p className="mt-2 text-xs text-ec-ink-3">{t("extracted.truncatedNote")}</p>}
          </div>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-ec-ink-3">{t("extracted.empty")}</p>
        )}
      </section>

      <div className="ec-card px-5 py-4">
        <p className="text-sm text-ec-ink-2">
          {t("field.source")} <span className="font-medium text-ec-ink">{SOURCE[doc.source] ?? doc.source}</span> · {t("footer.added")}{" "}
          <span className="num">{doc.created_at ? new Date(doc.created_at).toLocaleString("en-IN") : "—"}</span>
        </p>
      </div>
    </div>
  );
}
