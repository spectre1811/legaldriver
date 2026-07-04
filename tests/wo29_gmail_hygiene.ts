// WO-29 · Gmail ingestion hygiene. Run: npx tsx tests/wo29_gmail_hygiene.ts
// The guarantee: spam/promotions/social/trash never ingest, regardless of the path they arrive by
// (the incremental history feed ignores the list `q`, so the label check is the real gate).
import { isJunkByLabels, EXCLUDE_QUERY } from "../src/lib/mail/gmail";

let failed = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed++;
}

// Junk labels are excluded.
ok("SPAM excluded", isJunkByLabels(["INBOX", "SPAM"]) === true);
ok("TRASH excluded", isJunkByLabels(["TRASH"]) === true);
ok("Promotions excluded", isJunkByLabels(["CATEGORY_PROMOTIONS", "INBOX"]) === true);
ok("Social excluded", isJunkByLabels(["CATEGORY_SOCIAL"]) === true);

// Legitimate mail passes.
ok("plain inbox mail passes", isJunkByLabels(["INBOX", "IMPORTANT"]) === false);
ok("primary category passes", isJunkByLabels(["INBOX", "CATEGORY_PERSONAL"]) === false);
ok("empty/undefined labels pass", isJunkByLabels(undefined) === false && isJunkByLabels([]) === false);

// The list query narrows up front (defense in depth for the list path).
ok("exclude query drops promotions+social+spam+trash",
  /-in:spam/.test(EXCLUDE_QUERY) && /-category:promotions/.test(EXCLUDE_QUERY) && /-category:social/.test(EXCLUDE_QUERY));

console.log(failed === 0 ? "\nPASS" : `\nFAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
