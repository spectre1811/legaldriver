import { MarketingShell, Prose, DraftNotice } from "@/components/marketing-shell";

export const metadata = { title: "Privacy · Peshi" };

export default function PrivacyPage() {
  return (
    <MarketingShell
      title="Privacy"
      subtitle="How Peshi handles your data — the account and client information you give us, and the court records we surface."
    >
      <DraftNotice />
      <Prose>
        <h2>Two kinds of data</h2>
        <ul>
          <li><strong>Your data</strong> — your account, your clients, matters, documents and messages. We are a Data Fiduciary for this under the Digital Personal Data Protection Act, 2023, and it is isolated to your workspace.</li>
          <li><strong>Court records</strong> — cases, hearings, orders, judges and advocates sourced from public court records. Our position is that this is personal data made publicly available by or under law (DPDP §3(c)(ii)).</li>
        </ul>

        <h2>What we collect and why</h2>
        <p>Account details (name, email) to run your workspace; the case, client and billing information you enter; and technical logs to keep the service secure and reliable. We do not sell your data, and we do not log document contents, message bodies or credentials.</p>

        <h2>Your rights</h2>
        <p>You can access, correct, export or delete your workspace data from within the product, or by contacting us. For court records about you, see <a href="/data-corrections">Data corrections &amp; takedowns</a>. You may raise a grievance with our grievance officer at <a href="mailto:grievance@peshi.app">grievance@peshi.app</a>.</p>

        <h2>Security &amp; retention</h2>
        <p>Data is encrypted in transit and at rest; access is tenant-isolated. Third-party credentials (e.g. Gmail) are stored encrypted and never in plaintext. We retain your data for as long as your account is active and as required for legal and accountability obligations.</p>

        <h2>AI</h2>
        <p>AI features are assistive and always attributed and disclaimered. AI output is informational, not legal advice — verify against the official record.</p>
      </Prose>
    </MarketingShell>
  );
}
