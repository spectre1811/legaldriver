// WO-405 C5 · unified Dialog primitive (audit §4.1/§10 PRE-1). No live services, no DOM/React —
// source-greps src/components/ui/dialog.tsx for the contract the WO specifies (3 variants, focus
// trap, ESC/backdrop-click close, z-index scale, header/footer slots) and confirms the existing
// consumers (add-client-modal.tsx, request-access-dialog.tsx) still call it with the same props as
// before this WO (backward compatibility — render-inspected separately, this pins the source shape).
// Run: npx tsx tests/wo405_dialog.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

const root = process.cwd();
const dialog = readFileSync(join(root, "src/components/ui/dialog.tsx"), "utf8");

check("supports all 3 variants (center/drawer-right/sheet-bottom)", ["center", "drawer-right", "sheet-bottom"].every((v) => dialog.includes(`"${v}"`)));
check("center variant carries shadow-ec-3 + rounded-ec-l (per this WO's spec)", /center:\s*{[^}]*rounded-ec-l[^}]*shadow-ec-3/s.test(dialog));
check("center backdrop uses z-ec-modal; drawer/sheet use z-ec-drawer", dialog.includes('z: "z-ec-modal"') && (dialog.match(/z: "z-ec-drawer"/g) ?? []).length === 2);
check("backdrop is bg-ec-ink/40 + backdrop-blur-sm (the WO-401 fix this WO builds on)", dialog.includes("bg-ec-ink/40") && dialog.includes("backdrop-blur-sm"));

check("focus trap: queries a real focusable-elements selector", dialog.includes("FOCUSABLE") && dialog.includes("querySelectorAll"));
check("focus trap: Tab wraps at the panel boundary (Shift+Tab from first → last, Tab from last → first)", dialog.includes('"Tab"') && dialog.includes("shiftKey"));
check("focus trap: restores focus to the trigger on close (A11Y-1)", dialog.includes("restoreFocusRef"));
check("ESC closes the dialog", dialog.includes('e.key === "Escape"') && dialog.includes("onClose()"));
check("clicking the backdrop closes the dialog", /bg-ec-ink\/40[^>]*onClick={onClose}/.test(dialog));

check("optional header slot (eyebrow + title + close-X)", dialog.includes("header.eyebrow") && dialog.includes("header.title") && dialog.includes("header.closeLabel"));
check("optional footer slot", dialog.includes("{footer &&"));
check("header close-X carries an aria-label (A11Y-2)", dialog.includes("aria-label={header.closeLabel}"));

// ── backward compatibility: the pre-existing consumers must still call Dialog the same way ───────
const addClient = readFileSync(join(root, "src/app/dashboard/clients/add-client-modal.tsx"), "utf8");
const requestAccess = readFileSync(join(root, "src/components/request-access-dialog.tsx"), "utf8");

check("add-client-modal.tsx still composes the shared Dialog with its own labelledBy/className (no header/footer slot forced on it)", addClient.includes('from "@/components/ui/dialog"') && addClient.includes('labelledBy="add-client-title"'));
check("request-access-dialog.tsx still composes the shared Dialog with its own labelledBy (untouched)", requestAccess.includes('from "@/components/ui/dialog"') && requestAccess.includes('labelledBy="request-access-title"'));

console.log(failures === 0 ? "WO-405 DIALOG: PASS" : `WO-405 DIALOG: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
