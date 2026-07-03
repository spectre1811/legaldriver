import { MarketingShell, Prose, DraftNotice } from "@/components/marketing-shell";

export const metadata = { title: "Data corrections & takedowns · Peshi" };

// Compliance-critical: the correction/takedown workflow (07-COMPLIANCE §3).
export default function DataCorrectionsPage() {
  return (
    <MarketingShell
      title="Data corrections & takedowns"
      subtitle="Case data on Peshi comes from public court records and can lag or contain errors. If something about you or a matter is wrong, here’s how to have it corrected or removed."
    >
      <DraftNotice />
      <Prose>
        <h2>What you can request</h2>
        <ul>
          <li><strong>Correction</strong> — a case, party, advocate or date shown on Peshi is inaccurate.</li>
          <li><strong>Takedown / suppression</strong> — a record should not be shown (e.g. a sensitive matter, a wrong identity match, or a court/government order to remove it).</li>
        </ul>

        <h2>How to raise a request</h2>
        <p>Email <a href="mailto:grievance@peshi.app">grievance@peshi.app</a> with the CNR (or a link to the record), what is wrong, and — for a takedown — the reason. If you are the person named, please tell us so; if you act on someone’s behalf, say in what capacity.</p>

        <h2>What happens next — and by when</h2>
        <ul>
          <li><strong>Acknowledgement</strong> within 48 hours.</li>
          <li><strong>Action</strong> — 7 days for standard requests; within 24 hours for urgent (P0) cases such as a court order or a clear identity-harm.</li>
          <li><strong>Resolution notice</strong> — a written outcome, with an appeal path, within 2 days of action.</li>
        </ul>

        <h2>How we act on a takedown</h2>
        <p>We <strong>suppress rather than delete</strong>: the record is hidden from search, the product and any API, but retained with its provenance for audit and possible reinstatement, and the suppression is propagated to downstream consumers. Every request is logged in a takedown register.</p>

        <h2>Grievance officer</h2>
        <p>Concerns about how we handle personal data or a request can be sent to our grievance officer at <a href="mailto:grievance@peshi.app">grievance@peshi.app</a>. Peshi does not rank, recommend or endorse advocates; corrections do not affect any ranking because there is none.</p>
      </Prose>
    </MarketingShell>
  );
}
