import { NextResponse } from "next/server";

export interface ExportSupabase {
  auth: { getUser(): Promise<{ data: { user: { id: string; email?: string } | null } }> };
  from(table: string): {
    select(columns: string, opts?: { count?: string }): {
      limit(n: number): PromiseLike<{ data: unknown[] | null; count: number | null; error: { message: string } | null }>;
    };
  };
}

// handleExport — the DPDP export loop, separated from the route so the test can
// drive it with a mock supabase client (the real createClient() calls next/headers
// cookies(), which can't run outside a Next.js request scope). Every production
// call goes through GET() → createClient() → handleExport().
//
// WO-365 W1 · safety bound: a generous per-table row cap (env dial EXPORT_ROW_LIMIT,
// default 10 000) guards against a memory/timeout blowup on a large tenant.
//
// Truncation is signalled THREE ways so it can never be missed:
//   1. top-level `truncated: true`  (always present — `false` when nothing was capped)
//   2. per-table `truncations` with `{returned, omitted, total}` for every capped table
//   3. `console.warn` telemetry so ops learns before the user complains
//
// A query that errors (timeout, RLS denial, dropped column) is recorded in a top-level
// `errors` map keyed by table name. The table is NOT present in the payload — a failed
// table never masquerades as an empty one. The export still returns 200 (partial-with-
// loud-markers beats nothing). Pagination/continuation is the eventual correct fix.
export async function handleExport(
  supabase: ExportSupabase,
  cap: number,
  tables: readonly string[],
): Promise<NextResponse> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    user: { id: user.id, email: user.email },
    truncated: false,
  };
  let truncated = false;
  const truncations: Record<string, { returned: number; omitted: number; total: number }> = {};
  const errors: Record<string, string> = {};

  for (const tbl of tables) {
    const { data, count, error } = await supabase.from(tbl).select("*", { count: "exact" }).limit(cap);
    if (error) {
      errors[tbl] = error.message;
      console.error(`[export] table ${tbl} query failed: ${error.message} (cap: ${cap}, user: ${user.id})`);
      continue;
    }
    const rows = data ?? [];
    const total = count ?? rows.length;
    const omitted = count != null ? total - rows.length : 0;
    const countUnavailable = count == null && rows.length >= cap;
    if (omitted > 0 || countUnavailable) {
      truncated = true;
      truncations[tbl] = { returned: rows.length, omitted, total };
      const reason = countUnavailable ? "count unavailable" : `omitted ${omitted}`;
      console.warn(`[export] table ${tbl} truncated: returned ${rows.length}, ${reason}, total ${total} (cap: ${cap})`);
    }
    out[tbl] = rows;
  }

  if (truncated) {
    out.truncated = true;
    out.truncations = truncations;
  }

  if (Object.keys(errors).length > 0) {
    out.errors = errors;
    console.warn(`[export] ${Object.keys(errors).length} table(s) failed: ${Object.keys(errors).join(", ")} (user: ${user.id})`);
  }

  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="mukadma-data-export.json"`,
      "Cache-Control": "no-store",
    },
  });
}
