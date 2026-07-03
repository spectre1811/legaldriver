import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { InvoiceActions, AddLineForm, RemoveLineButton, InvoiceSettingsForm } from "../invoices-ui";

export const dynamic = "force-dynamic";

const rupees = (m: number) => `₹${(m / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TONE: Record<string, string> = { draft: "", sent: "ec-chip-warn", paid: "ec-chip-success", cancelled: "ec-chip-danger" };

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const t = await getTranslations("invoices");
  const tenantId = await getTenantId(supabase);
  if (!tenantId) notFound();

  const { data: inv } = await supabase.from("invoice").select("*, client:client_id(name, emails), matter:matter_id(id, title)").eq("id", params.id).maybeSingle();
  if (!inv) notFound();
  const { data: lines } = await supabase.from("invoice_line").select("*").eq("invoice_id", inv.id).order("sort");
  const client = inv.client as { name?: string; emails?: string[] } | null;
  const matter = inv.matter as { id?: string; title?: string } | null;
  const editable = inv.status === "draft";

  return (
    <div className="space-y-6 text-ec-ink">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard/invoices" className="mb-1 inline-flex items-center gap-1.5 text-xs text-ec-ink-3 hover:text-ec-ink"><Icon name="back" className="h-3.5 w-3.5" /> {t("title")}</Link>
          <h1 className="num font-display text-[1.5rem] font-medium leading-tight tracking-tight">{inv.number ?? t("detail.draftInvoice")}</h1>
          <p className="num mt-1 text-sm text-ec-ink-3">{client?.name ?? "—"}{matter?.id ? <> · <Link href={`/dashboard/cases/${matter.id}`} className="text-ec-brass-deep hover:text-ec-brass">{matter.title}</Link></> : null} · {fmtDate(inv.issue_date)}</p>
        </div>
        <span className={`ec-chip ${TONE[inv.status] ?? ""}`}>{inv.status}</span>
      </div>

      <div className="ec-card"><div className="px-5 py-4"><InvoiceActions invoiceId={inv.id} status={inv.status} finalised={!!inv.number} /></div></div>

      {editable && (
        <div className="ec-card">
          <div className="border-b border-ec-hair px-5 py-3"><p className="ec-label">{t("detail.taxSettings")}</p></div>
          <div className="px-5 py-4"><InvoiceSettingsForm invoiceId={inv.id} placeOfSupply={inv.place_of_supply ?? ""} gstRate={Number(inv.gst_rate)} reverseCharge={inv.reverse_charge} dueDate={inv.due_date ?? ""} /></div>
        </div>
      )}

      <div className="ec-card">
        <div className="border-b border-ec-hair px-5 py-3"><p className="ec-label">{t("detail.lineItems")}</p></div>
        <div className="overflow-x-auto px-5 py-4">
          <table className="w-full text-sm">
            <thead><tr className="ec-label text-left"><th className="py-1 pr-3">{t("detail.th.description")}</th><th className="py-1 px-3">{t("detail.th.sac")}</th><th className="py-1 px-3 text-right">{t("detail.th.qty")}</th><th className="py-1 px-3 text-right">{t("detail.th.rate")}</th><th className="py-1 px-3 text-right">{t("detail.th.amount")}</th>{editable && <th></th>}</tr></thead>
            <tbody>
              {(lines ?? []).map((l) => (
                <tr key={l.id} className="border-t border-ec-hair">
                  <td className="py-2 pr-3">{l.description}</td>
                  <td className="num py-2 px-3 text-ec-ink-3">{l.hsn_sac ?? "—"}</td>
                  <td className="num py-2 px-3 text-right">{l.quantity}{l.unit ? ` ${l.unit}` : ""}</td>
                  <td className="num py-2 px-3 text-right">{rupees(l.rate_minor)}</td>
                  <td className="num py-2 px-3 text-right">{rupees(l.amount_minor)}</td>
                  {editable && <td className="py-2 pl-3 text-right"><RemoveLineButton invoiceId={inv.id} lineId={l.id} /></td>}
                </tr>
              ))}
            </tbody>
            <tfoot className="num text-sm">
              <tr className="border-t border-ec-hair"><td colSpan={4} className="py-1.5 px-3 text-right">{t("detail.subtotal")}</td><td className="py-1.5 px-3 text-right">{rupees(inv.subtotal_minor)}</td>{editable && <td></td>}</tr>
              {inv.cgst_minor > 0 && <tr><td colSpan={4} className="py-1 px-3 text-right text-ec-ink-3">{t("detail.cgst")} ({Number(inv.gst_rate) / 2}%)</td><td className="py-1 px-3 text-right">{rupees(inv.cgst_minor)}</td>{editable && <td></td>}</tr>}
              {inv.sgst_minor > 0 && <tr><td colSpan={4} className="py-1 px-3 text-right text-ec-ink-3">{t("detail.sgst")} ({Number(inv.gst_rate) / 2}%)</td><td className="py-1 px-3 text-right">{rupees(inv.sgst_minor)}</td>{editable && <td></td>}</tr>}
              {inv.igst_minor > 0 && <tr><td colSpan={4} className="py-1 px-3 text-right text-ec-ink-3">{t("detail.igst")} ({Number(inv.gst_rate)}%)</td><td className="py-1 px-3 text-right">{rupees(inv.igst_minor)}</td>{editable && <td></td>}</tr>}
              <tr className="border-t-2 border-ec-ink"><td colSpan={4} className="py-2 px-3 text-right font-semibold">{t("detail.total")}</td><td className="py-2 px-3 text-right font-semibold">{rupees(inv.total_minor)}</td>{editable && <td></td>}</tr>
            </tfoot>
          </table>
          {inv.reverse_charge && <p className="mt-3 rounded-ec-s bg-ec-warn-t px-3 py-2 text-xs text-ec-warn">{t("detail.reverseCharge")}</p>}
          {editable && <div className="mt-4 border-t border-ec-hair pt-4"><AddLineForm invoiceId={inv.id} /></div>}
        </div>
      </div>
    </div>
  );
}
