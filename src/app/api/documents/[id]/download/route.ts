import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Secure download: verify the document belongs to the caller's tenant via RLS,
// then mint a short-lived signed URL for the private Storage object (service role).
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  // RLS scopes this to the user's tenant — they can only fetch their own docs.
  const { data: doc } = await supabase
    .from("document")
    .select("storage_path")
    .eq("id", params.id)
    .maybeSingle();
  if (!doc?.storage_path) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed } = await admin.storage.from("documents").createSignedUrl(doc.storage_path, 60);
  if (!signed?.signedUrl) return NextResponse.json({ error: "could not sign" }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
