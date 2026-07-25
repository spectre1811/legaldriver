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
