// Test: email send-path wiring (WO-264) — the send RULES, offline.
// No live services. Run: npx tsx tests/wo264_notify.ts
// Guards: the IST when-label closed set + stale-skip, the caseUpdate roundup honesty
// (real titles folded, nothing fabricated), the listingNoTime fallback (a time-less
// court row renders — the record carries item numbers, not clock times), and the
// renderNotice fallback shell (escaping, disclaimer, text part, single CTA link).
import { hearingWhenLabel, istDate, istFriendlyDate, composeCaseUpdate, appUrl, matterIdOf } from "@/lib/notify/email-render";
import { renderNotice, renderDailyHearings, renderEmail } from "@/lib/email/templates";

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
// worst-case label keeps the subject ≤ 6 words
const worst = renderEmail("hearingReminder", { when: hearingWhenLabel(istDate(365)) ?? "", case: "X v. Y", court: "C", cnr: "Z" });
check("hearingReminder worst-case subject ≤ 6 words", !!worst && worst.subject.trim().split(/\s+/).length <= 6);
// missing purpose → detail line drops, email still sends
const noPurpose = renderEmail("hearingReminder", { when: "tomorrow", case: "X v. Y", court: "C", cnr: "Z" });
check("hearingReminder without purpose still sends, detail dropped", !!noPurpose && !/Purpose on the record/.test(noPurpose.text));

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

// --- listingNoTime: a time-less row renders; a timed row still prefers the timed line ---
const board = renderDailyHearings(
  [
    { court: "Gujarat HC · Court 7", time: "11:00", parties: "A v. B" },
    { court: "City Civil · Court 3", parties: "C v. D" },
  ],
  { date: "24 Jul", count: 2 },
);
check("board with one time-less row renders BOTH rows", !!board && /A v. B/.test(board.text) && /C v. D/.test(board.text));
check("timed row keeps its time", !!board && /11:00/.test(board.text));
check("time-less row uses the no-time line (no dangling separator)", !!board && !/Court 3 · +—/.test(board.text));
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
check("renderNotice has exactly one link", (notice.html.match(/<a /g) ?? []).length === 1);
check("no leftover {ctaUrl}", !notice.html.includes("{ctaUrl}"));
const noCta = renderNotice("Just a note", [{ text: "Body." }]);
check("renderNotice without ctaUrl has zero links", !/<a /.test(noCta.html));

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
