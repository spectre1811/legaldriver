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
export function stripGatedPricing(messages: AbstractIntlMessages): AbstractIntlMessages {
  if (pricing.public) return messages;
  const landing = messages?.landing as Record<string, unknown> | undefined;
  const p = landing?.pricing as Record<string, unknown> | undefined;
  if (!p) return messages;

  // Drop the numeric feature rows (`f`) from each tier; keep name + number-free summary.
  const tiers = (p.tier as Record<string, Record<string, unknown>>) ?? {};
  const strippedTiers: Record<string, unknown> = {};
  for (const [id, tier] of Object.entries(tiers)) {
    const { f: _f, ...rest } = tier;
    strippedTiers[id] = rest;
  }
  // Drop the price-bearing lines (note = billing terms, founding = ₹ offer, fromSeat = ₹ seat).
  const { note: _note, founding: _founding, fromSeat: _fromSeat, ...restPricing } = p;

  return {
    ...messages,
    landing: { ...landing, pricing: { ...restPricing, tier: strippedTiers } },
  } as AbstractIntlMessages;
}
