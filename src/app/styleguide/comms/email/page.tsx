import { renderEmail, renderDailyHearings, EMAIL_KEYS, EMAIL_META, type EmailKey, type EmailData } from "@/lib/email/templates";

// SAMPLE-flagged preview of the transactional email set (email-templates-v3.1, the founder-
// approved Chambers gallery). ENGLISH ONLY (founder directive 2026-07-18) — no Hindi column.
// Every template renders through renderEmail/renderDailyHearings from clearly-labelled sample
// data — never real user data (copy-deck §8). Each email's own inline-styled HTML renders
// isolated in an <iframe srcDoc> so what you see is exactly what a mail client receives. Each
// carries its TRIGGER + TIMING + CTA target (the "which email, when" matrix). Dev/design route,
// noindex. ← founder reviews this before merge.
export const metadata = {
  title: "Transactional emails · SAMPLE",
  robots: { index: false, follow: false },
};

// Sample data per template (behind the SAMPLE badge, per §8). Real-shaped, obviously fake —
// enriched with the full v3.1 slot set (prev-hearing, changes, stats deltas) so every role
// previews; today's payloads drop those slots until WO-415.
const SAMPLE: Record<EmailKey, EmailData> = {
  welcome: { name: "Kavita" },
  assembled: { matters: 23, hearings: 9, orders: 41 },
  dailyHearings: { date: "12 Aug", count: 3 },
  weekly: {
    hearings: 7, orders: 4, filings: 2, collected: "48,000",
    hearingsDelta: "↑2 vs last wk", ordersDelta: "→ same", filingsDelta: "next: Mon", collectedDelta: "↑₹12k",
    nextWeek: "5 hearings — first on Monday, Sharma v. State (HC, Court 14). Two filings due before Friday.",
  },
  invoice: {
    advocate: "Adv. Kavita Joshi", invoice: "INV-0042", amount: "18,500", description: "Drafting & appearance, August 2026",
    dueDate: "27 Aug 2026",
    draftingDesc: "Affidavit-in-rejoinder, SCA/12034", draftingAmount: "10,000",
    appearanceDesc: "24 Jul hearing, High Court", appearanceAmount: "8,500",
  },
  receipt: { amount: "18,500", invoice: "INV-0042" },
  syncFailure: { misses: 2, since: "Sunday, 9 August" },
  security: { code: "482913", device: "Chrome on macOS", city: "Ahmedabad, India", time: "9:02 pm IST" },
  caseUpdate: {
    change: "New order uploaded", case: "Rajesh Sharma v. State of Gujarat", court: "High Court of Gujarat",
    cnr: "GJHC240067892023", regNo: "SCA/12034/2023", stage: "Arguments", purpose: "Final Hearing", courtNo: "14",
    coram: "Justice A. Y. Desai, Justice R. M. Sareen", nextHearingDate: "14 Aug", prevHearingDate: "24 Jul",
    deltaDays: "21", prevCoram: "Justice R. M. Sareen", orderTitle: "Order on Civil Application No. 4 of 2026",
    orderDate: "11 Aug", detail: "Also updated today: Patel Infrastructure v. AMC · Desai v. Desai.",
  },
  trackConfirm: {
    case: "Rajesh Sharma v. State of Gujarat", court: "High Court of Gujarat", stage: "Arguments", status: "Pending",
    nextHearingDate: "14 Aug", coram: "Justice A. Y. Desai, Justice R. M. Sareen",
    filed: "12 Mar 2023 · 2 yr 5 mo on the docket · 11 hearings",
    under: "Gujarat Land Revenue Code §211 · Constitution Art. 226",
    parties: "Rajesh Sharma (Adv. K. Joshi) v. State of Gujarat (AGP M. Vyas)", cnr: "GJHC240067892023",
  },
  hearingReminder: {
    when: "tomorrow", case: "Rajesh Sharma v. State of Gujarat", court: "High Court of Gujarat",
    cnr: "GJHC240067892023", purpose: "Final Hearing", stage: "Arguments",
    dayNum: "12", month: "AUG", fullDate: "Wednesday, 12 August 2026", courtNo: "14",
    lastListed: "24 Jul — Arguments (adjourned)", latestOrder: "Order on Civil Application No. 4 · 8 Aug",
    prevPurpose: "Arguments",
  },
  disposalNotice: {
    change: "No next date on record", case: "Meena Desai v. Kiran Desai", court: "Family Court, Vadodara",
    stage: "Fresh", cnr: "GJVD020098412026", prevHearingDate: "12 Aug",
  },
};

// Board rows: court name + court no + purpose (the record carries item numbers, not clock times).
const HEARING_ROWS: EmailData[] = [
  { parties: "Rajesh Sharma v. State of Gujarat", court: "High Court of Gujarat", courtNo: "14", purpose: "Final Hearing", cnr: "GJHC240067892023", stage: "Arguments", lastListed: "24 Jul, adjourned" },
  { parties: "Patel Infrastructure Pvt. Ltd. v. Ahmedabad Municipal Corp.", court: "City Civil Court, Ahmedabad", courtNo: "3", purpose: "Evidence", cnr: "GJAH010045622024", stage: "Trial", lastListed: "30 Jul, part-heard" },
  { parties: "Meena Desai v. Kiran Desai", court: "Family Court, Vadodara", courtNo: "1", purpose: "First Hearing", cnr: "GJVD020098412026", stage: "Fresh", lastListed: "First listing" },
];

const LABELS: Record<EmailKey, string> = {
  welcome: "Welcome",
  assembled: "Practice assembled",
  dailyHearings: "Daily hearings board",
  weekly: "Weekly recap",
  invoice: "Invoice to client",
  receipt: "Receipt",
  syncFailure: "Sync failure",
  security: "Security / sign-in code",
  caseUpdate: "Case update — tracked case",
  trackConfirm: "Track confirmation",
  hearingReminder: "Hearing reminder",
  disposalNotice: "Disposal notice (caseUpdate variant)",
};

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm bg-ec-brass-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ec-brass-deep">
      {children}
    </span>
  );
}

// The trigger/timing/CTA line for each email — the "which email, when" the founder asked for.
function Meta({ tkey }: { tkey: EmailKey }) {
  const m = EMAIL_META[tkey];
  return (
    <dl className="mb-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[12px] text-ec-ink-2">
      <dt className="font-semibold text-ec-ink-3">Trigger</dt><dd>{m.trigger}</dd>
      <dt className="font-semibold text-ec-ink-3">When</dt><dd>{m.timing}</dd>
      <dt className="font-semibold text-ec-ink-3">CTA →</dt><dd className="font-mono">{m.cta}</dd>
      {m.wiring && (<><dt className="font-semibold text-ec-warn">Wiring</dt><dd className="text-ec-ink-3">{m.wiring}</dd></>)}
    </dl>
  );
}

function EmailPreview({ tkey }: { tkey: EmailKey }) {
  const rendered =
    tkey === "dailyHearings"
      ? renderDailyHearings(HEARING_ROWS, {
          date: SAMPLE.dailyHearings.date, count: SAMPLE.dailyHearings.count, orders: 2,
          multiCourtLead: "Three courts, one day",
          multiCourtDetail: "High Court (Ahmedabad), City Civil (Ahmedabad), Family Court (Vadodara). Plan the order of appearance before leaving chambers.",
        })
      : renderEmail(tkey, SAMPLE[tkey]);
  if (!rendered) return <div className="text-ec-warn text-sm">— subject slot missing → no email —</div>;
  const len = rendered.subject.length;
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-mono text-[11px] text-ec-ink-2">subject:</span>
        <span className="text-sm text-ec-ink">{rendered.subject}</span>
        <span className={`ml-auto text-[11px] tabular-nums ${len > 78 ? "text-ec-warn" : "text-ec-ink-3"}`}>{len}/78 chars</span>
      </div>
      <iframe
        title={tkey}
        srcDoc={rendered.html}
        className="w-full rounded-md border border-ec-hair"
        style={{ height: 400 }}
      />
    </div>
  );
}

export default function EmailStyleguide() {
  // Slot-drop demo: weekly with money aggregates unavailable — those lines drop, not a "0".
  const dropDemo = renderEmail("weekly", { hearings: 5, orders: 2 }); // no filings/collected/deltas

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-ec-ink">
      <header className="mb-10 border-b border-ec-hair pb-6">
        <div className="mb-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Transactional emails</h1>
          <Badge>Sample</Badge>
          <Badge>English only</Badge>
        </div>
        <p className="text-sm text-ec-ink-2">
          The v3.1 Chambers email set — graphite masthead, honey accents, structured fact tables,
          informative subjects, preheaders, and a footer &ldquo;why you got this&rdquo; + settings link
          (founder gallery, 2026-08-11). Each frame is the exact inline-styled HTML a mail client
          receives. Missing slots drop their line — never faked; the enriched rows (what-changed
          blocks, stats deltas, last-listed) slot-drop until WO-415 ships the wider payload.
        </p>
      </header>

      {EMAIL_KEYS.map((tkey) => (
        <section key={tkey} className="mb-12">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ec-brass-deep">{LABELS[tkey]}</h2>
          <Meta tkey={tkey} />
          <EmailPreview tkey={tkey} />
        </section>
      ))}

      <section className="mb-10">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-ec-brass-deep">Honesty rule — live</h2>
        <p className="mb-4 text-xs text-ec-ink-3">
          The weekly letter with the money and filings aggregates unavailable: those stat cells drop
          entirely. No &ldquo;₹0 collected&rdquo; that reads as either fabricated or falsely empty.
        </p>
        {dropDemo && (
          <iframe title="weekly-drop-demo" srcDoc={dropDemo.html} className="w-full rounded-md border border-ec-hair" style={{ height: 380 }} />
        )}
      </section>
    </main>
  );
}
