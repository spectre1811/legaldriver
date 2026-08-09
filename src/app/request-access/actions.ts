"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMailer, type SendResult } from "@/lib/notify/mailer";
import { logOutboundEmail } from "@/lib/notify/log";
import { isValidEmail, normalizeEmail, capText, NAME_MAX, NOTE_MAX } from "@/lib/access/validate";
import { stepUp } from "@/lib/security/step-up";

// WO-272 — invite-only intake. Mukadma no longer lets the public self-serve an
// account (Supabase disable_signup + UI). Interested people leave their email
// here; we store it (durable ledger) and email the founder to decide + provision.
// The store uses the service-role admin client because access_requests is RLS
// deny-all for anon/authenticated — nobody can read/write it from the browser.

export type RequestAccessState = {
  error?: "email" | "failed" | "challenge";
  ok?: boolean;
  /** Echo for the "we'll be in touch at {email}" screen. */
  email?: string;
};

const field = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();

/** Who gets the "someone requested access" email. Env so recipients change without a redeploy. */
const notifyTo = () => process.env.ACCESS_REQUEST_NOTIFY || "yash@mukadma.in";

/**
 * WO-316 — one row and one email per address per window. This used to be a
 * notification-only dedupe that ran AFTER the insert, so a public form with no
 * captcha and no throttle was an unbounded DB-write amplifier: N posts = N rows.
 * The window check now runs FIRST and gates the write as well as the send.
 */
const WINDOW_MS = 10 * 60 * 1000;

const esc = (s: string) => s.replace(/[<>&]/g, (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"));

export async function requestAccess(_prev: RequestAccessState, formData: FormData): Promise<RequestAccessState> {
  // Honeypot: humans never fill this; bots fill every field. Silently accept
  // (don't tip off the bot) but store/send nothing.
  if (field(formData, "company")) return { ok: true, email: field(formData, "email") };

  const email = normalizeEmail(field(formData, "email"));
  if (!isValidEmail(email)) return { error: "email" };

  // WO-323 · Per-IP rate-limit + Turnstile step-up. The per-email dedupe below bounds a single
  // address; this bounds an attacker CYCLING addresses. Behind Cloudflare the trusted IP is the
  // unforgeable CF header. Dormant (existing honeypot/dedupe/caps remain the backstop) until
  // TURNSTILE_SECRET_KEY is wired; then a tripped IP must clear a Turnstile challenge.
  let ip = "";
  try {
    const h = headers();
    ip = h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? (h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  } catch {
    // Called outside a request scope (e.g. a direct unit-test invocation) — no IP; the limiter falls
    // back to a shared bucket, and the honeypot/dedupe/caps remain the real backstop.
  }
  const gate = await stepUp({ ip, action: "request-access", token: field(formData, "cf-turnstile-response") || null });
  if (!gate.ok) return { error: "challenge", email };

  // Bounded free text — see capText: a public write with unbounded fields is a
  // storage amplifier, so cap before the row is ever built.
  const name = capText(field(formData, "name"), NAME_MAX);
  const note = capText(field(formData, "note"), NOTE_MAX);

  const admin = createAdminClient();

  // CHECK BEFORE WRITE. A repeat inside the window costs one indexed count query
  // and nothing else: no row, no email. Best-effort — if the probe itself errors we
  // fall through and store (a durable ledger beats a dropped genuine request, and a
  // failing probe means the insert is about to fail too).
  let recent = false;
  try {
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { count } = await admin
      .from("access_requests")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", since);
    recent = (count ?? 0) > 0;
  } catch {
    recent = false;
  }

  // Identical answer to a first-time request — the form must not become an oracle
  // for "has this address already asked?".
  if (recent) return { ok: true, email };

  const { error: insErr } = await admin.from("access_requests").insert({ email, name, note, source: "login" });
  if (insErr) return { error: "failed" };

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

  return { ok: true, email };
}
