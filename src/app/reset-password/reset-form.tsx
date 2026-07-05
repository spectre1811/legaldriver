"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { updatePassword, type AuthFormState } from "@/app/login/actions";

const initial: AuthFormState = {};

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="ec-btn ec-btn-ink w-full">
      {pending && (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4 animate-spin">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {pending ? pendingLabel : label}
    </button>
  );
}

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const [state, formAction] = useFormState(updatePassword, initial);
  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label className="ec-label" htmlFor="password">{t("reset.newPassword")}</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="input mt-1.5"
          placeholder="••••••••"
        />
        <p className="mt-1.5 text-xs text-ec-ink-3">{t("signup.passwordHint")}</p>
      </div>
      {state.error && (
        <p role="alert" className="rounded-ec-s bg-ec-danger-t px-3.5 py-2.5 text-sm text-ec-danger">
          {t(`errors.${state.error}`)}
        </p>
      )}
      <Submit label={t("reset.cta")} pendingLabel={t("reset.pending")} />
    </form>
  );
}
