import { createHash } from "node:crypto";
import type { CachedEntry, ResponseCache } from "./core";

// In-process exact-hash response cache for the AI gateway (WO-186 W1). No new infra
// (per the WO): a bounded, TTL'd Map — insertion order gives cheap LRU eviction and
// batch workers (the "re-tokenize identical prefixes all day" case) share one
// long-lived process, so hits accrue for free. Serverless lambdas each keep their
// own map; that's fine — the win there is retries/re-runs within a warm instance.
// Raw keys (which embed the full prompt) are hashed to 64 chars so entries stay small.

const TTL_CEILING_MS = 24 * 60 * 60 * 1000; // WO-186: TTL ≤ 24h
const DEFAULT_MAX = 2000;

interface Node {
  entry: CachedEntry;
  expiresAt: number;
}

export function createResponseCache(opts?: {
  maxEntries?: number;
  ttlMs?: number;
  now?: () => number;
}): ResponseCache {
  // TTL is clamped to the 24h ceiling — a longer env value can't extend it.
  const ttl = Math.min(
    opts?.ttlMs ?? (Number(process.env.AI_RESPONSE_CACHE_TTL_MS) || TTL_CEILING_MS),
    TTL_CEILING_MS,
  );
  const max = opts?.maxEntries ?? (Number(process.env.AI_RESPONSE_CACHE_MAX) || DEFAULT_MAX);
  const now = opts?.now ?? Date.now;
  const map = new Map<string, Node>();
  const hash = (raw: string): string => createHash("sha256").update(raw).digest("hex");

  return {
    get(rawKey) {
      const k = hash(rawKey);
      const n = map.get(k);
      if (!n) return undefined;
      if (now() > n.expiresAt) {
        map.delete(k);
        return undefined;
      }
      // Touch: re-insert to move to the most-recent end (LRU recency).
      map.delete(k);
      map.set(k, n);
      return n.entry;
    },
    set(rawKey, entry) {
      const k = hash(rawKey);
      map.delete(k);
      map.set(k, { entry, expiresAt: now() + ttl });
      // Evict the least-recently-used (front of insertion order) over capacity.
      while (map.size > max) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
  };
}

// Flag-off (AI_RESPONSE_CACHE = off|0|false|no) restores pre-WO-186 behaviour.
export function responseCacheEnabled(): boolean {
  const v = (process.env.AI_RESPONSE_CACHE ?? "on").toLowerCase();
  return !["off", "0", "false", "no"].includes(v);
}
