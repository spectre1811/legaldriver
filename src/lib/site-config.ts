// Single founder-editable config for public-facing facts that are either
// INPUTS-backed or clearly-flagged placeholders (WO-53). The public landing
// (src/components/landing.tsx) reads ONLY from here for anything numeric or
// legally-sensitive, so a founder can change it without touching component code.
//
// TWO founder switches live here:
//   1) pricing.public — the pricing GATE (FOUNDER-ACTIONS #11). While false, the
//      landing ships the pricing STRUCTURE (tier names + a number-free value line)
//      but renders NO unconfirmed number — not a price, not "25 cases", not
//      "500 credits". Flip to true ONLY after every price + limit below is
//      confirmed against INPUTS §C.7. That is the one flag that makes numbers go
//      live. (Guardrail: no invented numbers reach the public page.)
//   2) grievanceOfficer — fill name/email when the officer is appointed
//      (IT Rules 2021 §3(2) requires an intermediary to publish this). Until
//      filled, the footer shows an honest "being appointed" line, never a fake name.
//
// The tier NAMES (Free → Basic → Pro → Enterprise) and the founding-member offer
// (Pro at ₹399/mo for the first 12 months) ARE INPUTS-backed (§C.7 / §Page-6 /
// M3-MRR note) — but the *list* prices and per-tier limits are design-concept
// placeholders and stay gated until #11 is ruled.

/** External product links (the free public case search lives in mukadma-search). */
export const links = {
  /** Free public case search — mukadma-search (WO-51 cross-link back to us).
   *  Env-driven (WO-162): the mukadma.in cutover is a Vercel env flip, not a code
   *  change; default is the brand host (vercel.app 308-redirects there after W2). */
  publicSearch: process.env.NEXT_PUBLIC_SEARCH_URL ?? "https://search.mukadma.in",
} as const;

/** A single pricing tier. `price`/`per`/`features` are UNCONFIRMED placeholders
 *  and MUST NOT render while `pricing.public` is false. `id`/`name`/`cta` (the
 *  structure) are safe to show. `features` are i18n keys resolved by the landing. */
export type PricingTier = {
  id: "free" | "basic" | "pro" | "enterprise";
  /** Placeholder price string. Rendered only when pricing.public === true. */
  price: string;
  /** Whether `price` is a per-lawyer/month figure (adds "/mo"). */
  per: boolean;
  /** Emphasised ("most chosen") tier. */
  hot: boolean;
  /** CTA verb key (start | choose | talk). */
  cta: "start" | "choose" | "talk";
  /** i18n feature-row keys under landing.pricing.tier.<id>.f.* — contain numbers,
   *  so they render only when pricing.public === true. */
  features: readonly string[];
};

export const pricing = {
  /** THE GATE (FOUNDER-ACTIONS #11). false → numbers stay hidden. Flip only after
   *  confirming every number below against INPUTS §C.7. Env override for staging:
   *  NEXT_PUBLIC_PRICING_PUBLIC=1. */
  public:
    (process.env.NEXT_PUBLIC_PRICING_PUBLIC ?? "").toLowerCase() === "1" ||
    (process.env.NEXT_PUBLIC_PRICING_PUBLIC ?? "").toLowerCase() === "true",
  /** INPUTS-backed: founding cohort gets Pro at ₹399/mo for 12 months. Shown only
   *  once pricing goes public (it names a number, so it rides the same gate). */
  showFoundingOffer: true,
  tiers: [
    { id: "free", price: "₹0", per: false, hot: false, cta: "start", features: ["cases", "digest", "clients", "search"] },
    { id: "basic", price: "₹399", per: true, hot: false, cta: "choose", features: ["cases", "alerts", "invoicing", "credits"] },
    { id: "pro", price: "₹999", per: true, hot: true, cta: "choose", features: ["cases", "credits", "portal", "marketplace"] },
    { id: "enterprise", price: "Custom", per: false, hot: false, cta: "talk", features: ["tenants", "audit", "pooled", "support"] },
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
