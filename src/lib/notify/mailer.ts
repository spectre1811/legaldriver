import { isDemoMode } from "@/lib/demo";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/database.types";

// Email delivery via Resend, behind a small interface so it's swappable/testable.
// Free-tier note: Resend only delivers to arbitrary recipients from a *verified*
// domain; until a domain is verified it sends from onboarding@resend.dev to the
// account owner's address. FROM_EMAIL/RESEND_API_KEY come from env.
//
// WO-288 (2026-07-28 outage root cause): this module used to be silent-by-design —
// no key returned a ConsoleMailer that reported ok:true, provider failures were
// never logged, and a module cache let DEMO_MODE poison the resolved mailer past
// an env fix. All three are gone: prod-without-key fails LOUDLY, every provider
// failure error-logs, and the mailer resolves fresh per call.

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

const recipientDomain = (to: string) => to.split("@")[1] ?? "?";

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
      if (!res.ok) {
        const error = body.message ?? `resend ${res.status}`;
        // WO-288 (a): a provider failure must never pass silently (the 2026-07-26 403s ran dark).
        console.error(`[mailer] resend send failed (${res.status}): ${error} — to *@${recipientDomain(to)}`);
        return { ok: false, error };
      }
      return { ok: true, id: body.id };
    } catch (e) {
      const error = e instanceof Error ? e.message : "send failed";
      console.error(`[mailer] resend send threw: ${error} — to *@${recipientDomain(to)}`);
      return { ok: false, error };
    }
  }
}

// No-op mailer for dev/demo when no key is set: logs nothing sensitive, just succeeds.
class ConsoleMailer implements Mailer {
  readonly channel = "email" as const;
  async send(to: string, subject: string): Promise<SendResult> {
    // No PII: subject only, recipient domain only.
    console.log(`[mailer:console] would send "${subject}" to *@${recipientDomain(to)}`);
    return { ok: true, id: "console" };
  }
}

// WO-288 (b): production with no key must be LOUD — every attempt fails honestly
// (never ok:true) and error-logs, so the outbound_email log + readiness go red
// instead of a misconfig masquerading as delivery. ConsoleMailer stays dev/demo-only.
class FailMailer implements Mailer {
  readonly channel = "email" as const;
  async send(to: string, subject: string): Promise<SendResult> {
    const error = "RESEND_API_KEY missing in production — email not sent";
    console.error(`[mailer] ${error} ("${subject}" to *@${recipientDomain(to)})`);
    return { ok: false, error };
  }
}

// WO-323 · Off Vercel there is no VERCEL_ENV, so prefer an app-owned APP_ENV flag (set to
// "production" in the box's SSM env); fall back to VERCEL_ENV so the Vercel path is unchanged during
// the transition. Without this the mailer would pick ConsoleMailer on the box and silently drop real
// prod email when RESEND_API_KEY is momentarily absent.
const isProd = () => (process.env.APP_ENV ?? process.env.VERCEL_ENV) === "production";

// WO-288 (c): NO module cache — the old cache let a DEMO_MODE toggle pin a
// ConsoleMailer past an env fix. Construction is trivial; resolve fresh per call.
export function getMailer(): Mailer {
  if (isDemoMode()) return new ConsoleMailer(); // never hit Resend in a demo session
  const key = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL ?? "onboarding@resend.dev";
  if (key) return new ResendMailer(key, from);
  return isProd() ? new FailMailer() : new ConsoleMailer();
}

// Readiness for the settings diagnostics (WO-35 #6) + the access console banner.
// WO-288 (d): TRUTH, not a string heuristic — the env shape gives the base status
// (prod without a key = "misconfigured", red), and the latest REAL send outcomes
// from outbound_email override to "failing" during an outage (the 2026-07-26 403s
// hid behind a heuristic "ready" for days).
// Deliberately NO provider probe: the prod key is sending-scoped — GET /domains
// returns an EMPTY list for it — so a domain-list probe would misread a healthy
// key as unverified. Send outcomes are the only honest signal.
export type MailerReadiness = {
  status: "ready" | "restricted" | "unconfigured" | "misconfigured" | "failing";
  from: string;
};

type DB = SupabaseClient<Database>;

export async function getMailerReadiness(sb?: DB): Promise<MailerReadiness> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL ?? "onboarding@resend.dev";
  if (!key) return { status: isProd() && !isDemoMode() ? "misconfigured" : "unconfigured", from };
  if (sb) {
    // Latest real outcomes. Fail-soft: a query error (or pre-migration schema) just
    // falls through to the env-shape answer — never crash a settings render.
    try {
      const { data } = await sb
        .from("outbound_email")
        .select("status")
        .order("created_at", { ascending: false })
        .limit(5);
      const recent = data ?? [];
      // ponytail: "latest ≥3 all failed" streak, not a windowed rate — tighten if flapping.
      if (recent.length >= 3 && recent.every((r) => r.status === "failed")) return { status: "failing", from };
    } catch {
      /* env-shape answer below */
    }
  }
  // The shared resend.dev sender can only reach the account owner — a verified custom FROM_EMAIL
  // domain is what unlocks delivery to clients/advocates. (An unset FROM_EMAIL already defaults to
  // onboarding@resend.dev, so this catches that case too.)
  const restricted = /@resend\.dev$/i.test(from);
  return { status: restricted ? "restricted" : "ready", from };
}
