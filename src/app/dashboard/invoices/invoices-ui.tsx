"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { createInvoiceFromMatter, finalizeInvoice, markPaid, cancelInvoice, emailInvoice, addManualLine, removeLine, updateInvoiceSettings, saveFirmBilling } from "./actions";

function useAction() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return { pending, msg, setMsg, run: (fn: () => Promise<{ ok: boolean; message: string; invoiceId?: string }>, nav?: (id?: string) => void) => start(async () => { const r = await fn(); setMsg(r.message); if (r.ok) { nav ? nav(r.invoiceId) : router.refresh(); } }), router };
}

// On the case page — assemble a draft invoice from unbilled time/expense.
export function CreateInvoiceButton({ matterId }: { matterId: string }) {
  const { pending, msg, run } = useAction();
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => run(() => createInvoiceFromMatter(matterId), (id) => id && router.push(`/dashboard/invoices/${id}`))} disabled={pending} className="btn-secondary">
        <Icon name="documents" className="h-4 w-4" /> {pending ? "Assembling…" : "Create invoice"}
      </button>
      {msg && <span className="text-xs text-ink-muted">{msg}</span>}
    </div>
  );
}

export function InvoiceActions({ invoiceId, status, finalised }: { invoiceId: string; status: string; finalised: boolean }) {
  const { pending, msg, run } = useAction();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!finalised && status === "draft" && (
        <button onClick={() => run(() => finalizeInvoice(invoiceId))} disabled={pending} className="btn-primary"><Icon name="check" className="h-4 w-4" /> Finalise &amp; number</button>
      )}
      {status !== "paid" && status !== "cancelled" && (
        <button onClick={() => run(() => emailInvoice(invoiceId))} disabled={pending} className="btn-secondary"><Icon name="gmail" className="h-4 w-4" /> Email to client</button>
      )}
      {status !== "paid" && status !== "cancelled" && (
        <button onClick={() => run(() => markPaid(invoiceId))} disabled={pending} className="btn-secondary"><Icon name="check" className="h-4 w-4" /> Mark paid</button>
      )}
      <a href={`/dashboard/invoices/${invoiceId}/print`} target="_blank" rel="noreferrer" className="btn-secondary"><Icon name="external" className="h-4 w-4" /> Print / PDF</a>
      {status !== "cancelled" && status !== "paid" && (
        <button onClick={() => { if (confirm("Cancel this invoice and release its entries?")) run(() => cancelInvoice(invoiceId)); }} disabled={pending} className="text-xs text-ink-faint hover:text-red-600">Cancel</button>
      )}
      {msg && <span className="w-full text-xs text-ink-muted">{msg}</span>}
    </div>
  );
}

export function AddLineForm({ invoiceId }: { invoiceId: string }) {
  const { pending, run } = useAction();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => addManualLine(invoiceId, fd)); formRef.current?.reset(); }} className="flex flex-wrap items-end gap-2">
      <input name="description" placeholder="Description (e.g. Professional fees)" required className="flex-1 min-w-48 rounded-lg border border-line px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none" />
      <input name="amount" type="number" step="0.01" min="0" placeholder="Amount ₹" required className="w-32 rounded-lg border border-line px-3 py-1.5 text-sm focus:border-brand-400 focus:outline-none" />
      <button type="submit" disabled={pending} className="btn-secondary"><Icon name="plus" className="h-4 w-4" /> Add line</button>
    </form>
  );
}

export function RemoveLineButton({ invoiceId, lineId }: { invoiceId: string; lineId: string }) {
  const { pending, run } = useAction();
  return <button onClick={() => run(() => removeLine(invoiceId, lineId))} disabled={pending} className="text-ink-faint hover:text-red-600" aria-label="remove line">×</button>;
}

export function InvoiceSettingsForm({ invoiceId, placeOfSupply, gstRate, reverseCharge, dueDate }: { invoiceId: string; placeOfSupply: string; gstRate: number; reverseCharge: boolean; dueDate: string }) {
  const { pending, msg, run } = useAction();
  return (
    <form onSubmit={(e) => { e.preventDefault(); run(() => updateInvoiceSettings(invoiceId, new FormData(e.currentTarget))); }} className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <label className="block">Place of supply<input name="place_of_supply" defaultValue={placeOfSupply} className="mt-1 w-full rounded-lg border border-line px-2 py-1" /></label>
      <label className="block">GST rate %<input name="gst_rate" type="number" step="0.5" defaultValue={gstRate} className="mt-1 w-full rounded-lg border border-line px-2 py-1" /></label>
      <label className="block">Due date<input name="due_date" type="date" defaultValue={dueDate} className="mt-1 w-full rounded-lg border border-line px-2 py-1" /></label>
      <label className="flex items-center gap-2 self-end"><input name="reverse_charge" type="checkbox" defaultChecked={reverseCharge} /> Reverse charge</label>
      <button type="submit" disabled={pending} className="btn-secondary col-span-2 w-fit sm:col-span-4"><Icon name="refresh" className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> Apply</button>
      {msg && <span className="col-span-2 text-xs text-ink-muted sm:col-span-4">{msg}</span>}
    </form>
  );
}

export function FirmBillingForm({ firm }: { firm: Record<string, unknown> | null }) {
  const { pending, msg, run } = useAction();
  const v = (k: string) => (firm?.[k] as string) ?? "";
  return (
    <form onSubmit={(e) => { e.preventDefault(); run(() => saveFirmBilling(new FormData(e.currentTarget))); }} className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      <label className="block">Legal name<input name="legal_name" defaultValue={v("legal_name")} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5" /></label>
      <label className="block">GSTIN<input name="gstin" defaultValue={v("gstin")} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5" /></label>
      <label className="block sm:col-span-2">Address<textarea name="address" defaultValue={v("address")} rows={2} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5" /></label>
      <label className="block">State code (place of supply)<input name="state_code" defaultValue={v("state_code")} placeholder="e.g. 24" className="mt-1 w-full rounded-lg border border-line px-2 py-1.5" /></label>
      <label className="block">Default GST rate %<input name="default_gst_rate" type="number" step="0.5" defaultValue={(firm?.default_gst_rate as number) ?? 18} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5" /></label>
      <label className="block">SAC code<input name="hsn_sac" defaultValue={v("hsn_sac") || "9982"} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5" /></label>
      <label className="block">Invoice prefix<input name="invoice_prefix" defaultValue={v("invoice_prefix") || "INV"} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5" /></label>
      <label className="flex items-center gap-2 self-end"><input name="reverse_charge" type="checkbox" defaultChecked={!!firm?.reverse_charge} /> Reverse charge by default (advocate→business RCM)</label>
      <label className="block sm:col-span-2">Bank / payment details<textarea name="bank_details" defaultValue={v("bank_details")} rows={2} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5" /></label>
      <label className="block sm:col-span-2">Terms<textarea name="terms" defaultValue={v("terms")} rows={2} className="mt-1 w-full rounded-lg border border-line px-2 py-1.5" /></label>
      <div className="sm:col-span-2 flex items-center gap-3"><button type="submit" disabled={pending} className="btn-primary"><Icon name="check" className="h-4 w-4" /> Save billing details</button>{msg && <span className="text-xs text-ink-muted">{msg}</span>}</div>
    </form>
  );
}
