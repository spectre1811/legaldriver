"use client";

// WO-50 — the /login auth panel: method-first (Google on top), email/password
// sign-in, forgot-password, and the "check your inbox" screen. Every submit
// shows a pending state; every failure renders distinct translated copy (EN+HI)
// from a stable error code.
//
// WO-272 — Mukadma is invite-only. The self-serve "Create account" mode is
// removed: no signup form, no signin↔signup toggle. Google stays (existing
// Google users keep signing in; NEW Google users are blocked by Supabase). Where
// a person would have signed up, they're routed to /request-access instead.

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import type { AuthErrorCode } from "@/lib/auth/errors";
import {
  requestPasswordReset,
  resendConfirmation,
  signIn,
  signInWithGoogle,
  type AuthFormState,
} from "./actions";

const initial: AuthFormState = {};

type Mode = "signin" | "forgot";

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-4 w-4 animate-spin">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function SubmitButton({ label, pendingLabel, variant = "ink" }: { label: string; pendingLabel: string; variant?: "ink" | "ghost" }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`ec-btn w-full ${variant === "ink" ? "ec-btn-ink" : "ec-btn-ghost"}`}
    >
      {pending && <Spinner />} {pending ? pendingLabel : label}
    </button>
  );
}

function ErrorNote({ code }: { code?: AuthErrorCode }) {
  const t = useTranslations("auth");
  if (!code) return null;
  return (
    <p role="alert" className="rounded-ec-s bg-ec-danger-t px-3.5 py-2.5 text-sm text-ec-danger">
      {t(`errors.${code}`)}
    </p>
  );
}

// WO-272 — the one entry point for people without an account: request access.
function RequestAccessLink() {
  const t = useTranslations("auth");
  return (
    <a href="/request-access" className="font-medium text-ec-brass-deep underline-offset-2 hover:underline">
      {t("invite.cta")} →
    </a>
  );
}

function HiddenIntent({ next, track }: { next?: string; track?: string }) {
  return (
    <>
      {next && <input type="hidden" name="next" value={next} />}
      {track && <input type="hidden" name="track" value={track} />}
    </>
  );
}

function GoogleButton({ mode, next, track }: { mode: Mode; next?: string; track?: string }) {
  const t = useTranslations("auth");
  return (
    <form action={signInWithGoogle}>
      <input type="hidden" name="mode" value={mode} />
      <HiddenIntent next={next} track={track} />
      <GoogleSubmit label={t("google")} pendingLabel={t("googlePending")} />
    </form>
  );
}

function GoogleSubmit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="ec-btn ec-btn-ghost w-full gap-2.5">
      {pending ? (
        <Spinner />
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z" />
          <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8z" />
          <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1C6.2 6.9 8.9 4.8 12 4.8z" />
        </svg>
      )}
      {pending ? pendingLabel : label}
    </button>
  );
}

function Divider() {
  const t = useTranslations("auth");
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-ec-ink-3">
      <span className="h-px flex-1 bg-ec-hair" /> {t("or")} <span className="h-px flex-1 bg-ec-hair" />
    </div>
  );
}

function SignInForm({
  next,
  track,
  onUnconfirmed,
  onForgot,
}: {
  next?: string;
  track?: string;
  onUnconfirmed: (email: string) => void;
  onForgot: () => void;
}) {
  const t = useTranslations("auth");
  const [state, formAction] = useFormState(signIn, initial);

  // An unconfirmed account isn't a dead end — send them to the confirm screen
  // (resend + change-email) instead of an inline scold.
  useEffect(() => {
    if (state.error === "unconfirmed" && state.email) onUnconfirmed(state.email);
  }, [state, onUnconfirmed]);

  const inlineError = state.error === "unconfirmed" ? undefined : state.error;
  return (
    <form action={formAction} className="space-y-4">
      <HiddenIntent next={next} track={track} />
      <div>
        <label className="ec-label" htmlFor="email">{t("email")}</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input mt-1.5" placeholder={t("ph.email")} />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label className="ec-label" htmlFor="password">{t("password")}</label>
          <button type="button" onClick={onForgot} className="text-xs font-medium text-ec-ink-2 underline-offset-2 hover:text-ec-brass-deep hover:underline">
            {t("signin.forgot")}
          </button>
        </div>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="input mt-1.5" placeholder="••••••••" />
      </div>
      {/* WO-316 — sign-in has ONE failure code now: a bad password and an unknown
          email are indistinguishable. The branch that used to detect "this email has
          no account" and offer a request-access link is gone — it was the visible
          half of a user-enumeration oracle. People without an account are served by
          the standing "New to Mukadma? Request access" line at the foot of the panel. */}
      <ErrorNote code={inlineError} />
      <SubmitButton label={t("signin.cta")} pendingLabel={t("signin.pending")} />
    </form>
  );
}

// Post-signup (or unconfirmed sign-in) — explicit "check your inbox" screen
// with resend + change-email escape hatches. WO-272: only reachable now via an
// existing but unconfirmed account signing in (no signup path creates one).
function ConfirmScreen({
  email,
  next,
  track,
  onChangeEmail,
  onSignIn,
}: {
  email: string;
  next?: string;
  track?: string;
  onChangeEmail: () => void;
  onSignIn: () => void;
}) {
  const t = useTranslations("auth");
  const [state, formAction] = useFormState(resendConfirmation, initial);
  return (
    <div className="space-y-4">
      <h2 className="font-display text-2xl font-medium text-ec-ink">{t("confirm.title")}</h2>
      <p className="text-sm text-ec-ink-2">{t("confirm.body", { email })}</p>
      <p className="text-xs text-ec-ink-3">{t("confirm.hint")}</p>
      {state.ok === "resent" && (
        <p role="status" className="rounded-ec-s bg-ec-brass-tint px-3.5 py-2.5 text-sm text-ec-brass-deep">
          {t("confirm.resent")}
        </p>
      )}
      <ErrorNote code={state.error} />
      <form action={formAction}>
        <input type="hidden" name="email" value={email} />
        <HiddenIntent next={next} track={track} />
        <SubmitButton variant="ghost" label={t("confirm.resend")} pendingLabel={t("confirm.resendPending")} />
      </form>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onChangeEmail} className="font-medium text-ec-ink-2 underline-offset-2 hover:text-ec-brass-deep hover:underline">
          {t("confirm.changeEmail")}
        </button>
        <button type="button" onClick={onSignIn} className="font-medium text-ec-ink-2 underline-offset-2 hover:text-ec-brass-deep hover:underline">
          {t("confirm.signInInstead")}
        </button>
      </div>
    </div>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const t = useTranslations("auth");
  const [state, formAction] = useFormState(requestPasswordReset, initial);

  if (state.ok === "resetSent" && state.email) {
    return (
      <div className="space-y-4">
        <h2 className="font-display text-2xl font-medium text-ec-ink">{t("forgot.sentTitle")}</h2>
        <p className="text-sm text-ec-ink-2">{t("forgot.sentBody", { email: state.email })}</p>
        <button type="button" onClick={onBack} className="text-sm font-medium text-ec-brass-deep underline-offset-2 hover:underline">
          ← {t("forgot.back")}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="ec-label" htmlFor="email">{t("email")}</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="input mt-1.5" placeholder={t("ph.email")} />
      </div>
      <ErrorNote code={state.error} />
      <SubmitButton label={t("forgot.cta")} pendingLabel={t("forgot.pending")} />
      <button type="button" onClick={onBack} className="text-sm font-medium text-ec-ink-2 underline-offset-2 hover:text-ec-brass-deep hover:underline">
        ← {t("forgot.back")}
      </button>
    </form>
  );
}

export function AuthPanel({
  initialMode,
  urlError,
  notice,
  next,
  track,
}: {
  initialMode: Mode;
  urlError?: AuthErrorCode;
  notice?: "confirmEmail" | "inviteOnly" | "passwordChanged";
  next?: string;
  track?: string;
}) {
  const t = useTranslations("auth");
  const [mode, setMode] = useState<Mode>(initialMode);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  if (confirmEmail) {
    return (
      <ConfirmScreen
        email={confirmEmail}
        next={next}
        track={track}
        onChangeEmail={() => setConfirmEmail(null)}
        onSignIn={() => { setConfirmEmail(null); setMode("signin"); }}
      />
    );
  }

  return (
    <div>
      <h2 className="font-display text-2xl font-medium text-ec-ink">{t(`${mode}.title`)}</h2>
      <p className="mt-1 text-sm text-ec-ink-3">{t(`${mode}.subtitle`)}</p>

      {urlError && (
        <p role="alert" className="mt-5 rounded-ec-s bg-ec-danger-t px-3.5 py-2.5 text-sm text-ec-danger">
          {t(`errors.${urlError}`)}
        </p>
      )}
      {notice === "confirmEmail" && (
        <p className="mt-5 rounded-ec-s bg-ec-brass-tint px-3.5 py-2.5 text-sm text-ec-brass-deep">
          {t("notice.confirmEmail")}
        </p>
      )}
      {notice === "passwordChanged" && (
        // WO-316 — a password change revokes EVERY session, this browser included,
        // so the landing here is expected. Say so instead of leaving a silent bounce.
        <p role="status" className="mt-5 rounded-ec-s bg-ec-brass-tint px-3.5 py-2.5 text-sm text-ec-brass-deep">
          {t("notice.passwordChanged")}
        </p>
      )}
      {notice === "inviteOnly" && (
        // WO-272 — arrived via a signup deep-link; explain invite-only + route on.
        <div className="mt-5 rounded-ec-s bg-ec-brass-tint px-3.5 py-3 text-sm text-ec-brass-deep">
          <p className="font-medium">{t("invite.noticeTitle")}</p>
          <p className="mt-1 text-ec-ink-2">{t("invite.noticeBody")}</p>
          <p className="mt-2"><RequestAccessLink /></p>
        </div>
      )}

      <div className="mt-6">
        {mode !== "forgot" && (
          <>
            <GoogleButton mode={mode} next={next} track={track} />
            <Divider />
          </>
        )}

        {mode === "signin" && (
          <SignInForm
            next={next}
            track={track}
            onUnconfirmed={setConfirmEmail}
            onForgot={() => setMode("forgot")}
          />
        )}
        {mode === "forgot" && <ForgotForm onBack={() => setMode("signin")} />}
      </div>

      {mode !== "forgot" && (
        <p className="mt-6 text-center text-sm text-ec-ink-2">
          {t("invite.prompt")} <RequestAccessLink />
        </p>
      )}
    </div>
  );
}
