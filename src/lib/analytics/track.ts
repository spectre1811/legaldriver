import "server-only";

import { safeProps, type AnalyticsEvent } from "./events";

// The ONE product-analytics seam (WO-15) — provider-agnostic, server-side, privacy-first.
//
// Why server-side: legaldriver is the AUTHED app. Client autocapture would send dashboard URLs
// (which carry matter ids) and could scoop up case content. So we emit only NAMED events with
// whitelisted props, from the server, fire-and-forget. Analytics must NEVER break or slow a request.
//
// Provider: PostHog capture when POSTHOG_KEY is set (self-serve free tier — the 12-CLOUD/ADR pick);
// no-op otherwise, so nothing ships until a founder adds the key (like the AI gateway degrades
// keyless). Swappable — a second provider slots in behind the same `track()` contract.

const KEY = process.env.POSTHOG_KEY;
const HOST = process.env.POSTHOG_HOST || "https://us.i.posthog.com";

/**
 * Record a product event. `distinctId` is a pseudonymous internal uuid (tenant or user id) — never
 * an email/name. Returns immediately; the network call is best-effort and swallows all errors.
 */
export function track(event: AnalyticsEvent, distinctId: string, props?: Record<string, unknown>): void {
  if (!KEY || !distinctId) return; // env-gated no-op
  const body = JSON.stringify({
    api_key: KEY,
    event,
    distinct_id: distinctId,
    properties: { ...safeProps(event, props), $lib: "legaldriver-server" },
  });
  // Fire-and-forget: do not await in the request path, never throw.
  void fetch(`${HOST}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    signal: AbortSignal.timeout(3000),
    cache: "no-store",
  }).catch(() => {});
}
