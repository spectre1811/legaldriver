// WO-46 Wave C · STATE_BAR_COUNCILS is a build-time-generated CONSUMER of the platform
// bar_council registry (/v1/dictionaries?dims=bar_council), not a hand-maintained copy.
// Pure/offline — no network, no .env. Run: npx tsx tests/wo46_bar_councils.ts
//
// This guards the generate + committed-fallback recipe (BP-05-W2): the generated data.ts must stay
// consistent with the committed snapshot it (offline) derives from, keep the runtime shape the
// consumers expect, and never let an unverified council leak a token (info-integrity).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STATE_BAR_COUNCILS } from "../src/lib/court/bar-number";
import { STATE_BAR_COUNCILS as GENERATED } from "../src/lib/court/bar-councils.data";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

const here = dirname(fileURLToPath(import.meta.url));
const SNAP = JSON.parse(readFileSync(join(here, "../src/lib/court/bar-councils.source.json"), "utf8"));

// ── the module now RE-EXPORTS the generated array (no hand-maintained copy) ──
check("bar-number re-exports the generated STATE_BAR_COUNCILS", STATE_BAR_COUNCILS === GENERATED);
check("registry is non-empty", STATE_BAR_COUNCILS.length > 15);

// ── generated ↔ committed snapshot parity (offline fallback can't drift silently) ──
const snapCouncils = SNAP.councils as Array<Record<string, unknown>>;
check("generated count == snapshot count", GENERATED.length === snapCouncils.length);
check("generated ids == snapshot ids (order preserved)",
  JSON.stringify(GENERATED.map((c) => c.id)) === JSON.stringify(snapCouncils.map((c) => c.id)));

// ── contract → StateBarCouncil field mapping (alpha→statePrefix, ecourts_state_code→stateCode …) ──
const gj = STATE_BAR_COUNCILS.find((c) => c.id === "GJ")!;
const gjSnap = snapCouncils.find((c) => c.id === "GJ")!;
check("Gujarat present + verified", !!gj && gj.verified === true);
check("alpha → statePrefix (G)", gj.statePrefix === gjSnap.alpha && gj.statePrefix === "G");
check("ecourts_state_code → stateCode (17)", gj.stateCode === gjSnap.ecourts_state_code && gj.stateCode === 17);
// === "G" IS the "not GJ/GJG" regression guard (BP-60: GJ/GJG/GUJ all return 0 cases).
check("hc_bar_token → hcBarToken (G, not GJ)", gj.hcBarToken === "G");
check("dc_bar_token → dcBarToken (G, not GJG)", gj.dcBarToken === "G");

// ── invariants the runtime relies on ──
check("exactly one verified council today (Gujarat)", STATE_BAR_COUNCILS.filter((c) => c.verified).length === 1);
check("verified↔token: a verified council carries a token + state_code",
  STATE_BAR_COUNCILS.every((c) => !c.verified || (!!c.hcBarToken && c.stateCode !== null)));
check("no unverified council leaks a token/prefix (never guessed)",
  STATE_BAR_COUNCILS.every((c) => c.verified || (c.hcBarToken === null && c.dcBarToken === null && c.stateCode === null && c.statePrefix === null)));
check("the verified snapshot row cites a source", !!gjSnap.source);

console.log(failures ? `\n${failures} FAILED` : "\nAll passed");
process.exit(failures ? 1 : 0);
