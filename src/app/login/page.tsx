import { signIn, signUp } from "./actions";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string };
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">LexDriver</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your court cases, cause list, deadlines and inbox — one daily driver.
        </p>
      </div>

      {searchParams.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}
      {searchParams.message && (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {searchParams.message}
        </p>
      )}

      <form className="flex flex-col gap-3">
        <label className="text-sm font-medium" htmlFor="full_name">
          Full name (sign up only)
        </label>
        <input
          id="full_name"
          name="full_name"
          className="rounded-md border border-slate-300 px-3 py-2"
          autoComplete="name"
        />
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="rounded-md border border-slate-300 px-3 py-2"
          autoComplete="email"
        />
        <label className="text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          className="rounded-md border border-slate-300 px-3 py-2"
          autoComplete="current-password"
        />
        <div className="mt-2 flex gap-3">
          <button
            formAction={signIn}
            className="flex-1 rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-blue-800"
          >
            Sign in
          </button>
          <button
            formAction={signUp}
            className="flex-1 rounded-md border border-accent px-4 py-2 font-medium text-accent hover:bg-blue-50"
          >
            Sign up
          </button>
        </div>
      </form>

      <p className="text-center text-xs text-slate-400">
        Not legal advice. Court data is informational — verify against the official record.
      </p>
    </main>
  );
}
