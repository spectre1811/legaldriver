// Shared E.164 phone normaliser/validator (WO-144 W1). One helper for every
// capture/send point so a WhatsApp number is stored and sent in one canonical
// shape (`+<country><national>`), never as free-form user text. India-default:
// bare 10-digit and 0-/91-prefixed numbers coerce to +91; anything already in
// +CC form is validated to E.164 (≤15 digits). Returns null when the input
// can't be a valid number so callers fail closed rather than send to garbage.

// E.164 caps the whole number (country + national, no +) at 15 digits; the
// shortest live international numbers run ~8. First digit is never 0.
export function normalizeE164(
  raw: string | null | undefined,
  defaultCountry = "91",
): string | null {
  if (!raw) return null;
  const hasPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let s = digits;
  if (!hasPlus) {
    // Bare national forms → apply the default country code (India).
    if (s.length === 10) s = defaultCountry + s; // 9876543210
    else if (s.length === 11 && s.startsWith("0")) s = defaultCountry + s.slice(1); // 09876543210
    // else: assume a country code is already present (e.g. 919876543210).
  }

  if (s.length < 8 || s.length > 15) return null;
  if (s.startsWith("0")) return null;
  return "+" + s;
}

export function isE164(raw: string | null | undefined): boolean {
  return normalizeE164(raw) !== null;
}
