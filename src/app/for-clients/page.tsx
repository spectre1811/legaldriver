import { MarketingShell, Prose } from "@/components/marketing-shell";

export const metadata = { title: "For clients · Peshi" };

export default function ForClientsPage() {
  return (
    <MarketingShell
      title="For clients"
      subtitle="Finding the right advocate — and following your own case — shouldn’t be a shot in the dark."
    >
      <Prose>
        <p>Today, Peshi is where advocates run their practice. Many already use it to keep their clients updated — case status, next hearing dates and documents, in plain language, on WhatsApp.</p>
        <h2>Coming next</h2>
        <p>We’re building a place where any citizen can find the right advocate with clarity and trust — drawn from the public court record, never rankings or “best lawyer” claims. If you’d like to be told when it opens, write to <a href="mailto:hello@peshi.app">hello@peshi.app</a>.</p>
        <p>Already working with an advocate on Peshi? Ask them to share your case portal.</p>
      </Prose>
    </MarketingShell>
  );
}
