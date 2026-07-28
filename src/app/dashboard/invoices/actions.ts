"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { getMailer } from "@/lib/notify/mailer";
import { computeGst, financialYear, invoiceNumber, assembleLines, sumMinor } from "@/lib/billing/invoice";
import { renderInvoiceHtml } from "@/lib/billing/render";
import { logOutboundEmail } from "@/lib/notify/log";
import type { Database } from "@/lib/db/database.types";

export type InvoiceResult = { ok: boolean; message: string; invoiceId?: string };
type DB = ReturnType<typeof createClient>;

// Recompute subtotal + GST + total from the current lines + invoice tax settings.
async function recompute(supabase: DB, tenantId: string, invoiceId: string) {
  const [{ data: inv }, { data: lines }, { data: firm }] = await Promise.all([
    supabase.from("invoice").select("gst_rate, reverse_charge, place_of_supply").eq("id", invoiceId).maybeSingle(),
    supabase.from("invoice_line").select("amount_minor").eq("invoice_id", invoiceId),
    supabase.from("firm_billing").select("state_code").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (!inv) return;
  const subtotal = sumMinor(lines ?? []);
  const gst = computeGst({ subtotalMinor: subtotal, rate: Number(inv.gst_rate), firmState: firm?.state_code, placeOfSupply: inv.place_of_supply, reverseCharge: inv.reverse_charge });
  await supabase.from("invoice").update({
    subtotal_minor: subtotal, cgst_minor: gst.cgstMinor, sgst_minor: gst.sgstMinor, igst_minor: gst.igstMinor,
    total_minor: gst.totalMinor, updated_at: new Date().toISOString(),
  }).eq("id", invoiceId);
}

// Assemble a draft invoice from a matter's unbilled billable time + expenses.
export async function createInvoiceFromMatter(matterId: string): Promise<InvoiceResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { data: { user } } = await supabase.auth.getUser();

  const { data: matter } = await supabase.from("matter").select("id, client_id, title").eq("id", matterId).maybeSingle();
  if (!matter) return { ok: false, message: "Case not found." };
  const { data: firm } = await supabase.from("firm_billing").select("*").eq("tenant_id", tenantId).maybeSingle();

  const [{ data: time }, { data: expenses }] = await Promise.all([
    supabase.from("time_entry").select("id, minutes, rate_minor, narrative, entry_date").eq("tenant_id", tenantId).eq("matter_id", matterId).eq("billable", true).is("invoiced_invoice_id", null),
    supabase.from("expense").select("id, amount_minor, category, notes, entry_date").eq("tenant_id", tenantId).eq("matter_id", matterId).eq("billable", true).is("invoiced_invoice_id", null),
  ]);
  const lines = assembleLines(time ?? [], expenses ?? [], firm?.hsn_sac ?? "9982");
  if (!lines.length) return { ok: false, message: "Nothing unbilled on this case to invoice." };

  const issue = new Date().toISOString().slice(0, 10);
  const { data: inv, error } = await supabase.from("invoice").insert({
    tenant_id: tenantId, client_id: matter.client_id, matter_id: matterId, status: "draft", fy: financialYear(issue), issue_date: issue,
    place_of_supply: firm?.state_code ?? null, reverse_charge: firm?.reverse_charge ?? false, gst_rate: firm?.default_gst_rate ?? 18,
    notes: `Professional services — ${matter.title}`, created_by: user?.id ?? null,
  }).select("id").single();
  if (error || !inv) return { ok: false, message: `Could not create invoice: ${error?.message ?? ""}` };

  await supabase.from("invoice_line").insert(lines.map((l, i) => ({ ...l, tenant_id: tenantId, invoice_id: inv.id, sort: i })));
  await recompute(supabase, tenantId, inv.id);
  revalidatePath("/dashboard/invoices");
  return { ok: true, invoiceId: inv.id, message: `Draft invoice created (${lines.length} lines).` };
}

export async function addManualLine(invoiceId: string, formData: FormData): Promise<InvoiceResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const description = String(formData.get("description") ?? "").trim();
  const rupees = Number(formData.get("amount") ?? 0);
  if (!description || !(rupees > 0)) return { ok: false, message: "Enter a description and amount." };
  const amount_minor = Math.round(rupees * 100);
  const { data: firm } = await supabase.from("firm_billing").select("hsn_sac").eq("tenant_id", tenantId).maybeSingle();
  await supabase.from("invoice_line").insert({ tenant_id: tenantId, invoice_id: invoiceId, kind: "manual", description, hsn_sac: firm?.hsn_sac ?? "9982", quantity: 1, unit: null, rate_minor: amount_minor, amount_minor });
  await recompute(supabase, tenantId, invoiceId);
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  return { ok: true, invoiceId, message: "Line added." };
}

export async function removeLine(invoiceId: string, lineId: string): Promise<InvoiceResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  await supabase.from("invoice_line").delete().eq("id", lineId).eq("invoice_id", invoiceId);
  await recompute(supabase, tenantId, invoiceId);
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  return { ok: true, invoiceId, message: "Line removed." };
}

// Update tax settings / dates, then recompute.
export async function updateInvoiceSettings(invoiceId: string, formData: FormData): Promise<InvoiceResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const patch: Database["public"]["Tables"]["invoice"]["Update"] = {
    place_of_supply: String(formData.get("place_of_supply") ?? "").trim() || null,
    gst_rate: Number(formData.get("gst_rate") ?? 18),
    reverse_charge: formData.get("reverse_charge") === "on",
    due_date: String(formData.get("due_date") ?? "").trim() || null,
    updated_at: new Date().toISOString(),
  };
  await supabase.from("invoice").update(patch).eq("id", invoiceId);
  await recompute(supabase, tenantId, invoiceId);
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  return { ok: true, invoiceId, message: "Updated." };
}

// Finalise: assign the FY-sequential number, lock source entries, mark sent.
export async function finalizeInvoice(invoiceId: string): Promise<InvoiceResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { data: inv } = await supabase.from("invoice").select("id, number, fy, status").eq("id", invoiceId).maybeSingle();
  if (!inv) return { ok: false, message: "Invoice not found." };
  if (inv.number) return { ok: false, message: "Already finalised." };
  const { data: firm } = await supabase.from("firm_billing").select("invoice_prefix").eq("tenant_id", tenantId).maybeSingle();
  // Sequence = (# already-numbered invoices this FY) + 1.
  const { count } = await supabase.from("invoice").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("fy", inv.fy ?? "").not("number", "is", null);
  const number = invoiceNumber(firm?.invoice_prefix ?? "INV", inv.fy ?? financialYear(new Date().toISOString().slice(0, 10)), (count ?? 0) + 1);
  await supabase.from("invoice").update({ number, status: "sent", updated_at: new Date().toISOString() }).eq("id", invoiceId);
  // Lock the billed entries so they can't be double-invoiced.
  await supabase.from("time_entry").update({ invoiced_invoice_id: invoiceId }).eq("tenant_id", tenantId).in("id", await lineSourceIds(supabase, invoiceId, "source_time_entry_id"));
  await supabase.from("expense").update({ invoiced_invoice_id: invoiceId }).eq("tenant_id", tenantId).in("id", await lineSourceIds(supabase, invoiceId, "source_expense_id"));
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  return { ok: true, invoiceId, message: `Finalised as ${number}.` };
}

async function lineSourceIds(supabase: DB, invoiceId: string, col: "source_time_entry_id" | "source_expense_id"): Promise<string[]> {
  const { data } = await supabase.from("invoice_line").select(col).eq("invoice_id", invoiceId);
  return (data ?? []).map((r) => (r as Record<string, string | null>)[col]).filter((v): v is string => !!v);
}

export async function markPaid(invoiceId: string): Promise<InvoiceResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  await supabase.from("invoice").update({ status: "paid", updated_at: new Date().toISOString() }).eq("id", invoiceId);
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  return { ok: true, invoiceId, message: "Marked paid." };
}

export async function cancelInvoice(invoiceId: string): Promise<InvoiceResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  // Release the locked entries so they can be re-billed.
  await supabase.from("time_entry").update({ invoiced_invoice_id: null }).eq("invoiced_invoice_id", invoiceId);
  await supabase.from("expense").update({ invoiced_invoice_id: null }).eq("invoiced_invoice_id", invoiceId);
  await supabase.from("invoice").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", invoiceId);
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  return { ok: true, invoiceId, message: "Cancelled; unbilled entries released." };
}

// Email the invoice (HTML) to the client. Finalises first if still a draft.
export async function emailInvoice(invoiceId: string): Promise<InvoiceResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const { data: inv } = await supabase.from("invoice").select("*, client:client_id(name, emails)").eq("id", invoiceId).maybeSingle();
  if (!inv) return { ok: false, message: "Invoice not found." };
  if (!inv.number) { const f = await finalizeInvoice(invoiceId); if (!f.ok) return f; }
  const client = inv.client as { name?: string; emails?: string[] } | null;
  const to = client?.emails?.[0];
  if (!to) return { ok: false, message: "Client has no email on file." };
  const [{ data: lines }, { data: firm }] = await Promise.all([
    supabase.from("invoice_line").select("*").eq("invoice_id", invoiceId).order("sort"),
    supabase.from("firm_billing").select("*").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  const fresh = await supabase.from("invoice").select("*").eq("id", invoiceId).maybeSingle();
  const html = renderInvoiceHtml({ invoice: fresh.data!, lines: lines ?? [], firm: firm ?? null, clientName: client?.name ?? "Client" });
  const subject = `Invoice ${fresh.data?.number} — ${firm?.legal_name ?? "Legal services"}`;
  const r = await getMailer().send(to, subject, html);
  await logOutboundEmail(supabase, { tenantId, to, subject, kind: "invoice", matterId: fresh.data?.matter_id ?? null, clientId: fresh.data?.client_id ?? null, ok: r.ok, providerId: r.id, error: r.error });
  if (!r.ok) return { ok: false, message: `Email failed: ${r.error}` };
  await supabase.from("invoice").update({ status: "sent", updated_at: new Date().toISOString() }).eq("id", invoiceId);
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  return { ok: true, invoiceId, message: `Emailed to ${to}.` };
}

export async function saveFirmBilling(formData: FormData): Promise<InvoiceResult> {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return { ok: false, message: "No tenant." };
  const row = {
    tenant_id: tenantId,
    legal_name: str(formData, "legal_name"), address: str(formData, "address"), gstin: str(formData, "gstin"),
    state_code: str(formData, "state_code"), default_gst_rate: Number(formData.get("default_gst_rate") ?? 18),
    reverse_charge: formData.get("reverse_charge") === "on", hsn_sac: str(formData, "hsn_sac") ?? "9982",
    invoice_prefix: str(formData, "invoice_prefix") ?? "INV", bank_details: str(formData, "bank_details"), terms: str(formData, "terms"),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("firm_billing").upsert(row, { onConflict: "tenant_id" });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "Billing details saved." };
}

const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? "").trim(); return v || null; };
