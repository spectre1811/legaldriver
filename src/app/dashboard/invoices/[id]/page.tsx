import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { formatCourtDate } from "@/components/court";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { InvoiceActions, AddLineForm, RemoveLineButton, InvoiceSettingsForm } from "../invoices-ui";

export const dynamic = "force-dynamic";

const rupees = (m: number) => `₹${(m / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TONE: Record<string, string> = { draft: "", sent: "ec-chip-warn", paid: "ec-chip-success", cancelled: "ec-chip-danger" };

type TimelineStep = { key: string; label: string; date: string | null; done: boolean; tone: "done" | "pending" };

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const t = await getTranslations("invoices");
  const te = await getTranslations("enum");
  const st = (v: string) => (te.has(`status.${v}`) ? te(`status.${v}`) : v);
  const tenantId = await getTenantId(supabase);
  if (!tenantId) notFound();

  const { data: inv } = await supabase.from("invoice").select("*, client:client_id(name, emails), matter:matter_id(id, title)").eq("id", params.id).maybeSingle();
  if (!inv) notFound();
  const { data: lines } = await supabase.from("invoice_line").select("*").eq("invoice_id", inv.id).order("sort");
  const client = inv.client as { name?: string; emails?: string[] } | null;
  const matter = inv.matter as { id?: string; title?: string } | null;
  const editable = inv.status === "draft";

  // Honest status-event timeline. We track invoice STATUS transitions, not a payment ledger
  // (no `payment` table exists — see queue/INBOX API ask). So: Created (always, at created_at)
  // → Issued (when it left draft) → Paid/Cancelled (terminal). Dates we actually hold:
  // created_at (create), updated_at (last transition). A finalised `number` proves it was
  // issued; the exact issue date is `issue_date`. We never invent an intermediate date.
  const issued = inv.status !== "draft"; // left draft ⇒ was issued (paid/cancelled pass through sent)
  const steps: TimelineStep[] = [
    { key: "created", label: t("timeline.created"), date: inv.created_at, done: true, tone: "done" },
    { key: "issued", label: t("timeline.issued"), date: issued ? inv.issue_date : null, done: issued, tone: issued ? "done" : "pending" },
  ];
  if (inv.status === "cancelled") {
    steps.push({ key: "cancelled", label: t("timeline.cancelled"), date: inv.updated_at, done: true, tone: "done" });
  } else {
    const paid = inv.status === "paid";
    steps.push({ key: "paid", label: t("timeline.paid"), date: paid ? inv.updated_at : null, done: paid, tone: paid ? "done" : "pending" });
  }

  return (
    <div className="space-y-6 text-ec-ink">
      {/* Sand header band — number · client/matter · issued date · status, on a recessed well. */}
      <div className="rounded-ec-m border border-ec-hair bg-ec-paper-3 px-5 py-5 sm:px-6">
        <Link href="/dashboard/invoices" className="mb-2 inline-flex items-center gap-1.5 text-xs text-ec-ink-3 hover:text-ec-ink"><Icon name="back" className="h-3.5 w-3.5" /> {t("title")}</Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="num font-display text-[1.6rem] font-medium leading-tight tracking-tight">{inv.number ?? t("detail.draftInvoice")}</h1>
            <p className="num mt-1 text-sm text-ec-ink-2">
              {client?.name ?? "—"}
              {matter?.id ? <> · <Link href={`/dashboard/cases/${matter.id}`} className="text-ec-brass-deep hover:text-ec-brass">{matter.title}</Link></> : null}
              {" · "}{formatCourtDate(inv.issue_date) ?? "—"}
            </p>
          </div>
          <div className="text-right">
            <span className={`ec-chip ${TONE[inv.status] ?? ""}`}>{st(inv.status)}</span>
            <p className="num mt-2 font-display text-xl font-medium leading-none">{rupees(inv.total_minor)}</p>
          </div>
        </div>
      </div>

      <div className="ec-card"><div className="px-5 py-4"><InvoiceActions invoiceId={inv.id} status={inv.status} finalised={!!inv.number} /></div></div>

      {/* Status timeline — honest transition ledger, not a payment history. */}
      <div className="ec-card">
        <div className="border-b border-ec-hair px-5 py-3"><p className="ec-label">{t("timeline.heading")}</p></div>
        <ol className="relative px-5 py-5">
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            const dotClass = s.tone === "done" ? "bg-ec-success-t text-ec-success" : "border border-dashed border-ec-hair-strong text-ec-ink-3";
            return (
              <li key={s.key} className="relative mb-6 flex gap-4 last:mb-0">
                {!isLast && <span className="absolute left-[11px] top-6 h-[calc(100%+0.5rem)] w-px bg-ec-hair" aria-hidden="true" />}
                <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${dotClass}`}>
                  {s.done ? <Icon name="check" className="h-3.5 w-3.5" /> : null}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className={`text-sm font-medium ${s.done ? "text-ec-ink" : "text-ec-ink-3"}`}>{s.label}</p>
                  <p className="num mt-0.5 text-xs text-ec-ink-3">{s.date ? formatCourtDate(s.date) : (s.key === "issued" ? t("timeline.pending") : t("timeline.awaiting"))}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="border-t border-ec-hair px-5 py-3 text-xs text-ec-ink-3">{t("timeline.note")}</p>
      </div>

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
