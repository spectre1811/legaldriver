import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGmailClient } from "@/lib/mail/client";
import { readSecret } from "@/lib/mail/vault";
import { refreshAccessToken, googleConfigured } from "@/lib/mail/oauth";
import { ingestMail } from "@/lib/mail/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Scheduled Gmail ingest. For each active Google connection: refresh the access
// token, fetch new mail incrementally, and run the file-and-parse pipeline.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!googleConfigured()) {
    return NextResponse.json({ ok: true, skipped: "google_not_configured" });
  }

  const admin = createAdminClient();
  const { data: conns, error } = await admin
    .from("oauth_connection")
    .select("id, tenant_id, user_id, refresh_token_ref, gmail_last_history_id")
    .eq("provider", "google")
    .eq("status", "active");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const found = conns?.length ?? 0;
  let processed = 0;
  let filed = 0;
  let needsReview = 0;
  const errors: { id: string; error: string }[] = [];
  for (const c of conns ?? []) {
    if (!c.refresh_token_ref) {
      errors.push({ id: c.id, error: "no refresh_token_ref" });
      continue;
    }
    try {
      const refresh = await readSecret(admin, c.refresh_token_ref);
      if (!refresh) throw new Error("could not read refresh token from vault");
      const accessToken = await refreshAccessToken(refresh);
      const mail = getGmailClient(accessToken);
      const summary = await ingestMail(admin, c.tenant_id, c.user_id, mail, c.gmail_last_history_id);
      filed += summary.filed;
      needsReview += summary.needsReview;
      processed++;
      if (summary.newHistoryId) {
        await admin
          .from("oauth_connection")
          .update({ gmail_last_history_id: summary.newHistoryId })
          .eq("id", c.id);
      }
    } catch (e) {
      // never throw the whole job; surface a redacted reason for diagnosis
      errors.push({ id: c.id, error: e instanceof Error ? e.message : "ingest failed" });
    }
  }

  return NextResponse.json({ ok: true, found, processed, filed, needsReview, errors });
}
