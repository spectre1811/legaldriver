// WO-43 Wave 1 — the shared selection/bulk primitive. Every selectable list imports from here:
//   const s = useSelection(orderedIds);
//   <RowCheckbox checked={s.isSelected(id)} onSelect={(shift) => s.onRowClick(id, shift)} … />
//   <BulkBar count={s.size} …>…actions…</BulkBar>
//   const { undo, show, dismiss } = useUndo();  <UndoToast undo={undo} onUndo={…} … />
export { useSelection } from "./use-selection";
export type { UseSelection, UseSelectionOptions } from "./use-selection";
export { BulkBar, bulkBtn, RowCheckbox, SelectAllCheckbox } from "./bulk-bar";
export { UndoToast, useUndo } from "./undo-toast";
export type { UndoState } from "./undo-toast";
