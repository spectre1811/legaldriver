import { NextResponse, type NextRequest } from "next/server";
import { resolveJudgeId, ldEnabled } from "@/lib/court/legaldriver-api";

export const dynamic = "force-dynamic";

// Resolve a coram/judge NAME (as stored on a case) to a judge_id and redirect to
// the judge dossier. Kept out of the case-page render so it doesn't add latency there.
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name || !ldEnabled()) return NextResponse.redirect(new URL("/dashboard/cases", request.url));
  const id = await resolveJudgeId(name);
  return NextResponse.redirect(new URL(id ? `/dashboard/judge/${id}` : "/dashboard/cases", request.url));
}
