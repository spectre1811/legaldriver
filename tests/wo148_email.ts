// Test: transactional email templates — subject caps + slot-drop honesty (WO-148 W2).
// No live services. Run: npx tsx tests/wo148_email.ts
// EN/HI key parity for emails.* is covered by tests/i18n_coverage.ts. This file guards what
// that can't see: subjects ≤ 6 words in BOTH languages (comms-catalog-v2 global rule, enforced
// here not in review), the money/count honesty rule (a missing aggregate DROPS, never a fake 0),
// the digest empty-board fallback, and the Gmail 102KB clip budget.
import { renderEmail, renderDigest, EMAIL_KEYS, type EmailKey, type EmailData } from "@/lib/email/templates";
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
  digest: { date: "24 Jul", matters: 3 },
  weekly: { hearings: 5, orders: 2, filings: 3, invoiced: "1,20,000", collected: "85,000", briefs: 2 },
  invoice: { advocate: "Adv. Yash Maheshwari", clientName: "Nirav-ji", invoice: "INV-2026-041", amount: "45,000", description: "professional fees, June" },
  receipt: { amount: "45,000", invoice: "INV-2026-041" },
  syncFailure: { misses: 2, since: "22 Jul" },
  security: { code: "418 293" },
};

const words = (s: string) => s.trim().split(/\s+/).length;
const render = (k: EmailKey, data: EmailData, locale: "en" | "hi") =>
  k === "digest"
    ? renderDigest([{ court: "GJ HC · 7 · 14", parties: "Patel v. State", stage: "Final" }], { date: data.date, matters: data.matters, orders: 2 }, locale)
    : renderEmail(k, data, locale);

// --- subject ≤ 6 words, both languages (rendered, so interpolated subjects count truly) ---
for (const locale of ["en", "hi"] as const) {
  for (const k of EMAIL_KEYS) {
    const r = render(k, SAMPLE[k], locale);
    check(`${k}.subject renders [${locale}]`, r !== null);
    if (r) check(`${k}.subject ≤ 6 words [${locale}] ("${r.subject}" = ${words(r.subject)})`, words(r.subject) <= 6);
  }
}

// --- honesty: missing money/count aggregates DROP their line; never a fabricated 0 ---
const partial = renderEmail("weekly", { hearings: 5, orders: 2, briefs: 2 }, "en"); // no filings/invoiced/collected
check("weekly renders with partial data", partial !== null);
if (partial) {
  check("dropped money line absent (no '₹' invoiced/collected block)", !/invoiced|collected/.test(partial.text));
  check("dropped filings line absent", !/filings due/.test(partial.text));
  check("no fabricated ₹0 / '0 filings'", !/₹0\b|\b0 filings\b/.test(partial.text));
  check("surviving lines still present (hearings attended)", /hearings attended/.test(partial.text));
}

// --- numeric 0 is REAL and shows (genuinely-zero ≠ missing) ---
const zero = renderEmail("assembled", { matters: 0, hearings: 0, orders: 0 }, "en");
check("assembled renders with genuine zeros", zero !== null);
if (zero) check("genuine 0 shows, not dropped", /0 matters synced/.test(zero.text));

// --- digest empty-board fallback (no rows survive) ---
const emptyBoard = renderDigest([{ court: null, parties: null, stage: null }], { date: "Fri 24 Jul", matters: 0 }, "en");
check("digest with no survivable row → honest empty line", !!emptyBoard && /Diary is clear/.test(emptyBoard.text));

// --- a subject that can't fill → no email (never a hole in the subject line) ---
// assembled's subject carries {matters}; drop it and there is no honest email to send.
check("missing subject slot → null (no email)", renderEmail("assembled", { matters: null, hearings: 1, orders: 1 }, "en") === null);
// a missing BODY slot only drops that line — the email still sends (welcome subject is slotless).
check("missing body slot drops the line, email still sends", renderEmail("welcome", { name: null }, "en") !== null);

// --- Gmail 102KB clip budget: every rendered email stays well under ---
for (const k of EMAIL_KEYS) {
  const r = render(k, SAMPLE[k], "en");
  const bytes = r ? Buffer.byteLength(r.html, "utf8") : 0;
  check(`${k} html < 100KB (${bytes} bytes)`, bytes < 100_000);
}

// --- ctaUrl is the ONLY link, and it's a real one the caller passes (never faked) ---
const withCta = renderEmail("welcome", { name: "Adv. X" }, "en", "https://app.mukadma.in/matters/new");
check("cta link is the passed url", !!withCta && withCta.html.includes("https://app.mukadma.in/matters/new"));
check("no leftover {ctaUrl} placeholder", !!withCta && !withCta.html.includes("{ctaUrl}"));

// silence the unused import lint if Slot ever drops out of use
const _slotType: Slot = null;
void _slotType;

console.log(ok ? "WO148 EMAIL: PASS" : "WO148 EMAIL: FAIL");
process.exit(ok ? 0 : 1);
