"use client";

// WO-272 — the invite-only intake form. Collects email (required) + name + an
// optional note, plus a hidden honeypot. Mirrors the login panel's pending/error
// idioms and design-system classes.

import Script from "next/script";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { NAME_MAX, NOTE_MAX } from "@/lib/access/validate";
import { requestAccess, type RequestAccessState } from "./actions";

const initial: RequestAccessState = {};

// WO-323 · Turnstile step-up. Inlined at build; unset → the widget never renders (the challenge
// only appears once the founder wires the site key AND an IP trips the limiter — dormant otherwise).
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

function Submit() {
  const { pending } = useFormStatus();
  const t = useTranslations("requestAccess");
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="ec-btn ec-btn-ink w-full">
      {pending ? t("pending") : t("cta")}
    </button>
  );
}

export function RequestAccessForm() {
  const t = useTranslations("requestAccess");
  const [state, action] = useFormState(requestAccess, initial);

  if (state.ok) {
    // WO-340 — ported the prototype's `rule-left` confirmation treatment (bronze rule +
    // tint wash). sentTitle carries the mk-eyebrow style on an actual <h1> so the view
    // keeps one real heading (the prototype splits eyebrow/heading into two copy strings;
    // this catalog only has one, so it takes the eyebrow's visual weight, not two lines
    // of fabricated copy).
    return (
      <div className="ec-rule-left p-5">
        <h1 className="mk-eyebrow">{t("sentTitle")}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ec-ink-2">{t("sentBody", { email: state.email ?? "" })}</p>
        <a href="/login" className="mt-3 inline-block text-sm font-medium text-ec-bronze-deep underline-offset-2 hover:underline">
          {t("backToLogin")}
        </a>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-[22px] font-medium leading-tight text-ec-ink">{t("title")}</h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ec-ink-2">{t("subtitle")}</p>
      <form action={action} className="mt-6 space-y-4">
        {/* WO-340 — 2-col name/email like the prototype's non-compact Field grid; note
            stays full-width below (the prototype's mobile-number row has no field here —
            the intake schema doesn't collect one, see actions.ts). */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="ec-label" htmlFor="name">{t("name")}</label>
            {/* WO-316 — maxLength mirrors the server cap so the browser stops at the
                same boundary instead of the server silently truncating. */}
            <input id="name" name="name" type="text" maxLength={NAME_MAX} autoComplete="name" className="input mt-1.5" placeholder={t("ph.name")} />
          </div>
          <div>
            <label className="ec-label" htmlFor="email">
              {t("email")} <span className="text-ec-bronze">*</span>
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input mt-1.5" placeholder={t("ph.email")} />
          </div>
        </div>
        <div>
          <label className="ec-label" htmlFor="note">{t("note")}</label>
          <textarea id="note" name="note" rows={3} maxLength={NOTE_MAX} className="input mt-1.5" placeholder={t("ph.note")} />
        </div>
        {/* Honeypot — off-screen + tab-skipped; humans never fill it, bots do. */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="company">Company</label>
          <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
        </div>
        {state.error && (
          <p role="alert" className="rounded-ec-s bg-ec-danger-t px-3.5 py-2.5 text-sm text-ec-danger">
            {t(`errors.${state.error}`)}
          </p>
        )}
        {state.error === "challenge" && TURNSTILE_SITE_KEY && (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
            {/* Turnstile injects a hidden `cf-turnstile-response` input into this form on solve; the
                server action reads it. */}
            <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} />
          </>
        )}
        <p className="text-xs text-ec-ink-3">{t("requiredHint")}</p>
        <Submit />
        <a href="/login" className="block text-sm font-medium text-ec-ink-2 underline-offset-2 hover:text-ec-bronze-deep hover:underline">
          {t("backToLogin")}
        </a>
      </form>
    </div>
  );
}
