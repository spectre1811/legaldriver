// WO-148 W2 · transactional email templates (comms-catalog-v2 §2).
//
// ENGLISH ONLY (founder directive 2026-07-18): transactional emails ship in English only —
// refined, targeted English, no Hindi. (Overrides the product-wide bilingual default for emails;
// the HI catalog carries no `emails.*` keys — see tests/i18n_coverage.ts EN_ONLY.)
//
// Brand-facing, data-bound, honest: every line is a `{slot}` template filled through
// fillTemplate (src/i18n/comms.ts) — a missing slot DROPS its line, never fakes a value
// (copy-deck §8). Money and count lines drop too: an absent aggregate is silence, not a "0"
// that reads as fabricated-empty. A genuine numeric 0 is a real value and shows.
//
// Standalone (react-email / WO-131 registry not landed — verified 2026-07-18). Email-safe
// HTML: single-column, all styles INLINE (no <style>, no external CSS/fonts — Gmail strips
// them), web-safe font stacks that approximate the v2 brand (Georgia serif display + a sans
// body), bronze #78582B accent (tokens.css --bronze), no images. Migrate to react-email when
// WO-131's base layout lands.
//
// TRIGGER + TIMING per template are documented in EMAIL_META below (the "which email, when"
// matrix the founder asked for) and surfaced in the styleguide. This module BUILDS templates;
// it does NOT send. Wiring the cron/notify path to adopt these is follow-up (INBOX) — the
// current ad-hoc htmlFor() stays until then; send-path stays WO-144/BSP-gated.

import en from "@/i18n/messages/en.json";
import { fillTemplate, type Slot } from "@/i18n/comms";

export type EmailKey = keyof typeof en.emails;
export type EmailData = Record<string, Slot>;

const EMAILS = en.emails;

// Brand-approximating, email-safe stacks. Fraunces/Work Sans can't be relied on in mail
// clients, so we fall back to the nearest web-safe families the brand tolerates (tokens.css
// --f-display Georgia fallback; UI sans → system-ui/Segoe/Arial). No webfonts in email.
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
const INK = "#1A1C1E";
const INK2 = "#4A4A45";
const INK3 = "#8B8578";
const PAPER = "#FAF9F7";
const CARD = "#FFFFFF";
const BRONZE = "#78582B";
const HAIR = "#E7E1D6";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// One filled line ("kind:key" → filled text or null). Order-preserving; null lines drop.
type Line = { key: string; text: string; role?: "lead" | "cta" | "muted" | "code" | "signoff" };

function fill(sec: Record<string, string>, key: string, data: EmailData): string | null {
  const tpl = sec[key];
  return tpl === undefined ? null : fillTemplate(tpl, data);
}

// Per-template body assembly. Returns ordered lines; each is dropped by fillTemplate when a
// slot is missing. The subject is always sec.subject (its slots must be present — the caller
// binds them; a subject that can't fill has no email to send).
function bodyLines(key: EmailKey, sec: Record<string, string>, data: EmailData): Line[] {
  const L = (k: string, role?: Line["role"]): Line[] => {
    const text = fill(sec, k, data);
    return text === null ? [] : [{ key: k, text, role }];
  };
  switch (key) {
    case "welcome":
      return [...L("greeting"), ...L("body", "lead"), ...L("ctaHint", "muted"), ...L("cta", "cta"), ...L("signoff", "signoff")];
    case "assembled":
      return [...L("lead", "lead"), ...L("closing"), ...L("cta", "cta")];
    case "dailyHearings":
      // rows are caller-expanded (multiple listed matters) — see renderDailyHearings; here for
      // the single-row/no-data shape the styleguide and the generic path use.
      return [...L("date", "muted"), ...L("listing", "lead"), ...L("orders", "muted"), ...L("cta", "cta")];
    case "weekly":
      return [
        ...L("hearingsAttended"), ...L("ordersNoted"), ...L("filingsDue"), ...L("billed"),
        ...L("ahead", "muted"), ...L("briefsReady"), ...L("cta", "cta"),
      ];
    case "invoice":
      return [...L("from", "muted"), ...L("body", "lead"), ...L("pay", "muted"), ...L("cta", "cta"), ...L("reply", "muted")];
    case "receipt":
      return [...L("body", "lead")];
    case "syncFailure":
      return [...L("body", "lead"), ...L("reassure", "muted")];
    case "security":
      return [...L("code", "code"), ...L("note", "muted")];
    case "caseUpdate":
      return [...L("lead", "lead"), ...L("ref", "muted"), ...L("detail"), ...L("cta", "cta")];
    case "trackConfirm":
      return [...L("lead", "lead"), ...L("body"), ...L("cta", "cta")];
  }
}

function lineHtml({ text, role }: Line): string {
  const t = esc(text);
  if (role === "code")
    return `<p style="margin:24px 0;font-family:${SANS};font-size:32px;font-weight:600;letter-spacing:6px;color:${INK};text-align:center">${t}</p>`;
  if (role === "cta")
    return `<p style="margin:24px 0"><a href="{ctaUrl}" style="display:inline-block;padding:11px 22px;background:${BRONZE};color:#FFFFFF;font-family:${SANS};font-size:15px;font-weight:600;text-decoration:none;border-radius:6px">${t}</a></p>`;
  if (role === "muted")
    return `<p style="margin:8px 0;font-family:${SANS};font-size:14px;line-height:1.55;color:${INK3}">${t}</p>`;
  if (role === "lead")
    return `<p style="margin:0 0 12px;font-family:${SANS};font-size:16px;line-height:1.6;color:${INK}">${t}</p>`;
  if (role === "signoff")
    return `<p style="margin:20px 0 0;font-family:${SERIF};font-size:15px;color:${INK2}">${t}</p>`;
  return `<p style="margin:8px 0;font-family:${SANS};font-size:15px;line-height:1.6;color:${INK2}">${t}</p>`;
}

// The single-column, inline-styled shell. `ctaUrl` (if any) is substituted into the {ctaUrl}
// placeholder the cta line leaves — a real link, never a fake one; absent → the button links
// to the app root the caller passes.
function shell(subject: string, inner: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:0;background:${PAPER}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAPER}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${CARD};border:1px solid ${HAIR};border-radius:10px"><tr><td style="padding:32px 28px">
<p style="margin:0 0 20px;font-family:${SERIF};font-size:13px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${BRONZE}">Mukadma</p>
<h1 style="margin:0 0 20px;font-family:${SERIF};font-size:22px;line-height:1.3;font-weight:600;color:${INK}">${esc(subject)}</h1>
${inner}
<hr style="border:none;border-top:1px solid ${HAIR};margin:28px 0 0">
<p style="margin:16px 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${INK3}">Not legal advice — verify against the official record.</p>
</td></tr></table>
</td></tr></table>
</body></html>`;
}

export type RenderedEmail = { subject: string; html: string; text: string };

/**
 * Render a transactional email from real data. Returns null when the subject can't fill
 * (a required subject slot is missing) — there is no honest email to send. Body lines with
 * missing slots drop silently. `ctaUrl` binds the one CTA link (copy-catalog: one link per
 * message); omit it and CTA lines still drop nothing but point at the app root you pass.
 */
export function renderEmail(
  key: EmailKey,
  data: EmailData,
  ctaUrl = "https://app.mukadma.in",
): RenderedEmail | null {
  const sec = EMAILS[key] as Record<string, string>;
  const subject = fillTemplate(sec.subject, data);
  if (subject === null) return null;

  const lines = bodyLines(key, sec, data);
  const inner = lines.map(lineHtml).join("\n");
  const html = shell(subject, inner).replace(/\{ctaUrl\}/g, esc(ctaUrl));

  // Plain-text part (copy-catalog / WO-131 constraint: always a text alternative). CTA lines
  // become "label: url"; the url replaces the {ctaUrl} the html used.
  const text = [
    subject,
    "",
    ...lines.map((l) => (l.role === "cta" ? `${l.text}: ${ctaUrl}` : l.text)),
    "",
    "Not legal advice — verify against the official record.",
  ].join("\n");

  return { subject, html, text };
}

// Every template key, for the styleguide + tests to iterate without a hardcoded list.
export const EMAIL_KEYS = Object.keys(en.emails) as EmailKey[];

/**
 * Daily hearings email (§2, template 8) — the evening-before board of tomorrow's listed matters
 * (the "never miss a hearing" channel while WhatsApp is dark). `rows` are per-matter listings;
 * each row drops if any of its slots ({court}/{time}/{parties}) is missing, so an incomplete row
 * is never faked. `orders` (the count line) drops when the count is missing — 0 is a real value.
 *
 * SEND RULE (documented, not wired here): the caller SKIPS sending entirely when no matter is
 * listed for tomorrow — this email is never sent empty (unlike the WhatsApp evening board, which
 * always fires). So there is no empty-board fallback line: an empty board means no email, and
 * this returns null when no row survives.
 */
export function renderDailyHearings(
  rows: EmailData[],
  meta: { date: Slot; count: Slot; orders?: Slot },
  ctaUrl = "https://app.mukadma.in",
): RenderedEmail | null {
  const sec = EMAILS.dailyHearings as Record<string, string>;
  const subject = fillTemplate(sec.subject, meta);
  if (subject === null) return null;

  const dateLine = fillTemplate(sec.date, { date: meta.date }); // "Listed for tomorrow · 24 Jul"; drops if date missing
  const listings = rows.map((r) => fillTemplate(sec.listing, r)).filter((l): l is string => l !== null);
  if (!listings.length) return null; // no listed matter → no email (send rule above)
  const ordersLine = meta.orders === undefined ? null : fillTemplate(sec.orders, { orders: meta.orders });

  const inner = [
    ...(dateLine ? [lineHtml({ key: "date", text: dateLine, role: "muted" })] : []),
    ...listings.map((l) => lineHtml({ key: "listing", text: l, role: "lead" })),
    ...(ordersLine ? [lineHtml({ key: "orders", text: ordersLine, role: "muted" })] : []),
    lineHtml({ key: "cta", text: sec.cta, role: "cta" }),
  ].join("\n");

  const html = shell(subject, inner).replace(/\{ctaUrl\}/g, esc(ctaUrl));
  const text = [subject, "", ...(dateLine ? [dateLine] : []), ...listings, ...(ordersLine ? [ordersLine] : []), `${sec.cta}: ${ctaUrl}`, "", "Not legal advice — verify against the official record."].join("\n");
  return { subject, html, text };
}

/**
 * TRIGGER + TIMING matrix ("which email, when") — the catalog metadata the founder asked for.
 * Documentation only: this module does NOT schedule or send. `cta` is the case-relative link
 * PATTERN the send-path caller resolves to an absolute URL (base + path). Case-detail links use
 * `caseDetailHref(cnr, matterId)` (src/lib/court/case-links.ts): tracked → /dashboard/cases/{id},
 * else /dashboard/cases/cnr/{cnr}. Surfaced in the styleguide so "what/when" is legible.
 */
export const EMAIL_META: Record<EmailKey, { trigger: string; timing: string; cta: string; wiring?: string }> = {
  welcome: { trigger: "Signup complete", timing: "Immediate, once", cta: "/dashboard/onboarding" },
  assembled: { trigger: "First onboarding sync finishes", timing: "Immediate, once", cta: "/dashboard/cases" },
  dailyHearings: {
    trigger: "Advocate has ≥1 matter listed for tomorrow — SKIP if none (never sent empty)",
    timing: "~6 pm IST daily",
    cta: "/dashboard/calendar",
    wiring: "Send-path (cron) not wired — WO-144 / INBOX. This WO ships the template only.",
  },
  weekly: { trigger: "Weekly recap", timing: "Sunday 6 pm IST", cta: "/dashboard/calendar" },
  invoice: {
    trigger: "Advocate sends an invoice to a client",
    timing: "Immediate",
    cta: "/dashboard/invoices/{id}",
    wiring: "Per-invoice route /dashboard/invoices/[id] exists; client pay link needs a token — send-path (WO-144/billing) resolves it.",
  },
  receipt: { trigger: "Payment confirmed", timing: "Immediate", cta: "— (receipt, no CTA)" },
  syncFailure: { trigger: "2 consecutive nightly sync misses", timing: "On the 2nd miss", cta: "— (reassurance, no CTA)" },
  security: { trigger: "OTP / password-reset requested", timing: "Immediate", cta: "— (code, no CTA)" },
  caseUpdate: {
    trigger: "A tracked case changes materially on nightly sync — new order · next-hearing set/changed · status/disposal change",
    timing: "On detection (day-of); tight per-user roundup if several change the same day, to avoid spam",
    cta: "caseDetailHref(cnr, matterId) → /dashboard/cases/{id}",
    wiring: "Change-detection + send-path not wired — WO-144 / INBOX. Tracking itself IS live (trackCaseByCnr → a tenant matter); no new store to build. This WO ships the template only.",
  },
  trackConfirm: {
    trigger: "trackCaseByCnr succeeds (user tracks a case from any page)",
    timing: "Immediate",
    cta: "caseDetailHref(cnr, matterId) → /dashboard/cases/{id}",
    wiring: "Send-path not wired — WO-144 / INBOX. This WO ships the template only.",
  },
};
