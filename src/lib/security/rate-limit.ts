import type { NextRequest } from "next/server";

// WO-326 · Shared helpers for the public `/api/public/*` proxy routes (search + stats). Pure
// functions only — imported exclusively by `src/app/api/public/*/route.ts` (route handlers are
// never bundled to the client), so nothing here can leak into a client bundle.

// ponytail: in-process sliding window — the same shape already proven in step-up.ts. Correct for
// the single-origin EC2 box (WO-323: one Node process behind the Cloudflare tunnel). Swap for a
// shared store (e.g. Redis) if the apex ever runs on more than one origin.
const hits = new Map<string, number[]>();

/** True (and records the hit) when `key` has NOT exceeded `max` calls in the trailing `windowMs`. */
export function allow(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  }
  return arr.length <= max;
}

/** The real visitor IP behind the Cloudflare tunnel (WO-323) — the unforgeable CF header first,
 * a raw x-forwarded-for as the last-resort fallback (local dev). "unknown" buckets requests with
 * no discoverable IP into one shared limiter bucket rather than skipping the limit entirely. */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  );
}

/** The scraper's public API base, trailing slash trimmed. Throws if unset (fail-closed, WO-326) —
 * never a hardcoded fallback origin, and the value is read at REQUEST time (never module load), so
 * a config error surfaces loudly per-request instead of baking a stale/missing base into a build. */
export function scraperApiBase(): string {
  const base = process.env.SCRAPER_API_BASE;
  if (!base) {
    throw new Error("SCRAPER_API_BASE is not set — refusing to proxy public court data (fail-closed, WO-326).");
  }
  return base.replace(/\/$/, "");
}
