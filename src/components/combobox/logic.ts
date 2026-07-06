// WO-55 · Pure, framework-free helpers for the shared <Combobox> / <MultiSelect> primitives.
// Kept out of the .tsx components so the selection/filter/threshold contract is unit-testable
// offline (no DOM, no React) — mirrors the WO-43 select-range extraction pattern.

export type ComboOption<T extends string | number = string> = {
  value: T;
  label: string;
  /** Optional secondary muted line (e.g. a bar id, court, or client code) — also matched by search. */
  hint?: string;
  disabled?: boolean;
};

/**
 * Case-insensitive, token-AND substring match over an option's label + hint.
 * "raj hc" matches an option labelled "Rajesh Kumar" with hint "Gujarat HC" (both tokens present).
 * An empty/whitespace query returns the list unchanged (identity — never hides options).
 */
export function filterOptions<T extends string | number>(
  options: ComboOption<T>[],
  query: string,
): ComboOption<T>[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  const tokens = q.split(/\s+/);
  return options.filter((o) => {
    const hay = `${o.label} ${o.hint ?? ""}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}

/**
 * Ship-grade list strategy (WO-55 §3 threshold rule) — decide how a list of a given size renders,
 * so we never ship thousands of options to the client:
 *   remote/unknown → async server search · > RENDER_ALL_MAX static → virtualize · else render all.
 */
export type ListStrategy = "all" | "virtualize" | "async";
export const RENDER_ALL_MAX = 150;

export function resolveStrategy(input: { remote?: boolean; count?: number }): ListStrategy {
  if (input.remote) return "async";
  return (input.count ?? 0) > RENDER_ALL_MAX ? "virtualize" : "all";
}

/** Immutable multi-select toggle over option values (add if absent, remove if present). */
export function toggleValue<T extends string | number>(selected: readonly T[], value: T): T[] {
  return selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
}

/** Every selectable (non-disabled) option's value — for "Select all" on bounded lists. */
export function selectAllValues<T extends string | number>(options: ComboOption<T>[]): T[] {
  return options.filter((o) => !o.disabled).map((o) => o.value);
}

/** True when every selectable option is currently selected (drives the Select-all/Deselect-all toggle). */
export function allSelected<T extends string | number>(
  selected: readonly T[],
  options: ComboOption<T>[],
): boolean {
  const selectable = options.filter((o) => !o.disabled);
  return selectable.length > 0 && selectable.every((o) => selected.includes(o.value));
}

/**
 * Chip overflow — show up to `max` chips, collapse the rest into a "+N" count so a wide
 * multi-selection never blows out the control's width. `max <= 0` disables collapsing.
 */
export function chipOverflow<T extends string | number>(
  selected: ComboOption<T>[],
  max: number,
): { visible: ComboOption<T>[]; overflow: number } {
  if (max <= 0 || selected.length <= max) return { visible: selected, overflow: 0 };
  return { visible: selected.slice(0, max), overflow: selected.length - max };
}

/** Resolve the human label for a stored value (single-select display); falls back to the raw value. */
export function labelForValue<T extends string | number>(
  options: ComboOption<T>[],
  value: T | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  return options.find((o) => o.value === value)?.label ?? String(value);
}

/**
 * Trailing debounce factory (used to throttle async server-search calls). Pure/DOM-free:
 * returns a wrapped fn that fires `delay` ms after the last call, plus a `cancel()`.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delay: number,
): ((...args: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delay);
  };
  wrapped.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}
