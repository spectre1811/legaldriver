import Link from "next/link";
import { CourtField, MaskedName } from "@/components/court";
import { isMaskedName } from "@/lib/court/mask";
import { Icon } from "@/components/icons";

type Row = { label: string; value: string | null; emptyReason?: "not-on-record" | "not-applicable"; emptyLabel: string };

// WO-332 · the prototype's collapsible "Court record" card — native <details>/<summary> (zero JS,
// keyboard/screen-reader native) instead of a useState toggle. `open` defaults true (matches the
// reference's default-expanded state); .group + Tailwind's `group-open:` flips the chevron.
export function CaseRecord({
  title,
  hideLabel,
  showLabel,
  rows,
  coramLabel,
  coramName,
  actsTitle,
  acts,
  maskedLabel,
  syncedNote,
}: {
  title: string;
  hideLabel: string;
  showLabel: string;
  rows: Row[];
  coramLabel: string;
  coramName: string | null;
  actsTitle: string;
  acts: string[];
  maskedLabel: string;
  syncedNote: string | null;
}) {
  if (!rows.length && !coramName && !acts.length) return null;
  return (
    <details className="group" open>
      <summary className="mb-3 flex cursor-pointer list-none items-end justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="ec-label">{title}</span>
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-ec-bronze-deep hover:underline">
          <span className="group-open:hidden">{showLabel}</span>
          <span className="hidden group-open:inline">{hideLabel}</span>
          <Icon name="chevron" className="h-3 w-3 rotate-90 transition-transform group-open:-rotate-90" />
        </span>
      </summary>
      <div className="mt-1.5 h-[3px] border-y border-ec-line" />
      <div className="ec-card px-5 py-1">
        <dl className="text-[13px]">
          {rows.map((r) => (
            <div key={r.label} className="grid gap-1 border-b border-ec-hair py-2.5 sm:grid-cols-[210px_minmax(0,1fr)]">
              <dt className="ec-label">{r.label}</dt>
              <dd className="num text-[12.5px] text-ec-ink-2">
                <CourtField value={r.value} emptyReason={r.emptyReason} emptyLabel={r.emptyLabel} maskedLabel={maskedLabel} field={r.label} />
              </dd>
            </div>
          ))}
          {coramName && (
            <div className="grid gap-1 border-b border-ec-hair py-2.5 sm:grid-cols-[210px_minmax(0,1fr)]">
              <dt className="ec-label">{coramLabel}</dt>
              <dd className="text-[12.5px] font-medium text-ec-ink">
                {isMaskedName(coramName) ? (
                  <MaskedName value={coramName} label={maskedLabel} />
                ) : (
                  <Link href={`/dashboard/search/directory?q=${encodeURIComponent(coramName)}`} className="text-ec-bronze-deep hover:text-ec-bronze">
                    {coramName}
                  </Link>
                )}
              </dd>
            </div>
          )}
          {acts.length > 0 && (
            <div className="grid gap-1.5 py-2.5 sm:grid-cols-[210px_minmax(0,1fr)]">
              <dt className="ec-label">{actsTitle}</dt>
              <dd className="flex flex-wrap gap-1.5">
                {acts.map((a, i) => (
                  <span key={i} className="ec-chip ec-chip-hot">{a}</span>
                ))}
              </dd>
            </div>
          )}
        </dl>
        {syncedNote && <p className="num py-3 text-[11px] text-ec-ink-3">{syncedNote}</p>}
      </div>
    </details>
  );
}
