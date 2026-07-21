import { renderEmail, renderDailyHearings, EMAIL_KEYS, EMAIL_META, type EmailKey, type EmailData } from "@/lib/email/templates";

// SAMPLE-flagged preview of the transactional email set (comms-catalog-v2 §2). ENGLISH ONLY
// (founder directive 2026-07-18) — no Hindi column. Every template renders through renderEmail/
// renderDailyHearings from clearly-labelled sample data — never real user data (copy-deck §8).
// Each email's own inline-styled HTML renders isolated in an <iframe srcDoc> so what you see is
// exactly what a mail client receives. Each carries its TRIGGER + TIMING + CTA target (the
// "which email, when" matrix). Dev/design route, noindex. ← founder reviews this before merge.
export const metadata = {
  title: "Transactional emails · SAMPLE",
  robots: { index: false, follow: false },
};

// Sample data per template (behind the SAMPLE badge, per §8). Real-shaped, obviously fake.
const SAMPLE: Record<EmailKey, EmailData> = {
  welcome: { name: "Adv. Maheshwari" },
  assembled: { matters: 34, hearings: 12, orders: 3 },
  dailyHearings: { date: "24 Jul", count: 2 },
  weekly: { hearings: 5, orders: 2, filings: 3, invoiced: "1,20,000", collected: "85,000", briefs: 2 },
  invoice: { advocate: "Adv. Yash Maheshwari", clientName: "Nirav-ji", invoice: "INV-2026-041", amount: "45,000", description: "professional fees, June" },
  receipt: { amount: "45,000", invoice: "INV-2026-041" },
  syncFailure: { misses: 2, since: "22 Jul" },
  security: { code: "418 293" },
  caseUpdate: { change: "Next hearing set", case: "Patel v. State of Gujarat", court: "Gujarat HC", cnr: "GJHC010012342026", detail: "Next hearing on 12 Aug 2026 · for filing of reply." },
  trackConfirm: { case: "Shah Traders v. Mehta Buildcon", court: "City Civil Court" },
  hearingReminder: { when: "tomorrow", case: "Patel v. State of Gujarat", court: "Gujarat HC", cnr: "GJHC010012342026", purpose: "Arguments" },
};

// One row has a clock time, one doesn't — the court record publishes item numbers, not
// times, so the time-less listingNoTime line (WO-264) is the honest NORMAL rendering.
const HEARING_ROWS: EmailData[] = [
  { court: "Gujarat HC · Court 7", time: "11:00", parties: "Patel v. State of Gujarat" },
  { court: "City Civil · Court 3", parties: "Shah Traders v. Mehta Buildcon" },
];

const LABELS: Record<EmailKey, string> = {
  welcome: "Welcome (§2a)",
  assembled: "Practice assembled (§2b)",
  dailyHearings: "Daily hearings (§2 · new #8)",
  weekly: "Weekly letter (§2d)",
  invoice: "Invoice to client (§2e)",
  receipt: "Receipt (§2f)",
  syncFailure: "Sync failure (§2g)",
  security: "Security / sign-in code (§2h)",
  caseUpdate: "Case update — tracked case (§2 · new #9)",
  trackConfirm: "Track confirmation (§2 · new #9)",
  hearingReminder: "Hearing reminder (WO-264 — previously had no format)",
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
      ? renderDailyHearings(HEARING_ROWS, { date: SAMPLE.dailyHearings.date, count: SAMPLE.dailyHearings.count, orders: 2 })
      : renderEmail(tkey, SAMPLE[tkey]);
  if (!rendered) return <div className="text-ec-warn text-sm">— subject slot missing → no email —</div>;
  const words = rendered.subject.trim().split(/\s+/).length;
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-mono text-[11px] text-ec-ink-2">subject:</span>
        <span className="text-sm text-ec-ink">{rendered.subject}</span>
        <span className={`ml-auto text-[11px] tabular-nums ${words > 6 ? "text-ec-warn" : "text-ec-ink-3"}`}>{words}/6 words</span>
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
  const dropDemo = renderEmail("weekly", { hearings: 5, orders: 2, briefs: 2 }); // no filings/invoiced/collected

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-ec-ink">
      <header className="mb-10 border-b border-ec-hair pb-6">
        <div className="mb-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Transactional emails</h1>
          <Badge>Sample</Badge>
          <Badge>English only</Badge>
        </div>
        <p className="text-sm text-ec-ink-2">
          The comms-catalog-v2 §2 email set, English only (founder directive 2026-07-18) — now including the
          hearing reminder (WO-264; founder 2026-07-22: it previously had no format). Each frame is the exact
          inline-styled HTML a mail client receives, with its trigger, timing, and CTA target. Missing slots drop
          their line — never faked; money and count lines drop rather than show a fabricated-looking 0. The live
          send path (notify + daily-hearings crons, trackConfirm) renders through these templates since WO-264;
          each &ldquo;Wiring&rdquo; note states what fires it.
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
          The weekly letter with the money and filings aggregates unavailable: those lines drop entirely. No
          &ldquo;₹0 invoiced&rdquo; that reads as either fabricated or falsely empty.
        </p>
        {dropDemo && (
          <iframe title="weekly-drop-demo" srcDoc={dropDemo.html} className="w-full rounded-md border border-ec-hair" style={{ height: 380 }} />
        )}
      </section>
    </main>
  );
}
