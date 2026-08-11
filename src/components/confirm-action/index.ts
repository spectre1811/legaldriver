// WO-405 C3 — the shared confirm-before-destructive component. Generalizes
// src/components/confirm-delete.tsx's two-step pattern with danger/warning/default variants and an
// optional cascade-warning section:
//   <ConfirmAction open title="Delete client?" body="…" variant="danger" confirmLabel="Delete"
//     cascade={{ heading: "2 clients can't be deleted — they have linked matters:", items }}
//     onConfirm={…} onCancel={…} />
export { ConfirmAction } from "./confirm-action";
export type { CascadeItem, CascadeWarning, ConfirmActionProps, ConfirmVariant } from "./confirm-action";
export { confirmButtonClasses, hasCascadeWarning } from "./logic";
