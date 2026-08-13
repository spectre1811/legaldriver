// WO-405 C3 · ConfirmAction primitive (audit §4.3/§10 PRE-3). No live services, no DOM/React —
// (1) exercises the pure variant→class mapping and cascade-warning predicate directly
// (src/components/confirm-action/logic.ts); (2) source-greps the component for the cascade-warning
// rendering contract (heading + muted item list, gated on non-empty items) since rendering a
// Dialog-based portal component isn't feasible in this offline (no-jsdom) suite.
// Run: npx tsx tests/wo405_confirm_action.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { confirmButtonClasses, hasCascadeWarning } from "../src/components/confirm-action/logic";

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

// ── pure logic ─────────────────────────────────────────────────────────────────────────────────
check('variant "danger" fills bg-ec-danger (the destructive step)', confirmButtonClasses("danger").includes("bg-ec-danger"));
check('variant "warning" is visually distinct from "danger"', confirmButtonClasses("warning") !== confirmButtonClasses("danger"));
check('variant "default" reuses the app primary-CTA (.ec-btn.ec-btn-ink), not a bespoke look', confirmButtonClasses("default").includes("ec-btn-ink"));

check("no cascade block when cascade is undefined", hasCascadeWarning(undefined) === false);
check("no cascade block when items is empty (nothing to warn about)", hasCascadeWarning({ heading: "x", items: [] }) === false);
check("cascade block renders when items is non-empty", hasCascadeWarning({ heading: "x", items: [{ id: "1", label: "a" }] }) === true);

// ── the component's cascade-rendering + Dialog composition (source-grep) ─────────────────────────
const root = process.cwd();
const src = readFileSync(join(root, "src/components/confirm-action/confirm-action.tsx"), "utf8");

check("built on the shared Dialog primitive (not a 4th hand-rolled modal)", src.includes('from "@/components/ui/dialog"') && src.includes("<Dialog"));
check("cascade renders a warn-tinted block (matches add-client-modal.tsx's existing conflict box)", src.includes("bg-ec-warn-bg"));
check("cascade section is gated on hasCascadeWarning (never renders an empty warning)", src.includes("hasCascadeWarning(cascade)"));
check("cascade renders the heading + a muted item list", src.includes("cascade.heading") && src.includes("cascade.items.map"));
check("primary button uses the variant-mapped classes", src.includes("confirmButtonClasses(variant)"));
check("has a Cancel affordance distinct from the primary action", /{cancel}/.test(src) && src.includes('t("cancel")'));

console.log(failures === 0 ? "WO-405 CONFIRM-ACTION: PASS" : `WO-405 CONFIRM-ACTION: FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
