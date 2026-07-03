import { MarketingShell, Prose, DraftNotice } from "@/components/marketing-shell";

export const metadata = { title: "Terms · Peshi" };

export default function TermsPage() {
  return (
    <MarketingShell
      title="Terms of use"
      subtitle="The terms on which Peshi is provided. By using Peshi you agree to these."
    >
      <DraftNotice />
      <Prose>
        <h2>What Peshi is</h2>
        <p>Peshi is practice software for advocates and firms, and a neutral directory built on public court records. It helps you track cases by CNR, see your cause list and deadlines, and run billing and client communication.</p>

        <h2>Not legal advice</h2>
        <p>Everything Peshi shows — court data, deadlines, AI output — is <strong>informational, not legal advice</strong>. Court data can lag or contain errors; always verify against the official record before relying on it.</p>

        <h2>A neutral directory</h2>
        <p>Peshi does not rank, recommend or endorse advocates, and carries no ratings or “best lawyer” claims. Directory information is drawn from the public record and from details an advocate chooses to claim.</p>

        <h2>Acceptable use</h2>
        <p>Use Peshi lawfully and only for your own practice and clients. Do not attempt to access other tenants’ data, scrape the service, or misuse court data. Tenant data is isolated; you are responsible for the accuracy of what you enter.</p>

        <h2>Subscriptions &amp; payment</h2>
        <p>Paid plans are billed per lawyer as described on our <a href="/#pricing">pricing</a>. Taxes apply as required. You can cancel; access continues to the end of the paid period.</p>

        <h2>Liability &amp; governing law</h2>
        <p>Peshi is provided “as is” to the extent permitted by law; we are not liable for actions taken in reliance on informational data. These terms are governed by the laws of India, with courts at Ahmedabad, Gujarat having jurisdiction. We may update these terms; material changes will be notified.</p>
      </Prose>
    </MarketingShell>
  );
}
