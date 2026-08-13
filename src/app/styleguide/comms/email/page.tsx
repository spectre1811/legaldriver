import { renderEmail, renderDailyHearings, EMAIL_KEYS, EMAIL_META, type EmailKey, type EmailData } from "@/lib/email/templates";

// SAMPLE-flagged preview of the transactional email set (email-templates-v3.1, the founder-approved
// Chambers gallery). ENGLISH ONLY (founder directive 2026-07-18) — no Hindi column. Every template
// renders through renderEmail/renderDailyHearings from clearly-labelled sample data — never real user
// data (copy-deck §8). Each email's own inline-styled HTML renders isolated in an <iframe srcDoc> so
// what you see is exactly what a mail client receives. Dev/design route, noindex. ← founder reviews
// this before merge.
//
// WO-414 F2: each template renders TWICE — "Today's payload" (only slots today's producer actually
// carries) beside "With WO-415 enrichment" (the wider slot set) — so the founder signs off on what
// SHIPS, not an artifact production cannot send. TODAY is derived from the real payload shape
// (recordCaseChanges + the WO-314 widening), not by hand-deleting a few keys.
export const metadata = {
  title: "Transactional emails · SAMPLE",
  robots: { index: false, follow: false },
};

// TODAY: only slots today's payload carries. WO-415-only slots (prevHearingDate/prevCoram/deltaDays,
// date-banner parts, stats deltas, board lastListed, multi-court note, OTP device/city) are absent.
const TODAY: Record<EmailKey, EmailData> = {
  welcome: { name: "Kavita" },
  assembled: { matters: 23, hearings: 9, orders: 41 },
  dailyHearings: { date: "12 Aug", count: 3 },
  weekly: { hearings: 7, orders: 4, filings: 2, collected: "48,000" },
  invoice: { advocate: "Adv. Kavita Joshi", invoice: "INV-0042", amount: "18,500", description: "Drafting & appearance, August 2026" },
  receipt: { amount: "18,500", invoice: "INV-0042" },
  syncFailure: { misses: 2, since: "Sunday, 9 August" },
  security: { code: "482913" },
  caseUpdate: {
    change: "New order", case: "Rajesh Sharma v. State of Gujarat", court: "High Court of Gujarat",
    cnr: "GJHC240067892023", regNo: "SCA/12034/2023", stage: "Arguments", purpose: "Final Hearing",
    coram: "Justice A. Y. Desai, Justice R. M. Sareen", nextHearingDate: "14 Aug",
    orderTitle: "Order on Civil Application No. 4 of 2026", orderDate: "11 Aug",
    detail: "Also updated today: Patel Infrastructure v. AMC.",
  },
  trackConfirm: {
    case: "Rajesh Sharma v. State of Gujarat", court: "High Court of Gujarat", stage: "Arguments",
    status: "Pending", nextHearingDate: "14 Aug", coram: "Justice A. Y. Desai, Justice R. M. Sareen",
  },
  hearingReminder: {
    when: "tomorrow", case: "Rajesh Sharma v. State of Gujarat", court: "High Court of Gujarat",
    cnr: "GJHC240067892023", purpose: "Final Hearing", stage: "Arguments", date: "12 Aug", courtNo: "14",
  },
  disposalNotice: {
    change: "No next date on record", case: "Meena Desai v. Kiran Desai", court: "Family Court, Vadodara",
    stage: "Fresh", cnr: "GJVD020098412026",
  },
};

// ENRICHED: TODAY + the WO-415 slot set (structured changes, prev-hearing, date-banner parts, stats
// deltas, board last-listed, multi-court note, OTP device/city) so every role previews.
const ENRICHED: Record<EmailKey, EmailData> = {
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
    change: "New order", case: "Rajesh Sharma v. State of Gujarat", court: "High Court of Gujarat",
    cnr: "GJHC240067892023", regNo: "SCA/12034/2023", stage: "Arguments", purpose: "Final Hearing",
    coram: "Justice A. Y. Desai, Justice R. M. Sareen", nextHearingDate: "14 Aug", prevHearingDate: "24 Jul",
    deltaDays: "21", prevCoram: "Justice R. M. Sareen", orderTitle: "Order on Civil Application No. 4 of 2026",
    orderDate: "11 Aug", detail: "Also updated today: Patel Infrastructure v. AMC.",
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

// Board rows: TODAY carries court name + court no + purpose (the record carries item numbers, not
// clock times); ENRICHED adds lastListed (WO-415) so the boardRow sub-line previews fully.
const BOARD_TODAY: EmailData[] = [
  { parties: "Rajesh Sharma v. State of Gujarat", court: "High Court of Gujarat", courtNo: "14", purpose: "Final Hearing", cnr: "GJHC240067892023", stage: "Arguments" },
  { parties: "Patel Infrastructure Pvt. Ltd. v. Ahmedabad Municipal Corp.", court: "City Civil Court, Ahmedabad", courtNo: "3", purpose: "Evidence", cnr: "GJAH010045622024", stage: "Trial" },
  { parties: "Meena Desai v. Kiran Desai", court: "Family Court, Vadodara", courtNo: "1", purpose: "First Hearing", cnr: "GJVD020098412026", stage: "Fresh" },
];
const BOARD_ENRICHED: EmailData[] = BOARD_TODAY.map((r, i) => ({ ...r, lastListed: ["24 Jul, adjourned", "30 Jul, part-heard", "First listing"][i] }));

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

function Pane({ label, rendered }: { label: string; rendered: { subject: string; html: string } | null }) {
  if (!rendered) return <div className="text-ec-warn text-sm">— subject slot missing → no email —</div>;
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-ec-ink-3">{label}</div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-mono text-[11px] text-ec-ink-2">subject:</span>
        <span className="text-sm text-ec-ink">{rendered.subject}</span>
      </div>
      <iframe title={label} srcDoc={rendered.html} className="w-full rounded-md border border-ec-hair" style={{ height: 400 }} />
    </div>
  );
}

function EmailPreview({ tkey }: { tkey: EmailKey }) {
  const todayRendered =
    tkey === "dailyHearings"
      ? renderDailyHearings(BOARD_TODAY, { date: TODAY.dailyHearings.date, count: TODAY.dailyHearings.count, orders: 2 })
      : renderEmail(tkey, TODAY[tkey]);
  const enrichedRendered =
    tkey === "dailyHearings"
      ? renderDailyHearings(BOARD_ENRICHED, {
          date: ENRICHED.dailyHearings.date, count: ENRICHED.dailyHearings.count, orders: 2,
          multiCourtLead: "Three courts, one day",
          multiCourtDetail: "High Court (Ahmedabad), City Civil (Ahmedabad), Family Court (Vadodara). Plan the order of appearance before leaving chambers.",
        })
      : renderEmail(tkey, ENRICHED[tkey]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Pane label="Today's payload" rendered={todayRendered} />
      <Pane label="With WO-415 enrichment" rendered={enrichedRendered} />
    </div>
  );
}

export default function EmailStyleguide() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 text-ec-ink">
      <header className="mb-10 border-b border-ec-hair pb-6">
        <div className="mb-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Transactional emails</h1>
          <Badge>Sample</Badge>
          <Badge>English only</Badge>
        </div>
        <p className="text-sm text-ec-ink-2">
          The v3.1 Chambers email set — graphite masthead, honey accents, structured fact tables,
          informative subjects, preheaders, and a footer &ldquo;why you got this&rdquo; + settings link
          (founder gallery, 2026-08-11). Each template renders twice: <b>&ldquo;Today&rsquo;s payload&rdquo;</b> —
          what production actually sends — beside <b>&ldquo;With WO-415 enrichment&rdquo;</b>, the wider slot set
          that lands when the producer widens. The enriched rows (what-changed blocks, stats deltas,
          date banners, last-listed) slot-drop until then; the &ldquo;today&rdquo; column is what the founder is
          signing off on.
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
          The two columns above are the honest demo: in &ldquo;Today&rsquo;s payload&rdquo; the enriched rows drop rather
          than fake a value. Specifically — <b>caseUpdate</b> drops the what-changed block and the
          &ldquo;Hearing moved &hellip;&rdquo; diff (no prev-hearing yet); <b>disposalNotice</b> drops the
          &ldquo;Was listed &hellip;&rdquo; diff; <b>hearingReminder</b> drops the date banner and last-listed history.
          No &ldquo;₹0&rdquo;, no invented date, no half-empty line — a missing slot drops its line.
        </p>
      </section>
    </main>
  );
}
