// WO-405 C4 · usePersistedState primitive (audit §4.4/§10 PRE-4). No live services, no DOM/React —
// exercises the pure read/write module directly (src/lib/persisted-state.ts) with a fake
// `window.localStorage`, plus the SSR/no-window fallback the module also has to survive.
// Also guards the one concrete adoption (Cases density: cookie → localStorage, key
// `mukadma:cases:density`) with a source-grep, so a future edit can't quietly reintroduce the cookie.
// Run: npx tsx tests/wo405_persisted_state.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readPersisted, writePersisted } from "../src/lib/persisted-state";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

// ── no `window` (this test's default Node runtime = the SSR shape) — degrades to an in-memory
// fallback instead of throwing, so a component reading this during SSR never crashes. ──────────
check("no-window: fallback returned when nothing persisted yet", readPersisted<string>("mukadma:test:a", "default") === "default");
writePersisted("mukadma:test:a", "value-a");
check("no-window: round-trips through the in-memory fallback", readPersisted<string>("mukadma:test:a", "default") === "value-a");

// ── a real localStorage-shaped object (mocks the browser) ───────────────────────────────────────
class FakeStorage {
  private store = new Map<string, string>();
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, v); }
  removeItem(k: string) { this.store.delete(k); }
  clear() { this.store.clear(); }
}
(globalThis as { window?: unknown }).window = { localStorage: new FakeStorage() };

check("fallback when key absent from real localStorage", readPersisted<string>("mukadma:cases:density", "comfortable") === "comfortable");
writePersisted("mukadma:cases:density", "compact");
check("round-trips through real localStorage", readPersisted<string>("mukadma:cases:density", "comfortable") === "compact");
const win = (globalThis as unknown as { window: { localStorage: FakeStorage } }).window;
check(
  "value actually lands in localStorage, JSON-encoded (not just in-memory)",
  win.localStorage.getItem("mukadma:cases:density") === JSON.stringify("compact"),
);

// ── round-trips non-string shapes too (usePersistedState is generic, not density-specific) ──────
writePersisted("mukadma:test:obj", { collapsed: true, width: 280 });
const obj = readPersisted<{ collapsed: boolean; width: number }>("mukadma:test:obj", { collapsed: false, width: 0 });
check("round-trips an object value", obj.collapsed === true && obj.width === 280);

// ── corrupt JSON degrades to the fallback, never throws ──────────────────────────────────────────
win.localStorage.setItem("mukadma:corrupt", "{not-json");
check("corrupt stored value falls back instead of throwing", readPersisted("mukadma:corrupt", "safe") === "safe");

// ── a throwing localStorage (quota/privacy mode) degrades to the in-memory fallback ──────────────
(globalThis as { window?: unknown }).window = {
  localStorage: { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } },
};
writePersisted("mukadma:cases:density2", "compact");
check("value still readable after a failed localStorage write (in-memory fallback)", readPersisted<string>("mukadma:cases:density2", "comfortable") === "compact");

delete (globalThis as { window?: unknown }).window;

// ── the one concrete adoption: Cases density moved off the cookie onto this hook ────────────────
const root = process.cwd();
const density = readFileSync(join(root, "src/app/dashboard/cases/density.ts"), "utf8");
const casesTable = readFileSync(join(root, "src/app/dashboard/cases/cases-table.tsx"), "utf8");
const casesPage = readFileSync(join(root, "src/app/dashboard/cases/page.tsx"), "utf8");

check('density.ts exports the namespaced storage key literally as "mukadma:cases:density"', /DENSITY_STORAGE_KEY\s*=\s*"mukadma:cases:density"/.test(density));
check("cases-table.tsx uses the shared usePersistedState hook for density", casesTable.includes("usePersistedState") && casesTable.includes("DENSITY_STORAGE_KEY"));
check("cases-table.tsx no longer hand-writes the density cookie", !casesTable.includes("document.cookie"));
check("page.tsx no longer reads a density cookie for first paint", !casesPage.includes("DENSITY_COOKIE") && !casesPage.includes("cookies().get"));

console.log(failures === 0 ? "WO-405 PERSISTED STATE: PASS" : `WO-405 PERSISTED STATE: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
