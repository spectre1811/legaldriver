"use client";

// WO-54 W3 · Cases-list detail drawer — a right-side peek that answers "when / for what / whose
// court / which side / can I trust this" without leaving the list (progressive disclosure, ≤2 levels:
// row → drawer → full case page). Renders from the row data already fetched for the list (no second
// query). Every court value goes through the BP-17/WO-45 court kit so empties are honest ("not on
// record at eCourts", never a bare "—") and dates are day-first + TZ-correct.

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { CourtField, CourtChip, CourtDate, relativeAge, formatCourtDate } from "@/components/court";
import { expandCaseType, cleanPurpose } from "@/lib/court/code-labels";
import { maskTitle } from "@/lib/court/mask";
import {
  selectCaseDetailRows, extractCaseDetailValues, type CaseDetailFieldId,
} from "@/lib/court/case-detail-fields";
import { hearingUrgency, urgencyTone, courtCaseNo } from "@/app/dashboard/cases/cases-row";
import type { MatterRow } from "@/app/dashboard/cases/cases-query";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function CaseDetailDrawer({
  row, today, onClose,
}: {
  row: MatterRow | null;
  today: string;
  onClose: () => void;
}) {
  const t = useTranslations("cases");
  const tcd = useTranslations("caseDetail");
  const te = useTranslations("enum");
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = row != null;

  // Escape closes; lock body scroll while open; move focus into the panel (a11y).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!row) return null;

  const st = (v: string) => (te.has(`status.${v}`) ? te(`status.${v}`) : v);
  const detail = (row.detail ?? {}) as Record<string, unknown>;
  const isCourtSourced = !!row.source && row.source !== "manual";
  const isDisposed = (row.status ?? "").toUpperCase().includes("DISPOSED");

  // Field grid — the SAME taxonomy + honest-empty rule as the full case page (shared pure module),
  // dates formatted through the court kit here.
  const values = extractCaseDetailValues(detail, (r) => formatCourtDate(r) ?? r);
  const labels: Record<CaseDetailFieldId, string> = {
    registrationNo: tcd("detail.registrationNo"), filingNo: tcd("detail.filingNo"),
    registrationDate: tcd("detail.registrationDate"), filingDate: tcd("detail.filingDate"),
    firstHearingDate: tcd("detail.firstHearingDate"), district: tcd("detail.district"),
    state: tcd("detail.state"), category: tcd("detail.category"), subCategory: tcd("detail.subCategory"),
    subSubCategory: tcd("detail.subSubCategory"),
    benchType: tcd("detail.benchType"), judicialBranch: tcd("detail.judicialBranch"),
    subordinateCourt: tcd("detail.subordinateCourt"), filedBy: tcd("detail.filedBy"),
    decidedOn: tcd("detail.decidedOn"), natureOfDisposal: tcd("detail.natureOfDisposal"),
    firNo: tcd("detail.firNo"), policeStation: tcd("detail.policeStation"),
  };
  const detailRows = selectCaseDetailRows(values, { isCourtSourced, isDisposed });

  const caseNo = courtCaseNo(row.case_type, detail);
  const tier = str(detail.tier);
  const coram = str(detail.coram);
  const ct = expandCaseType(row.case_type);
  const caseTypeLabel = ct.full
    ? (ct.known && ct.code.toUpperCase() !== ct.full.toUpperCase() ? `${ct.full} · ${ct.code}` : ct.full)
    : null;
  const regional = (detail.regional ?? {}) as { pet_name?: string | null; res_name?: string | null };
  const advocateBars = (detail.advocateBars ?? {}) as Record<string, string>;
  const advocates = (row.advocate_names ?? []).filter((a) => a && a.trim());
  const judges = (row.judge_names ?? []).filter((j) => j && j.trim());
  const acts = (row.act_names ?? []).filter((a) => a && a.trim());
  const parties = (row.party_names ?? []).filter((p) => p && p.trim());
  const eff = row.next_hearing_override ?? row.next_hearing_date;
  const urg = hearingUrgency(eff, today);
  const emptyOnRecord = isCourtSourced ? tcd("empty.onRecord") : tcd("empty.notSet");

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-ec-ink/30 backdrop-blur-[1px] motion-safe:transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-drawer-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-paper shadow-2xl motion-safe:animate-slide-in-right sm:border-l sm:border-ec-hair-strong"
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-ec-hair-strong px-5 py-4">
          <div className="min-w-0">
            <h2 id="case-drawer-title" className="font-display text-lg font-medium leading-tight text-ec-ink">
              {maskTitle(row.title, tcd("maskedTitle"))}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {row.cnr && <span className="num ec-chip text-[0.7rem]">{row.cnr}</span>}
              {tier && <CourtChip tone="neutral">{tier}</CourtChip>}
              {row.status && <CourtChip tone={isDisposed ? "neutral" : "hot"}>{st(row.status)}</CourtChip>}
            </div>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label={t("drawer.close")}
            className="-mr-1 rounded-full p-1.5 text-ec-ink-3 hover:bg-ec-hair hover:text-ec-ink focus-visible:ring-2 focus-visible:ring-ec-brass"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
          {/* At-a-glance: case no + type + next hearing */}
          <Section title={t("drawer.identifiers")}>
            {caseNo && <Field label={t("drawer.caseNo")}><span className="num text-ec-ink">{caseNo}</span></Field>}
            <Field label={t("drawer.caseType")}>
              <CourtField value={caseTypeLabel} emptyReason="not-on-record" emptyLabel={emptyOnRecord} />
            </Field>
            <Field label={tcd("info.next")}>
              <span className="inline-flex items-center gap-1.5">
                <CourtDate value={eff} emptyLabel={tcd("empty.scheduled")} />
                {row.next_hearing_override && <span className="text-[0.7rem] text-ec-ink-3">{t("diary")}</span>}
                <UrgencyChip urg={urg} t={t} />
              </span>
            </Field>
            <Field label={tcd("info.stage")}>
              <CourtField value={cleanPurpose(row.stage) || null} emptyReason="not-on-record" emptyLabel={emptyOnRecord} />
            </Field>
          </Section>

          {/* Parties */}
          {(regional.pet_name || regional.res_name || parties.length > 0) && (
            <Section title={tcd("parties.title")}>
              {regional.pet_name || regional.res_name ? (
                <>
                  <Field label={t("drawer.petitioner")}><CourtField value={str(regional.pet_name)} emptyReason="not-on-record" emptyLabel={emptyOnRecord} /></Field>
                  <Field label={t("drawer.respondent")}><CourtField value={str(regional.res_name)} emptyReason="not-on-record" emptyLabel={emptyOnRecord} /></Field>
                </>
              ) : (
                <ul className="space-y-1 text-ec-ink-2">{parties.map((p, i) => <li key={i}>{p}</li>)}</ul>
              )}
            </Section>
          )}

          {/* Court record */}
          <Section title={tcd("tab.court")}>
            <Field label={tcd("info.court")}><CourtField value={row.court} emptyReason="not-on-record" emptyLabel={emptyOnRecord} /></Field>
            {coram && <Field label={tcd("detail.coram")}><span className="text-ec-ink-2">{coram}</span></Field>}
            {detailRows.map((r) => (
              <Field key={r.id} label={labels[r.id]}>
                <CourtField
                  value={r.value}
                  emptyReason={r.emptyReason}
                  emptyLabel={r.emptyReason === "not-applicable" ? tcd("empty.notApplicable") : tcd("empty.onRecord")}
                />
              </Field>
            ))}
          </Section>

          {/* Acts & sections */}
          {acts.length > 0 && (
            <Section title={tcd("acts.title")}>
              <div className="flex flex-wrap gap-1.5">{acts.map((a, i) => <CourtChip key={i} tone="neutral">{a}</CourtChip>)}</div>
            </Section>
          )}

          {/* Advocates */}
          {advocates.length > 0 && (
            <Section title={t("drawer.advocates")}>
              <ul className="space-y-1">
                {advocates.map((a, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2 text-ec-ink-2">
                    <span>{a}</span>
                    {advocateBars[a] && <span className="num shrink-0 text-[0.7rem] text-ec-ink-3">{advocateBars[a]}</span>}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Judges (when distinct from coram) */}
          {judges.length > 0 && (
            <Section title={t("drawer.judges")}>
              <div className="flex flex-wrap gap-1.5">{judges.map((j, i) => <CourtChip key={i} tone="neutral">{j}</CourtChip>)}</div>
            </Section>
          )}
        </div>

        {/* Footer — provenance + link to the full case */}
        <footer className="border-t border-ec-hair-strong px-5 py-3">
          <p className="text-[0.7rem] leading-relaxed text-ec-ink-3">
            {row.source && t("drawer.provenance", { source: row.source, ago: relativeAge(row.last_synced_at) })}
            {" "}{tcd("source.verify")}
          </p>
          <Link
            href={`/dashboard/cases/${row.id}`}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-ec-brass-deep hover:text-ec-brass"
          >
            {t("drawer.viewFull")} <Icon name="external" className="h-4 w-4" />
          </Link>
        </footer>
      </aside>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="ec-label mb-2">{title}</h3>
      <dl className="space-y-1.5">{children}</dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-ec-ink-3">{label}</dt>
      <dd className="text-right text-ec-ink-2">{children}</dd>
    </div>
  );
}

// A compact urgency chip (Today / Tomorrow / in Nd / Nd overdue). `future` & `none` show no chip —
// the date already speaks for itself, and we never invent urgency for an absent hearing. Exported so
// the Cases row renders the identical signal.
export function UrgencyChip({ urg, t }: { urg: ReturnType<typeof hearingUrgency>; t: ReturnType<typeof useTranslations> }) {
  const tone = urgencyTone(urg.key);
  if (!tone || urg.days == null) return null;
  const label =
    urg.key === "today" ? t("urgency.today")
    : urg.key === "tomorrow" ? t("urgency.tomorrow")
    : urg.key === "overdue" ? t("urgency.overdue", { n: Math.abs(urg.days) })
    : t("urgency.soon", { n: urg.days });
  return <CourtChip tone={tone}>{label}</CourtChip>;
}
