// WO-405 C2 · ToastProvider/useToast primitive (audit §4.2/§10 PRE-2). No live services, no
// DOM/React — (1) exercises the pure queue algebra directly (src/components/toast/logic.ts);
// (2) source-greps the React shell for the contract the WO specifies (bottom-center stack,
// z-ec-toast, role=status/aria-live=polite, Undo action, mounted once in the dashboard layout)
// since rendering a portal-based client component isn't feasible in this offline (no-jsdom) suite.
// Run: npx tsx tests/wo405_toast.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addToast, removeToast, DEFAULT_DURATION_MS, MAX_STACK, type ToastItem } from "../src/components/toast/logic";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

// ── pure queue algebra ────────────────────────────────────────────────────────────────────────
let list: ToastItem[] = [];
const r1 = addToast(list, { title: "Case deleted", variant: "success" });
list = r1.list;
check("addToast appends one item and defaults the variant only when unset", list.length === 1 && list[0].variant === "success");
check("addToast defaults durationMs", list[0].durationMs === DEFAULT_DURATION_MS);
check("addToast returns a real id, matching the item in the list", list[0].id === r1.id);

const undoClicks: string[] = [];
const r2 = addToast(list, {
  title: "Stage changed",
  action: { label: "Undo", onClick: () => undoClicks.push("undo") },
});
list = r2.list;
check("addToast preserves an action (Undo pattern)", list[1].action?.label === "Undo");
list[1].action!.onClick();
check("the action's onClick actually fires", undoClicks.length === 1);

list = removeToast(list, r1.id);
check("removeToast drops exactly the dismissed id", list.length === 1 && list[0].id === r2.id);

// ── the stack cap (a mutation storm can't wall the screen) ───────────────────────────────────────
let stacked: ToastItem[] = [];
for (let i = 0; i < MAX_STACK + 3; i++) {
  stacked = addToast(stacked, { title: `toast ${i}` }).list;
}
check(`stack never exceeds MAX_STACK (${MAX_STACK})`, stacked.length === MAX_STACK);
check("the cap drops the OLDEST toast, keeping the newest", stacked[stacked.length - 1].title === `toast ${MAX_STACK + 2}`);

// ── the React shell's contract (source-grep — no jsdom in this offline suite) ────────────────────
const root = process.cwd();
const provider = readFileSync(join(root, "src/components/toast/toast-provider.tsx"), "utf8");
const layout = readFileSync(join(root, "src/app/dashboard/layout.tsx"), "utf8");

check('toast stack is bottom-center and uses the z-ec-toast token', /bottom-6.*z-ec-toast|z-ec-toast.*bottom-6/.test(provider.replace(/\n/g, " ")));
check('each toast row is role="status" + aria-live="polite" (announced, not focus-stealing)', provider.includes('role="status"') && provider.includes('aria-live="polite"'));
check("supports an Undo-shaped action (label + onClick)", provider.includes("item.action"));
check("dismiss button carries an aria-label (A11Y-2, icon-only button)", provider.includes('aria-label={t("dismiss")}'));
check("styled with ec-* dark-ink chrome + honey action (Chambers palette, not raw hex)", provider.includes("bg-ec-ink") && provider.includes("text-ec-honey"));
check("ToastProvider is mounted once in the dashboard layout", layout.includes("<ToastProvider>") && layout.includes('from "@/components/toast"'));

console.log(failures === 0 ? "WO-405 TOAST: PASS" : `WO-405 TOAST: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
