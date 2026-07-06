// WO-55 · The shared modern combobox primitive (searchable · multi-select · virtualized · async · a11y).
// Offline, no secrets, no DOM. Run: npx tsx tests/wo55_combobox.ts
// Covers the pure filter/threshold/selection algebra directly, and locks the component contract by
// asserting on the committed source — so a future edit can't silently drop async server-search,
// the a11y label, chips/clear-all, or re-introduce a raw native <select> in the primitive.
import { readFileSync } from "node:fs";
import {
  allSelected,
  chipOverflow,
  debounce,
  filterOptions,
  labelForValue,
  RENDER_ALL_MAX,
  resolveStrategy,
  selectAllValues,
  toggleValue,
  type ComboOption,
} from "../src/components/combobox/logic";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const OPTS: ComboOption[] = [
  { value: "a", label: "Rajesh Kumar", hint: "Gujarat HC" },
  { value: "b", label: "Anita Shah", hint: "District — Ahmedabad" },
  { value: "c", label: "Rajendra Patel", hint: "Gujarat HC", disabled: true },
];

// ── filterOptions ──
ok("filter: empty query is identity", filterOptions(OPTS, "  ") === OPTS);
ok("filter: case-insensitive label match", eq(filterOptions(OPTS, "anita").map((o) => o.value), ["b"]));
ok("filter: token-AND across label+hint", eq(filterOptions(OPTS, "raj hc").map((o) => o.value), ["a", "c"]));
ok("filter: matches the hint too", eq(filterOptions(OPTS, "ahmedabad").map((o) => o.value), ["b"]));
ok("filter: no match → empty", filterOptions(OPTS, "zzz").length === 0);

// ── resolveStrategy (ship-grade threshold rule) ──
ok("strategy: remote → async (never fetch-all)", resolveStrategy({ remote: true, count: 3 }) === "async");
ok("strategy: small static → render all", resolveStrategy({ count: 20 }) === "all");
ok("strategy: at the cap → render all", resolveStrategy({ count: RENDER_ALL_MAX }) === "all");
ok("strategy: over the cap → virtualize", resolveStrategy({ count: RENDER_ALL_MAX + 1 }) === "virtualize");

// ── toggleValue (immutable multi-select set algebra) ──
{
  const base = ["a", "b"];
  ok("toggle: adds when absent", eq(toggleValue(base, "c"), ["a", "b", "c"]));
  ok("toggle: removes when present", eq(toggleValue(base, "a"), ["b"]));
  ok("toggle: is immutable", eq(base, ["a", "b"]));
}

// ── selectAllValues / allSelected (skip disabled) ──
ok("selectAll: excludes disabled options", eq(selectAllValues(OPTS), ["a", "b"]));
ok("allSelected: true when every selectable chosen", allSelected(["a", "b"], OPTS) === true);
ok("allSelected: false when one selectable missing", allSelected(["a"], OPTS) === false);
ok("allSelected: false on empty list", allSelected([], []) === false);

// ── chipOverflow ──
{
  const sel = OPTS;
  ok("chips: no overflow when under max", eq(chipOverflow(sel, 5), { visible: sel, overflow: 0 }));
  const r = chipOverflow(sel, 2);
  ok("chips: collapses the tail into a count", r.visible.length === 2 && r.overflow === 1);
  ok("chips: max<=0 disables collapsing", chipOverflow(sel, 0).overflow === 0);
}

// ── labelForValue ──
ok("label: resolves a known value", labelForValue(OPTS, "b") === "Anita Shah");
ok("label: null → empty string", labelForValue(OPTS, null) === "");
ok("label: unknown value falls back to the raw value", labelForValue(OPTS, "x" as string) === "x");

// ── debounce (trailing) ── (async — wrapped; the runner has no top-level await)
async function debounceTests() {
  let calls = 0;
  const d = debounce(() => calls++, 20);
  d();
  d();
  d();
  ok("debounce: coalesces bursts (no sync call)", calls === 0);
  await new Promise((r) => setTimeout(r, 40));
  ok("debounce: fires once after the window", calls === 1);
  const d2 = debounce(() => calls++, 20);
  d2();
  d2.cancel();
  await new Promise((r) => setTimeout(r, 40));
  ok("debounce: cancel() prevents the trailing call", calls === 1);
}

// ── committed-source contract (the primitive can't silently regress) ──
const combo = src("src/components/combobox/combobox.tsx");
const multi = src("src/components/combobox/multi-select.tsx");
const hook = src("src/components/combobox/use-async-options.ts");
const index = src("src/components/combobox/index.ts");

ok("both components are Headless-UI-backed (APG a11y for free)", combo.includes('from "@headlessui/react"') && multi.includes('from "@headlessui/react"'));
ok("both are client components", combo.startsWith('"use client"') && multi.startsWith('"use client"'));
ok("both accept an async loadOptions (server search)", combo.includes("loadOptions") && multi.includes("loadOptions"));
ok("both require an accessible label (aria-label)", combo.includes("aria-label={label}") && multi.includes("aria-label={label}"));
ok("both support virtualization", combo.includes("virtual: { options") && multi.includes("virtual: { options"));
ok("multi keeps the popup open on toggle (multiple)", /\bmultiple\b/.test(multi));
ok("multi renders removable chips + clear-all", multi.includes('t("remove"') && multi.includes('t("clearAll")'));
ok("multi supports Backspace-removes-last-chip", multi.includes('e.key === "Backspace"'));
ok("async loader is race-guarded (drops superseded responses)", hook.includes("reqId.current"));
ok("primitive exports both components", index.includes("Combobox") && index.includes("MultiSelect"));
ok("primitive itself contains no raw native <select>", !combo.includes("<select") && !multi.includes("<select"));

debounceTests().then(() => {
  console.log(failed ? `\nWO55 COMBOBOX: FAIL (${failed})` : "\nWO55 COMBOBOX: PASS");
  process.exit(failed ? 1 : 0);
});
