import { renderEmail, renderDigest, EMAIL_KEYS, type EmailKey, type EmailData } from "@/lib/email/templates";

// SAMPLE-flagged preview of the transactional email set (comms-catalog-v2 §2). Every template
// renders through renderEmail/renderDigest from clearly-labelled sample data — never real user
// data (copy-deck §8). Each email's own inline-styled HTML renders isolated in an <iframe
// srcDoc> so what you see is exactly what a mail client receives. Dev/design route, noindex.
export const metadata = {
  title: "Transactional emails · SAMPLE",
  robots: { index: false, follow: false },
};

// Sample data per template (behind the SAMPLE badge, per §8). Real-shaped, obviously fake.
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

const DIGEST_ROWS: EmailData[] = [
  { court: "Gujarat HC · Court 7 · Item 14", parties: "Patel v. State of Gujarat", stage: "Final hearing" },
  { court: "City Civil · Court 3 · Item 42", parties: "Shah Traders v. Mehta Buildcon", stage: "Evidence" },
];

const LABELS: Record<EmailKey, string> = {
  welcome: "Welcome (§2a)",
  assembled: "Practice assembled (§2b)",
  digest: "Daily digest (§2c)",
  weekly: "Weekly letter (§2d)",
  invoice: "Invoice to client (§2e)",
  receipt: "Receipt (§2f)",
  syncFailure: "Sync failure (§2g)",
  security: "Security / sign-in code (§2h)",
};

const LOCALES = ["en", "hi"] as const;

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm bg-ec-brass-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ec-brass-deep">
      {children}
    </span>
  );
}

function EmailPreview({ tkey, locale }: { tkey: EmailKey; locale: (typeof LOCALES)[number] }) {
  const rendered =
    tkey === "digest"
      ? renderDigest(DIGEST_ROWS, { date: SAMPLE.digest.date, matters: SAMPLE.digest.matters, orders: 2 }, locale)
      : renderEmail(tkey, SAMPLE[tkey], locale);
  if (!rendered) return <div className="text-ec-warn text-sm">— subject slot missing → no email —</div>;
  const words = rendered.subject.trim().split(/\s+/).length;
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-wide text-ec-ink-3">{locale === "en" ? "EN" : "हि"}</span>
        <span className="font-mono text-[11px] text-ec-ink-2">subject:</span>
        <span className="text-sm text-ec-ink">{rendered.subject}</span>
        <span className={`ml-auto text-[11px] tabular-nums ${words > 6 ? "text-ec-warn" : "text-ec-ink-3"}`}>{words}/6 words</span>
      </div>
      <iframe
        title={`${tkey}-${locale}`}
        srcDoc={rendered.html}
        className="w-full rounded-md border border-ec-hair"
        style={{ height: 380 }}
      />
    </div>
  );
}

export default function EmailStyleguide() {
  // Slot-drop demo: weekly with money aggregates unavailable — those lines drop, not a "0".
  const dropDemo = renderEmail("weekly", { hearings: 5, orders: 2, briefs: 2 }, "en"); // no filings/invoiced/collected

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 text-ec-ink">
      <header className="mb-10 border-b border-ec-hair pb-6">
        <div className="mb-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Transactional emails</h1>
          <Badge>Sample</Badge>
        </div>
        <p className="text-sm text-ec-ink-2">
          The comms-catalog-v2 §2 email set, rendered from sample data in both languages. Each frame is the
          exact inline-styled HTML a mail client receives. Missing slots drop their line — never faked; money
          and count lines drop rather than show a fabricated-looking 0.
        </p>
      </header>

      {EMAIL_KEYS.map((tkey) => (
        <section key={tkey} className="mb-12">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-ec-brass-deep">{LABELS[tkey]}</h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {LOCALES.map((loc) => (
              <EmailPreview key={loc} tkey={tkey} locale={loc} />
            ))}
          </div>
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
