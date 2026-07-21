import { isDemoMode } from "@/lib/demo";

// Email delivery via Resend, behind a small interface so it's swappable/testable.
// Free-tier note: Resend only delivers to arbitrary recipients from a *verified*
// domain; until a domain is verified it sends from onboarding@resend.dev to the
// account owner's address. FROM_EMAIL/RESEND_API_KEY come from env.

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export interface Mailer {
  readonly channel: "email";
  /** `text` is the plain-text alternative part (WO-264 — every v2 template renders one). */
  send(to: string, subject: string, html: string, text?: string): Promise<SendResult>;
}

class ResendMailer implements Mailer {
  readonly channel = "email" as const;
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(to: string, subject: string, html: string, text?: string): Promise<SendResult> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: this.from, to, subject, html, ...(text ? { text } : {}) }),
      });
      const body = (await res.json()) as { id?: string; message?: string };
      if (!res.ok) return { ok: false, error: body.message ?? `resend ${res.status}` };
      return { ok: true, id: body.id };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "send failed" };
    }
  }
}

// No-op mailer for dev when no key is set: logs nothing sensitive, just succeeds.
class ConsoleMailer implements Mailer {
  readonly channel = "email" as const;
  async send(to: string, subject: string): Promise<SendResult> {
    // No PII: subject only, recipient domain only.
    const domain = to.split("@")[1] ?? "?";
    console.log(`[mailer:console] would send "${subject}" to *@${domain}`);
    return { ok: true, id: "console" };
  }
}

let cached: Mailer | null = null;
export function getMailer(): Mailer {
  // DEMO_MODE first (before the cache) — never hit Resend in a demo session,
  // regardless of keys, and immune to a runtime toggle defeating the cache.
  if (isDemoMode()) return (cached = new ConsoleMailer());
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL ?? "onboarding@resend.dev";
  cached = key ? new ResendMailer(key, from) : new ConsoleMailer();
  return cached;
}

// Readiness for the settings diagnostics (WO-35 #6) — email alerts silently no-op with no key,
// and Resend restricts delivery to the account owner until a sending domain is verified. Surface
// which state we're in so an advocate isn't left wondering why reminders never arrive.
// "ready" = real delivery to any recipient; "restricted" = key set but on the shared sender
// (owner-only); "unconfigured" = console no-op.
export type MailerReadiness = {
  status: "ready" | "restricted" | "unconfigured";
  from: string;
};
export function getMailerReadiness(): MailerReadiness {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL ?? "onboarding@resend.dev";
  if (!key) return { status: "unconfigured", from };
  // The shared resend.dev sender can only reach the account owner — a verified custom FROM_EMAIL
  // domain is what unlocks delivery to clients/advocates. (An unset FROM_EMAIL already defaults to
  // onboarding@resend.dev, so this catches that case too.)
  const restricted = /@resend\.dev$/i.test(from);
  return { status: restricted ? "restricted" : "ready", from };
}
