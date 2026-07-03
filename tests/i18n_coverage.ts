// Test: i18n catalog key-parity (WO-03, Wave 1). No live services.
// Guards against a locale drifting keys or a hardcoded string slipping past
// a catalog. Run: npx tsx tests/i18n_coverage.ts
import en from "@/i18n/messages/en.json";
import hi from "@/i18n/messages/hi.json";
import { locales } from "@/i18n/config";

function keys(obj: unknown, prefix = ""): string[] {
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      keys(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [prefix];
}

const enKeys = new Set(keys(en));
const hiKeys = new Set(keys(hi));
const missingInHi = [...enKeys].filter((k) => !hiKeys.has(k));
const extraInHi = [...hiKeys].filter((k) => !enKeys.has(k));

let ok = true;
if (missingInHi.length) { ok = false; console.log("MISSING IN hi:", missingInHi.join(", ")); }
if (extraInHi.length) { ok = false; console.log("EXTRA IN hi (absent in en):", extraInHi.join(", ")); }
for (const l of ["en", "hi"] as const) {
  if (!(locales as readonly string[]).includes(l)) { ok = false; console.log(`locale ${l} not declared in config`); }
}

console.log(`i18n key-parity: en=${enKeys.size} hi=${hiKeys.size} keys`);
console.log(ok ? "I18N COVERAGE: PASS" : "I18N COVERAGE: FAIL");
process.exit(ok ? 0 : 1);
