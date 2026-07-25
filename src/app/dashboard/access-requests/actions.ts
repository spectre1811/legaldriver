"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMailer } from "@/lib/notify/mailer";
import { requestOrigin } from "@/lib/auth/redirects";
import { isAllowedAdmin } from "@/lib/access/validate";

// WO-272 W2 — admin approve/reject for access requests. Every action re-checks
// the ADMIN_EMAILS gate server-side (never trust the page gate alone). Approve
// provisions a Supabase user and emails the requester BOTH a temporary password
// AND a set-password link, so their durable login is email + password.

export type AdminActionState = { ok?: string; error?: string };

/** Returns the acting admin user, or null if the caller isn't an allow-listed admin. */
async function requireAdmin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAllowedAdmin(user.email, process.env.ADMIN_EMAILS)) return null;
  return user;
}

/** URL-safe temp password, ~16 chars — well above GoTrue's 6-char minimum. */
function tempPassword(): string {
  return randomBytes(12).toString("base64url");
}

/** Existing-user lookup by exact email via the admin REST filter (service role). */
async function findUserId(email: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=50&filter=${encodeURIComponent(email)}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { users?: { id: string; email?: string }[] };
  const target = email.toLowerCase();
  return body.users?.find((u) => u.email?.toLowerCase() === target)?.id ?? null;
}

type Provisioned = { password: string; link: string };

/**
 * Create (or, if it already exists, reset) the user and mint a single-use
 * set-password (recovery) link. Idempotent: re-approving an existing email just
 * resets the password + re-issues the link. Returns the temp password + link,
 * or an error string.
 */
async function provision(email: string, origin: string): Promise<Provisioned | { error: string }> {
  const admin = createAdminClient();
  const password = tempPassword();
  // email_confirm so they can sign in immediately (no confirmation round-trip).
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) {
    // Most likely already registered — reset the existing user's password instead.
    const id = await findUserId(email);
    if (!id) return { error: created.error.message };
    const upd = await admin.auth.admin.updateUserById(id, { password, email_confirm: true });
    if (upd.error) return { error: upd.error.message };
  }
  // Set-password link lands on the app's existing recovery screen.
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`;
  const link = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
  const actionLink = link.data?.properties?.action_link;
  if (link.error || !actionLink) return { error: link.error?.message ?? "could not create the set-password link" };
  return { password, link: actionLink };
}

const esc = (s: string) => s.replace(/[<>&]/g, (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"));

function credentialsEmail(email: string, password: string, link: string, loginUrl: string) {
  const html =
    `<h2>Your Mukadma access is ready</h2>` +
    `<p>Your request to join Mukadma has been approved. Sign in at ` +
    `<a href="${esc(loginUrl)}">${esc(loginUrl)}</a> with:</p>` +
    `<p><strong>Email:</strong> ${esc(email)}<br><strong>Temporary password:</strong> ${esc(password)}</p>` +
    `<p><strong>Recommended:</strong> <a href="${esc(link)}">set your own password</a> now ` +
    `(the link is single-use and expires). Or sign in with the temporary password above and change it in Settings.</p>` +
    `<p>From then on, log in with your <strong>email and password</strong> at ${esc(loginUrl)}.</p>`;
  const text =
    `Your Mukadma access is ready\n\n` +
    `Your request to join Mukadma has been approved. Sign in at ${loginUrl} with:\n\n` +
    `  Email: ${email}\n  Temporary password: ${password}\n\n` +
    `Recommended: set your own password (single-use, expiring link):\n${link}\n\n` +
    `Or sign in with the temporary password above and change it in Settings.\n` +
    `From then on, log in with your email and password at ${loginUrl}.\n`;
  return { html, text };
}

export async function approveRequest(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const adminUser = await requireAdmin();
  if (!adminUser) return { error: "Not authorized." };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing request id." };

  const admin = createAdminClient();
  const { data: row } = await admin.from("access_requests").select("email, status").eq("id", id).maybeSingle();
  if (!row) return { error: "Request not found." };

  const origin = requestOrigin(headers());
  const result = await provision(row.email, origin);
  if ("error" in result) return { error: `Could not provision ${row.email}: ${result.error}` };

  const loginUrl = `${origin}/login`;
  const { html, text } = credentialsEmail(row.email, result.password, result.link, loginUrl);
  const sent = await getMailer().send(row.email, "Your Mukadma access is ready", html, text).catch(() => ({ ok: false }));

  await admin
    .from("access_requests")
    .update({ status: "provisioned", handled_at: new Date().toISOString(), handled_by: adminUser.id })
    .eq("id", id);
  revalidatePath("/dashboard/access-requests");

  return sent.ok
    ? { ok: `Provisioned ${row.email} and emailed their credentials.` }
    : { ok: `Provisioned ${row.email}. Email delivery not confirmed — share the credentials manually if needed.` };
}

export async function rejectRequest(_prev: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const adminUser = await requireAdmin();
  if (!adminUser) return { error: "Not authorized." };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing request id." };

  const admin = createAdminClient();
  await admin
    .from("access_requests")
    .update({ status: "rejected", handled_at: new Date().toISOString(), handled_by: adminUser.id })
    .eq("id", id);
  revalidatePath("/dashboard/access-requests");
  return { ok: "Request rejected." };
}
