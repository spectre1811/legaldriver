import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState, fmtDate, fmtSize } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";
import { DocActions } from "@/components/doc-actions";
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/docs/categories";
import { FilterBar } from "./filter-bar";
import { DocumentsUpload } from "./documents-upload";

const CATEGORY_ICON: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.icon]));

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: { q?: string; source?: string; type?: string; filed?: string; client?: string; category?: string };
}) {
  const t = await getTranslations("documents");
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

  const [{ data: docs }, { data: clients }, { data: typeRows }] = await Promise.all([
    query,
    supabase.from("client").select("id, name"),
    supabase.from("document").select("doc_type").not("doc_type", "is", null).limit(1000),
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
  const sections = CATEGORY_ORDER.filter((k) => groups.has(k)).map((k) => [k, groups.get(k)!] as const);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <DocumentsUpload />

      <FilterBar types={types} clients={clientOpts} />

      {docs && docs.length ? (
        <div className="space-y-6">
          <div className="text-xs text-ink-faint">
            {t("summary.count", { docs: docs.length, categories: sections.length })}{activeFilters ? ` · ${t("summary.filtered")}` : ""}
          </div>
          {sections.map(([cat, rows]) => (
            <Card key={cat} className="overflow-hidden">
              <div className="flex items-center gap-2.5 border-b border-line bg-paper/60 px-5 py-3">
                <Icon name={(CATEGORY_ICON[cat] as IconName) ?? "documents"} className="h-4 w-4 text-brand-600" />
                <h2 className="text-sm font-semibold text-ink">{CATEGORY_LABEL[cat]}</h2>
                <span className="text-xs text-ink-faint">{rows.length}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    <th className="px-5 py-3 label">{t("field.file")}</th>
                    <th className="hidden px-5 py-3 label sm:table-cell">{t("field.type")}</th>
                    <th className="px-5 py-3 label">{t("field.filedUnder")}</th>
                    <th className="hidden px-5 py-3 label md:table-cell">{t("field.source")}</th>
                    <th className="hidden px-5 py-3 label lg:table-cell">{t("field.size")}</th>
                    <th className="hidden px-5 py-3 label lg:table-cell">{t("field.added")}</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    // Client-first: resolve directly, else via the tagged case's client.
                    const resolvedClientId = d.client_id ?? (d.matter_id ? matterClient.get(d.matter_id) ?? null : null);
                    const clientLabel = resolvedClientId ? clientName.get(resolvedClientId) ?? null : null;
                    const caseLabel = d.matter_id ? matterName.get(d.matter_id) ?? null : null;
                    const primary = clientLabel ?? caseLabel;
                    const secondary = clientLabel ? caseLabel : null;
                    return (
                      <tr key={d.id} className="border-b border-line last:border-0 hover:bg-paper">
                        <td className="px-5 py-3.5">
                          <Link href={`/dashboard/documents/${d.id}`} className="flex items-center gap-2.5 group">
                            <Icon name="documents" className="h-4 w-4 shrink-0 text-ink-faint" />
                            <span className="font-medium text-ink group-hover:text-brand-700 group-hover:underline">{d.filename ?? "—"}</span>
                          </Link>
                        </td>
                        <td className="hidden px-5 py-3.5 sm:table-cell">{d.doc_type ? <Badge>{d.doc_type}</Badge> : <span className="text-ink-faint">—</span>}</td>
                        <td className="px-5 py-3.5 text-ink-muted">
                          {primary ? (
                            <span className="flex flex-col leading-tight">
                              <span className="font-medium text-ink">{primary}</span>
                              {secondary && <span className="mt-0.5 text-xs text-ink-faint">{secondary}</span>}
                            </span>
                          ) : (
                            <span className="text-amber-600">{t("unfiled")}</span>
                          )}
                        </td>
                        <td className="hidden px-5 py-3.5 text-xs text-ink-faint md:table-cell">{SOURCE[d.source] ?? d.source}</td>
                        <td className="hidden px-5 py-3.5 text-xs text-ink-faint lg:table-cell">{fmtSize(d.size_bytes)}</td>
                        <td className="hidden px-5 py-3.5 text-xs text-ink-faint lg:table-cell">{fmtDate(d.created_at)}</td>
                        <td className="px-5 py-3.5 text-right">
                          <DocActions documentId={d.id} matterId={d.matter_id} clientId={d.client_id} matters={matterOpts} clients={clientOpts} shared={d.portal_shared} docType={d.doc_type} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon="documents" title={activeFilters ? t("empty.filteredTitle") : t("empty.emptyTitle")} body={activeFilters ? t("empty.filteredBody") : t("empty.emptyBody")} />
      )}

      <p className="text-xs text-ink-faint">{t("storageNote")}</p>
    </div>
  );
}
