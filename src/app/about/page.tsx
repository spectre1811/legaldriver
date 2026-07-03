import { MarketingShell, Prose } from "@/components/marketing-shell";

export const metadata = { title: "About · Peshi" };

export default function AboutPage() {
  return (
    <MarketingShell
      title="About Peshi"
      subtitle="The operating system for India’s lawyers — and the marketplace where India finds them."
    >
      <Prose>
        <p>India’s courts are public, but scattered. We turn that public record into software a lawyer can run their whole practice on, and into a place any citizen can find the right advocate with clarity and trust.</p>
        <h2>Why we’re building it</h2>
        <p>A missed hearing shouldn’t be a professional disaster. Finding a lawyer shouldn’t be a shot in the dark. The data to fix both is already public — we make it usable.</p>
        <h2>How we work</h2>
        <ul>
          <li><strong>Trust is the product.</strong> Provenance on every record, “verify against the official record”, AI always attributed and disclaimered, tenant data kept sacred.</li>
          <li><strong>Lawyer-first, citizen-honest.</strong> Built for the working advocate; fair and clear to the citizen. No dark patterns, no fake urgency, no “best lawyer” theatre.</li>
          <li><strong>Bilingual by default.</strong> English and the litigant’s language, first-class — India’s courts are multilingual, and so are we.</li>
        </ul>
      </Prose>
    </MarketingShell>
  );
}
