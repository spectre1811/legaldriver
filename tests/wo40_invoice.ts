// WO-40 — pure billing/invoice functions characterization test. Run: npx tsx tests/wo40_invoice.ts
// Tests the GST/invoice math in src/lib/billing/invoice.ts — no network, no .env, fully mocked.
import { computeGst, financialYear, invoiceNumber, assembleLines, sumMinor } from "../src/lib/billing/invoice";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

// computeGst tests
// 1. intra-state 18%
const gst1 = computeGst({ subtotalMinor: 100000, rate: 18, firmState: "24", placeOfSupply: "24" });
ok("computeGst intra-state 18%", gst1.cgstMinor === 9000 && gst1.sgstMinor === 9000 && gst1.igstMinor === 0 && gst1.totalMinor === 118000);

// 2. inter-state 18%
const gst2 = computeGst({ subtotalMinor: 100000, rate: 18, firmState: "24", placeOfSupply: "27" });
ok("computeGst inter-state 18%", gst2.cgstMinor === 0 && gst2.sgstMinor === 0 && gst2.igstMinor === 18000 && gst2.totalMinor === 118000);

// 3. reverse charge → no tax
const gst3 = computeGst({ subtotalMinor: 100000, rate: 18, reverseCharge: true });
ok("computeGst reverse charge no tax", gst3.cgstMinor === 0 && gst3.sgstMinor === 0 && gst3.igstMinor === 0 && gst3.totalMinor === 100000);

// 4. zero rate → no tax
const gst4 = computeGst({ subtotalMinor: 100000, rate: 0, firmState: "24", placeOfSupply: "24" });
ok("computeGst zero rate", gst4.totalMinor === 100000 && gst4.cgstMinor === 0 && gst4.igstMinor === 0);

// 5. state-code normalization (leading token matches)
const gst5 = computeGst({ subtotalMinor: 100000, rate: 18, firmState: "24-Gujarat", placeOfSupply: "24" });
ok("computeGst state-code normalization", gst5.cgstMinor === 9000 && gst5.sgstMinor === 9000 && gst5.igstMinor === 0);

// 6. rounding on odd paise, intra-state
const gst6 = computeGst({ subtotalMinor: 101, rate: 18, firmState: "24", placeOfSupply: "24" });
ok("computeGst rounding odd paise", gst6.cgstMinor === 9 && gst6.sgstMinor === 9 && gst6.totalMinor === 119);

// 7. missing state info defaults to inter-state (IGST)
const gst7 = computeGst({ subtotalMinor: 100000, rate: 18 });
ok("computeGst missing state defaults to IGST", gst7.igstMinor === 18000 && gst7.cgstMinor === 0 && gst7.totalMinor === 118000);

// financialYear tests
// 8. 2026-07-05 → 2026-27
ok("financialYear 2026-07-05", financialYear("2026-07-05") === "2026-27");

// 9. 2026-03-31 → 2025-26
ok("financialYear 2026-03-31", financialYear("2026-03-31") === "2025-26");

// 10. 2026-04-01 → 2026-27
ok("financialYear 2026-04-01", financialYear("2026-04-01") === "2026-27");

// 11. 2000-04-10 → 2000-01
ok("financialYear 2000-04-10", financialYear("2000-04-10") === "2000-01");

// invoiceNumber tests
// 12. "INV", "2026-27", 7 → "INV/2026-27/0007"
ok("invoiceNumber INV 2026-27 7", invoiceNumber("INV", "2026-27", 7) === "INV/2026-27/0007");

// 13. "MK", "2025-26", 1234 → "MK/2025-26/1234"
ok("invoiceNumber MK 2025-26 1234", invoiceNumber("MK", "2025-26", 1234) === "MK/2025-26/1234");

// 14. "A", "2026-27", 0 → "A/2026-27/0000"
ok("invoiceNumber A 2026-27 0", invoiceNumber("A", "2026-27", 0) === "A/2026-27/0000");

// assembleLines tests
// Define inputs once
const time = [
  { id: "t1", minutes: 90, rate_minor: 200000, narrative: "Drafting", entry_date: "2026-07-01" },
  { id: "t2", minutes: 30, rate_minor: 100000, narrative: null, entry_date: "2026-07-02" },
];
const expenses = [
  { id: "e1", amount_minor: 50000, category: "Court fee", notes: "stamp paper", entry_date: "2026-07-03" },
  { id: "e2", amount_minor: 12000, category: "Travel", notes: null, entry_date: "2026-07-04" },
];
const lines = assembleLines(time, expenses, "998216");

// 15. lines.length === 4
ok("assembleLines length", lines.length === 4);

// 16. first time line
ok("assembleLines first time line", lines[0].kind === "time" && lines[0].description === "Drafting (2026-07-01)" && lines[0].hsn_sac === "998216" && lines[0].quantity === 1.5 && lines[0].unit === "hrs" && lines[0].rate_minor === 200000 && lines[0].amount_minor === 300000 && lines[0].source_time_entry_id === "t1");

// 17. null-narrative time line
ok("assembleLines null-narrative time line", lines[1].description === "Professional services (2026-07-02)" && lines[1].quantity === 0.5 && lines[1].amount_minor === 50000);

// 18. expense line with notes
ok("assembleLines expense line with notes", lines[2].kind === "expense" && lines[2].description === "Court fee — stamp paper (2026-07-03)" && lines[2].hsn_sac === null && lines[2].quantity === 1 && lines[2].unit === "item" && lines[2].amount_minor === 50000 && lines[2].source_expense_id === "e1");

// 19. null-notes expense line
ok("assembleLines null-notes expense line", lines[3].description === "Travel (2026-07-04)");

// sumMinor tests
// 20. sumMinor with values
ok("sumMinor with values", sumMinor([{ amount_minor: 300000 }, { amount_minor: 50000 }, { amount_minor: 12000 }]) === 362000);

// 21. sumMinor empty array
ok("sumMinor empty array", sumMinor([]) === 0);

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
