// WO-61 · Live enrolment validation for the guided onboarding form.
// Pure/offline — no network, no .env. Run: npx tsx tests/wo61_enrolment_validation.ts
//
// Guards the as-you-type validation (`checkEnrolment`) + the primary-path gate
// (`canFetchRoster`) that replace the old "submit → wait 60s → learn you needed the
// year" trap. The canonical STATE/SERIAL/YEAR format is founder-ruled (WO-42) and NOT
// re-litigated here — this only covers the WO-61 validation layer on top of it.
import { checkEnrolment, canFetchRoster } from "../src/lib/court/bar-number";

let failures = 0;
const check = (name: string, cond: boolean) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

// ── checkEnrolment states ─────────────────────────────────────────────────────
check("empty input → empty state", checkEnrolment("").state === "empty");
check("whitespace-only → empty state", checkEnrolment("   ").state === "empty");
check("null → empty state", checkEnrolment(null).state === "empty");

// A partial number (no year) is the classic trap — must flag needs-year, never silently accept.
check("state+serial without year → needs-year", checkEnrolment("G/702").state === "needs-year");
check("bare eCourts display code (11240) → needs-year", checkEnrolment("11240").state === "needs-year");
check("garbage → needs-year", checkEnrolment("hello").state === "needs-year");

// A full Gujarat enrolment (verified council) → ready + live roster.
const ready = checkEnrolment("G/702/2020");
check("full Gujarat enrolment → ready", ready.state === "ready");
check("ready carries live:true", ready.state === "ready" && ready.live === true);
check("ready resolves the council label (Gujarat)", ready.state === "ready" && /gujarat/i.test(ready.council));
check("ready surfaces serial + year for the chip", ready.state === "ready" && ready.serial === 702 && ready.year === 2020);

// Council auto-inferred from the enrolment prefix even without an explicit selection.
check("Gujarat inferred from 'G' prefix (no council passed)", checkEnrolment("G/4732/1999").state === "ready");
// An explicit unverified council still resolves the enrolment but stays name-only (live:false).
const parsed = checkEnrolment("MAH/1234/1982");
check("valid enrolment on an unverified council → parsed (not ready)", parsed.state === "parsed");
check("parsed carries live:false", parsed.state === "parsed" && parsed.live === false);
check("parsed still exposes the canonical string", parsed.state === "parsed" && parsed.canonical === "MAH/1234/1982");

// ── canFetchRoster (the primary "Add & fetch" gate) ───────────────────────────
check("gate open for a full enrolment", canFetchRoster("G/702/2020") === true);
check("gate open regardless of verified council (year is the requirement)", canFetchRoster("MAH/1234/1982") === true);
check("gate CLOSED without a year", canFetchRoster("G/702") === false);
check("gate CLOSED for a bare display code", canFetchRoster("11240") === false);
check("gate CLOSED for empty", canFetchRoster("") === false);
check("gate CLOSED for null", canFetchRoster(null) === false);

console.log(failures === 0 ? "\n✅ all wo61 enrolment-validation checks passed" : `\n❌ ${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
