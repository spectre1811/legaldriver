// Invoicing core — pure, testable: Indian GST computation, FY numbering, and
// assembly of unbilled time/expense into invoice lines. Money is paise (minor units).

export interface GstInput {
  subtotalMinor: number;
  rate: number;            // %
  firmState?: string | null;       // firm's state code
  placeOfSupply?: string | null;   // recipient's state code
  reverseCharge?: boolean;
}
export interface GstResult { cgstMinor: number; sgstMinor: number; igstMinor: number; totalMinor: number }

// Intra-state → CGST+SGST (rate split in half); inter-state → IGST (full rate).
// Reverse charge (advocate→business RCM) → no tax added to the invoice total
// (recipient pays it); we still record rate for the "tax payable under RCM" note.
export function computeGst(i: GstInput): GstResult {
  if (i.reverseCharge || i.rate <= 0) return { cgstMinor: 0, sgstMinor: 0, igstMinor: 0, totalMinor: i.subtotalMinor };
  const sameState = !!i.firmState && !!i.placeOfSupply && norm(i.firmState) === norm(i.placeOfSupply);
  if (sameState) {
    const half = Math.round((i.subtotalMinor * i.rate) / 200); // rate/2 each, on paise
    return { cgstMinor: half, sgstMinor: half, igstMinor: 0, totalMinor: i.subtotalMinor + half * 2 };
  }
  const igst = Math.round((i.subtotalMinor * i.rate) / 100);
  return { cgstMinor: 0, sgstMinor: 0, igstMinor: igst, totalMinor: i.subtotalMinor + igst };
}
// State codes may be stored as "24", "24-Gujarat", "GJ" — compare the leading digits/code.
function norm(s: string): string { return s.trim().toLowerCase().split(/[^a-z0-9]/)[0]; }

// Indian financial year (Apr 1 – Mar 31) for an ISO date → "2026-27".
export function financialYear(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00Z" : ""));
  const y = d.getUTCFullYear();
  const startYear = d.getUTCMonth() >= 3 ? y : y - 1; // month 3 = April
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function invoiceNumber(prefix: string, fy: string, seq: number): string {
  return `${prefix}/${fy}/${String(seq).padStart(4, "0")}`;
}

export interface DraftLine {
  kind: "time" | "expense" | "manual";
  description: string;
  hsn_sac?: string | null;
  quantity: number;
  unit?: string | null;
  rate_minor: number;
  amount_minor: number;
  source_time_entry_id?: string | null;
  source_expense_id?: string | null;
}

// Build invoice lines from unbilled billable time entries + expenses.
export function assembleLines(
  time: { id: string; minutes: number; rate_minor: number; narrative: string | null; entry_date: string }[],
  expenses: { id: string; amount_minor: number; category: string; notes: string | null; entry_date: string }[],
  hsnSac: string,
): DraftLine[] {
  const lines: DraftLine[] = [];
  for (const t of time) {
    const hrs = Math.round((t.minutes / 60) * 100) / 100;
    const amount = Math.round((t.minutes / 60) * t.rate_minor);
    lines.push({
      kind: "time", description: `${t.narrative?.trim() || "Professional services"} (${t.entry_date})`,
      hsn_sac: hsnSac, quantity: hrs, unit: "hrs", rate_minor: t.rate_minor, amount_minor: amount, source_time_entry_id: t.id,
    });
  }
  for (const e of expenses) {
    lines.push({
      kind: "expense", description: `${e.category}${e.notes ? ` — ${e.notes.trim()}` : ""} (${e.entry_date})`,
      hsn_sac: null, quantity: 1, unit: "item", rate_minor: e.amount_minor, amount_minor: e.amount_minor, source_expense_id: e.id,
    });
  }
  return lines;
}

export const sumMinor = (lines: { amount_minor: number }[]): number => lines.reduce((a, l) => a + l.amount_minor, 0);
