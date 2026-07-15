import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { track } from "@/lib/analytics/track"; // WO-184 user-lifecycle

export async function POST(request: NextRequest) {
  const supabase = createClient();
  // Read the user id BEFORE signOut clears the session (fire-and-forget; never blocks the redirect).
  const { data: { user } } = await supabase.auth.getUser();
  if (user) track("logout", user.id);
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
