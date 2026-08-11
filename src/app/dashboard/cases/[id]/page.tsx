import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fmtAgo, fmtMoney, fmtHours } from "@/components/ui";
import { Icon } from "@/components/icons";
import { LogTimeToggle, RefreshButton, GenerateSummaryButton, AddDocumentForm, EditCaseForm, ProposedDeadlineActions, MatterDiaryDate, CopyCnrButton, CaseMenu, AiBriefingSection } from "./case-actions";
import { DeadlineRuleForm } from "./deadline-rules";
import { CaseTimeline } from "./case-timeline";
import { CaseRecord } from "./case-record";
import { SectionLabel } from "./case-section";
import { CaseSectionNav } from "./case-nav";
import { DocumentsCard, type CaseDocRow } from "./doc-viewer";
import { getTimeline, type TimelineEvent } from "@/lib/court/legaldriver-api";
import { expandCaseType, cleanPurpose } from "@/lib/court/code-labels";
import { CourtField, formatCourtDate, parseCourtDate } from "@/components/court";
import { isMaskedName, maskTitle } from "@/lib/court/mask";
import { selectCaseDetailRows, extractCaseDetailValues, type CaseDetailFieldId } from "@/lib/court/case-detail-fields";
import type { CaseSummary } from "@/lib/docs/case-summary";
import { confidenceBand } from "@/lib/docs/case-summary";
import { Reveal } from "../../motion";

type Party = { name?: string; side?: string; advocate?: string; masked?: boolean };

// WO-332: also rejects the literal strings "null"/"undefined" — the provider occasionally sends
// these AS TEXT (not a real null) for a missing field (e.g. an advocate-less party), which used to
// render the word "null" on screen. Every field routed through `str()` gets this guard for free.
const str = (v: unknown) => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && !/^(null|undefined)$/i.test(t) ? t : null;
};
// short "02 Jul" from the shared day-first formatter (drop the year for the compact aside lists).
const shortDate = (v: string | null | undefined) => formatCourtDate(v)?.replace(/ \d{4}$/, "") ?? null;

// C5 (WO-402, DESIGN.md ref Lovable /mocks Mockup 2): the Notifications card's Email row needs a
// two-tone envelope (flap stroke `var(--honey)`) — the shared `Icon` set's single-stroke `gmail`
// glyph can't give that without recoloring `gmail` everywhere it's already used (settings/inbox/
// invoices), so this is a one-off inline glyph rather than a fork of the shared primitive.
function EnvelopeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" />
      <path d="m2 7 10 7 10-7" stroke="var(--honey)" />
    </svg>
  );
}

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const t = await getTranslations("caseDetail");
  const te = await getTranslations("enum");
  const tf = await getTranslations("dashboard.caseFile");
  const tn = await getTranslations("notifications"); // C5: existing channel/kind vocabulary (WO-336) — reused, not forked
  const st = (v: string) => (te.has(`status.${v}`) ? te(`status.${v}`) : v);
  const { data: matter } = await supabase.from("matter").select("*").eq("id", params.id).maybeSingle();
  if (!matter) notFound();

  const [{ data: hearings }, { data: docs }, { data: client }, { data: activity }, { data: allMatters }, { data: allClients }] = await Promise.all([
    supabase.from("hearing").select("id, date, purpose, court_no, judge").eq("matter_id", matter.id).order("date", { ascending: false }),
    supabase.from("document").select("id, filename, doc_type, source, size_bytes, mime, created_at, parsed_text, matter_id, client_id, portal_shared, storage_path").eq("matter_id", matter.id).order("created_at", { ascending: false }),
    matter.client_id ? supabase.from("client").select("id, name, phones, emails").eq("id", matter.client_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("activity_event").select("id, type, summary, created_at").eq("matter_id", matter.id).order("created_at", { ascending: false }).limit(30),
    supabase.from("matter").select("id, title").order("title"),
    supabase.from("client").select("id, name").order("name"),
  ]);
  const matterOpts = (allMatters ?? []).map((m) => ({ id: m.id, label: m.title }));
  const clientOpts = (allClients ?? []).map((c) => ({ id: c.id, label: c.name }));

  const [{ data: timeEntries }, { data: expenses }] = await Promise.all([
    supabase.from("time_entry").select("id, entry_date, minutes, billable, rate_minor, narrative").eq("matter_id", matter.id).order("entry_date", { ascending: false }),
    supabase.from("expense").select("id, entry_date, category, amount_minor, billable, notes").eq("matter_id", matter.id).order("entry_date", { ascending: false }),
  ]);
  const totalMinutes = (timeEntries ?? []).reduce((s, t2) => s + t2.minutes, 0);
  const billableTime = (timeEntries ?? []).filter((t2) => t2.billable).reduce((s, t2) => s + Math.round((t2.minutes / 60) * t2.rate_minor), 0);
  const billableExp = (expenses ?? []).filter((e) => e.billable).reduce((s, e) => s + e.amount_minor, 0);
  const wip = billableTime + billableExp;

  const [{ data: orders }, { data: deadlines }, { data: deadlineRules }, timelineEvents] = await Promise.all([
    supabase.from("court_order").select("id, order_date, title, url, raw").eq("matter_id", matter.id).order("order_date", { ascending: false, nullsFirst: false }),
    supabase.from("deadline").select("id, kind, due_date, jurisdiction_rule, status, basis").eq("matter_id", matter.id).order("due_date", { ascending: true }),
    supabase.from("deadline_rule").select("id, kind, days, jurisdiction, description").order("jurisdiction"),
    matter.cnr ? getTimeline(matter.cnr).catch(() => []) : Promise.resolve([]),
  ]);

  // WO-332 · header/alert real signals — a per-matter reminder log (channel/kind/status, keyed
  // by payload.ref like the existing delete-cleanup query in actions.ts), the most recent INBOUND
  // filing ("from the inbox"), and a count of THIS matter's own needs-review documents (the same
  // needs_review flag the global Review Inbox uses — never a fabricated "unreviewed" heuristic).
  const [{ data: notifyRows }, { data: latestInbound }, { count: needsReviewCount }] = await Promise.all([
    supabase.from("notification").select("channel, kind, status, sent_at, scheduled_for").contains("payload", { ref: `matter:${matter.id}` }).order("sent_at", { ascending: false, nullsFirst: false }).limit(10),
    supabase.from("communication_log").select("channel, counterparty, subject, preview, occurred_at").eq("matter_id", matter.id).eq("direction", "in").order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("document").select("id", { count: "exact", head: true }).eq("matter_id", matter.id).filter("extracted->>status", "eq", "needs_review").filter("extracted->>deletedAt", "is", null),
  ]);

  // WO-332: clean name/advocate through `str()` ONCE here — every downstream render (this page's
  // parties card) then just sees "no value" instead of a stray literal "null"/"undefined" string
  // (founder-reported under RESPONDENT). Root cause is upstream (the sync client can persist that
  // literal text — flagged separately); this normalizes whatever's already on the row today too.
  const parties = ((Array.isArray(matter.parties) ? matter.parties : []) as Party[]).map((p) => ({
    ...p,
    name: str(p.name) ?? undefined,
    advocate: str(p.advocate) ?? undefined,
  }));
  const ai = matter.ai_summary as unknown as CaseSummary | null;
  // Self-assessed confidence (BP-26). Only briefings generated with a real score carry the
  // chip/review banner; legacy summaries (no score) render unchanged rather than being mislabelled.
  const aiConf = ai && typeof ai.confidence === "number" && Number.isFinite(ai.confidence) ? ai.confidence : null;
  const aiBand = aiConf === null ? null : confidenceBand(aiConf);
  const acts = (matter.act_names ?? []) as string[];
  const detail = (matter.detail ?? {}) as Record<string, unknown>;

  const coramName = str(detail.coram);
  // A case is "court-sourced" when it came from the eCourts provider (not a manual entry). Only then
  // is "not on record at eCourts" the honest empty state; a manual case has no eCourts record to
  // compare against, so we don't render a 16-field "not on record" mirror for it (BP-24).
  const isCourtSourced = !!matter.source && matter.source !== "manual";
  // Product voice (WO-132): the user never sees the internal pipeline name ("legaldriver") — a
  // court-synced case reads as "the court record", a hand-entered one as "added manually", the demo
  // seed as "demo data". Founder 2026-07-22: the raw "via legaldriver" leaked here.
  const sourceLabel = matter.source === "manual"
    ? t("sourceName.manual")
    : matter.source === "mock"
      ? t("sourceName.demo")
      : t("sourceName.court");
  const isDisposed = (str(matter.status) ?? "").toUpperCase().includes("DISPOSED");
  const detailValues = extractCaseDetailValues(detail, (r) => formatCourtDate(r) ?? "—");
  const detailLabels: Record<CaseDetailFieldId, string> = {
    registrationNo: t("detail.registrationNo"), filingNo: t("detail.filingNo"),
    registrationDate: t("detail.registrationDate"), filingDate: t("detail.filingDate"),
    firstHearingDate: t("detail.firstHearingDate"), district: t("detail.district"),
    state: t("detail.state"), category: t("detail.category"), subCategory: t("detail.subCategory"),
    subSubCategory: t("detail.subSubCategory"),
    benchType: t("detail.benchType"), judicialBranch: t("detail.judicialBranch"),
    subordinateCourt: t("detail.subordinateCourt"), filedBy: t("detail.filedBy"),
    decidedOn: t("detail.decidedOn"), natureOfDisposal: t("detail.natureOfDisposal"),
    firNo: t("detail.firNo"), policeStation: t("detail.policeStation"),
  };
  const caseDetails = selectCaseDetailRows(detailValues, { isCourtSourced, isDisposed }).map((r) => ({
    label: detailLabels[r.id],
    value: r.value,
    emptyReason: r.emptyReason,
    emptyLabel: r.emptyReason === "not-applicable" ? t("empty.notApplicable") : t("empty.onRecord"),
  }));

  // Timeline: prefer the live /timeline feed; when it's empty (endpoint down, no LD key, or a
  // manual case), fall back to DB-derived hearings + orders so the tab reflects what we DO have
  // instead of a false "data gap" (WO-35 timeline fallback).
  const orderRowByProviderId = new Map<string, string>();
  for (const o of orders ?? []) {
    const pid = (o.raw as { order_id?: number | string } | null)?.order_id;
    if (pid != null) orderRowByProviderId.set(String(pid), o.id);
  }
  const dbTimeline: TimelineEvent[] = [
    ...(hearings ?? []).filter((h) => h.date).map((h) => ({ date: h.date as string, type: "hearing" as const, detail: h.purpose ?? undefined, judge: h.judge ?? undefined })),
    ...(orders ?? []).filter((o) => o.order_date).map((o) => ({ date: o.order_date as string, type: "order" as const, detail: o.title ?? undefined, order_id: o.id })),
  ];
  const liveTimeline: TimelineEvent[] = timelineEvents.map((ev) =>
    ev.type === "order" && ev.order_id != null
      ? { ...ev, order_id: orderRowByProviderId.get(String(ev.order_id)) }
      : ev,
  );
  const effectiveTimeline = timelineEvents.length ? liveTimeline : dbTimeline;
  // WO-332 FIDELITY RECONCILE: the reference has ONE combined "Hearings & orders" list — union in
  // any real `court_order` row the live/DB timeline branch above didn't surface (e.g. the live feed
  // omitted it), so merging OrdersPanel's separate card into this one list never silently drops an
  // order that used to have its own row.
  const timelineOrderIds = new Set(effectiveTimeline.filter((e) => e.type === "order" && e.order_id != null).map((e) => String(e.order_id)));
  const missingOrders: TimelineEvent[] = (orders ?? [])
    .filter((o) => o.order_date && !timelineOrderIds.has(String(o.id)))
    .map((o) => ({ date: o.order_date as string, type: "order" as const, detail: o.title ?? undefined, order_id: o.id }));
  const mainTimeline = [...effectiveTimeline, ...missingOrders];

  const ct = expandCaseType(matter.case_type);
  const caseTypeLabel = ct.full
    ? (ct.known && ct.code.toUpperCase() !== ct.full.toUpperCase() ? `${ct.full} · ${ct.code}` : ct.full)
    : null;
  const stageLabel = cleanPurpose(matter.stage) || null;
  const judgeOnRecord = hearings?.find((h) => h.judge)?.judge ?? null;
  const courtNo = hearings?.find((h) => h.court_no)?.court_no ?? null;
  // D2(b): district eCourts data often carries the judge name AS the court designation itself
  // (e.g. "4th ADDL CIVIL JUDGE & JMFC"), so `judgeOnRecord` can be a case-only variant of
  // `matter.court` — printing both in the masthead then reads as a stutter ("X · X"). De-duplicate
  // case-insensitively so the redundant copy never renders.
  const courtValue = str(matter.court);
  const coramDuplicatesCourt = !!judgeOnRecord && !!courtValue && judgeOnRecord.trim().toLowerCase() === courtValue.trim().toLowerCase();
  const emptyOnRecord = isCourtSourced ? t("empty.onRecord") : t("empty.notSet");
  // Case type (matter.case_type, expanded) is a separate real field from the eCourts detail.category
  // row already inside caseDetails — kept as its own leading row in the Court record card rather
  // than dropped (it was a standalone "Case type" info row before this reskin). Coram is appended as
  // the record's last row — the reference's own RECORD array ends on Coram, plain text like every
  // other row (see case-record.tsx).
  const recordRows = [
    { label: t("info.caseType"), value: caseTypeLabel, emptyReason: "not-on-record" as const, emptyLabel: emptyOnRecord },
    ...caseDetails,
    { label: t("detail.coram"), value: coramName, emptyReason: "not-on-record" as const, emptyLabel: emptyOnRecord },
  ];
  const refreshed = matter.last_synced_at ? new Date(matter.last_synced_at).toLocaleString("en-IN") : t("source.never");

  // Parties grouped by side (real data may carry any number of sides/labels — never hard-locked
  // to exactly "petitioner"/"respondent").
  const partyGroups = new Map<string, Party[]>();
  for (const p of parties) {
    const side = p.side?.trim() || t("parties.title");
    if (!partyGroups.has(side)) partyGroups.set(side, []);
    partyGroups.get(side)!.push(p);
  }

  // Next-hearing relative day count (header). Diary override wins over the synced date, same
  // precedence as everywhere else on this page.
  const nextRaw = matter.next_hearing_override || matter.next_hearing_date;
  const nextParsed = nextRaw ? parseCourtDate(nextRaw) : null;
  let daysUntilNext: number | null = null;
  if (nextParsed) {
    const today0 = new Date(); today0.setUTCHours(0, 0, 0, 0);
    daysUntilNext = Math.round((nextParsed.getTime() - today0.getTime()) / 86400000);
  }
  const nextRelative =
    daysUntilNext === null ? null
      : daysUntilNext === 0 ? tf("next.today")
        : daysUntilNext === 1 ? tf("next.tomorrow")
          : daysUntilNext > 1 ? tf("next.inDays", { count: daysUntilNext })
            : tf("next.past", { count: Math.abs(daysUntilNext) });

  // Alert strip — real signals only: the nearest overdue (open, past-due) deadline, and this
  // matter's own needs-review document count. Renders nothing when both are clear.
  const todayIso = new Date().toISOString().slice(0, 10);
  const nearestOverdue = (deadlines ?? [])
    .filter((d) => d.status === "open" && d.due_date < todayIso)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;
  const overdueDays = nearestOverdue ? Math.round((new Date(todayIso).getTime() - new Date(nearestOverdue.due_date).getTime()) / 86400000) : 0;
  const reviewCount = needsReviewCount ?? 0;
  const showAlert = Boolean(nearestOverdue) || reviewCount > 0;

  // Documents (aside) — the same hasFile contract documents-browser/[id] use.
  const docRows: CaseDocRow[] = (docs ?? []).map((d) => ({
    id: d.id, filename: d.filename ?? "—", docType: d.doc_type, mime: d.mime,
    dateLabel: shortDate(d.created_at), hasFile: Boolean(d.storage_path), shared: d.portal_shared,
    clientId: d.client_id,
  }));

  // Notifications (aside) — distinct channel/kind pairs actually sent for this matter (never the
  // reference's static 3-badge legend), plus the latest send for the "Last sent" line.
  const notifySeen = new Map<string, { channel: string; kind: string }>();
  for (const n of notifyRows ?? []) {
    const key = `${n.channel}:${n.kind}`;
    if (!notifySeen.has(key)) notifySeen.set(key, { channel: n.channel, kind: n.kind });
  }
  const lastNotify = (notifyRows ?? [])[0] ?? null;

  // WO-332 · sticky scroll-spy nav (founder ask) — the page's primary content areas, in the
  // order they now appear (Parties moved to the top of main, per the same ask). Every id below
  // has a matching `id=` on its own section landmark further down; add a section here + there
  // together, or the nav silently grows a dead tab.
  const navSections = [
    { id: "parties", label: tf("partiesTitle") },
    { id: "ai-briefing", label: t("ai.title") },
    { id: "hearings-orders", label: tf("hearingsOrders") },
    { id: "court-record", label: tf("record.title") },
    { id: "documents", label: t("documents.title") },
  ];

  return (
    <div className="text-ec-ink">
      {/* header — the page's own dark "engraved" masthead panel (not shell chrome; WO-328's
          shell/top-bar/nav are untouched above this) */}
      <Reveal as="div" className="mk-engraved -mx-5 rounded-[14px] bg-ec-ink px-5 py-6 sm:-mx-8 sm:px-7 sm:py-7">
        {/* D2(a): was a bare 12px text link — easy to miss against the dark masthead. Upgraded to
            the same ink-bordered chip family as the header's own action buttons (case-actions.tsx),
            matching the Documents Trash page's dark-surface back-link precedent. */}
        <Link href="/dashboard/cases" className="inline-flex items-center gap-1.5 rounded-md border border-ec-ink-border px-3 py-1.5 text-[12.5px] text-ec-paper transition-colors hover:border-ec-honey hover:text-ec-honey">
          <Icon name="back" className="h-3.5 w-3.5" /> {tf("back")}
        </Link>

        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-[26px] leading-tight text-paper sm:text-[30px]">{maskTitle(matter.title, t("maskedTitle"))}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {matter.cnr && (
                <>
                  <span className="num font-mono text-[12px] text-ec-line-strong">CNR {matter.cnr}</span>
                  <CopyCnrButton cnr={matter.cnr} label={tf("copyCnr")} copiedLabel={tf("copiedCnr")} />
                </>
              )}
              <span className="ec-chip !border-transparent bg-ec-ink-chip text-ec-honey">{st(matter.status)}</span>
              {stageLabel && <span className="ec-chip !border-transparent bg-ec-ink-chip text-ec-line-strong">{tf("stagePrefix")} · {stageLabel}</span>}
            </div>
            <p className="mt-2.5 text-[13px] text-ec-line-strong">
              <CourtField value={matter.court} emptyLabel={emptyOnRecord} maskedLabel={t("masked")} field={t("info.court")} className="text-ec-line-strong" />
              {courtNo && <> · {tf("courtNo", { no: courtNo })}</>}
              {judgeOnRecord && !isMaskedName(judgeOnRecord) && !coramDuplicatesCourt && (
                <> · <Link href={`/dashboard/search/directory?q=${encodeURIComponent(judgeOnRecord)}`} className="text-ec-honey hover:underline">{judgeOnRecord}</Link></>
              )}
            </p>
            <p className="num mt-1 font-mono text-[12px] text-ec-line-strong">
              {t("info.next")} {formatCourtDate(nextRaw) ?? t("empty.scheduled")}
              {matter.next_hearing_override && <span className="ml-1 text-ec-honey">{t("info.yourDiary")}</span>}
              {nextRelative && (
                <> · <span className={`rounded px-1.5 py-0.5 ${daysUntilNext !== null && daysUntilNext < 0 ? "bg-ec-warn-bg text-ec-warn" : "bg-ec-honey text-ec-honey-ink"}`}>{nextRelative}</span></>
              )}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {matter.cnr && <RefreshButton matterId={matter.id} />}
            <EditCaseForm
              matterId={matter.id}
              initial={{
                title: matter.title, court: matter.court ?? "", case_type: matter.case_type ?? "",
                stage: matter.stage ?? "", status: matter.status ?? "active", next_hearing_date: matter.next_hearing_date ?? "",
              }}
            />
            <CaseMenu
              matterId={matter.id}
              label={tf("moreActions")}
              deleteLabel={t("delete")}
              deleteConfirmLabel={t("deleteConfirm")}
              deleteNote={t("deleteNote")}
              soonItems={[tf("soon.calendar"), tf("soon.share"), tf("soon.export")]}
              soonLabel={tf("soon.badge")}
            />
          </div>
        </div>
      </Reveal>

      <CaseSectionNav sections={navSections} />

      <div className="pt-7">
        {matter.source === "mock" && (
          <Reveal as="div" delay={40} role="status" className="ec-rule-left mb-6 flex items-start gap-2.5 rounded-r-md px-4 py-3 text-sm text-ec-warn">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">{t("demoBanner.title")}</p>
              <p className="mt-0.5 text-xs text-ec-warn/90">{t("demoBanner.body")}</p>
            </div>
          </Reveal>
        )}

        {/* alert strip — real overdue deadline + this matter's own unreviewed inbox filings */}
        {showAlert && (
          <Reveal as="div" delay={60} className="ec-rule-left mb-6 flex flex-col gap-2 rounded-r-md px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-[13px] text-ec-ink">
              <Icon name="alert" className="mt-[2px] h-3.5 w-3.5 shrink-0 text-ec-danger" />
              <span>
                {nearestOverdue && (
                  <>{nearestOverdue.kind.replace(/_/g, " ")} {tf("alert.wasDue", { date: formatCourtDate(nearestOverdue.due_date) ?? "—" })} — {tf("alert.overdueDays", { count: overdueDays })}</>
                )}
                {nearestOverdue && reviewCount > 0 && " · "}
                {reviewCount > 0 && tf("alert.reviewCount", { count: reviewCount })}
              </span>
            </p>
            {reviewCount > 0 && (
              <Link href="/dashboard/documents/review" className="shrink-0 text-[12.5px] text-ec-bronze-deep hover:underline">
                {tf("alert.reviewLink")} →
              </Link>
            )}
          </Reveal>
        )}

        {/* provenance/freshness — non-negotiable on every court-data surface (repo CLAUDE.md §3);
            the reference is dummy content with no such disclosure, but this stays: never optional. */}
        <Reveal as="div" delay={80} className="mb-7 flex flex-wrap items-center justify-between gap-3 ec-card px-5 py-3">
          <p className="num text-sm text-ec-ink-3">
            {t.rich("source.line", { source: sourceLabel, time: refreshed, b: (c) => <span className="font-medium text-ec-ink">{c}</span> })}
          </p>
          <MatterDiaryDate matterId={matter.id} synced={matter.next_hearing_date} override={matter.next_hearing_override ?? null} />
        </Reveal>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* main */}
          <div className="min-w-0 space-y-9">
            {/* parties & advocates — WO-332: moved to the top of the main column (founder ask —
                important, previously buried at the bottom). Always shown (per the FAITHFUL-TO-
                PROTOTYPE bar: keep every designed element, honest empty state, never a silently-
                dropped section). */}
            <Reveal as="section" id="parties" delay={120} className="scroll-mt-28">
              <SectionLabel>{tf("partiesTitle")}</SectionLabel>
              {partyGroups.size > 0 ? (
                <div className="ec-card grid gap-0 sm:grid-cols-2">
                  {[...partyGroups.entries()].map(([side, group], i) => (
                    <div key={side} className={`border-b border-ec-hair p-5 last:border-b-0 sm:border-b-0 ${i > 0 ? "sm:border-l sm:border-ec-hair" : ""}`}>
                      <span className={`ec-chip ${i === 0 ? "ec-chip-hot" : ""}`}>{side}</span>
                      {group.map((p, j) => (
                        <div key={j} className={j > 0 ? "mt-3 border-t border-ec-hair pt-3" : "mt-2"}>
                          <div className="font-display text-[16px] text-ec-ink">
                            <CourtField value={p.name ?? null} maskedLabel={t("masked")} emptyLabel={t("parties.empty")} field="party" />
                          </div>
                          {/* D3: `p.advocate` is already cleaned (page-level `parties` map, above) —
                              a literal "null"/"undefined" string can never reach here, so this stays a
                              plain truthy check, not a special-cased render (no fabricated placeholder
                              text either; the block simply doesn't print when there's nothing real).
                              The "Represented by" eyebrow makes it read as THIS party's advocate,
                              not a second, unrelated name floating under the party. */}
                          {p.advocate && (
                            <div className="mt-2.5">
                              <div className="ec-label">{t("parties.representedBy")}</div>
                              {!isMaskedName(p.advocate) ? (
                                <Link href={`/dashboard/search/directory?q=${encodeURIComponent(p.advocate)}`} className="mt-0.5 block text-[13px] text-ec-bronze-deep hover:underline">
                                  {p.advocate}
                                </Link>
                              ) : (
                                <div className="mt-0.5 text-[13px] text-ec-ink-2">{p.advocate}</div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="ec-card px-5 py-8 text-center text-sm text-ec-ink-3">{t("parties.empty")}</div>
              )}
            </Reveal>

            {/* AI briefing — hideable + persisted (founder ask), see AiBriefingSection */}
            <Reveal as="section" id="ai-briefing" delay={160} className="scroll-mt-28">
              <AiBriefingSection
                title={t("ai.title")}
                generateSummary={<GenerateSummaryButton matterId={matter.id} has={!!ai} />}
                hideLabel={tf("record.hide")}
                showLabel={tf("record.show")}
              >
                {ai ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      {ai.generated_at && <span className="ec-chip ec-chip-hot"><Icon name="sparkles" className="mr-1 inline h-3 w-3" />{t("ai.generated", { time: fmtAgo(ai.generated_at) })}</span>}
                      {aiBand && (
                        <span title={t("ai.confidenceHint", { pct: Math.round((aiConf as number) * 100) })} className={`ec-chip ${aiBand === "high" ? "ec-chip-success" : aiBand === "medium" ? "ec-chip-hot" : "ec-chip-warn"}`}>
                          {t("ai.confidence")} · {t(`ai.confidence_${aiBand}`)}
                        </span>
                      )}
                    </div>
                    {aiBand === "low" && (
                      <div className="mt-3 rounded-ec-m border border-ec-warn/40 bg-ec-warn-bg px-4 py-3">
                        <p className="flex items-center gap-2 text-sm font-medium text-ec-warn"><Icon name="alert" className="h-4 w-4 shrink-0" /> {t("ai.reviewTitle")}</p>
                        <p className="mt-1 text-sm text-ec-ink-2">{t("ai.reviewBody")}</p>
                      </div>
                    )}
                    {matter.last_synced_at && ai.generated_at && matter.last_synced_at > ai.generated_at && (
                      <div className="mt-3 flex items-center gap-2 rounded-ec-m border border-ec-bronze bg-ec-bronze-tint px-4 py-2.5 text-sm text-ec-bronze-deep">
                        <Icon name="alert" className="h-4 w-4 shrink-0" /> {t("ai.stale")}
                      </div>
                    )}
                    <p className="mt-3 text-[13.5px] leading-relaxed text-ec-ink-2">{ai.summary}</p>
                    <div className="mt-4 grid gap-5 sm:grid-cols-2">
                      {ai.key_points && ai.key_points.length > 0 && (
                        <div>
                          <div className="ec-label">{t("ai.keyPoints")}</div>
                          <ul className="mt-1.5 space-y-1.5 text-[13px] text-ec-ink-2">
                            {ai.key_points.map((s, i) => <li key={i}>· {s}</li>)}
                          </ul>
                        </div>
                      )}
                      {ai.next_steps.length > 0 && (
                        <div>
                          <div className="ec-label">{t("ai.nextSteps")}</div>
                          <ul className="mt-1.5 space-y-1.5 text-[13px] text-ec-ink-2">
                            {ai.next_steps.map((s, i) => <li key={i} className="flex gap-1.5"><Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ec-bronze-deep" />{s}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                    {ai.risk_flags.length > 0 && (
                      <div className="mt-4">
                        <div className="ec-label">{t("ai.watch")}</div>
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {ai.risk_flags.map((s, i) => <span key={i} className="ec-chip ec-chip-warn">{s}</span>)}
                        </div>
                      </div>
                    )}
                    {/* real briefing fields beyond the mockup's illustrative 2-column layout — the
                        WO's hard constraint is explicit: match the reference's DESIGN, not its dummy
                        CONTENT shape. These extend the same card, never fabricated. */}
                    {ai.posture && (
                      <div className="mt-4 rounded-ec-m bg-ec-paper-3 px-4 py-3">
                        <p className="ec-label mb-1">{t("ai.posture")}</p>
                        <p className="text-sm text-ec-ink-2">{ai.posture}</p>
                      </div>
                    )}
                    {ai.arguments && ai.arguments.length > 0 && (
                      <div className="mt-4">
                        <div className="ec-label mb-1.5">{t("ai.arguments")}</div>
                        <ul className="space-y-1.5 text-[13px] text-ec-ink-2">
                          {ai.arguments.map((s, i) => <li key={i} className="flex gap-2"><Icon name="scale" className="mt-0.5 h-4 w-4 shrink-0 text-ec-bronze-deep" />{s}</li>)}
                        </ul>
                      </div>
                    )}
                    {ai.what_to_present && ai.what_to_present.length > 0 && (
                      <div className="mt-4">
                        <div className="ec-label mb-1.5">{t("ai.present")}</div>
                        <ul className="space-y-1.5 text-[13px] text-ec-ink-2">
                          {ai.what_to_present.map((s, i) => <li key={i} className="flex gap-2"><Icon name="documents" className="mt-0.5 h-4 w-4 shrink-0 text-ec-bronze-deep" />{s}</li>)}
                        </ul>
                      </div>
                    )}
                    {ai.sources && ai.sources.length > 0 && (
                      <div className="mt-4">
                        <div className="ec-label mb-1.5">{t("ai.sources")}</div>
                        <div className="flex flex-wrap gap-1.5">{ai.sources.map((s, i) => <span key={i} className="ec-chip">{s}</span>)}</div>
                      </div>
                    )}
                    <p className="mt-4 border-t border-ec-hair pt-3 text-[11.5px] text-ec-ink-3">{t("ai.disclaimer")}</p>
                  </>
                ) : (
                  <p className="text-sm text-ec-ink-3">{t("ai.empty")}</p>
                )}
              </AiBriefingSection>
            </Reveal>

            {/* hearings & orders — one combined, reverse-chronological list (reference's own
                shape); an order's document link opens the real streamed PDF. */}
            <Reveal as="section" id="hearings-orders" delay={200} className="scroll-mt-28">
              <SectionLabel>{tf("hearingsOrders")}</SectionLabel>
              <CaseTimeline events={mainTimeline} hasCnr={!!matter.cnr} />
            </Reveal>

            {/* court record (collapsible) */}
            <Reveal as="section" id="court-record" delay={240} className="scroll-mt-28">
              <CaseRecord
                title={tf("record.title")}
                hideLabel={tf("record.hide")}
                showLabel={tf("record.show")}
                rows={recordRows}
                actsTitle={t("acts.title")}
                acts={acts}
                maskedLabel={t("masked")}
                syncedNote={matter.last_synced_at ? tf("record.synced", { time: refreshed }) : null}
              />
            </Reveal>
          </div>

          {/* right rail */}
          <aside className="min-w-0 space-y-7">
            <Reveal as="section" delay={120}>
              <SectionLabel>{t("info.client")}</SectionLabel>
              <div className="ec-card p-4">
                {client ? (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="font-display grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ec-bronze-tint text-[15px] text-ec-bronze-deep">
                        {(client.name || "?").slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="font-display truncate text-[15px] text-ec-ink">{client.name}</div>
                        {client.phones?.[0] && <div className="num truncate text-[11.5px] text-ec-ink-3">{client.phones[0]}</div>}
                        {client.emails?.[0] && <div className="num truncate text-[11.5px] text-ec-ink-3">{client.emails[0]}</div>}
                      </div>
                    </div>
                    <Link href={`/dashboard/clients/${client.id}`} className="mt-3 block border-t border-ec-hair pt-2.5 text-[12.5px] text-ec-bronze-deep hover:underline">
                      {tf("client.view")} →
                    </Link>
                  </>
                ) : (
                  <p className="text-sm text-ec-ink-3">{t("empty.client")}</p>
                )}
              </div>
            </Reveal>

            <Reveal as="section" delay={160}>
              <SectionLabel>{tf("notify.title")}</SectionLabel>
              <div className="ec-card p-4">
                {/* C5 (DESIGN.md, Lovable /mocks Mockup 2 "after"): a readable list, data-driven —
                    only channel/kind pairs this matter actually has real notification rows for
                    (`notifySeen`, built above from `notification` receipts) ever render; the honest
                    empty state below is unchanged when there are none. */}
                {notifySeen.size > 0 ? (
                  <>
                    <ul className="divide-y divide-ec-line">
                      {[...notifySeen.values()].map((n) => (
                        <li key={`${n.channel}:${n.kind}`} className="flex items-center gap-2.5 py-[7px] first:pt-0 last:pb-0">
                          {n.channel === "email" ? (
                            <EnvelopeIcon className="h-[15px] w-[15px] shrink-0 text-ec-ink-2" />
                          ) : (
                            <Icon name="bell" className="h-[15px] w-[15px] shrink-0 text-ec-ink-2" />
                          )}
                          <span className="shrink-0 text-[12.5px] font-medium text-ec-ink">{tn.has(`channel.${n.channel}`) ? tn(`channel.${n.channel}`) : n.channel}</span>
                          <span className="min-w-0 truncate text-[12.5px] text-ec-muted-ink">{tn.has(`kind.${n.kind}`) ? tn(`kind.${n.kind}`) : n.kind.replace(/_/g, " ")}</span>
                        </li>
                      ))}
                    </ul>
                    {lastNotify && (
                      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-ec-line pt-2.5 text-[12.5px] text-ec-muted-ink">
                        <span>{tf("notify.lastSent", { date: lastNotify.sent_at ? new Date(lastNotify.sent_at).toLocaleString("en-IN") : "—" })}</span>
                        <Link href="/dashboard/notifications" className="shrink-0 text-ec-bronze hover:underline">{tf("notify.manage")} →</Link>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-ec-ink-3">{tf("notify.empty")}</p>
                )}
              </div>
            </Reveal>

            {/* D1: Documents moved above Deadlines (was Deadlines → Documents). */}
            <Reveal as="section" id="documents" delay={200} className="scroll-mt-28">
              <SectionLabel>{t("documents.title")}</SectionLabel>
              <div className="ec-card">
                <div className="border-b border-ec-hair px-3 py-2.5"><AddDocumentForm matterId={matter.id} /></div>
                {docRows.length ? (
                  <DocumentsCard docs={docRows} matterId={matter.id} matterOpts={matterOpts} clientOpts={clientOpts} />
                ) : (
                  <p className="px-4 py-6 text-center text-sm text-ec-ink-3">{t("documents.empty")}</p>
                )}
                <Link href="/dashboard/documents" className="block border-t border-ec-hair px-4 py-2.5 text-[12.5px] text-ec-bronze-deep hover:underline">
                  {tf("allDocuments")} →
                </Link>
              </div>
            </Reveal>

            <Reveal as="section" delay={240}>
              <SectionLabel>{t("deadlines.title")}</SectionLabel>
              <div className="ec-card divide-y divide-ec-hair">
                {(() => {
                  const proposed = (deadlines ?? []).filter((d) => d.status === "proposed");
                  const firm = (deadlines ?? []).filter((d) => d.status !== "proposed" && d.status !== "dismissed");
                  if (!proposed.length && !firm.length) return <p className="px-4 py-6 text-center text-sm text-ec-ink-3">{t("deadlines.empty")}</p>;
                  return (
                    <>
                      {proposed.map((d) => (
                        <div key={d.id} className="p-4">
                          <span className="ec-chip ec-chip-warn">{t("deadlines.proposed")}</span>
                          <div className="mt-1.5 text-[13.5px] text-ec-ink">{d.kind.replace(/_/g, " ")}{d.basis ? <span className="block text-xs text-ec-warn">{d.basis}</span> : null}</div>
                          <div className="num text-[11.5px] text-ec-ink-3">{formatCourtDate(d.due_date) ?? "—"}</div>
                          <div className="mt-2"><ProposedDeadlineActions deadlineId={d.id} /></div>
                        </div>
                      ))}
                      {firm.map((d) => {
                        const overdue = d.status === "open" && d.due_date < todayIso;
                        return (
                          <div key={d.id} className="p-4">
                            <div className="text-[13.5px] text-ec-ink">{d.kind.replace(/_/g, " ")}{d.jurisdiction_rule ? <span className="text-ec-ink-3"> — {d.jurisdiction_rule}</span> : null}</div>
                            <div className={`num text-[11.5px] ${overdue ? "text-ec-danger" : "text-ec-ink-3"}`}>{formatCourtDate(d.due_date) ?? "—"}{d.status !== "open" ? ` · ${d.status}` : overdue ? ` · ${t("deadlines.overdue")}` : ""}</div>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
                <div className="p-4">
                  <DeadlineRuleForm matterId={matter.id} rules={deadlineRules ?? []} />
                </div>
              </div>
            </Reveal>

            <Reveal as="section" delay={280}>
              <SectionLabel>{tf("inbox.title")}</SectionLabel>
              <div className="ec-card p-4">
                {latestInbound ? (
                  <div className="flex items-start gap-2.5">
                    <Icon name="inbox" className="mt-[3px] h-4 w-4 shrink-0 text-ec-ink-3" />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] text-ec-ink">{latestInbound.counterparty ?? "—"}</div>
                      {(latestInbound.subject ?? latestInbound.preview) && <div className="line-clamp-2 text-[12.5px] text-ec-ink-2">{latestInbound.subject ?? latestInbound.preview}</div>}
                      <div className="num text-[10.5px] text-ec-ink-3">{fmtAgo(latestInbound.occurred_at)}</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-ec-ink-3">{tf("inbox.empty")}</p>
                )}
                <Link href="/dashboard/inbox" className="mt-3 block border-t border-ec-hair pt-2.5 text-[12.5px] text-ec-bronze-deep hover:underline">
                  {tf("inbox.review")} →
                </Link>
              </div>
            </Reveal>

            <Reveal as="section" delay={320}>
              <SectionLabel>{t("billing.title")}</SectionLabel>
              <div className="ec-card p-4">
                <div className="flex justify-between text-[13px]"><span className="text-ec-ink-2">{t("billing.unbilled")}</span><span className="num text-ec-ink">{fmtHours(totalMinutes)}</span></div>
                <div className="mt-1.5 flex justify-between text-[13px]"><span className="text-ec-ink-2">{tf("billing.outstanding")}</span><span className="num text-ec-ink">{fmtMoney(wip)}</span></div>
                <LogTimeToggle matterId={matter.id} label={t("timeExpense.logTime")} />
              </div>
            </Reveal>

            <Reveal as="section" delay={360}>
              <SectionLabel>{t("activity.title")}</SectionLabel>
              <ul className="ec-card divide-y divide-ec-hair">
                {activity && activity.length ? activity.map((a) => (
                  <li key={a.id} className="px-4 py-2.5">
                    <div className="num text-[10.5px] text-ec-ink-3">{fmtAgo(a.created_at)}</div>
                    <div className="text-[12.5px] text-ec-ink-2">{a.summary}</div>
                  </li>
                )) : <li className="px-4 py-6 text-center text-sm text-ec-ink-3">{t("activity.empty")}</li>}
              </ul>
            </Reveal>
          </aside>
        </div>
      </div>
    </div>
  );
}
