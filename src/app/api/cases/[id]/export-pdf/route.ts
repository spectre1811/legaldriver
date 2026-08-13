import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { loadCaseFileData } from "@/lib/court/case-file-data";
import { buildCaseFilePdf } from "@/lib/court/case-file-pdf";

export const dynamic = "force-dynamic";

// WO-411 · "Export as PDF" — a real, downloadable PDF built server-side from the live case record
// (parties, hearings, orders, deadlines only — no documents/AI/billing). RLS-scoped via the
// caller's own session (createClient, same as src/app/api/documents/[id]/download/route.ts) —
// there's no admin-client bypass here, so a matter outside the caller's tenant 404s exactly like
// a missing one. See src/lib/docs/pdf.ts for why this is hand-rolled rather than a new dependency.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  if (!tenantId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const data = await loadCaseFileData(supabase, tenantId, params.id);
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const bytes = buildCaseFilePdf(data);
  const slug = data.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 60) || "case-file";
  return new NextResponse(new Blob([bytes], { type: "application/pdf" }), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
