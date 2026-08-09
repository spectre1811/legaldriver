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
// WO-324 (founder 2026-08-04): pricing collapsed from the old INPUTS-backed 4-tier
// Free/Basic/Pro/Enterprise structure to Free + Pro (one plan, two billing cycles),
// matching design-mockups/iteration3/landing-v6-daybreak.html — supersedes the pin below.
const ids = pricing.tiers.map((t) => t.id);
check("both WO-324 tiers present, in order", JSON.stringify(ids) === JSON.stringify(["free", "pro"]));
check("exactly one tier is emphasised (hot)", pricing.tiers.filter((t) => t.hot).length === 1);
check("every tier declares a CTA verb", pricing.tiers.every((t) => ["start", "choose"].includes(t.cta)));
check("every tier carries feature keys (rendered only when public)", pricing.tiers.every((t) => t.features.length > 0));
check("Pro declares both billing-cycle prices", pricing.tiers.find((t) => t.id === "pro")?.yearlyPrice != null);

// --- the cross-product link points at the free public search (mukadma-search), over https ---
// Env-driven since WO-162 (NEXT_PUBLIC_SEARCH_URL); CI sets no env, so the shipped default applies.
check("public-search link defaults to the brand search origin (search.mukadma.in)", links.publicSearch === "https://search.mukadma.in");
check("public-search link is absolute https (external)", /^https:\/\//.test(links.publicSearch));

// --- grievance officer: APPOINTED 2026-07-28 (40d391d) — the footer must publish the real
// contact (IT Rules 2021 §3(2)), never regress to the "being appointed" placeholder.
// (.trim() comparisons keep this green under the `as const` literal types — TS2367.)
check("grievance officer is appointed (name+email published)", grievanceOfficer.name.trim() !== "" && grievanceOfficer.email.trim() !== "");
check("hasGrievanceOfficer() is true once appointed (footer shows the contact, not the placeholder)", hasGrievanceOfficer() === true);

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
  // WO-324: the monthly/yearly billing toggle names a price-derived number ("Save 16%")
  // that's meaningless — and misleading — without the prices it discounts; must vanish too.
  // Scoped to landing.pricing.billing specifically — `billing` also exists (correctly,
  // unrelated) under shell/caseDetail/analytics/settings for the authed dashboard.
  const landingPricing = (catalog as { landing: { pricing: Record<string, unknown> } }).landing.pricing;
  const strippedLandingPricing = (stripGatedPricing(catalog as never) as { landing: { pricing: Record<string, unknown> } }).landing.pricing;
  check(`${name}: billing-cycle toggle present in raw landing.pricing`, "billing" in landingPricing);
  check(`${name}: client catalog drops landing.pricing.billing while gated`, !("billing" in strippedLandingPricing));
  // number-free structure survives (tier names + summaries still translate client-side if needed)
  check(`${name}: tier summaries survive stripping (structure intact)`, stripped.includes("summary"));
}
// EN carries the Pro yearly-billing sentence's derived ₹ amount in the raw catalog; must be gone once stripped.
check("en: ₹ price strings exist in raw catalog", flatten(en).includes("₹417"));
check("en: client catalog carries NO ₹ price strings while gated", !flatten(stripGatedPricing(en as never)).includes("₹417"));

// The numbers themselves stay in config, never leaked to the page while the gate is
// closed — the landing guards every price/limit/founding-note behind `pricing.public`.
// If someone flips the default to true here without confirming INPUTS §C.7, this fails.
if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log("\nAll wo53_pricing_gate checks passed.");
