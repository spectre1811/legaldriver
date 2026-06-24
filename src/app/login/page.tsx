import { signIn, signUp } from "./actions";
import { Icon } from "@/components/icons";

const TRUST = [
  ["cases", "Every case, hearing & deadline in one calendar"],
  ["inbox", "Gmail auto-filed against the right client & case"],
  ["notices", "Legal-notice escalation that runs itself"],
];

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string };
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-900 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{ background: "radial-gradient(700px circle at 20% 10%, #4A4FD6 0%, transparent 55%), radial-gradient(600px circle at 90% 90%, #2E32A0 0%, transparent 50%)" }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <Icon name="scale" className="h-5 w-5 text-brass-400" />
          </span>
          <span className="font-serif text-xl font-medium">LexDriver</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-serif text-4xl font-medium leading-[1.15] text-white">
            Your practice, on a single daily driver.
          </h1>
          <p className="mt-4 text-white/70">
            Track cases by CNR, surface your cause list and deadlines, escalate notices, and let
            your inbox file itself — built for advocates and firms.
          </p>
          <ul className="mt-8 space-y-3">
            {TRUST.map(([icon, text]) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/85">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-brass-400">
                  <Icon name={icon as never} className="h-4 w-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/40">
          Court data via a licensed API · not legal advice · verify against the official record.
        </p>
      </section>

      {/* Auth panel */}
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
                <Icon name="scale" className="h-5 w-5" />
              </span>
              <span className="font-serif text-xl font-medium">LexDriver</span>
            </div>
          </div>

          <h2 className="text-2xl font-semibold">Welcome back</h2>
          <p className="mt-1 text-sm text-ink-muted">Sign in to your workspace, or create a new one.</p>

          {searchParams.error && (
            <p role="alert" className="mt-5 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {searchParams.error}
            </p>
          )}
          {searchParams.message && (
            <p className="mt-5 rounded-xl bg-brand-50 px-3.5 py-2.5 text-sm text-brand-700">
              {searchParams.message}
            </p>
          )}

          <form className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="full_name">Full name <span className="font-normal normal-case text-ink-faint">(sign up)</span></label>
              <input id="full_name" name="full_name" autoComplete="name" className="input mt-1.5" placeholder="Adv. Meera Joshi" />
            </div>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required autoComplete="email" className="input mt-1.5" placeholder="you@firm.in" />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" name="password" type="password" required minLength={6} autoComplete="current-password" className="input mt-1.5" placeholder="••••••••" />
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              <button formAction={signIn} className="btn-primary w-full">Sign in</button>
              <button formAction={signUp} className="btn-secondary w-full">Create a workspace</button>
            </div>
          </form>

          <p className="mt-8 text-center text-xs text-ink-faint">
            By continuing you agree this is informational only and not legal advice.
          </p>
        </div>
      </section>
    </main>
  );
}
