// WO-405 C3 (audit §4.3/§10 PRE-3) — pure, framework-free helpers for <ConfirmAction>. No React
// here, so variant→style mapping and the cascade-warning predicate are unit-tested offline.

export type ConfirmVariant = "danger" | "warning" | "default";

export interface CascadeItem {
  id: string;
  label: string;
}

export interface CascadeWarning {
  /** e.g. "2 clients can't be deleted — they have linked matters:" */
  heading: string;
  items: CascadeItem[];
}

const BASE = "rounded-ec-s px-3.5 py-2 text-[13px] font-medium transition disabled:opacity-50 disabled:pointer-events-none";

// 'danger' fills solid (bg-ec-danger) — the truly destructive step (case/client/document delete).
// 'warning' fills solid too but in --warn (a real consequence, short of data loss — e.g. "move to
// trash"). 'default' reuses the app's one primary-CTA treatment (.ec-btn.ec-btn-ink) rather than
// inventing a second "primary button" look.
export function confirmButtonClasses(variant: ConfirmVariant): string {
  switch (variant) {
    case "danger":
      return `${BASE} bg-ec-danger text-ec-paper hover:opacity-90`;
    case "warning":
      return `${BASE} bg-ec-warn text-ec-paper hover:opacity-90`;
    default:
      return `ec-btn ec-btn-ink disabled:opacity-50`;
  }
}

export function hasCascadeWarning(cascade: CascadeWarning | undefined | null): cascade is CascadeWarning {
  return Boolean(cascade && cascade.items.length > 0);
}
