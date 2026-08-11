import { createClient } from "@/lib/supabase/server";
import { handleExport } from "@/lib/export/handler";

const DEFAULT_EXPORT_ROW_LIMIT = 10_000;

function resolveExportRowLimit(): number {
  const raw = process.env.EXPORT_ROW_LIMIT;
  if (!raw) return DEFAULT_EXPORT_ROW_LIMIT;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    console.warn(`[export] invalid EXPORT_ROW_LIMIT="${raw}" — using default ${DEFAULT_EXPORT_ROW_LIMIT}`);
    return DEFAULT_EXPORT_ROW_LIMIT;
  }
  return n;
}

const TABLES = [
  "tenant", "profile", "advocate", "matter", "client", "document",
  "invoice", "invoice_line", "notice", "hearing", "time_entry", "expense",
  "notification_prefs", "audit_event",
] as const;

// GET /api/export — DPDP "download my data": the signed-in user's tenant data as a JSON file.
// Every query goes through the RLS server client (scoped to the caller's tenant) — NO service-role.
// Document/voice BLOBS are not included (those are separate Storage objects) — only their metadata.
export async function GET() {
  const cap = resolveExportRowLimit();
  const supabase = createClient();
  return handleExport(supabase, cap, TABLES as unknown as readonly string[]);
}
