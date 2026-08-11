// WO-405 C4 (audit §4.4/§10 PRE-4) — pure, framework-free localStorage read/write for UI
// preferences (density, column config, sidebar width/collapsed…). No React here, so the read/write
// contract is unit-tested offline without a DOM (see tests/wo405_persisted_state.ts). The React
// shell lives in `@/lib/hooks/use-persisted-state`.
//
// Keys are namespaced `mukadma:*` by convention (e.g. `mukadma:cases:density`) so this origin's
// localStorage never collides with anything else that might write here — callers own the full key,
// this module doesn't rewrite it.
//
// `memory` is a tab-lifetime write-through cache, checked BEFORE localStorage on every read: every
// write lands here first, so a value this tab just wrote is always readable back even if the
// durable `localStorage.setItem` call itself then fails (quota/privacy mode) — the failure only
// costs durability across reloads, never self-consistency within the tab. A missing/broken
// `window.localStorage` degrades the same way (SSR, privacy mode) instead of throwing — a UI
// preference is worth persisting best-effort, not worth crashing a mutation over. Every degrade
// path is logged (`console.warn`), never silently swallowed.

const memory = new Map<string, string>();

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch (e) {
    console.warn("[persisted-state] localStorage unavailable (privacy mode?) — using an in-memory fallback:", e);
    return null;
  }
}

export function readPersisted<T>(key: string, fallback: T): T {
  const s = storage();
  const raw = memory.get(key) ?? (s ? s.getItem(key) : null);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`[persisted-state] corrupt value for "${key}" — falling back to default:`, e);
    return fallback;
  }
}

export function writePersisted<T>(key: string, value: T): void {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  const s = storage();
  if (!s) return;
  try {
    s.setItem(key, raw);
  } catch (e) {
    console.warn(`[persisted-state] durable write failed for "${key}" (quota/privacy mode) — this tab still has it in-memory, but it won't survive a reload:`, e);
  }
}
