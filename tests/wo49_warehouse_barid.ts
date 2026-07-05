// WO-49: the LD-API warehouse fallback must look up an advocate by the FULL canonical bar id
// ("G/4732/1999"), which is how the warehouse keys advocates — NOT the bare serial ("4732"),
// which 404s. Bug: onboarding returned 0 even for advocates whose cases we fully hold (verified
// live: GET /advocate/G/4732/1999 → 5075 cases; GET /advocate/4732 → 404).
// Run: npx tsx tests/wo49_warehouse_barid.ts
import { warehouseBarId } from "../src/lib/court/advocate-cases";
import { parseBarNumber } from "../src/lib/court/bar-number";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

// The bug fix: a parsed canonical bar → the FULL id, never the bare serial.
check("G/4732/1999 → full canonical (not the bare serial 4732)",
  warehouseBarId(parseBarNumber("G/4732/1999"), "G/4732/1999") === "G/4732/1999");
check("G/702/2020 → full canonical",
  warehouseBarId(parseBarNumber("G/702/2020"), "G/702/2020") === "G/702/2020");
check("separator-loose input normalizes to the canonical warehouse key",
  warehouseBarId(parseBarNumber("g 702 2020"), "g 702 2020") === "G/702/2020");
check("the returned id is NEVER the bare serial",
  warehouseBarId(parseBarNumber("G/4732/1999"), "G/4732/1999") !== "4732");

// A bare numeric eCourts code (no STATE/YEAR) → used as-is (the 11240-style display code).
check("bare numeric code passed through as-is", warehouseBarId(null, "11240") === "11240");

// Unparseable / name-only → null so the caller falls back to a name search.
check("null when nothing usable (→ name search)", warehouseBarId(null, null) === null);
check("null for a non-numeric, unparseable bar (→ name search)", warehouseBarId(null, "not-a-bar") === null);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
