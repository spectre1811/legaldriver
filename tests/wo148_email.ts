// Test: transactional email templates — subject caps + slot-drop honesty (WO-148 W2, English-only rework).
// No live services. Run: npx tsx tests/wo148_email.ts
// Emails are ENGLISH ONLY (founder directive 2026-07-18) — there is no HI locale to check; the HI
// catalog carries no emails.* keys (tests/i18n_coverage.ts EN_ONLY guards that). This file guards:
// subjects ≤ 6 words (comms-catalog-v2 global rule, enforced here not in review), the money/count
// honesty rule (a missing aggregate DROPS, never a fake 0), the dailyHearings never-sent-empty send
// rule, and the Gmail 102KB clip budget.
import { renderEmail, renderDailyHearings, EMAIL_KEYS, EMAIL_META, type EmailKey, type EmailData } from "@/lib/email/templates";
import type { Slot } from "@/i18n/comms";

let ok = true;
const check = (name: string, cond: boolean) => {
  if (!cond) ok = false;
  console.log(`${cond ? "ok  " : "FAIL"}: ${name}`);
};

// Full sample data so every subject slot fills (a subject that can't fill = no email).
const SAMPLE: Record<EmailKey, EmailData> = {
  welcome: { name: "Adv. Maheshwari" },
  assembled: { matters: 34, hearings: 12, orders: 3 },
  dailyHearings: { date: "24 Jul", count: 2 },
  weekly: { hearings: 5, orders: 2, filings: 3, invoiced: "1,20,000", collected: "85,000", briefs: 2 },
  invoice: { advocate: "Adv. Yash Maheshwari", clientName: "Nirav-ji", invoice: "INV-2026-041", amount: "45,000", description: "professional fees, June" },
  receipt: { amount: "45,000", invoice: "INV-2026-041" },
  syncFailure: { misses: 2, since: "22 Jul" },
  security: { code: "418 293" },
  // `change` is a caller-supplied CLOSED-SET label — the 3 longest are "Next hearing set" /
  // "Case disposed" / "New order uploaded"; sample the longest so the ≤6-word subject cap
  // ("{change} on a tracked case") is proven for the worst realistic input, not a lucky one.
  // WO-314: enriched with the producer-widened fields (next hearing / stage / purpose / full
  // coram / registration no. / latest order) — none of these are subject slots, so they can't
  // affect the ≤6-word cap; the sweep below proves that.
  caseUpdate: {
    change: "New order uploaded", case: "Patel v. State", court: "Gujarat HC", cnr: "GJHC010012342026",
    detail: "Next hearing on 12 Aug.", nextHearingDate: "12 Aug", stage: "Arguments", purpose: "Final hearing",
    coram: "Justice A. Shah, Justice B. Mehta", regNo: "SCA/1234/2026", orderTitle: "Order", orderDate: "20 Jul",
  },
  trackConfirm: { case: "Shah v. Mehta", court: "City Civil", stage: "Evidence", status: "active", nextHearingDate: "5 Aug", coram: "Judge R. Iyer" },
  // {when} is a closed-set send-time label (WO-264); "in 365 days" is the longest form,
  // so the ≤6-word subject cap is proven at the worst case, not a lucky sample.
  // WO-314: + the actual date / court number / stage — {when} alone never said WHEN.
  hearingReminder: { when: "in 365 days", case: "Patel v. State", court: "Gujarat HC", cnr: "GJHC010012342026", purpose: "Arguments", date: "30 Jul", courtNo: "7", stage: "Arguments" },
};

const HEARING_ROWS: EmailData[] = [
  { court: "Gujarat HC · Court 7", time: "11:00", parties: "Patel v. State" },
  { court: "City Civil · Court 3", time: "02:30", parties: "Shah v. Mehta" },
];

const words = (s: string) => s.trim().split(/\s+/).length;
const render = (k: EmailKey, data: EmailData) =>
  k === "dailyHearings"
    ? renderDailyHearings(HEARING_ROWS, { date: data.date, count: data.count, orders: 2 })
    : renderEmail(k, data);

// --- every key has trigger/timing metadata (the "which email, when" matrix, nothing orphaned) ---
check("EMAIL_META covers every key", EMAIL_KEYS.every((k) => !!EMAIL_META[k]?.trigger && !!EMAIL_META[k]?.timing));

// --- subject ≤ 6 words (rendered, so interpolated subjects count truly) ---
for (const k of EMAIL_KEYS) {
  const r = render(k, SAMPLE[k]);
  check(`${k}.subject renders`, r !== null);
  if (r) check(`${k}.subject ≤ 6 words ("${r.subject}" = ${words(r.subject)})`, words(r.subject) <= 6);
}

// --- honesty: missing money/count aggregates DROP their line; never a fabricated 0 ---
const partial = renderEmail("weekly", { hearings: 5, orders: 2, briefs: 2 }); // no filings/invoiced/collected
check("weekly renders with partial data", partial !== null);
if (partial) {
  check("dropped money line absent (no '₹' invoiced/collected block)", !/invoiced|collected/.test(partial.text));
  check("dropped filings line absent", !/filings due/.test(partial.text));
  check("no fabricated ₹0 / '0 filings'", !/₹0\b|\b0 filings\b/.test(partial.text));
  check("surviving lines still present (hearings attended)", /hearings attended/.test(partial.text));
}

// --- numeric 0 is REAL and shows (genuinely-zero ≠ missing) ---
const zero = renderEmail("assembled", { matters: 0, hearings: 0, orders: 0 });
check("assembled renders with genuine zeros", zero !== null);
if (zero) check("genuine 0 shows, not dropped", /0 matters synced/.test(zero.text));

// --- dailyHearings NEVER sent empty: no surviving row → null (the send rule, enforced) ---
const emptyBoard = renderDailyHearings([{ court: null, time: null, parties: null }], { date: "24 Jul", count: 0 });
check("dailyHearings with no survivable row → null (never sent empty)", emptyBoard === null);
const fullBoard = renderDailyHearings(HEARING_ROWS, { date: "24 Jul", count: 2, orders: 2 });
check("dailyHearings with rows renders", !!fullBoard && /Patel v. State/.test(fullBoard.text));

// --- a subject that can't fill → no email (never a hole in the subject line) ---
check("missing subject slot → null (no email)", renderEmail("assembled", { matters: null, hearings: 1, orders: 1 }) === null);
// caseUpdate subject carries {change} + {case} — drop either and there's no honest subject.
check("caseUpdate missing subject slot → null", renderEmail("caseUpdate", { change: null, case: "X", court: "Y", cnr: "Z", detail: "d" }) === null);
// a missing BODY slot only drops that line — the email still sends (welcome subject is slotless).
check("missing body slot drops the line, email still sends", renderEmail("welcome", { name: null }) !== null);

// --- Gmail 102KB clip budget: every rendered email stays well under ---
for (const k of EMAIL_KEYS) {
  const r = render(k, SAMPLE[k]);
  const bytes = r ? Buffer.byteLength(r.html, "utf8") : 0;
  check(`${k} html < 100KB (${bytes} bytes)`, bytes < 100_000);
}

// --- ctaUrl is the ONLY link, and it's a real one the caller passes (never faked) ---
const withCta = renderEmail("welcome", { name: "Adv. X" }, "https://app.mukadma.in/dashboard/onboarding");
check("cta link is the passed url", !!withCta && withCta.html.includes("https://app.mukadma.in/dashboard/onboarding"));
check("no leftover {ctaUrl} placeholder", !!withCta && !withCta.html.includes("{ctaUrl}"));
// exactly one <a> link per message (copy-catalog: one link per email)
check("welcome has exactly one link", !!withCta && (withCta.html.match(/<a /g) ?? []).length === 1);
// no-CTA emails (receipt/syncFailure/security) carry zero links
for (const k of ["receipt", "syncFailure", "security"] as const) {
  const r = renderEmail(k, SAMPLE[k]);
  check(`${k} has no CTA link`, !!r && !/<a /.test(r.html));
}

// --- WO-314: caseUpdate carries next hearing / stage / purpose / FULL coram / regNo / latest order ---
const caseUpdateFull = renderEmail("caseUpdate", SAMPLE.caseUpdate);
check("caseUpdate carries next hearing date", !!caseUpdateFull && /Next hearing: 12 Aug/.test(caseUpdateFull.text));
check("caseUpdate carries stage", !!caseUpdateFull && /Stage: Arguments/.test(caseUpdateFull.text));
check("caseUpdate carries purpose", !!caseUpdateFull && /Purpose: Final hearing/.test(caseUpdateFull.text));
check("caseUpdate carries the FULL coram, not judges[0]", !!caseUpdateFull && /Coram: Justice A\. Shah, Justice B\. Mehta/.test(caseUpdateFull.text));
check("caseUpdate carries the registration number", !!caseUpdateFull && /Registration No\. SCA\/1234\/2026/.test(caseUpdateFull.text));
check("caseUpdate carries the latest order", !!caseUpdateFull && /Latest order: Order · 20 Jul/.test(caseUpdateFull.text));

// absent enrichment fields degrade gracefully — the email still sends with fewer lines,
// never a fabricated value (a bench-change alert with no known next date must not print one).
const caseUpdateSparse = renderEmail("caseUpdate", { change: "Bench changed", case: "Patel v. State", court: "Gujarat HC", cnr: "GJHC010012342026" });
check("caseUpdate with absent enrichment fields still sends", caseUpdateSparse !== null);
if (caseUpdateSparse) {
  check("caseUpdate sparse: no next-hearing line", !/Next hearing:/.test(caseUpdateSparse.text));
  check("caseUpdate sparse: no stage line", !/Stage:/.test(caseUpdateSparse.text));
  check("caseUpdate sparse: no coram line", !/Coram:/.test(caseUpdateSparse.text));
  check("caseUpdate sparse: no registration line", !/Registration No\./.test(caseUpdateSparse.text));
  check("caseUpdate sparse: no latest-order line", !/Latest order:/.test(caseUpdateSparse.text));
}

// --- WO-314: trackConfirm carries stage / status / next hearing / coram (was title + court only) ---
const trackFull = renderEmail("trackConfirm", SAMPLE.trackConfirm);
check("trackConfirm carries stage", !!trackFull && /Stage: Evidence/.test(trackFull.text));
check("trackConfirm carries status", !!trackFull && /Status: active/.test(trackFull.text));
check("trackConfirm carries next hearing", !!trackFull && /Next hearing: 5 Aug/.test(trackFull.text));
check("trackConfirm carries coram", !!trackFull && /Coram: Judge R\. Iyer/.test(trackFull.text));

// --- WO-314: hearingReminder carries the actual date + court number + stage, not just {when} ---
const reminderFull = renderEmail("hearingReminder", SAMPLE.hearingReminder);
check("hearingReminder carries the actual date", !!reminderFull && /Listed on 30 Jul/.test(reminderFull.text));
check("hearingReminder carries the court number", !!reminderFull && /Court No\. 7/.test(reminderFull.text));
check("hearingReminder carries stage", !!reminderFull && /Stage: Arguments/.test(reminderFull.text));

// --- WO-314: dailyHearings carries CNR (was SELECTed, never bound), purpose, court item, stage ---
const enrichedRows: EmailData[] = [
  { court: "Gujarat HC · Court 7", time: "11:00", parties: "Patel v. State", cnr: "GJHC010012342026", stage: "Arguments", courtNo: "7", purpose: "Final hearing" },
];
const enrichedBoard = renderDailyHearings(enrichedRows, { date: "24 Jul", count: 1 });
check("dailyHearings row carries CNR", !!enrichedBoard && /CNR GJHC010012342026/.test(enrichedBoard.text));
check("dailyHearings row carries stage", !!enrichedBoard && /Stage: Arguments/.test(enrichedBoard.text));
check("dailyHearings row carries court no. + purpose", !!enrichedBoard && /Court 7 · Purpose: Final hearing/.test(enrichedBoard.text));

// a row missing cnr/stage/purpose still renders its core listing line — one absent sub-field
// never drops the court/parties line (each sub-line is independently droppable).
const partialRow = renderDailyHearings([{ court: "City Civil · Court 3", time: "02:30", parties: "Shah v. Mehta" }], { date: "24 Jul", count: 1 });
check("dailyHearings row without enrichment still renders its core listing", !!partialRow && /Shah v\. Mehta/.test(partialRow.text));
check("dailyHearings row without enrichment carries no CNR line", !!partialRow && !/CNR /.test(partialRow.text));

// silence the unused import lint if Slot ever drops out of use
const _slotType: Slot = null;
void _slotType;

console.log(ok ? "WO148 EMAIL: PASS" : "WO148 EMAIL: FAIL");
process.exit(ok ? 0 : 1);
