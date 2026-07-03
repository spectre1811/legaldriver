import { MarketingShell, Prose } from "@/components/marketing-shell";

export const metadata = { title: "Contact · Peshi" };

export default function ContactPage() {
  return (
    <MarketingShell
      title="Contact"
      subtitle="We read everything. The fastest way to reach us is email."
    >
      <Prose>
        <ul>
          <li><strong>General &amp; support</strong> — <a href="mailto:hello@peshi.app">hello@peshi.app</a></li>
          <li><strong>Data corrections &amp; grievances</strong> — <a href="mailto:grievance@peshi.app">grievance@peshi.app</a> (see <a href="/data-corrections">corrections &amp; takedowns</a>)</li>
          <li><strong>Already a member?</strong> Use in-app support from your dashboard.</li>
        </ul>
        <p>If you’re an advocate, the quickest way to see Peshi is to <a href="/login">start free</a> and add a case by CNR.</p>
      </Prose>
    </MarketingShell>
  );
}
