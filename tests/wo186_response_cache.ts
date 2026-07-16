// WO-186 W1 — response-cache store: exact-key hits, TTL expiry, LRU eviction,
// recency touch. Fully in-process — no network. Run: npx tsx tests/wo186_response_cache.ts
import { createResponseCache, responseCacheEnabled } from "../src/lib/ai/gateway/response-cache";
import type { CachedEntry } from "../src/lib/ai/gateway/core";

let failed = 0;
function ok(name: string, cond: boolean) { console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`); if (!cond) failed++; }

const entry = (tag: string): CachedEntry => ({
  output: { tag }, citations: [], model: "m", backend: "b",
  tokens: { input: 1, output: 1, total: 2, estimated: false }, outputChars: 3,
});

// ── Exact-key hit / miss ──────────────────────────────────────────────────────
let clock = 1000;
const c = createResponseCache({ maxEntries: 2, ttlMs: 100, now: () => clock });
c.set("k1", entry("a"));
ok("hit returns the stored entry", (c.get("k1")?.output as { tag: string })?.tag === "a");
ok("miss for an unknown key", c.get("nope") === undefined);

// ── TTL expiry ────────────────────────────────────────────────────────────────
clock = 1050;
ok("within TTL → still a hit", c.get("k1") !== undefined);
clock = 1200; // past 1000 + 100
ok("past TTL → expired miss", c.get("k1") === undefined);

// ── LRU eviction with recency touch ──────────────────────────────────────────
clock = 2000;
const c2 = createResponseCache({ maxEntries: 2, ttlMs: 10_000, now: () => clock });
c2.set("a", entry("a"));
c2.set("b", entry("b"));
c2.get("a");            // touch A → A is now most-recent
c2.set("c", entry("c")); // over capacity → evict the LRU (B), keep A + C
ok("eviction drops the least-recently-used (b)", c2.get("b") === undefined);
ok("recently-touched entry survives (a)", c2.get("a") !== undefined);
ok("newest entry present (c)", c2.get("c") !== undefined);

// ── TTL is clamped to the 24h ceiling ─────────────────────────────────────────
let clk = 0;
const c3 = createResponseCache({ ttlMs: 999 * 24 * 60 * 60 * 1000, now: () => clk });
c3.set("x", entry("x"));
clk = 24 * 60 * 60 * 1000 + 1; // just past 24h
ok("TTL clamped to 24h ceiling even if a longer value is requested", c3.get("x") === undefined);

// ── Enable flag ───────────────────────────────────────────────────────────────
const prev = process.env.AI_RESPONSE_CACHE;
process.env.AI_RESPONSE_CACHE = "off";  ok("flag off disables the cache", responseCacheEnabled() === false);
process.env.AI_RESPONSE_CACHE = "on";   ok("flag on enables the cache", responseCacheEnabled() === true);
delete process.env.AI_RESPONSE_CACHE;   ok("default (unset) → enabled", responseCacheEnabled() === true);
if (prev === undefined) delete process.env.AI_RESPONSE_CACHE; else process.env.AI_RESPONSE_CACHE = prev;

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
