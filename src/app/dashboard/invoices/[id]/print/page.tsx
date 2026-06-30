import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { renderInvoiceHtml } from "@/lib/billing/render";

export const dynamic = "force-dynamic";

// Printable invoice — renders the same HTML used for email; the advocate uses the
// browser's "Save as PDF". No app chrome.
export default async function InvoicePrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) notFound();
  const { data: inv } = await supabase.from("invoice").select("*, client:client_id(name)").eq("id", params.id).maybeSingle();
  if (!inv) notFound();
  const [{ data: lines }, { data: firm }] = await Promise.all([
    supabase.from("invoice_line").select("*").eq("invoice_id", inv.id).order("sort"),
    supabase.from("firm_billing").select("*").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  const client = inv.client as { name?: string } | null;
  const html = renderInvoiceHtml({ invoice: inv, lines: lines ?? [], firm: firm ?? null, clientName: client?.name ?? "Client" });
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
