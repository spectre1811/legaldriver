import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState, fmtDate, fmtSize } from "@/components/ui";
import { Icon } from "@/components/icons";
import { DocActions } from "@/components/doc-actions";
import { FilterBar } from "./filter-bar";

const SOURCE: Record<string, string> = { gmail: "Gmail", upload: "Upload", court_order: "Court order" };

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: { q?: string; source?: string; type?: string; filed?: string; client?: string };
}) {
  const supabase = createClient();
  const { q, source, type, filed, client } = searchParams;

  // Matters carry client_id so we can resolve a document's client even when it's
  // only tagged to a case. Fetch this first — the client filter needs the map.
  const { data: matters } = await supabase.from("matter").select("id, title, client_id");
  const matterClient = new Map((matters ?? []).map((m) => [m.id, m.client_id]));

  let query = supabase
    .from("document")
    .select("id, filename, doc_type, source, client_id, matter_id, size_bytes, parsed_text, portal_shared, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (q) query = query.textSearch("fts", q, { type: "websearch" });
  if (source) query = query.eq("source", source);
  if (type) query = query.eq("doc_type", type);
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

  const activeFilters = Boolean(q || source || type || filed || client);

  return (
    <div className="space-y-6">
      <PageHeader title="Documents" subtitle="Every document, organised by client. A case is an optional tag — file by client first, link to a case when it matters." />

      <FilterBar types={types} clients={clientOpts} />

      {docs && docs.length ? (
        <Card className="overflow-hidden">
          <div className="border-b border-line px-5 py-2.5 text-xs text-ink-faint">{docs.length} document{docs.length === 1 ? "" : "s"}{activeFilters ? " · filtered" : ""}</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-3 label">File</th>
                <th className="hidden px-5 py-3 label sm:table-cell">Type</th>
                <th className="px-5 py-3 label">Filed under</th>
                <th className="hidden px-5 py-3 label md:table-cell">Source</th>
                <th className="hidden px-5 py-3 label lg:table-cell">Size</th>
                <th className="hidden px-5 py-3 label lg:table-cell">Added</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                // Client-first: resolve directly, else via the tagged case's client.
                const resolvedClientId = d.client_id ?? (d.matter_id ? matterClient.get(d.matter_id) ?? null : null);
                const clientLabel = resolvedClientId ? clientName.get(resolvedClientId) ?? null : null;
                const caseLabel = d.matter_id ? matterName.get(d.matter_id) ?? null : null;
                const primary = clientLabel ?? caseLabel;
                const secondary = clientLabel ? caseLabel : null;
                return (
                  <tr key={d.id} className="border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-2.5">
                        <Icon name="documents" className="h-4 w-4 shrink-0 text-ink-faint" />
                        <span className="font-medium text-ink">{d.filename ?? "—"}</span>
                      </span>
                    </td>
                    <td className="hidden px-5 py-3.5 sm:table-cell">{d.doc_type ? <Badge>{d.doc_type}</Badge> : <span className="text-ink-faint">—</span>}</td>
                    <td className="px-5 py-3.5 text-ink-muted">
                      {primary ? (
                        <span className="flex flex-col leading-tight">
                          <span className="font-medium text-ink">{primary}</span>
                          {secondary && <span className="mt-0.5 text-xs text-ink-faint">{secondary}</span>}
                        </span>
                      ) : (
                        <span className="text-amber-600">unfiled</span>
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
      ) : (
        <EmptyState icon="documents" title={activeFilters ? "No matching documents" : "No documents yet"} body={activeFilters ? "Try a different search or clear the filters." : "Connect Gmail or upload to a case — everything is parsed and searchable here."} />
      )}

      <p className="text-xs text-ink-faint">Files are stored in a private bucket; downloads use short-lived signed URLs scoped to your tenant.</p>
    </div>
  );
}
