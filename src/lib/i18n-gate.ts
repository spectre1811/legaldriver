import type { AbstractIntlMessages } from "next-intl";
import { pricing } from "./site-config";

// WO-53 · Keep gated pricing NUMBERS out of the client message catalog.
//
// layout.tsx ships the whole message catalog to the browser via
// NextIntlClientProvider (it's serialized into the page's RSC/HTML payload). The
// landing's unconfirmed pricing numbers live in that catalog — so even though the
// landing never *renders* them while the gate is closed (FOUNDER-ACTIONS #11), they
// would still sit in page source, visible to view-source, scrapers and search
// engines. That defeats the "no invented numbers go live" guardrail.
//
// The landing renders pricing SERVER-side (getTranslations reads the full catalog
// independently of the provider), and no CLIENT component translates
// landing.pricing.*, so stripping the numeric keys from the client catalog is safe:
// nothing client-side ever asks for them. When the founder flips pricing.public,
// they flow through untouched.
// Per-tier keys that only make sense once a price exists (feature rows, and the
// billing-cycle sentences that name a derived amount, e.g. "about ₹417 a month").
const NUMERIC_TIER_KEYS = ["f", "billMonthly", "billYearly", "save"];

export function stripGatedPricing(messages: AbstractIntlMessages): AbstractIntlMessages {
  if (pricing.public) return messages;
  const landing = messages?.landing as Record<string, unknown> | undefined;
  const p = landing?.pricing as Record<string, unknown> | undefined;
  if (!p) return messages;

  const tiers = (p.tier as Record<string, Record<string, unknown>>) ?? {};
  const strippedTiers: Record<string, unknown> = {};
  for (const [id, tier] of Object.entries(tiers)) {
    const rest = { ...tier };
    for (const k of NUMERIC_TIER_KEYS) delete rest[k];
    strippedTiers[id] = rest;
  }
  // Drop the monthly/yearly toggle (its "Save 16%" IS a price-derived number —
  // meaningless, and misleading, without the prices it discounts) and any legacy
  // price-bearing top-level lines.
  const { billing: _billing, note: _note, founding: _founding, fromSeat: _fromSeat, ...restPricing } = p;

  return {
    ...messages,
    landing: { ...landing, pricing: { ...restPricing, tier: strippedTiers } },
  } as AbstractIntlMessages;
}
