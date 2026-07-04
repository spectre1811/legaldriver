import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/export — DPDP "download my data": the signed-in user's tenant data as a JSON file.
// Every query goes through the RLS server client (scoped to the caller's tenant) — NO service-role.
// Document/voice BLOBS are not included (those are separate Storage objects) — only their metadata.
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
  for (const tbl of TABLES) {
    const { data } = await supabase.from(tbl).select("*");
    out[tbl] = data ?? [];
  }

  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="mukadma-data-export.json"`,
      "Cache-Control": "no-store",
    },
  });
}
