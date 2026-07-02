import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Global search across the tenant's entities (RLS-scoped). Powers the ⌘K palette —
// one query → cases, clients, documents, invoices, notices. Cheap ilike; capped.
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });
  const supabase = createClient();
  const like = `%${q.replace(/[%_]/g, "")}%`;

  const [matters, clients, docs, invoices, notices] = await Promise.all([
    supabase.from("matter").select("id, title, cnr, status").or(`title.ilike.${like},cnr.ilike.${like}`).limit(8),
    supabase.from("client").select("id, name").ilike("name", like).limit(5),
    supabase.from("document").select("id, filename").ilike("filename", like).limit(5),
    supabase.from("invoice").select("id, number, total_minor").ilike("number", like).limit(4),
    supabase.from("notice").select("id, type").ilike("type", like).limit(4),
  ]);

  const results = [
    ...(matters.data ?? []).map((m) => ({ type: "Case", label: m.title, sub: m.cnr ?? m.status ?? "", href: `/dashboard/cases/${m.id}` })),
    ...(clients.data ?? []).map((c) => ({ type: "Client", label: c.name, sub: "", href: `/dashboard/clients/${c.id}` })),
    ...(docs.data ?? []).map((d) => ({ type: "Document", label: d.filename ?? "document", sub: "", href: `/dashboard/documents/${d.id}` })),
    ...(invoices.data ?? []).map((i) => ({ type: "Invoice", label: i.number ?? "Draft invoice", sub: `₹${(i.total_minor / 100).toLocaleString("en-IN")}`, href: `/dashboard/invoices/${i.id}` })),
    ...(notices.data ?? []).map((n) => ({ type: "Notice", label: n.type.replace(/_/g, " "), sub: "", href: `/dashboard/notices` })),
  ];
  return NextResponse.json({ results });
}
