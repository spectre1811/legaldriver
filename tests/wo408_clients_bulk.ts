// WO-408 E3 · Clients bulk actions — pure cascade-partition logic (offline, no DB/React).
// The guard behind both bulk-delete's cascade-confirm AND the inline single-row delete: a client
// with ANY linked matter is blocked; everything else is deletable. Also source-greps the wiring so
// the word-wrap fix, ConfirmAction's confirmDisabled extension, and the soft-delete filter can't
// silently regress without a test noticing.
// Run: npx tsx tests/wo408_clients_bulk.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { partitionByLinkedMatters } from "../src/app/dashboard/clients/cascade";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

// ── partitionByLinkedMatters ─────────────────────────────────────────────────────────────────
const a = { id: "a", name: "Ambika Traders" };
const b = { id: "b", name: "Bhagwati Steel" };
const c = { id: "c", name: "Chetan Patel" };

{
  const { deletable, blocked } = partitionByLinkedMatters([a, b, c], new Set(["b"]));
  ok("blocked = the linked id only", blocked.length === 1 && blocked[0].id === "b");
  ok("deletable = everyone else, order preserved", deletable.map((x) => x.id).join(",") === "a,c");
}
{
  const { deletable, blocked } = partitionByLinkedMatters([a, b, c], new Set());
  ok("no linked ids → everyone deletable", deletable.length === 3 && blocked.length === 0);
}
{
  const { deletable, blocked } = partitionByLinkedMatters([a, b, c], new Set(["a", "b", "c"]));
  ok("all linked → nothing deletable (confirm button must disable)", deletable.length === 0 && blocked.length === 3);
}
{
  // Empty selection is a no-op, not an error.
  const { deletable, blocked } = partitionByLinkedMatters([], new Set(["x"]));
  ok("empty selection → empty partition", deletable.length === 0 && blocked.length === 0);
}
{
  // Generic over any {id}-shaped record — the server passes bare ids (no name available without a
  // second query), the client passes full ClientRow objects; both must behave identically.
  const { blocked, deletable } = partitionByLinkedMatters([{ id: "x" }, { id: "y" }], new Set(["x"]));
  ok("works over bare {id} records (the server-side call shape)", blocked.length === 1 && blocked[0].id === "x" && deletable.length === 1 && deletable[0].id === "y");
}

// ── wiring (source-grep — the pieces that make this honest, not decorative) ─────────────────────
const root = process.cwd();
const table = readFileSync(join(root, "src/app/dashboard/clients/clients-table.tsx"), "utf8");
const query = readFileSync(join(root, "src/app/dashboard/clients/clients-query.ts"), "utf8");
const actions = readFileSync(join(root, "src/app/dashboard/clients/actions.ts"), "utf8");
const confirmAction = readFileSync(join(root, "src/components/confirm-action/confirm-action.tsx"), "utf8");

ok("word-wrap fix: client-name cell wraps, doesn't truncate", table.includes("whitespace-normal") && table.includes("break-words"));
ok("checked row gets the bronze-tint treatment (E3 spec)", table.includes("bg-ec-bronze-tint"));
ok("reuses the shared ConfirmAction, not a bespoke modal", table.includes('from "@/components/confirm-action"'));
ok("reuses the shared BulkBar primitive", table.includes("BulkBar"));
ok("reuses the shared useToast for the Undo pill", table.includes("useToast"));
ok("bulk delete button disabled when nothing is actually deletable", table.includes("confirmDisabled={deletable.length === 0}"));
ok("roster query hides soft-deleted clients (custom.deletedAt)", query.includes('"custom->>deletedAt"'));
ok("delete is guarded server-side by the SAME partition helper (never trusts the client)", actions.includes("partitionByLinkedMatters"));
ok("delete re-derives linkedIds from a fresh matter query (never trusts the caller's partition)", actions.includes('from("matter").select("client_id")'));
ok("ConfirmAction extended (not forked) with an explicit confirm-disable for the d==0 case", confirmAction.includes("confirmDisabled"));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
