import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, fmtDate, fmtSize } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/docs/categories";
import { FilterBar } from "./filter-bar";
import { DocumentsUpload } from "./documents-upload";
import { DocumentsBrowser, type DocRow } from "./documents-browser";

const CATEGORY_ICON: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.icon]));

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: { q?: string; source?: string; type?: string; filed?: string; client?: string; category?: string; trash?: string };
}) {
  const t = await getTranslations("documents");
  const isTrash = searchParams.trash === "1";
  const SOURCE: Record<string, string> = {
    gmail: t("source.gmail"),
    upload: t("source.upload"),
    court_order: t("source.courtOrder"),
  };
  const supabase = createClient();
  const { q, source, type, filed, client, category } = searchParams;

  // Matters carry client_id so we can resolve a document's client even when it's
  // only tagged to a case. Fetch this first — the client filter needs the map.
  const { data: matters } = await supabase.from("matter").select("id, title, client_id");
  const matterClient = new Map((matters ?? []).map((m) => [m.id, m.client_id]));

  let query = supabase
    .from("document")
    .select("id, filename, doc_type, category, source, client_id, matter_id, size_bytes, parsed_text, portal_shared, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (q) query = query.textSearch("fts", q, { type: "websearch" });
  if (source) query = query.eq("source", source);
  if (type) query = query.eq("doc_type", type);
  if (category) query = query.eq("category", category);
  if (filed === "filed") query = query.or("matter_id.not.is.null,client_id.not.is.null");
  if (filed === "unfiled") query = query.is("matter_id", null).is("client_id", null);
  if (client) {
    // A doc belongs to a client directly (client_id) or via a tagged case
    // whose matter belongs to that client.
    const matterIds = (matters ?? []).filter((m) => m.client_id === client).map((m) => m.id);
    query = matterIds.length
      ? query.or(`client_id.eq.${client},matter_id.in.(${matterIds.join(",")})`)
      : query.eq("client_id", client);
  }
  // WO-27 Wave 2 — soft-delete: the main list hides trashed docs; the Trash view shows only them.
  query = isTrash
    ? query.not("extracted->>deletedAt", "is", null)
    : query.filter("extracted->>deletedAt", "is", null);

  const [{ data: docs }, { data: clients }, { data: typeRows }, { count: trashCount }, { count: reviewCount }] = await Promise.all([
    query,
    supabase.from("client").select("id, name"),
    supabase.from("document").select("doc_type").not("doc_type", "is", null).limit(1000),
    supabase.from("document").select("id", { count: "exact", head: true }).not("extracted->>deletedAt", "is", null),
    // WO-32: needs-review = flagged OR unfiled, not trashed — the Review Inbox count.
    supabase.from("document").select("id", { count: "exact", head: true })
      .filter("extracted->>deletedAt", "is", null)
      .or("extracted->>status.eq.needs_review,and(client_id.is.null,matter_id.is.null)"),
  ]);

  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const matterName = new Map((matters ?? []).map((m) => [m.id, m.title]));
  const clientOpts = (clients ?? []).map((c) => ({ id: c.id, label: c.name }));
  const matterOpts = (matters ?? []).map((m) => ({ id: m.id, label: m.title }));
  const types = [...new Set((typeRows ?? []).map((t) => t.doc_type).filter(Boolean) as string[])].sort();

  const activeFilters = Boolean(q || source || type || filed || client || category);

  type Doc = NonNullable<typeof docs>[number];

  // Group rows by canonical category, then iterate in CATEGORY_ORDER so sections
  // appear in a stable legal-practice order. Unknown/missing categories fall back
  // to "other". Empty categories are skipped.
  const groups = new Map<string, Doc[]>();
  for (const d of docs ?? []) {
    const key = d.category && CATEGORY_LABEL[d.category] ? d.category : "other";
    const bucket = groups.get(key) ?? [];
    if (!groups.has(key)) groups.set(key, bucket);
    bucket.push(d);
  }
  // Resolve display fields server-side (client-first: direct client, else via the tagged case's
  // client) into serialisable rows for the client-side selectable browser.
  const toRow = (d: Doc): DocRow => {
    const resolvedClientId = d.client_id ?? (d.matter_id ? matterClient.get(d.matter_id) ?? null : null);
    const clientLabel = resolvedClientId ? clientName.get(resolvedClientId) ?? null : null;
    const caseLabel = d.matter_id ? matterName.get(d.matter_id) ?? null : null;
    return {
      id: d.id, filename: d.filename ?? "—", docType: d.doc_type,
      primary: clientLabel ?? caseLabel, secondary: clientLabel ? caseLabel : null,
      sourceLabel: SOURCE[d.source] ?? d.source, sizeLabel: fmtSize(d.size_bytes), dateLabel: fmtDate(d.created_at),
      matterId: d.matter_id, clientId: d.client_id, shared: d.portal_shared,
    };
  };
  const sectionData = CATEGORY_ORDER.filter((k) => groups.has(k)).map((k) => ({
    cat: k, label: CATEGORY_LABEL[k], icon: CATEGORY_ICON[k] ?? "documents",
    rows: groups.get(k)!.map(toRow),
  }));
  const orderedIds = sectionData.flatMap((s) => s.rows.map((r) => r.id));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title={isTrash ? t("trash.title") : t("title")} subtitle={isTrash ? t("trash.subtitle") : t("subtitle")} />
        <div className="flex shrink-0 items-center gap-2">
          {!isTrash && (reviewCount ?? 0) > 0 && (
            <Link href="/dashboard/documents/review" className="btn-primary text-sm">
              <Icon name="sparkles" className="h-4 w-4" />
              <span className="ml-1.5">{t("review.link", { n: reviewCount ?? 0 })}</span>
            </Link>
          )}
          <Link href={isTrash ? "/dashboard/documents" : "/dashboard/documents?trash=1"} className="btn-ghost text-sm">
            <Icon name={isTrash ? "back" : "trash"} className="h-4 w-4" />
            <span className="ml-1.5">{isTrash ? t("trash.back") : t("trash.link", { n: trashCount ?? 0 })}</span>
          </Link>
        </div>
      </div>

      {!isTrash && <DocumentsUpload />}
      {!isTrash && <FilterBar types={types} clients={clientOpts} />}

      {sectionData.length ? (
        <>
          <div className="text-xs text-ink-faint">
            {isTrash
              ? t("trash.count", { docs: (docs ?? []).length })
              : t("summary.count", { docs: (docs ?? []).length, categories: sectionData.length })}
            {activeFilters ? ` · ${t("summary.filtered")}` : ""}
          </div>
          <DocumentsBrowser sections={sectionData} orderedIds={orderedIds} matterOpts={matterOpts} clientOpts={clientOpts} trash={isTrash} />
        </>
      ) : (
        <EmptyState
          icon={isTrash ? "trash" : "documents"}
          title={isTrash ? t("trash.emptyTitle") : activeFilters ? t("empty.filteredTitle") : t("empty.emptyTitle")}
          body={isTrash ? t("trash.emptyBody") : activeFilters ? t("empty.filteredBody") : t("empty.emptyBody")}
        />
      )}

      <p className="text-xs text-ink-faint">{t("storageNote")}</p>
    </div>
  );
}
