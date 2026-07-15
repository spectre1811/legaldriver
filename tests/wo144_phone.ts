// WO-144 W1: E.164 normaliser self-check. Deterministic, offline, no secrets.
// Run: npx tsx tests/wo144_phone.ts
import { normalizeE164, isE164 } from "@/lib/phone";

let failed = 0;
function eq(label: string, got: unknown, want: unknown) {
  if (got !== want) {
    failed++;
    console.error(`✗ ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
  }
}

// India-default coercion: bare / 0- / 91- / spaced / dashed all canonicalise.
eq("bare 10-digit → +91", normalizeE164("9876543210"), "+919876543210");
eq("0-prefixed national", normalizeE164("09876543210"), "+919876543210");
eq("already 91-prefixed", normalizeE164("919876543210"), "+919876543210");
eq("+91 with spaces", normalizeE164("+91 98765 43210"), "+919876543210");
eq("dashes/parens stripped", normalizeE164("(+91) 98765-43210"), "+919876543210");
eq("already canonical", normalizeE164("+919876543210"), "+919876543210");

// Other country codes pass through when the + is explicit.
eq("US +1 kept", normalizeE164("+1 555 123 4567"), "+15551234567");

// Rejections → null (fail closed).
eq("empty", normalizeE164(""), null);
eq("null", normalizeE164(null), null);
eq("too short", normalizeE164("12345"), null);
eq("too long (>15)", normalizeE164("+1234567890123456"), null);
eq("junk", normalizeE164("not a phone"), null);
eq("leading zero after CC strip", normalizeE164("012345678901234"), null);

// isE164 mirrors normalizeE164 truthiness.
eq("isE164 valid", isE164("9876543210"), true);
eq("isE164 invalid", isE164("nope"), false);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("wo144_phone: all assertions passed");
