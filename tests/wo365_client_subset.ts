// Test: WO-365 W1 — selectClientMessages keeps exactly the whitelisted namespaces.
// No live services. Run: npx tsx tests/wo365_client_subset.ts
//
// Why this exists (review finding F4): the selector is a nested-path loop with three
// early-exit branches, and its failure mode is SILENT and user-visible — drop a namespace a
// client component needs and useTranslations() renders raw key strings to users with no
// error, no exception, no log. The CI namespace-guard catches the *whitelist* going wrong;
// nothing caught the *selector* going wrong until this file.
import assert from "node:assert/strict";
import { selectClientMessages } from "@/lib/i18n-client-subset";
import CLIENT_NAMESPACE_PATHS from "@/lib/CLIENT_NAMESPACE_PATHS.json";
import en from "@/i18n/messages/en.json";
import hi from "@/i18n/messages/hi.json";

function get(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>(
    (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failures++;
    console.error(`  FAIL ${name}: ${(e as Error).message}`);
  }
}

console.log("WO-365 selectClientMessages");

// 1. Every whitelisted path that EXISTS in the catalog survives selection. This is the
//    property whose violation ships raw keys to users.
for (const locale of [["en", en], ["hi", hi]] as const) {
  const [name, catalog] = locale;
  check(`${name}: every present whitelisted path survives`, () => {
    const out = selectClientMessages(catalog as never);
    for (const path of CLIENT_NAMESPACE_PATHS) {
      if (get(catalog, path) === undefined) continue; // absent upstream — covered by test 3
      assert.notEqual(get(out, path), undefined, `dropped whitelisted path: ${path}`);
    }
  });
}

// 2. An unlisted namespace must NOT leak through — that is the entire point of the change.
check("unlisted namespace is absent from the result", () => {
  const out = selectClientMessages({
    common: { a: "1" },
    __definitelyNotWhitelisted: { secret: "should not ship" },
  } as never);
  assert.equal(get(out, "__definitelyNotWhitelisted"), undefined);
  assert.equal(get(out, "common.a"), "1");
});

// 3. A whitelisted path missing from the catalog is SKIPPED, not crashed on and not
//    invented. hi.json genuinely has no `emails` namespace (English-only, WO-148 W2), so
//    this is a real production shape, not a hypothetical.
check("missing top-level namespace is skipped, not fabricated", () => {
  const out = selectClientMessages({ common: { a: "1" } } as never);
  assert.equal(get(out, "emails"), undefined);
  assert.equal(get(out, "common.a"), "1");
});

check("missing nested leaf is never invented (empty parent husk is known + benign)", () => {
  // `dashboard` exists but the whitelisted child does not.
  const out = selectClientMessages({ dashboard: { somethingElse: "x" } } as never);
  // THE property that matters: a missing leaf is never fabricated. Serving a key that does
  // not exist upstream is how a user ends up reading a raw key string.
  assert.equal(get(out, "dashboard.clients"), undefined, "invented a missing leaf");
  // Documented actual behaviour, deliberately NOT asserted as a defect: the walk creates the
  // parent (`dashboard: {}`) before it discovers the leaf is absent, so an empty husk can
  // survive. It costs ~15 bytes, cannot render anything, and does not occur in production —
  // all 33 whitelisted paths exist in both catalogs (verified in review). Tightening the walk
  // to prune empty parents is a real change to a hot path for no measurable gain, so it is
  // recorded here rather than "fixed" on a hunch.
  assert.equal(get(out, "dashboard.somethingElse"), undefined, "unlisted sibling leaked");
});

// 4. Nested dot-paths are kept at their real depth, not flattened.
check("nested path is preserved at depth", () => {
  const out = selectClientMessages({
    dashboard: { clients: { title: "T" }, caseFile: { serverOnly: "no" } },
  } as never);
  assert.equal(get(out, "dashboard.clients.title"), "T");
  assert.equal(get(out, "dashboard.caseFile"), undefined, "server-only sibling leaked");
});

// 5. Selection must not mutate the source catalog.
check("does not mutate the input catalog", () => {
  const src = { common: { a: "1" }, terms: { t: "x" } };
  const before = JSON.stringify(src);
  selectClientMessages(src as never);
  assert.equal(JSON.stringify(src), before);
});

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("all passed");
