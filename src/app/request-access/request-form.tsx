"use client";

// WO-272 — the invite-only intake form. Collects email (required) + name + an
// optional note, plus a hidden honeypot. Mirrors the login panel's pending/error
// idioms and design-system classes.

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { NAME_MAX, NOTE_MAX } from "@/lib/access/validate";
import { requestAccess, type RequestAccessState } from "./actions";

const initial: RequestAccessState = {};

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
    return (
      <div className="space-y-4">
        <h1 className="font-display text-2xl font-medium text-ec-ink">{t("sentTitle")}</h1>
        <p className="text-sm text-ec-ink-2">{t("sentBody", { email: state.email ?? "" })}</p>
        <a href="/login" className="inline-block text-sm font-medium text-ec-brass-deep underline-offset-2 hover:underline">
          {t("backToLogin")}
        </a>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-medium text-ec-ink">{t("title")}</h1>
      <p className="mt-1 text-sm text-ec-ink-3">{t("subtitle")}</p>
      <form action={action} className="mt-6 space-y-4">
        <div>
          <label className="ec-label" htmlFor="name">{t("name")}</label>
          {/* WO-316 — maxLength mirrors the server cap so the browser stops at the
              same boundary instead of the server silently truncating. */}
          <input id="name" name="name" type="text" maxLength={NAME_MAX} autoComplete="name" className="input mt-1.5" placeholder={t("ph.name")} />
        </div>
        <div>
          <label className="ec-label" htmlFor="email">{t("email")}</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input mt-1.5" placeholder={t("ph.email")} />
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
        <Submit />
        <a href="/login" className="block text-sm font-medium text-ec-ink-2 underline-offset-2 hover:text-ec-brass-deep hover:underline">
          {t("backToLogin")}
        </a>
      </form>
    </div>
  );
}
