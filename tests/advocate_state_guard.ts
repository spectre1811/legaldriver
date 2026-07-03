// Advocate onboarding state guard: a bar-identified advocate must not be seeded with
// name-collision cases from other states. Run: npx tsx tests/advocate_state_guard.ts
import { passesStateGuard } from "../src/lib/court/advocate-cases";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

// Pinned to Gujarat (bar + state given → stateGuard = "GJ")
const GJ = "GJ";
check("authoritative bar-lookup row always kept (even if CNR odd)", passesStateGuard({ source: "legaldriver", cnr: "GJHC240305222026" }, GJ) === true);
check("bar-lookup row kept regardless of state prefix", passesStateGuard({ source: "legaldriver", cnr: null }, GJ) === true);
check("corpus GJ case kept (CNR prefix matches)", passesStateGuard({ source: "corpus", cnr: "GJGN123" }, GJ) === true);
check("corpus UP namesake DROPPED (cross-state)", passesStateGuard({ source: "corpus", cnr: "UPHC013249272025" }, GJ) === false);
check("indiankanoon no-CNR namesake DROPPED (unverifiable)", passesStateGuard({ source: "indiankanoon", cnr: null }, GJ) === false);

// Name-only search (no bar+state → stateGuard = null → keep everything, unchanged behaviour)
check("no state guard → corpus UP case kept (name-only search unchanged)", passesStateGuard({ source: "corpus", cnr: "UPHC013249272025" }, null) === true);
check("no state guard → no-CNR row kept", passesStateGuard({ source: "indiankanoon", cnr: null }, null) === true);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
