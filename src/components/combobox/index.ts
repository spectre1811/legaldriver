// WO-55 · Shared modern combobox primitives — the one place the app builds a dropdown.
// Never ship a raw native <select> for a long/DB-derived list again (LEARNINGS.md).
export { Combobox, type ComboboxProps } from "./combobox";
export { MultiSelect, type MultiSelectProps } from "./multi-select";
export {
  type ComboOption,
  type ListStrategy,
  RENDER_ALL_MAX,
  filterOptions,
  resolveStrategy,
  toggleValue,
  selectAllValues,
  allSelected,
  chipOverflow,
  labelForValue,
  debounce,
} from "./logic";
