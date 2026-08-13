// WO-405 C2 (audit §4.2/§10 PRE-2) — pure, framework-free toast-queue algebra. No React/DOM here,
// so the queue behaviour (add/remove, id generation, the stack cap) is unit-tested offline; the
// React shell (toast-provider.tsx) just holds this list in state and renders it.

export type ToastVariant = "default" | "success" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** The audit's Undo pattern: `{ label: "Undo", onClick: restore }`. */
  action?: ToastAction;
  /** ms before auto-dismiss; defaults to DEFAULT_DURATION_MS. */
  durationMs?: number;
}

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  action?: ToastAction;
  durationMs: number;
}

export const DEFAULT_DURATION_MS = 5000;
// ponytail: a hard cap so a mutation storm (e.g. a bulk action that fires one toast per row)
// can't wall the screen — oldest drops first. Raise if a real feature needs more than 4 stacked.
export const MAX_STACK = 4;

let seq = 0;
export function nextToastId(): string {
  seq += 1;
  return `toast-${Date.now()}-${seq}`;
}

export function addToast(list: ToastItem[], input: ToastInput): { list: ToastItem[]; id: string } {
  const id = nextToastId();
  const item: ToastItem = {
    id,
    title: input.title,
    description: input.description,
    variant: input.variant ?? "default",
    action: input.action,
    durationMs: input.durationMs ?? DEFAULT_DURATION_MS,
  };
  return { list: [...list, item].slice(-MAX_STACK), id };
}

export function removeToast(list: ToastItem[], id: string): ToastItem[] {
  return list.filter((t) => t.id !== id);
}
