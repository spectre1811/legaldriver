// Product-analytics event taxonomy (WO-15). ONE place that defines every product event we track
// + the ONLY prop keys allowed on each. Privacy rule for a legal product: named events with SAFE,
// low-cardinality props only — NEVER a CNR, a party/advocate/client name, a search query, a
// filename, or any case content. The `track()` seam whitelists against this map + drops CNR-shaped
// values as defense-in-depth. `distinctId` is a pseudonymous internal uuid (tenant/user), not PII.

export const ALLOWED_PROPS = {
  // Activation funnel
  signup: [],
  onboarding_completed: [],
  case_added: ["source", "isNew"], // source = provider (legaldriver|mock|…); isNew = "true"|"false"
  first_case_added: ["source"], // fired once per tenant — the north-star activation moment
  // Engagement
  case_viewed: [],
  search_performed: ["kind"], // party|advocate|order_text — NOT the query text
  cause_list_alert: ["bucket"], // "1-5" | "6-20" | "20+" — a size bucket, never which cases
  order_text_viewed: [],
  draft_generated: ["kind"],
  // Monetisation
  invoice_created: [],
} as const;

export type AnalyticsEvent = keyof typeof ALLOWED_PROPS;

// Coarse size bucket so we can measure "cause lists deliver value" without leaking case counts/ids.
export function sizeBucket(n: number): string {
  return n <= 0 ? "0" : n <= 5 ? "1-5" : n <= 20 ? "6-20" : "20+";
}

const CNR_RE = /\b[A-Z]{2}[A-Z0-9]{2}\d{6,}\b/; // CNR-shaped → never let it into analytics

// The PII-guard (pure, unit-tested). Keeps ONLY whitelisted keys for the event, drops null,
// CNR-shaped, or oversized values, and stringifies. This is the single chokepoint that makes it
// hard to leak case content into analytics — kept here (no `server-only`) so it's testable.
export function safeProps(event: AnalyticsEvent, props?: Record<string, unknown>): Record<string, string> {
  const allowed: readonly string[] = ALLOWED_PROPS[event] ?? [];
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (!allowed.includes(k) || v == null) continue;
    const s = String(v).slice(0, 64);
    if (CNR_RE.test(s)) continue;
    out[k] = s;
  }
  return out;
}
