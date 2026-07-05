import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditRefileTenant } from "@/lib/docs/audit-refile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// WO-33 W4 · Scheduled audit-refile. Every tenant that has unfiled / needs-review documents gets
// them re-matched against its CURRENT clients & cases — a doc that couldn't match last week (the
// case didn't exist yet) matches now. Match-only: never creates records; a strong match auto-files,
// a fuzzy one refreshes the Review Inbox suggestion. Service-role client, but every query filters
// by tenant_id (never cross-tenant).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  // Tenants with at least one candidate document (same predicate as the Review Inbox).
  const { data: rows, error } = await admin
    .from("document")
    .select("tenant_id")
    .filter("extracted->>deletedAt", "is", null)
    .or("extracted->>status.eq.needs_review,and(client_id.is.null,matter_id.is.null)")
    .limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tenantIds = [...new Set((rows ?? []).map((r) => r.tenant_id).filter(Boolean))] as string[];
  let filed = 0;
  let suggested = 0;
  let scanned = 0;
  const errors: { tenantId: string; error: string }[] = [];
  for (const tenantId of tenantIds) {
    try {
      const s = await auditRefileTenant(admin, tenantId);
      filed += s.filed;
      suggested += s.suggested;
      scanned += s.scanned;
    } catch (e) {
      errors.push({ tenantId, error: e instanceof Error ? e.message : "refile failed" });
    }
  }

  return NextResponse.json({ ok: true, tenants: tenantIds.length, scanned, filed, suggested, errors });
}
