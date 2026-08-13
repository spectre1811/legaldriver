// Test: transactional email templates — subject budget + slot-drop honesty (WO-148 W2, WO-414 v3.1 rework).
// No live services. Run: npx tsx tests/wo148_email.ts
// Emails are ENGLISH ONLY (founder directive 2026-07-18) — there is no HI locale to check; the HI
// catalog carries no emails.* keys (tests/i18n_coverage.ts EN_ONLY guards that). This file guards:
// subjects ≤ 78 chars (the Gmail truncation point — v3.1 subjects carry the case title by design and
// exceed 6 words), the money/count honesty rule (a missing aggregate DROPS, never a fake 0), the
// dailyHearings never-sent-empty send rule, the link budget (one CTA + one footer settings link), and
// the Gmail 102KB clip budget.
import { renderEmail, renderDailyHearings, EMAIL_KEYS, EMAIL_META, type EmailKey, type EmailData } from "@/lib/email/templates";
import type { Slot } from "@/i18n/comms";

let ok = true;
const check = (name: string, cond: boolean) => {
  if (!cond) ok = false;
  console.log(`${cond ? "ok  " : "FAIL"}: ${name}`);
};

// Full sample data so every subject slot fills (a subject that can't fill = no email). Enriched
// with the v3.1 slot set (prev-hearing, changes, stats deltas) so the new roles are exercised —
// today's payloads drop those slots until WO-415, and the slot-drop checks below prove they drop cleanly.
const SAMPLE: Record<EmailKey, EmailData> = {
  welcome: { name: "Adv. Maheshwari" },
  assembled: { matters: 34, hearings: 12, orders: 3 },
  dailyHearings: { date: "24 Jul", count: 2 },
  weekly: { hearings: 5, orders: 2, filings: 3, collected: "85,000" },
  invoice: { advocate: "Adv. Yash Maheshwari", invoice: "INV-2026-041", amount: "45,000", description: "professional fees, June" },
  receipt: { amount: "45,000", invoice: "INV-2026-041" },
  syncFailure: { misses: 2, since: "22 Jul" },
  security: { code: "418 293" },
  // WO-314 fields (next hearing / stage / purpose / full coram / regNo / latest order) + the v3.1
  // enriched diff slots (prevHearingDate / prevCoram / deltaDays). `change` is a caller-supplied
  // closed-set label — "New order uploaded" is the longest realistic one.
  caseUpdate: {
    change: "New order uploaded", case: "Patel v. State", court: "Gujarat HC", cnr: "GJHC010012342026",
    detail: "Next hearing on 12 Aug.", nextHearingDate: "12 Aug", stage: "Arguments", purpose: "Final hearing",
    coram: "Justice A. Shah, Justice B. Mehta", regNo: "SCA/1234/2026", orderTitle: "Order", orderDate: "20 Jul",
  },
  trackConfirm: { case: "Shah v. Mehta", court: "City Civil", stage: "Evidence", status: "active", nextHearingDate: "5 Aug", coram: "Judge R. Iyer" },
  // {when} is a closed-set send-time label; "in 365 days" is the longest form. + the enriched
  // dateBanner + changes slots so those roles render in the sweep.
  hearingReminder: {
    when: "in 365 days", case: "Patel v. State", court: "Gujarat HC", cnr: "GJHC010012342026", purpose: "Arguments",
    date: "30 Jul", courtNo: "7", stage: "Arguments", dayNum: "30", month: "JUL", fullDate: "Thursday, 30 July 2026",
    lastListed: "22 Jul — Arguments (adjourned)", latestOrder: "Order on Civil Application No. 9 · 26 Jul", prevPurpose: "Hearing",
  },
  disposalNotice: { change: "No next date on record", case: "Meena Desai v. Kiran Desai", court: "Family Court, Vadodara", stage: "Fresh", cnr: "GJVD020098412026", prevHearingDate: "12 Aug" },
};

const HEARING_ROWS: EmailData[] = [
  { court: "Gujarat HC", courtNo: "7", parties: "Patel v. State" },
  { court: "City Civil", courtNo: "3", parties: "Shah v. Mehta" },
];

const render = (k: EmailKey, data: EmailData) =>
  k === "dailyHearings"
    ? renderDailyHearings(HEARING_ROWS, { date: data.date, count: data.count, orders: 2 })
    : renderEmail(k, data);

// --- every key has trigger/timing metadata (the "which email, when" matrix, nothing orphaned) ---
check("EMAIL_META covers every key", EMAIL_KEYS.every((k) => !!EMAIL_META[k]?.trigger && !!EMAIL_META[k]?.timing));

// --- subject ≤ 78 chars (rendered, so interpolated subjects count truly; 78 = Gmail truncation) ---
for (const k of EMAIL_KEYS) {
  const r = render(k, SAMPLE[k]);
  check(`${k}.subject renders`, r !== null);
  if (r) check(`${k}.subject ≤ 78 chars ("${r.subject}" = ${r.subject.length})`, r.subject.length <= 78);
}

// --- honesty: missing money/count aggregates DROP their stat cell; never a fabricated 0 ---
const partial = renderEmail("weekly", { hearings: 5, orders: 2 }); // no filings/collected/deltas
check("weekly renders with partial data", partial !== null);
if (partial) {
  check("dropped money cell absent (no 'Collected')", !/Collected/.test(partial.text));
  check("dropped filings cell absent (no 'Filings due')", !/Filings due/.test(partial.text));
  check("no fabricated ₹0 / '0 filings'", !/₹0\b|\b0 filings\b/.test(partial.text));
  check("surviving stat cells still present (Hearings)", /Hearings/.test(partial.text));
}

// --- numeric 0 is REAL and shows (genuinely-zero ≠ missing) ---
const zero = renderEmail("assembled", { matters: 0, hearings: 0, orders: 0 });
check("assembled renders with genuine zeros", zero !== null);
if (zero) check("genuine 0 shows, not dropped", /\b0 Matters\b/.test(zero.text));

// --- dailyHearings NEVER sent empty: no surviving row → null (the send rule, enforced) ---
const emptyBoard = renderDailyHearings([{ court: null, parties: null }], { date: "24 Jul", count: 0 });
check("dailyHearings with no survivable row → null (never sent empty)", emptyBoard === null);
const fullBoard = renderDailyHearings(HEARING_ROWS, { date: "24 Jul", count: 2, orders: 2 });
check("dailyHearings with rows renders", !!fullBoard && /Patel v. State/.test(fullBoard.text));

// --- a subject that can't fill → no email (never a hole in the subject line) ---
check("missing subject slot → null (no email)", renderEmail("assembled", { matters: null, hearings: 1, orders: 1 }) === null);
// caseUpdate subject carries {change} + {case} — drop either and there's no honest subject.
check("caseUpdate missing subject slot → null", renderEmail("caseUpdate", { change: null, case: "X", court: "Y", cnr: "Z", detail: "d" }) === null);
// a missing BODY slot only drops that line — the email still sends (welcome subject has a slotless fallback).
check("missing body slot drops the line, email still sends", renderEmail("welcome", { name: null }) !== null);

// --- Gmail 102KB clip budget: every rendered email stays well under ---
for (const k of EMAIL_KEYS) {
  const r = render(k, SAMPLE[k]);
  const bytes = r ? Buffer.byteLength(r.html, "utf8") : 0;
  check(`${k} html < 100KB (${bytes} bytes)`, bytes < 100_000);
}

// --- link budget (v3.1 contract): one CTA link + one footer settings link; no-CTA templates carry the footer link only ---
const withCta = renderEmail("welcome", { name: "Adv. X" }, "https://app.mukadma.in/dashboard/onboarding");
check("cta link is the passed url", !!withCta && withCta.html.includes("https://app.mukadma.in/dashboard/onboarding"));
check("no leftover {ctaUrl} placeholder", !!withCta && !withCta.html.includes("{ctaUrl}"));
check("welcome has one CTA link + one footer settings link", !!withCta && (withCta.html.match(/<a /g) ?? []).length === 2);
// the footer settings link is a REAL route, never a bare "#"
check("footer settings link points at /dashboard/settings", !!withCta && withCta.html.includes("/dashboard/settings"));
// no-CTA emails (receipt/syncFailure/security) carry the footer settings link only
for (const k of ["receipt", "syncFailure", "security"] as const) {
  const r = renderEmail(k, SAMPLE[k]);
  check(`${k} carries the footer settings link only`, !!r && (r.html.match(/<a /g) ?? []).length === 1);
}

// --- caseUpdate carries the record's facts + a "what changed" diff (WO-314 fields, v3.1 roles) ---
const caseUpdateFull = renderEmail("caseUpdate", SAMPLE.caseUpdate);
check("caseUpdate carries next hearing date", !!caseUpdateFull && /Next hearing · 12 Aug/.test(caseUpdateFull.text));
check("caseUpdate carries stage", !!caseUpdateFull && /Stage: Arguments/.test(caseUpdateFull.text));
check("caseUpdate carries purpose", !!caseUpdateFull && /Final hearing/.test(caseUpdateFull.text));
check("caseUpdate carries the FULL coram, not judges[0]", !!caseUpdateFull && /Coram: Justice A\. Shah, Justice B\. Mehta/.test(caseUpdateFull.text));
check("caseUpdate carries the registration number", !!caseUpdateFull && /Reg\. No\.: SCA\/1234\/2026/.test(caseUpdateFull.text));
check("caseUpdate carries the latest order in the changes block", !!caseUpdateFull && /New: Order of SCA\/1234\/2026 · uploaded 20 Jul/.test(caseUpdateFull.text));

// absent enrichment fields degrade gracefully — the email still sends with fewer lines,
// never a fabricated value (a bench-change alert with no known next date must not print one).
const caseUpdateSparse = renderEmail("caseUpdate", { change: "Bench changed", case: "Patel v. State", court: "Gujarat HC", cnr: "GJHC010012342026" });
check("caseUpdate with absent enrichment fields still sends", caseUpdateSparse !== null);
if (caseUpdateSparse) {
  check("caseUpdate sparse: no next-hearing callout", !/Next hearing/.test(caseUpdateSparse.text));
  check("caseUpdate sparse: no stage fact", !/Stage:/.test(caseUpdateSparse.text));
  check("caseUpdate sparse: no coram fact", !/Coram:/.test(caseUpdateSparse.text));
  check("caseUpdate sparse: no registration fact", !/Reg\. No\./.test(caseUpdateSparse.text));
  check("caseUpdate sparse: no changes block (no diff slots)", !/uploaded/.test(caseUpdateSparse.text));
}

// --- trackConfirm carries stage / status / next hearing / coram (fact table) ---
const trackFull = renderEmail("trackConfirm", SAMPLE.trackConfirm);
check("trackConfirm carries stage", !!trackFull && /Stage: Evidence/.test(trackFull.text));
check("trackConfirm carries status", !!trackFull && /Status: active/.test(trackFull.text));
check("trackConfirm carries next hearing", !!trackFull && /Next hearing: 5 Aug/.test(trackFull.text));
check("trackConfirm carries coram", !!trackFull && /Coram: Judge R\. Iyer/.test(trackFull.text));

// --- hearingReminder carries the date banner + court number + stage (v3.1 roles) ---
const reminderFull = renderEmail("hearingReminder", SAMPLE.hearingReminder);
check("hearingReminder carries the date banner (full date)", !!reminderFull && /30 July 2026/.test(reminderFull.text));
check("hearingReminder carries the court number (banner note)", !!reminderFull && /Court No\. 7/.test(reminderFull.text));
check("hearingReminder carries stage", !!reminderFull && /Stage: Arguments/.test(reminderFull.text));

// --- dailyHearings board rows carry CNR / stage / court no. + purpose (boardRow role) ---
const enrichedRows: EmailData[] = [
  { court: "Gujarat HC", courtNo: "7", parties: "Patel v. State", cnr: "GJHC010012342026", stage: "Arguments", purpose: "Final hearing" },
];
const enrichedBoard = renderDailyHearings(enrichedRows, { date: "24 Jul", count: 1 });
check("dailyHearings row carries CNR", !!enrichedBoard && /CNR GJHC010012342026/.test(enrichedBoard.text));
check("dailyHearings row carries stage", !!enrichedBoard && /Stage: Arguments/.test(enrichedBoard.text));
check("dailyHearings row carries court no. + purpose", !!enrichedBoard && /Court 7 · Final hearing/.test(enrichedBoard.text));

// a row missing cnr/stage/purpose still renders its core listing line — one absent sub-field
// never drops the court/parties line (each sub-line is independently droppable).
const partialRow = renderDailyHearings([{ court: "City Civil", courtNo: "3", parties: "Shah v. Mehta" }], { date: "24 Jul", count: 1 });
check("dailyHearings row without enrichment still renders its core listing", !!partialRow && /Shah v\. Mehta/.test(partialRow.text));
check("dailyHearings row without enrichment carries no CNR line", !!partialRow && !/CNR /.test(partialRow.text));

// silence the unused import lint if Slot ever drops out of use
const _slotType: Slot = null;
void _slotType;

console.log(ok ? "WO148 EMAIL: PASS" : "WO148 EMAIL: FAIL");
process.exit(ok ? 0 : 1);
