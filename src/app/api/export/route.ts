import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/export — DPDP "download my data": the signed-in user's tenant data as a JSON file.
// Every query goes through the RLS server client (scoped to the caller's tenant) — NO service-role.
// Document/voice BLOBS are not included (those are separate Storage objects) — only their metadata.
//
// WO-365 W1 · safety bound: a generous per-table row cap (env dial EXPORT_ROW_LIMIT, default 10 000)
// guards against a memory/timeout blowup on a large tenant. If ANY table hits the cap the response
// carries `truncated: true` + per-table `truncations` (returned / omitted / total) — the calling
// user ALWAYS knows the download was partial. Telemetry lands via console.warn so ops learns from
// the log before the user complains. Pagination/continuation is the eventual correct fix, not this
// wave.
const EXPORT_ROW_LIMIT = Number(process.env.EXPORT_ROW_LIMIT || "10000");

const TABLES = [
  "tenant", "profile", "advocate", "matter", "client", "document",
  "invoice", "invoice_line", "notice", "hearing", "time_entry", "expense",
  "notification_prefs", "audit_event",
] as const;

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    user: { id: user.id, email: user.email },
  };
  let truncated = false;
  const truncations: Record<string, { returned: number; omitted: number; total: number }> = {};
  const cap = EXPORT_ROW_LIMIT;

  for (const tbl of TABLES) {
    const { data, count } = await supabase.from(tbl).select("*", { count: "exact" }).limit(cap);
    const rows = data ?? [];
    const total = count ?? rows.length;
    const omitted = total - rows.length;
    out[tbl] = rows;
    if (omitted > 0) {
      truncated = true;
      truncations[tbl] = { returned: rows.length, omitted, total };
      console.warn(`[export] table ${tbl} truncated: returned ${rows.length}, omitted ${omitted}, total ${total} (cap: ${cap})`);
    }
  }

  if (truncated) {
    out.truncated = true;
    out.truncations = truncations;
  }

  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="mukadma-data-export.json"`,
      "Cache-Control": "no-store",
    },
  });
}
