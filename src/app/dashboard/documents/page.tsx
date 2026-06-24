import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";

const SOURCE: Record<string, string> = { gmail: "Gmail", upload: "Upload", court_order: "Court order" };

export default async function DocumentsPage() {
  const supabase = createClient();
  const [{ data: docs }, { data: clients }, { data: matters }] = await Promise.all([
    supabase.from("document").select("id, filename, doc_type, source, client_id, matter_id, parsed_text, created_at").order("created_at", { ascending: false }).limit(300),
    supabase.from("client").select("id, name"),
    supabase.from("matter").select("id, title"),
  ]);
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const matterName = new Map((matters ?? []).map((m) => [m.id, m.title]));

  return (
    <div className="space-y-7">
      <PageHeader title="Documents" subtitle="Every parsed document — from Gmail attachments, uploads, and court orders." />

      {docs && docs.length ? (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-3 label">File</th>
                <th className="hidden px-5 py-3 label sm:table-cell">Type</th>
                <th className="px-5 py-3 label">Filed under</th>
                <th className="hidden px-5 py-3 label md:table-cell">Source</th>
                <th className="hidden px-5 py-3 label lg:table-cell">Added</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const filed = d.matter_id ? matterName.get(d.matter_id) : d.client_id ? clientName.get(d.client_id) : null;
                return (
                  <tr key={d.id} className="border-b border-line last:border-0 transition hover:bg-paper">
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-2.5">
                        <Icon name="documents" className="h-4 w-4 shrink-0 text-ink-faint" />
                        <span className="font-medium text-ink">{d.filename ?? "—"}</span>
                      </span>
                    </td>
                    <td className="hidden px-5 py-3.5 sm:table-cell">{d.doc_type ? <Badge>{d.doc_type}</Badge> : <span className="text-ink-faint">—</span>}</td>
                    <td className="px-5 py-3.5 text-ink-muted">{filed ?? <span className="text-amber-600">unfiled</span>}</td>
                    <td className="hidden px-5 py-3.5 text-xs text-ink-faint md:table-cell">{SOURCE[d.source] ?? d.source}</td>
                    <td className="hidden px-5 py-3.5 text-xs text-ink-faint lg:table-cell">{fmtDate(d.created_at)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <a href={`/api/documents/${d.id}/download`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                        Open <Icon name="external" className="h-3.5 w-3.5" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState icon="documents" title="No documents yet" body="Connect Gmail or run the demo ingest in the Inbox — attachments are parsed and filed here automatically." />
      )}

      <p className="text-xs text-ink-faint">Files are stored in a private bucket; downloads use short-lived signed URLs scoped to your tenant.</p>
    </div>
  );
}
