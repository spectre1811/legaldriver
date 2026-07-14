// WO-53 · landing pricing gate + site-config contract (offline, no DB/network).
// The load-bearing guarantee: the public landing NEVER renders an unconfirmed price
// or numeric limit until the founder flips the gate (FOUNDER-ACTIONS #11). The gate,
// the tier structure, and the grievance-officer slot all live in one config file;
// this pins their contract so a future edit can't silently leak numbers.
// Run: npx tsx tests/wo53_pricing_gate.ts
import { pricing, links, grievanceOfficer, hasGrievanceOfficer } from "../src/lib/site-config";
import { stripGatedPricing } from "../src/lib/i18n-gate";
import en from "../src/i18n/messages/en.json";
import hi from "../src/i18n/messages/hi.json";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };
const flatten = (o: unknown): string => JSON.stringify(o);

// --- the gate defaults CLOSED (no invented numbers go public without a founder flip) ---
// CI/build sets no NEXT_PUBLIC_PRICING_PUBLIC, so the shipped default must be false.
check("pricing gate is CLOSED by default (numbers hidden until #11 is ruled)", pricing.public === false);

// --- tier STRUCTURE is complete and stable (this part IS safe to ship: names only) ---
const ids = pricing.tiers.map((t) => t.id);
check("all four INPUTS-confirmed tiers present, in order", JSON.stringify(ids) === JSON.stringify(["free", "basic", "pro", "enterprise"]));
check("exactly one tier is emphasised (hot)", pricing.tiers.filter((t) => t.hot).length === 1);
check("every tier declares a CTA verb", pricing.tiers.every((t) => ["start", "choose", "talk"].includes(t.cta)));
check("every tier carries feature keys (rendered only when public)", pricing.tiers.every((t) => t.features.length > 0));

// --- the cross-product link points at the free public search (mukadma-search), over https ---
// Env-driven since WO-162 (NEXT_PUBLIC_SEARCH_URL); CI sets no env, so the shipped default applies.
check("public-search link defaults to the brand search origin (search.mukadma.in)", links.publicSearch === "https://search.mukadma.in");
check("public-search link is absolute https (external)", /^https:\/\//.test(links.publicSearch));

// --- grievance officer: honest empty state until the founder appoints one ---
check("grievance officer is unappointed by default", grievanceOfficer.name === "" && grievanceOfficer.email === "");
check("hasGrievanceOfficer() is false while unappointed (footer shows the 'being appointed' line)", hasGrievanceOfficer() === false);

// --- the client message catalog carries NO unconfirmed numbers while gated ---
// layout.tsx passes getMessages() through stripGatedPricing() before shipping it to
// the browser. With the gate closed, the numeric pricing strings must be gone from
// the client catalog entirely (not just unrendered — absent from page source/SEO).
// pricing.public is false in CI, so stripGatedPricing strips.
for (const [name, catalog] of [["en", en], ["hi", hi]] as const) {
  const raw = flatten(catalog);
  const stripped = flatten(stripGatedPricing(catalog as never));
  // the numeric feature rows live under pricing.tier.<id>.f — must vanish from the client copy
  check(`${name}: gated feature rows present in raw catalog`, /"f":\{/.test(raw));
  check(`${name}: client catalog drops the numeric feature rows (.f) while gated`, !/"f":\{/.test(stripped));
  // number-free structure survives (tier names + summaries still translate client-side if needed)
  check(`${name}: tier summaries survive stripping (structure intact)`, stripped.includes("summary"));
}
// EN carries the ₹ founding line + fromSeat in the raw catalog; both must be gone once stripped.
check("en: ₹ price strings exist in raw catalog", flatten(en).includes("₹399") && flatten(en).includes("₹2,000"));
check("en: client catalog carries NO ₹ price strings while gated", !flatten(stripGatedPricing(en as never)).includes("₹399") && !flatten(stripGatedPricing(en as never)).includes("₹2,000"));

// The numbers themselves stay in config, never leaked to the page while the gate is
// closed — the landing guards every price/limit/founding-note behind `pricing.public`.
// If someone flips the default to true here without confirming INPUTS §C.7, this fails.
if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll wo53_pricing_gate checks passed.");
