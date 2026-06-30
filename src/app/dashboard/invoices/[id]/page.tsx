import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Badge, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { InvoiceActions, AddLineForm, RemoveLineButton, InvoiceSettingsForm } from "../invoices-ui";

export const dynamic = "force-dynamic";

const rupees = (m: number) => `₹${(m / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TONE: Record<string, "neutral" | "brand" | "green" | "amber" | "red"> = { draft: "neutral", sent: "amber", paid: "green", cancelled: "red" };

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) notFound();

  const { data: inv } = await supabase.from("invoice").select("*, client:client_id(name, emails), matter:matter_id(id, title)").eq("id", params.id).maybeSingle();
  if (!inv) notFound();
  const { data: lines } = await supabase.from("invoice_line").select("*").eq("invoice_id", inv.id).order("sort");
  const client = inv.client as { name?: string; emails?: string[] } | null;
  const matter = inv.matter as { id?: string; title?: string } | null;
  const editable = inv.status === "draft";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard/invoices" className="mb-1 inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink"><Icon name="back" className="h-3.5 w-3.5" /> Invoices</Link>
          <h1 className="text-[1.5rem] font-semibold leading-tight">{inv.number ?? "Draft invoice"}</h1>
          <p className="mt-1 text-sm text-ink-muted">{client?.name ?? "—"}{matter?.id ? <> · <Link href={`/dashboard/cases/${matter.id}`} className="text-brand-600 hover:underline">{matter.title}</Link></> : null} · {fmtDate(inv.issue_date)}</p>
        </div>
        <Badge tone={TONE[inv.status] ?? "neutral"}>{inv.status}</Badge>
      </div>

      <Card><div className="px-5 py-4"><InvoiceActions invoiceId={inv.id} status={inv.status} finalised={!!inv.number} /></div></Card>

      {editable && (
        <Card>
          <div className="border-b border-line px-5 py-3"><p className="text-sm font-medium">Tax settings</p></div>
          <div className="px-5 py-4"><InvoiceSettingsForm invoiceId={inv.id} placeOfSupply={inv.place_of_supply ?? ""} gstRate={Number(inv.gst_rate)} reverseCharge={inv.reverse_charge} dueDate={inv.due_date ?? ""} /></div>
        </Card>
      )}

      <Card>
        <div className="border-b border-line px-5 py-3"><p className="text-sm font-medium">Line items</p></div>
        <div className="overflow-x-auto px-5 py-4">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-ink-faint"><th className="py-1 pr-3 font-medium">Description</th><th className="py-1 px-3 font-medium">SAC</th><th className="py-1 px-3 text-right font-medium">Qty</th><th className="py-1 px-3 text-right font-medium">Rate</th><th className="py-1 px-3 text-right font-medium">Amount</th>{editable && <th></th>}</tr></thead>
            <tbody>
              {(lines ?? []).map((l) => (
                <tr key={l.id} className="border-t border-line">
                  <td className="py-2 pr-3">{l.description}</td>
                  <td className="py-2 px-3 text-ink-muted">{l.hsn_sac ?? "—"}</td>
                  <td className="py-2 px-3 text-right">{l.quantity}{l.unit ? ` ${l.unit}` : ""}</td>
                  <td className="py-2 px-3 text-right">{rupees(l.rate_minor)}</td>
                  <td className="py-2 px-3 text-right">{rupees(l.amount_minor)}</td>
                  {editable && <td className="py-2 pl-3 text-right"><RemoveLineButton invoiceId={inv.id} lineId={l.id} /></td>}
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr className="border-t border-line"><td colSpan={4} className="py-1.5 px-3 text-right">Subtotal</td><td className="py-1.5 px-3 text-right">{rupees(inv.subtotal_minor)}</td>{editable && <td></td>}</tr>
              {inv.cgst_minor > 0 && <tr><td colSpan={4} className="py-1 px-3 text-right text-ink-muted">CGST ({Number(inv.gst_rate) / 2}%)</td><td className="py-1 px-3 text-right">{rupees(inv.cgst_minor)}</td>{editable && <td></td>}</tr>}
              {inv.sgst_minor > 0 && <tr><td colSpan={4} className="py-1 px-3 text-right text-ink-muted">SGST ({Number(inv.gst_rate) / 2}%)</td><td className="py-1 px-3 text-right">{rupees(inv.sgst_minor)}</td>{editable && <td></td>}</tr>}
              {inv.igst_minor > 0 && <tr><td colSpan={4} className="py-1 px-3 text-right text-ink-muted">IGST ({Number(inv.gst_rate)}%)</td><td className="py-1 px-3 text-right">{rupees(inv.igst_minor)}</td>{editable && <td></td>}</tr>}
              <tr className="border-t-2 border-ink"><td colSpan={4} className="py-2 px-3 text-right font-semibold">Total</td><td className="py-2 px-3 text-right font-semibold">{rupees(inv.total_minor)}</td>{editable && <td></td>}</tr>
            </tfoot>
          </table>
          {inv.reverse_charge && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Reverse charge: GST payable by the recipient under RCM — not added to this invoice.</p>}
          {editable && <div className="mt-4 border-t border-line pt-4"><AddLineForm invoiceId={inv.id} /></div>}
        </div>
      </Card>
    </div>
  );
}
