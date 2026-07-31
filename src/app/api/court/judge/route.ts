import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { currentUser, unauthorizedResponse } from "@/lib/auth/guard";
import { resolveJudgeId, ldEnabled } from "@/lib/court/legaldriver-api";

export const dynamic = "force-dynamic";

// Resolve a coram/judge NAME (as stored on a case) to a judge_id and redirect to
// the judge dossier. Kept out of the case-page render so it doesn't add latency there.
export async function GET(request: NextRequest) {
  // WO-316 — this proxy drives the KEYED court API on our credential. The middleware
  // guards /dashboard and /portal only, so the session check has to live here or an
  // anonymous caller gets a free, un-throttled lookup. Gate first, spend after.
  if (!(await currentUser(createClient()))) return unauthorizedResponse();

  const name = request.nextUrl.searchParams.get("name");
  if (!name || !ldEnabled()) return NextResponse.redirect(new URL("/dashboard/cases", request.url));
  const id = await resolveJudgeId(name);
  return NextResponse.redirect(new URL(id ? `/dashboard/judge/${id}` : "/dashboard/cases", request.url));
}
