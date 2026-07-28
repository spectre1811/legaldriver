import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMailerReadiness } from "@/lib/notify/mailer";
import { isAllowedAdmin } from "@/lib/access/validate";
import { RequestRow, type Row } from "./request-row";

// WO-272 W2 — founder-only console for invite-only access requests. Gated by the
// ADMIN_EMAILS allowlist; non-admins get a 404 (never a leak that it exists).
// Reads via the service-role admin client (access_requests is RLS deny-all).
export const dynamic = "force-dynamic";

export default async function AccessRequestsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAllowedAdmin(user.email, process.env.ADMIN_EMAILS)) notFound();

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("access_requests")
    .select("id, email, name, note, created_at")
    .eq("status", "new")
    .order("created_at", { ascending: false })
    .limit(200);

  const mail = await getMailerReadiness(admin); // WO-288: outcome-derived (all recent sends)
  const list = (rows ?? []) as Row[];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-2xl font-medium text-ec-ink">Access requests</h1>
      <p className="mt-1 text-sm text-ec-ink-3">
        Invite-only intake. Approve to create the account and email their credentials, or reject.
      </p>

      {mail.status !== "ready" && (
        <p role="alert" className="mt-4 rounded-ec-s bg-ec-danger-t px-3.5 py-2.5 text-sm text-ec-danger">
          Email delivery is {mail.status} (sender: {mail.from}). Credential emails may not reach requesters until a verified sending domain is set — share credentials manually until then.
        </p>
      )}

      {list.length === 0 ? (
        <p className="mt-8 text-sm text-ec-ink-3">No pending requests.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {list.map((r) => (
            <RequestRow key={r.id} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}
