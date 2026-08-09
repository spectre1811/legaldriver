// Single founder-editable config for public-facing facts that are either
// INPUTS-backed or clearly-flagged placeholders (WO-53). The public landing
// (src/components/landing.tsx) reads ONLY from here for anything numeric or
// legally-sensitive, so a founder can change it without touching component code.
//
// TWO founder switches live here:
//   1) pricing.public — the pricing GATE (FOUNDER-ACTIONS #11). While false, the
//      landing ships the pricing STRUCTURE (tier names + a number-free value line)
//      but renders NO unconfirmed number — not a price, not "5 matters", not a
//      billing-cycle sentence with a derived amount. Flip to true ONLY after every
//      price below is confirmed against INPUTS §C.7. (Guardrail: no invented
//      numbers reach the public page — src/lib/i18n-gate.ts strips the matching
//      i18n keys from the client message catalog too, not just the render path.)
//   2) grievanceOfficer — fill name/email when the officer is appointed
//      (IT Rules 2021 §3(2) requires an intermediary to publish this). Until
//      filled, the footer shows an honest "being appointed" line, never a fake name.
//
// WO-324 (Daybreak reskin, founder 2026-08-04): pricing collapses to Free + Pro,
// one plan two billing cycles (₹499/mo · ₹4,999/yr, "Save 16%"), replacing the
// old 4-tier Free/Basic/Pro/Enterprise structure — matches
// design-mockups/iteration3/landing-v6-daybreak.html exactly. PUBLICATION GUARD
// carried over from that mockup: these are a proposed launch configuration, NOT
// approved live prices, until pricing.public is flipped per INPUTS §C.7.

/** External product links (the free public case search lives in mukadma-search). */
export const links = {
  /** Free public case search — mukadma-search (WO-51 cross-link back to us).
   *  Env-driven (WO-162): the mukadma.in cutover is a Vercel env flip, not a code
   *  change; default is the brand host (vercel.app 308-redirects there after W2). */
  publicSearch: process.env.NEXT_PUBLIC_SEARCH_URL ?? "https://search.mukadma.in",
} as const;

/** A single pricing tier. `monthlyPrice`/`yearlyPrice`/`features` are UNCONFIRMED
 *  placeholders and MUST NOT render while `pricing.public` is false. `id`/`name`/
 *  `cta` (the structure) are safe to show. `features` are i18n keys resolved by
 *  the landing (under landing.pricing.tier.<id>.f.*). */
export type PricingTier = {
  id: "free" | "pro";
  /** Placeholder price string, billed monthly. Rendered only when pricing.public. */
  monthlyPrice: string;
  /** Placeholder price string, billed yearly (Pro only — Free has no cycle). */
  yearlyPrice?: string;
  /** Emphasised ("for practising advocates") tier. */
  hot: boolean;
  /** CTA verb key (start | choose). Both land on /request-access — no checkout. */
  cta: "start" | "choose";
  features: readonly string[];
};

export const pricing = {
  /** THE GATE (FOUNDER-ACTIONS #11). false → numbers stay hidden. Flip only after
   *  confirming every number below against INPUTS §C.7. Env override for staging:
   *  NEXT_PUBLIC_PRICING_PUBLIC=1. */
  public:
    (process.env.NEXT_PUBLIC_PRICING_PUBLIC ?? "").toLowerCase() === "1" ||
    (process.env.NEXT_PUBLIC_PRICING_PUBLIC ?? "").toLowerCase() === "true",
  tiers: [
    // Feature keys (t1..) resolve against landing.pricing.tier.<id>.f.* in the i18n catalog.
    { id: "free", monthlyPrice: "₹0", hot: false, cta: "start", features: ["t1", "t2", "t3", "t4", "t5"] },
    { id: "pro", monthlyPrice: "₹499", yearlyPrice: "₹4,999", hot: true, cta: "choose", features: ["t1", "t2", "t3", "t4", "t5", "t6", "t7"] },
  ] as readonly PricingTier[],
} as const;

/** Grievance Officer contact (IT Rules 2021 §3(2)). Founder fills when appointed;
 *  empty strings → the footer renders the honest "being appointed" placeholder.
 *  WO-291: name confirmed by founder 2026-07-31 (Yash Maheshwari — matches the
 *  repo's git author identity; the "Bahety" variant was not adopted). */
export const grievanceOfficer = {
  name: "Yash Maheshwari",
  email: "yash@mukadma.in",
} as const;

/** True once the founder has appointed the grievance officer. */
export function hasGrievanceOfficer(): boolean {
  return grievanceOfficer.name.trim() !== "" && grievanceOfficer.email.trim() !== "";
}

/** Effective date stamped on the legal pages (privacy/terms/refund/cancellation).
 *  WO-291. Bump this — and note the change in the relevant page copy if material —
 *  whenever a legal page's substance changes. Deliberately unlocalized (like court
 *  dates elsewhere in the product): a legal effective date should read identically
 *  in every language. */
export const legalEffectiveDate = "30 July 2026";
