import { MarketingShell, Prose } from "@/components/marketing-shell";

export const metadata = { title: "Why Peshi · Peshi" };

export default function WhyUsPage() {
  return (
    <MarketingShell
      title="Why Peshi"
      subtitle="Built for how Indian litigation actually runs — the daily cause list, the CNR, WhatsApp, two languages."
    >
      <Prose>
        <ul>
          <li><strong>Tomorrow’s peshi, before 8 pm.</strong> Your full cause list for the next day reaches your WhatsApp every evening — no portal logins, no calls to the clerk.</li>
          <li><strong>CNR-native.</strong> Add a case once; hearings, orders and next dates keep themselves current from the court record.</li>
          <li><strong>One daily driver.</strong> Cases, clients, deadlines, documents and GST invoicing in one place, instead of five.</li>
          <li><strong>Bilingual by default.</strong> The whole product works in English and Hindi, with Gujarati following — first-class, not bolted on.</li>
          <li><strong>Trust, designed in.</strong> Every court record shows its source and a “verify against the official record” note; AI is always attributed. We are a neutral directory — no rankings, no “best lawyer” claims.</li>
        </ul>
      </Prose>
    </MarketingShell>
  );
}
