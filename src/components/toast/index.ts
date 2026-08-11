// WO-405 C2 — the app's ONE toast system. Mount `<ToastProvider>` once (dashboard/layout.tsx),
// then any client component under it calls `useToast()`:
//   const toast = useToast();
//   toast({ title: "Case deleted", variant: "success", action: { label: "Undo", onClick: restore } });
export { ToastProvider, useToast } from "./toast-provider";
export type { ToastAction, ToastInput, ToastItem, ToastVariant } from "./logic";
