"use client";
import { useEffect, useRef, useState } from "react";
import {
  Combobox as HCombobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { useTranslations } from "next-intl";
import { Icon } from "../icons";
import { type ComboOption, allSelected, chipOverflow, selectAllValues, toggleValue } from "./logic";
import { useComboOptions } from "./use-async-options";

export type MultiSelectProps<T extends string | number = string> = {
  value: T[];
  onChange: (values: T[]) => void;
  /** Required accessible name (WCAG) — rendered as aria-label on the input. */
  label: string;
  options?: ComboOption<T>[];
  loadOptions?: (query: string) => Promise<ComboOption<T>[]>;
  placeholder?: string;
  virtualized?: boolean;
  disabled?: boolean;
  /** Chips shown before collapsing the rest into a "+N" count. Default 4. */
  maxChips?: number;
  /** Offer Select-all / Deselect-all (bounded static lists only). */
  showSelectAll?: boolean;
  className?: string;
  emptyText?: string;
  loadingText?: string;
};

/**
 * WO-55 · Shared multi-select combobox. Checkbox-in-list (discoverable — NN/g) + removable chips
 * above the control (× keyboard-removable, Backspace-in-empty-input removes the last), a "+N" count
 * when chips overflow, Clear-all, and optional Select-all for bounded lists. The popup stays OPEN on
 * toggle (Headless UI `multiple`), so several picks happen in one open — the whole point of multi.
 * APG a11y (roles, aria-activedescendant, keyboard) comes from Headless UI.
 */
export function MultiSelect<T extends string | number = string>({
  value,
  onChange,
  label,
  options,
  loadOptions,
  placeholder,
  virtualized = false,
  disabled = false,
  maxChips = 4,
  showSelectAll = false,
  className = "",
  emptyText,
  loadingText,
}: MultiSelectProps<T>) {
  const t = useTranslations("combobox");
  const [query, setQuery] = useState("");
  const { options: shown, loading, error } = useComboOptions({ query, options, loadOptions });
  const useVirtual = virtualized && !loadOptions && shown.length > 0;
  const byValue = new Map(shown.map((o) => [o.value, o] as const));

  // Keep resolved labels for selected values, even when async search has scrolled them out of `shown`.
  const cacheRef = useRef(new Map<T, string>());
  useEffect(() => {
    for (const o of shown) cacheRef.current.set(o.value, o.label);
  }, [shown]);
  const resolveLabel = (v: T) =>
    options?.find((o) => o.value === v)?.label ?? cacheRef.current.get(v) ?? String(v);

  const selectedOptions: ComboOption<T>[] = value.map((v) => ({ value: v, label: resolveLabel(v) }));
  const { visible, overflow } = chipOverflow(selectedOptions, maxChips);
  const allOn = !!options && allSelected(value, options);

  const removeAt = (v: T) => onChange(value.filter((x) => x !== v));

  const renderRow = (o: ComboOption<T>) => (
    <ComboboxOption
      key={String(o.value)}
      value={o.value}
      disabled={o.disabled}
      className="group flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink data-[focus]:bg-brand-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-line group-data-[selected]:border-brand-600 group-data-[selected]:bg-brand-600">
        <Icon name="check" className="h-3 w-3 text-white opacity-0 group-data-[selected]:opacity-100" />
      </span>
      <span className="min-w-0">
        <span className="block truncate">{o.label}</span>
        {o.hint && <span className="block truncate text-xs text-ink-faint">{o.hint}</span>}
      </span>
    </ComboboxOption>
  );

  return (
    <HCombobox
      multiple
      value={value}
      onChange={(vals: T[]) => onChange(vals)}
      disabled={disabled}
      immediate
      onClose={() => setQuery("")}
      {...(useVirtual ? { virtual: { options: shown.map((o) => o.value) } } : {})}
    >
      <div className={`relative ${className}`}>
        {selectedOptions.length > 0 && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {visible.map((o) => (
              <span key={String(o.value)} className="chip bg-brand-50 text-brand-700">
                <span className="max-w-[10rem] truncate">{o.label}</span>
                <button
                  type="button"
                  aria-label={t("remove", { label: o.label })}
                  onClick={() => removeAt(o.value)}
                  className="rounded-full p-0.5 hover:bg-brand-100"
                >
                  <Icon name="close" className="h-3 w-3" />
                </button>
              </span>
            ))}
            {overflow > 0 && <span className="chip bg-paper text-ink-muted">{t("more", { count: overflow })}</span>}
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs font-medium text-ink-faint underline-offset-2 hover:text-ink hover:underline"
            >
              {t("clearAll")}
            </button>
          </div>
        )}

        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-faint">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <ComboboxInput
            aria-label={label}
            placeholder={placeholder ?? t("search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && query === "" && value.length > 0) {
                removeAt(value[value.length - 1]);
              }
            }}
            className="input min-h-[2.75rem] pl-9 pr-10"
          />
          <ComboboxButton
            aria-label={label}
            className="absolute inset-y-0 right-2 flex items-center rounded-md p-1 text-ink-faint hover:text-ink"
          >
            <Icon name="chevron" className="h-4 w-4 rotate-90" />
          </ComboboxButton>
        </div>

        {useVirtual && !loading && !error ? (
          <ComboboxOptions anchor="bottom start" className={PANEL_CLASS}>
            {({ option }) => renderRow(byValue.get(option as T) ?? { value: option as T, label: String(option) })}
          </ComboboxOptions>
        ) : (
          <ComboboxOptions anchor="bottom start" className={PANEL_CLASS}>
            {showSelectAll && options && options.length > 0 && !loading && !error && (
              <button
                type="button"
                onClick={() => onChange(allOn ? [] : selectAllValues(options))}
                className="mb-1 w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-brand-700 hover:bg-brand-50"
              >
                {allOn ? t("deselectAll") : t("selectAll")}
              </button>
            )}
            {loading ? (
              <div className="px-3 py-2 text-sm text-ink-faint">{loadingText ?? t("loading")}</div>
            ) : error ? (
              <div className="px-3 py-2 text-sm text-rose-600">{t("error")}</div>
            ) : shown.length === 0 ? (
              <div className="px-3 py-2 text-sm text-ink-faint">{emptyText ?? t("noResults")}</div>
            ) : (
              shown.map(renderRow)
            )}
          </ComboboxOptions>
        )}
      </div>
    </HCombobox>
  );
}

const PANEL_CLASS =
  "z-50 mt-1 max-h-72 w-[var(--input-width)] min-w-[13rem] overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lift empty:hidden";
