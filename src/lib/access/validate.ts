// WO-272 — pure helpers for the invite-only access-request intake. No imports,
// so the offline test can import them directly under tsx (no `@/` alias needed).

/** Conservative email check. Rejects the obvious-bad; not RFC-perfect by design. */
export function isValidEmail(v: string): boolean {
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Canonical form for storage + dedupe. */
export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

/**
 * WO-316 — hard length caps for the PUBLIC, unauthenticated /request-access form.
 * A free-text field on an anonymous write is a storage amplifier: without a cap,
 * one POST can carry megabytes. Truncate rather than reject — a long note is a
 * clumsy human, not an attacker, and the founder still gets the first NAME_MAX /
 * NOTE_MAX characters. Empty (or whitespace-only) collapses to null so the column
 * stores NULL, not "".
 */
export const NAME_MAX = 120;
export const NOTE_MAX = 2000;

export function capText(v: string | null | undefined, max: number): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  return s.length <= max ? s : s.slice(0, max);
}

/**
 * WO-272 W2 — global-admin gate for the access-request console. The app's
 * profile.role is tenant-scoped (owner/lawyer/staff), so it can't express
 * "founder"; instead an ADMIN_EMAILS allowlist names the platform admins.
 * Pure so it's offline-testable; the server wrapper passes process.env.ADMIN_EMAILS.
 */
export function isAllowedAdmin(email: string | null | undefined, allowlist: string | null | undefined): boolean {
  if (!email || !allowlist) return false;
  const set = allowlist.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return set.length > 0 && set.includes(email.trim().toLowerCase());
}
