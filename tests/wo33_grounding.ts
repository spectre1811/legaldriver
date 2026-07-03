// WO-33 W3 — grounding guard: a hallucinated CNR must be dropped. Run: npx tsx tests/wo33_grounding.ts
import { groundCnrs } from "../src/lib/docs/grounding";

let failed = 0;
function ok(name: string, cond: boolean) { console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`); if (!cond) failed++; }

const real = "GJAH01000007202" + "5"; // 16 chars
const text = `In the matter bearing CNR ${real}, the demand notice...`;

ok("keeps a CNR present in the text", JSON.stringify(groundCnrs([real], text)) === JSON.stringify([real]));
ok("drops a hallucinated CNR not in the text", groundCnrs(["MHXX99999999" + "2099"], text).length === 0);
ok("matches despite spaces/hyphens in the extracted value", groundCnrs(["GJAH-0100 0007 2025"], text).length === 1);
ok("drops a non-16-char value (format guard)", groundCnrs(["GJAH0100"], text).length === 0);
ok("empty in → empty out", groundCnrs([], text).length === 0 && groundCnrs(undefined, text).length === 0);
ok("dedups", groundCnrs([real, real], text).length === 1);
// grounds against the filename too (a CNR-named PDF with no text layer yet)
ok("grounds via filename", groundCnrs([real], `scan ${real}.pdf`).length === 1);

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
