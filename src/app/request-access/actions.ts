"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getMailer, type SendResult } from "@/lib/notify/mailer";
import { logOutboundEmail } from "@/lib/notify/log";
import { isValidEmail, normalizeEmail } from "@/lib/access/validate";

// WO-272 — invite-only intake. Mukadma no longer lets the public self-serve an
// account (Supabase disable_signup + UI). Interested people leave their email
// here; we store it (durable ledger) and email the founder to decide + provision.
// The store uses the service-role admin client because access_requests is RLS
// deny-all for anon/authenticated — nobody can read/write it from the browser.

export type RequestAccessState = {
  error?: "email" | "failed";
  ok?: boolean;
  /** Echo for the "we'll be in touch at {email}" screen. */
  email?: string;
};

const field = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

/** Who gets the "someone requested access" email. Env so recipients change without a redeploy. */
const notifyTo = () => process.env.ACCESS_REQUEST_NOTIFY || "yash@mukadma.in";
const DEDUPE_MS = 10 * 60 * 1000;

const esc = (s: string) => s.replace(/[<>&]/g, (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"));

export async function requestAccess(_prev: RequestAccessState, formData: FormData): Promise<RequestAccessState> {
  // Honeypot: humans never fill this; bots fill every field. Silently accept
  // (don't tip off the bot) but store/send nothing.
  if (field(formData, "company")) return { ok: true, email: field(formData, "email") };

  const email = normalizeEmail(field(formData, "email"));
  if (!isValidEmail(email)) return { error: "email" };
  const name = field(formData, "name") || null;
  const note = field(formData, "note") || null;

  const admin = createAdminClient();
  // Store first — the row is the durable record even if the email later fails.
  const { error: insErr } = await admin.from("access_requests").insert({ email, name, note, source: "login" });
  if (insErr) return { error: "failed" };

  // 10-min notification dedupe: skip the founder email if this address just
  // submitted (the row is still stored). The just-inserted row is counted, so
  // >1 within the window means a prior request. Best-effort — never block on it.
  let recentlyNotified = false;
  try {
    const since = new Date(Date.now() - DEDUPE_MS).toISOString();
    const { count } = await admin
      .from("access_requests")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);
    recentlyNotified = (count ?? 0) > 1;
  } catch {
    recentlyNotified = false;
  }

  if (!recentlyNotified) {
    const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const lines = [`Email: ${email}`, name ? `Name: ${name}` : null, note ? `Note: ${note}` : null, `When: ${when} IST`]
      .filter((l): l is string => Boolean(l));
    const html = `<h2>New access request</h2>${lines.map((l) => `<p>${esc(l)}</p>`).join("")}<p>Approve or reject in the admin console.</p>`;
    const text = `New access request\n\n${lines.join("\n")}\n\nApprove or reject in the admin console.`;
    // A failed notification must never fail the request (the row is stored) — but it
    // must never be SILENT either (WO-288 a: the old empty catch swallowed the
    // founder-notify outage whole). Log the outcome; tenantId null = system send.
    const subject = `New access request: ${email}`;
    const res = await getMailer()
      .send(notifyTo(), subject, html, text)
      .catch((e): SendResult => ({ ok: false, error: e instanceof Error ? e.message : "send threw" }));
    await logOutboundEmail(admin, { tenantId: null, to: notifyTo(), subject, kind: "notice", ok: res.ok, providerId: res.id, error: res.error });
  }

  return { ok: true, email };
}
