// WO-29 W2 · inbox undo-grouping. Run: npx tsx tests/wo29_inbox_status.ts
// restoreEmails must put each email back to its EXACT prior status — so a bulk delete of mixed
// filed + needs_review emails restores each correctly, grouped into one UPDATE per status.
import { groupIdsByStatus, INBOX_ACTIVE_STATUSES } from "../src/lib/mail/inbox-status";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

const g = groupIdsByStatus([
  { id: "a", status: "filed" },
  { id: "b", status: "needs_review" },
  { id: "c", status: "filed" },
]);
ok("groups filed together", (g.get("filed") ?? []).join(",") === "a,c");
ok("keeps needs_review separate", (g.get("needs_review") ?? []).join(",") === "b");
ok("one entry per distinct status", g.size === 2);
ok("empty in → empty map", groupIdsByStatus([]).size === 0);
ok("active statuses exclude archived/deleted",
  !INBOX_ACTIVE_STATUSES.includes("archived" as never) && !INBOX_ACTIVE_STATUSES.includes("deleted" as never));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
