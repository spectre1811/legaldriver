// BP-17 · Disclaimer (folded in from ui.tsx) — the mandatory "not legal advice — verify against
// the official record" line (conventions §3). Prop-driven copy (English default) keeps the kit
// pure and portable; the app passes its next-intl string. Uses the kit's own AlertIcon.
import { AlertIcon } from "./icons";

export function Disclaimer({
  text = "Not legal advice — verify against the official court record.",
  className = "",
}: {
  text?: string;
  className?: string;
}) {
  return (
    <p className={`flex items-center gap-1.5 text-xs text-ec-ink-3 ${className}`.trim()}>
      <AlertIcon className="h-3.5 w-3.5" />
      {text}
    </p>
  );
}
