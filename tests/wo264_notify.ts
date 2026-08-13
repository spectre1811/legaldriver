// Test: email send-path wiring (WO-264) — the send RULES, offline.
// No live services. Run: npx tsx tests/wo264_notify.ts
// Guards: the IST when-label closed set + stale-skip, the caseUpdate roundup honesty
// (real titles folded, nothing fabricated), the listingNoTime fallback (a time-less
// court row renders — the record carries item numbers, not clock times), and the
// renderNotice fallback shell (escaping, disclaimer, text part, single CTA link).
import { hearingWhenLabel, istDate, istFriendlyDate, composeCaseUpdate, appUrl, matterIdOf } from "@/lib/notify/email-render";
import { renderNotice, renderDailyHearings, renderEmail } from "@/lib/email/templates";
import { maskTitle } from "@/lib/court/mask";

let ok = true;
const check = (name: string, cond: boolean) => {
  if (!cond) ok = false;
  console.log(`${cond ? "ok  " : "FAIL"}: ${name}`);
};

// --- istDate: IST calendar day, shape + ordering ---
const today = istDate(0);
const tomorrow = istDate(1);
check(`istDate shape (${today})`, /^\d{4}-\d{2}-\d{2}$/.test(today));
check("istDate(1) is after istDate(0)", tomorrow > today);
check(`istFriendlyDate renders ("${istFriendlyDate(tomorrow)}")`, /^\d{1,2} [A-Z][a-z]{2}$/.test(istFriendlyDate(tomorrow)));
// IST vs UTC divergence window: at 20:00 UTC it is already the NEXT day in IST (+05:30).
check("istDate rolls to the next IST day at 20:00 UTC", istDate(0, new Date("2026-07-22T20:00:00Z")) === "2026-07-23");
check("istDate holds the same IST day at 12:30 UTC (the 6 pm cron instant)", istDate(0, new Date("2026-07-22T12:30:00Z")) === "2026-07-22");
check("istDate(1) at the cron instant = the next IST day", istDate(1, new Date("2026-07-22T12:30:00Z")) === "2026-07-23");

// --- hearingWhenLabel: closed set, computed at send time; stale → null (skip) ---
check("event today → 'today'", hearingWhenLabel(today) === "today");
check("event tomorrow → 'tomorrow'", hearingWhenLabel(tomorrow) === "tomorrow");
check("event in 3 days → 'in 3 days'", hearingWhenLabel(istDate(3)) === "in 3 days");
check("past event → null (stale reminders are skipped, never sent late)", hearingWhenLabel(istDate(-1)) === null);
check("garbage date → null", hearingWhenLabel("not-a-date") === null);
// worst-case label keeps the subject ≤ 78 chars (v3.1 subjects carry the case title by design)
const worst = renderEmail("hearingReminder", { when: hearingWhenLabel(istDate(365)) ?? "", case: "X v. Y", court: "C", cnr: "Z" });
check("hearingReminder worst-case subject ≤ 78 chars", !!worst && worst.subject.length <= 78);
// missing purpose → purpose fact drops, email still sends
const noPurpose = renderEmail("hearingReminder", { when: "tomorrow", case: "X v. Y", court: "C", cnr: "Z" });
check("hearingReminder without purpose still sends, purpose fact dropped", !!noPurpose && !/Purpose:/.test(noPurpose.text));

// --- caseUpdate roundup: one email, real titles folded into the detail slot ---
const single = composeCaseUpdate([{ change: "New order", title: "A v. B", cnr: "CNR1", matterId: "m1", court: "HC", body: "1 new order (latest 2026-07-20)" }]);
check("single change composes", !!single && single.data.change === "New order" && single.data.case === "A v. B");
check("single change CTA targets the matter", !!single && single.ctaPath === "/dashboard/cases/m1");
const multi = composeCaseUpdate([
  { change: "New order", title: "A v. B", cnr: "CNR1", matterId: "m1", body: "1 new order" },
  { change: "Next hearing set", title: "C v. D" },
  { change: "Bench changed", title: "E v. F" },
]);
check("roundup folds sibling titles into detail", !!multi && /Also updated today: C v. D · E v. F\./.test(multi.data.detail ?? ""));
check("roundup keeps the primary as subject-bearer", !!multi && multi.data.change === "New order");
const legacy = composeCaseUpdate([{ title: "Old row, no change label" }]);
check("legacy row without a change label → null (caller falls back to renderNotice)", legacy === null);

// --- WO-314: composeCaseUpdate surfaces eventDate (was silently dropped — the founder's
// screenshot's first cause) + the producer's widened fields ---
const enriched = composeCaseUpdate([{
  change: "Bench changed", title: "A v. B", cnr: "CNR1", matterId: "m1", court: "HC",
  eventDate: "2026-08-12", stage: "Arguments", purpose: "Final hearing",
  coram: "Justice A, Justice B", regNo: "SCA/1/2026", orderTitle: "Order", orderDate: "20 Jul",
}]);
check("composeCaseUpdate surfaces eventDate as a human next-hearing date", !!enriched && enriched.data.nextHearingDate === "12 Aug");
check(
  "composeCaseUpdate carries stage/purpose/coram/regNo/latest-order through",
  !!enriched &&
    enriched.data.stage === "Arguments" &&
    enriched.data.purpose === "Final hearing" &&
    enriched.data.coram === "Justice A, Justice B" &&
    enriched.data.regNo === "SCA/1/2026" &&
    enriched.data.orderTitle === "Order" &&
    enriched.data.orderDate === "20 Jul",
);
// absent enrichment fields never fabricate a value — the keys are simply not present
const sparse = composeCaseUpdate([{ change: "Bench changed", title: "A v. B" }]);
check(
  "composeCaseUpdate without enrichment carries none of the new keys",
  !!sparse && !("nextHearingDate" in sparse.data) && !("stage" in sparse.data) && !("coram" in sparse.data) && !("regNo" in sparse.data),
);

// --- WO-314: a masked party's title survives maskTitle() → composeCaseUpdate as "name
// withheld" — never the raw "XXXXXXX" the court record carries (BP-24). This is the exact
// pipeline recordCaseChanges (src/lib/court/sync.ts) uses before writing the email payload. ---
const maskedInput = maskTitle("XXXXXXX v. State");
check("maskTitle converts the protected side to 'name withheld'", maskedInput === "name withheld v. State");
const maskedRow = composeCaseUpdate([{ change: "Bench changed", title: maskedInput, cnr: "CNR9", court: "HC" }]);
check(
  "a masked-party matter's caseUpdate never carries the raw XXXXXXX value",
  !!maskedRow && maskedRow.data.case === "name withheld v. State" && !/XXXXXXX/i.test(maskedRow.data.case),
);

// --- boardRow: a time-less row renders (the record carries item numbers, not clock times) ---
const board = renderDailyHearings(
  [
    { court: "Gujarat HC", courtNo: "7", parties: "A v. B" },
    { court: "City Civil", parties: "C v. D" },
  ],
  { date: "24 Jul", count: 2 },
);
check("board with one court-no-less row renders BOTH rows", !!board && /A v. B/.test(board.text) && /C v. D/.test(board.text));
check("row with a court no. keeps it", !!board && /Court 7/.test(board.text));
check("court-no-less row renders without a dangling separator", !!board && !/· ·/.test(board.text));
// court+parties still required — a row with parties only never fakes a court
const bare = renderDailyHearings([{ parties: "Only parties" }], { date: "24 Jul", count: 1 });
check("row without court is dropped (board empty → null)", bare === null);

// --- renderNotice: fallback shell honesty ---
const notice = renderNotice(
  "Deadline: reply due 2026-08-01",
  [{ text: "Reply in <A v. B> is due." }, { text: "Filed under the matter.", role: "muted" }],
  "https://app.mukadma.in/dashboard",
  "Open Mukadma",
);
check("renderNotice escapes html in lines", notice.html.includes("&lt;A v. B&gt;"));
check("renderNotice carries the disclaimer", /verify against the official record/.test(notice.html));
check("renderNotice text part carries subject + cta url", /Deadline: reply due/.test(notice.text) && /https:\/\/app\.mukadma\.in\/dashboard/.test(notice.text));
check("renderNotice has one CTA link + one footer settings link", (notice.html.match(/<a /g) ?? []).length === 2);
check("no leftover {ctaUrl}", !notice.html.includes("{ctaUrl}"));
const noCta = renderNotice("Just a note", [{ text: "Body." }]);
check("renderNotice without ctaUrl carries the footer settings link only", (noCta.html.match(/<a /g) ?? []).length === 1);

// --- matterIdOf: the dead-ref guard's parser (a row must be verifiable to be guarded) ---
const U = "9cd1b8e6-4e2b-444c-ad93-9686eb23ef91";
check("matterIdOf reads explicit matterId", matterIdOf({ matterId: U }) === U);
check("matterIdOf reads matter:<uuid> ref", matterIdOf({ ref: `matter:${U}` }) === U);
check("matterIdOf prefers explicit matterId over ref", matterIdOf({ matterId: U, ref: "matter:other" }) === U);
check("non-matter ref → undefined", matterIdOf({ ref: `deadline:${U}` }) === undefined);
check("non-uuid ref suffix → undefined", matterIdOf({ ref: "matter:not-a-uuid" }) === undefined);
check("empty payload → undefined", matterIdOf({}) === undefined);
// jsonb is untrusted — non-string shapes must parse to undefined, never throw (review must-fix #2)
check("non-string ref (number) → undefined, no throw", matterIdOf({ ref: 42 as unknown as string }) === undefined);
check("non-string ref (object) → undefined, no throw", matterIdOf({ ref: { x: 1 } as unknown as string }) === undefined);
check("non-string matterId → undefined, no throw", matterIdOf({ matterId: 7 as unknown as string }) === undefined);

// --- appUrl ---
check("appUrl joins cleanly", /^https:\/\/.+\/dashboard\/calendar$/.test(appUrl("/dashboard/calendar")));

console.log(ok ? "WO264 NOTIFY: PASS" : "WO264 NOTIFY: FAIL");
process.exit(ok ? 0 : 1);
