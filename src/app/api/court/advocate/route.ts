import { NextResponse, type NextRequest } from "next/server";
import { resolveAdvocateBar, ldEnabled } from "@/lib/court/legaldriver-api";

export const dynamic = "force-dynamic";

// Resolve an advocate NAME (from a judgment/case) → bar code → advocate dossier.
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");
  if (!name || !ldEnabled()) return NextResponse.redirect(new URL("/dashboard/research", request.url));
  const bar = await resolveAdvocateBar(name);
  return NextResponse.redirect(new URL(bar ? `/dashboard/advocate/${bar}` : "/dashboard/research", request.url));
}
