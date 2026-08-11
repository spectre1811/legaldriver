"use client";

// WO-405 C3 (audit §4.3/§10 PRE-3) — generalizes the two-step ConfirmDelete pattern
// (src/components/confirm-delete.tsx) into one reusable confirm-before-destructive component, built
// on the shared <Dialog>. E3 (clients bulk delete), E4 (documents delete/move-to-trash), and F2
// (case "…" menu delete, which today has NO confirmation at all — audit §4.3) consume this next;
// existing ConfirmDelete/DeleteButton call sites are NOT force-migrated by this WO.
//
// Controlled component (no imperative promise API): the caller owns `open` + wires `onConfirm`/
// `onCancel`. The optional `cascade` block is the audit's example verbatim — a warn-tinted section
// listing what CAN'T be actioned ("2 clients can't be deleted — they have linked matters:" + a
// muted list), styled like add-client-modal.tsx's existing conflict-warning box (bg-ec-warn-bg).
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Dialog } from "@/components/ui/dialog";
import { confirmButtonClasses, hasCascadeWarning, type CascadeWarning, type ConfirmVariant } from "./logic";

export type { CascadeItem, CascadeWarning, ConfirmVariant } from "./logic";

export interface ConfirmActionProps {
  open: boolean;
  title: string;
  body: React.ReactNode;
  cascade?: CascadeWarning;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /** Disables both buttons + swaps the confirm label for a busy indicator (server action in flight). */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const TITLE_ID = "confirm-action-title";

export function ConfirmAction({
  open, title, body, cascade, confirmLabel, cancelLabel, variant = "default", busy = false, onConfirm, onCancel,
}: ConfirmActionProps) {
  const t = useTranslations("common.actions");
  const cancel = cancelLabel ?? t("cancel");

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      variant="center"
      className="max-w-md"
      header={{ title, titleId: TITLE_ID, closeLabel: t("close") }}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-ec-s border border-ec-line px-3.5 py-2 text-[13px] text-ec-ink-2 transition hover:bg-ec-paper-3 disabled:opacity-50"
          >
            {cancel}
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className={confirmButtonClasses(variant)}>
            {/* "…" not a translated word (matches confirm-delete.tsx's existing busy glyph) — locale-invariant, no new i18n key needed. */}
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="px-5 py-4">
        <div className="text-sm text-ec-ink-2">{body}</div>
        {hasCascadeWarning(cascade) && (
          <div className="mt-3 rounded-ec-s bg-ec-warn-bg px-3 py-2.5">
            <p className="flex items-start gap-2 text-[12.5px] font-medium text-ec-warn">
              <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {cascade.heading}
            </p>
            <ul className="mt-2 space-y-1 pl-5 text-[12.5px] text-ec-muted-ink">
              {cascade.items.map((item) => (
                <li key={item.id} className="list-disc">{item.label}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
