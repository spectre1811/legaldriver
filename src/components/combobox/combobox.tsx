"use client";
import { useState } from "react";
import {
  Combobox as HCombobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@headlessui/react";
import { useTranslations } from "next-intl";
import { Icon } from "../icons";
import { type ComboOption, labelForValue } from "./logic";
import { useComboOptions } from "./use-async-options";

const PANEL_CLASS =
  "z-50 mt-1 max-h-72 w-[var(--input-width)] min-w-[12rem] overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lift empty:hidden";

export type ComboboxProps<T extends string | number = string> = {
  value: T | null;
  onChange: (value: T | null) => void;
  /** Required accessible name (WCAG) — rendered as aria-label on the input. */
  label: string;
  /** Static option set (filtered client-side). Provide this OR `loadOptions`. */
  options?: ComboOption<T>[];
  /** Async server search (debounced) for long/DB-derived lists — never ship thousands to the client. */
  loadOptions?: (query: string) => Promise<ComboOption<T>[]>;
  placeholder?: string;
  /** Show a clear (×) affordance to reset to null. */
  clearable?: boolean;
  /** Virtualize a large static list (TanStack Virtual, bundled with Headless UI v2). */
  virtualized?: boolean;
  disabled?: boolean;
  renderOption?: (o: ComboOption<T>) => React.ReactNode;
  className?: string;
  emptyText?: string;
  loadingText?: string;
};

/**
 * WO-55 · Shared single-select, searchable combobox. Headless UI (`Combobox`) gives us the full
 * WAI-ARIA APG contract for free — role=combobox, aria-expanded/controls/autocomplete,
 * aria-activedescendant highlight (focus stays on the input), and Down/Up/Home/End/Enter/Esc
 * keyboard nav — so we only style it to the Editorial-Chambers tokens and wire static/async data.
 */
export function Combobox<T extends string | number = string>({
  value,
  onChange,
  label,
  options,
  loadOptions,
  placeholder,
  clearable = true,
  virtualized = false,
  disabled = false,
  renderOption,
  className = "",
  emptyText,
  loadingText,
}: ComboboxProps<T>) {
  const t = useTranslations("combobox");
  const [query, setQuery] = useState("");
  const { options: shown, loading, error } = useComboOptions({ query, options, loadOptions });

  const displayValue = () => labelForValue(options ?? shown, value);
  const useVirtual = virtualized && !loadOptions && shown.length > 0;
  const byValue = new Map(shown.map((o) => [o.value, o] as const));

  const renderRow = (o: ComboOption<T>) => (
    <ComboboxOption
      key={String(o.value)}
      value={o.value}
      disabled={o.disabled}
      className="group flex cursor-pointer select-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-ink data-[focus]:bg-brand-50 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
    >
      <span className="min-w-0">
        {renderOption ? (
          renderOption(o)
        ) : (
          <>
            <span className="block truncate">{o.label}</span>
            {o.hint && <span className="block truncate text-xs text-ink-faint">{o.hint}</span>}
          </>
        )}
      </span>
      <Icon name="check" className="h-4 w-4 shrink-0 text-brand-600 opacity-0 group-data-[selected]:opacity-100" />
    </ComboboxOption>
  );

  return (
    <HCombobox
      value={value}
      onChange={(v: T | null) => onChange(v)}
      disabled={disabled}
      immediate
      onClose={() => setQuery("")}
      {...(useVirtual ? { virtual: { options: shown.map((o) => o.value) } } : {})}
    >
      <div className={`relative ${className}`}>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-faint">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <ComboboxInput
            aria-label={label}
            placeholder={placeholder ?? t("search")}
            displayValue={displayValue}
            onChange={(e) => setQuery(e.target.value)}
            className="input min-h-[2.75rem] pl-9 pr-16"
          />
          <div className="absolute inset-y-0 right-2 flex items-center gap-1">
            {clearable && value !== null && value !== undefined && (
              <button
                type="button"
                aria-label={t("clear")}
                onClick={() => {
                  onChange(null);
                  setQuery("");
                }}
                className="rounded-md p-1 text-ink-faint hover:bg-paper hover:text-ink"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            )}
            <ComboboxButton aria-label={label} className="rounded-md p-1 text-ink-faint hover:text-ink">
              <Icon name="chevron" className="h-4 w-4 rotate-90" />
            </ComboboxButton>
          </div>
        </div>

        {useVirtual && !loading && !error ? (
          <ComboboxOptions anchor="bottom start" className={PANEL_CLASS}>
            {({ option }) => renderRow(byValue.get(option as T) ?? { value: option as T, label: String(option) })}
          </ComboboxOptions>
        ) : (
          <ComboboxOptions anchor="bottom start" className={PANEL_CLASS}>
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
