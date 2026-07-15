// Test: communications-catalog rendering + honesty/length invariants (WO-148 W1).
// No live services. Run: npx tsx tests/wo148_comms.ts
// EN/HI key parity for the whole catalog (incl. comms.*) is already covered by
// tests/i18n_coverage.ts — this file guards the behaviour i18n_coverage can't see:
// the slot-drop honesty rule and the catalog length caps (comms-catalog-v2 global rules).
import en from "@/i18n/messages/en.json";
import hi from "@/i18n/messages/hi.json";
import { fillTemplate, fillLines, type Slot } from "@/i18n/comms";

let ok = true;
const check = (name: string, cond: boolean) => {
  if (!cond) ok = false;
  console.log(`${cond ? "ok  " : "FAIL"}: ${name}`);
};

const SAMPLE: Record<string, Slot> = {
  matter: "Meghdoot v. Kandla Port",
  when: "2h ago",
  item: "14",
  court: "Gujarat HC Court 7",
  days: 3,
  amount: "45,000",
  payer: "Maheshwari",
  invoice: "INV-041",
  count: 297,
  time: "02:14",
};

// --- fillTemplate behaviour ---
check(
  "interpolates present slots",
  fillTemplate("Order uploaded · {matter} · {when}", { matter: "Patel v. State", when: "2h ago" }) ===
    "Order uploaded · Patel v. State · 2h ago",
);
check(
  "drops the sentence when any slot is missing (null/undefined/empty)",
  [null, undefined, ""].every(
    (m) => fillTemplate("Reply due in {days} days · {matter}", { days: 3, matter: m }) === null,
  ),
);
check("numeric 0 is a real value, not missing", fillTemplate("{count} pending", { count: 0 }) === "0 pending");
check("no-slot templates always render", fillTemplate("Brief ready.") === "Brief ready.");

// --- fillLines behaviour (multi-line board/email) ---
check(
  "fillLines drops only the missing lines",
  fillLines("Board · {date}\n{n} orders today", { date: "Fri 24 Jul", n: null }) === "Board · Fri 24 Jul",
);
check(
  "fillLines falls back to the empty variant when all lines drop",
  fillLines("{a}\n{b}", { a: null, b: null }, "Diary is clear.") === "Diary is clear.",
);

// --- catalog length caps, rendered with sample data (comms-catalog-v2 global rules) ---
for (const [lang, src] of [["en", en], ["hi", hi]] as const) {
  for (const [k, tpl] of Object.entries(src.comms.notification)) {
    const out = fillTemplate(tpl, SAMPLE) ?? tpl;
    check(`notification.${k} [${lang}] ≤ 90 chars (${out.length})`, out.length <= 90);
  }
}
for (const [k, tpl] of Object.entries(en.comms.toast)) {
  const out = fillTemplate(tpl, SAMPLE) ?? tpl;
  check(`toast.${k} [en] short ≤ 40 chars (${out.length})`, out.length <= 40);
}

console.log(ok ? "WO148 COMMS: PASS" : "WO148 COMMS: FAIL");
process.exit(ok ? 0 : 1);
