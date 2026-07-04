// WO-35 blocker #1 — information-integrity signal. Run: npx tsx tests/wo35_provider_signal.ts
// The trust banner keys off isMockCourtProvider(): it must be TRUE only when the active provider
// is the synthetic mock (no live court sync), so fabricated cases are never shown as real records.
import { isMockCourtProvider, setCourtDataClient } from "../src/lib/court/client";
import type { CourtDataClient } from "../src/lib/court/client";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

const fake = (source: string) => ({ source } as unknown as CourtDataClient);

// 1) Mock provider active → flag the demo banner.
setCourtDataClient(fake("mock"));
ok("mock provider → isMockCourtProvider() true", isMockCourtProvider() === true);

// 2) Live LegalDriver provider → NO banner (real court data).
setCourtDataClient(fake("legaldriver"));
ok("legaldriver provider → isMockCourtProvider() false", isMockCourtProvider() === false);

// 3) Any other live provider (e.g. legacy ecourtsindia) → NO banner.
setCourtDataClient(fake("ecourtsindia"));
ok("ecourtsindia provider → isMockCourtProvider() false", isMockCourtProvider() === false);

setCourtDataClient(null); // reset the cache for any downstream run
console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
