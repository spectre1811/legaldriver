import { createClient } from "@/lib/supabase/server";

const SOURCE_LABEL: Record<string, string> = {
  gmail: "Gmail",
  upload: "Upload",
  court_order: "Court order",
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default async function DocumentsPage() {
  const supabase = createClient();
  const [{ data: docs }, { data: clients }, { data: matters }] = await Promise.all([
    supabase
      .from("document")
      .select("id, filename, mime, doc_type, source, client_id, matter_id, parsed_text, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("client").select("id, name"),
    supabase.from("matter").select("id, title"),
  ]);
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const matterName = new Map((matters ?? []).map((m) => [m.id, m.title]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Documents</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every parsed document — from Gmail attachments, uploads, and court orders.
        </p>
      </header>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {docs && docs.length ? (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Filed under</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Parsed</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const filed = d.matter_id
                  ? matterName.get(d.matter_id)
                  : d.client_id
                    ? clientName.get(d.client_id)
                    : null;
                const chars = (d.parsed_text ?? "").length;
                return (
                  <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-ink">{d.filename ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{d.doc_type ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {filed ?? <span className="text-amber-600">unfiled</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{SOURCE_LABEL[d.source] ?? d.source}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {chars > 0 ? `${chars.toLocaleString("en-IN")} chars` : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{fmt(d.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/api/documents/${d.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        Open
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">
            No documents yet. Connect Gmail or run the demo ingest in the Inbox.
          </div>
        )}
      </section>

      <p className="text-xs text-slate-400">
        Files are stored in a private bucket; downloads use short-lived signed URLs scoped to your tenant.
      </p>
    </div>
  );
}
