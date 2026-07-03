import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fmtDate, fmtAgo, fmtSize, fmtMoney, fmtHours } from "@/components/ui";
import { Icon } from "@/components/icons";
import { DocActions } from "@/components/doc-actions";
import { LogTimeExpense } from "./time-expense";
import type { CaseSummary } from "@/lib/docs/case-summary";
import { findSimilarCases } from "@/lib/court/similar";
import { RefreshButton, GenerateSummaryButton, AddDocumentForm, EditCaseForm, ProposedDeadlineActions, MatterDiaryDate } from "./case-actions";
import { CaseTabs, CaseTabPanel } from "./case-tabs";
import { CreateInvoiceButton } from "../../invoices/invoices-ui";
import { Communications } from "@/components/communications";
import { ConfirmDelete } from "@/components/confirm-delete";
import { deleteMatter } from "../actions";
import { DeadlineRuleForm } from "./deadline-rules";

type Party = { name?: string; side?: string; advocate?: string };

const STATUS_TONE: Record<string, string> = { active: "green", disposed: "neutral" };
// tone → ec chip class
const chip = (tone: string) =>
  `ec-chip ${({ green: "ec-chip-success", amber: "ec-chip-warn", red: "ec-chip-danger", brand: "ec-chip-hot", neutral: "" } as Record<string, string>)[tone] ?? ""}`;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const truncate = (s: string, n = 32) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

const CASE_TAB_DEFS = [
  { id: "overview", label: "overview", icon: "sparkles" as const },
  { id: "court", label: "court", icon: "scale" as const },
  { id: "documents", label: "documents", icon: "documents" as const },
  { id: "billing", label: "billing", icon: "clock" as const },
  { id: "comms", label: "comms", icon: "inbox" as const },
];

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const t = await getTranslations("caseDetail");
  const tc = await getTranslations("common");
  const te = await getTranslations("enum");
  const st = (v: string) => (te.has(`status.${v}`) ? te(`status.${v}`) : v);
  const { data: matter } = await supabase.from("matter").select("*").eq("id", params.id).maybeSingle();
  if (!matter) notFound();

  const [{ data: hearings }, { data: docs }, { data: client }, { data: activity }, { data: allMatters }, { data: allClients }] = await Promise.all([
    supabase.from("hearing").select("id, date, purpose, court_no, judge").eq("matter_id", matter.id).order("date", { ascending: false }),
    supabase.from("document").select("id, filename, doc_type, source, size_bytes, created_at, parsed_text, matter_id, client_id, portal_shared").eq("matter_id", matter.id).order("created_at", { ascending: false }),
    matter.client_id ? supabase.from("client").select("name").eq("id", matter.client_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("activity_event").select("id, type, summary, created_at").eq("matter_id", matter.id).order("created_at", { ascending: false }).limit(30),
    supabase.from("matter").select("id, title").order("title"),
    supabase.from("client").select("id, name").order("name"),
  ]);
  const matterOpts = (allMatters ?? []).map((m) => ({ id: m.id, label: m.title }));
  const clientOpts = (allClients ?? []).map((c) => ({ id: c.id, label: c.name }));

  const [{ data: timeEntries }, { data: expenses }, { data: caseInvoices }, { data: caseNotices }] = await Promise.all([
    supabase.from("time_entry").select("id, entry_date, minutes, billable, rate_minor, narrative").eq("matter_id", matter.id).order("entry_date", { ascending: false }),
    supabase.from("expense").select("id, entry_date, category, amount_minor, billable, notes").eq("matter_id", matter.id).order("entry_date", { ascending: false }),
    supabase.from("invoice").select("id, number, status, issue_date, total_minor").eq("matter_id", matter.id).order("created_at", { ascending: false }),
    supabase.from("notice").select("id, type, escalation_state, response_due").eq("matter_id", matter.id).order("created_at", { ascending: false }),
  ]);
  const totalMinutes = (timeEntries ?? []).reduce((s, t2) => s + t2.minutes, 0);
  const billableTime = (timeEntries ?? []).filter((t2) => t2.billable).reduce((s, t2) => s + Math.round((t2.minutes / 60) * t2.rate_minor), 0);
  const billableExp = (expenses ?? []).filter((e) => e.billable).reduce((s, e) => s + e.amount_minor, 0);
  const wip = billableTime + billableExp;

  const [{ data: orders }, similar, { data: deadlines }, { data: deadlineRules }] = await Promise.all([
    supabase.from("court_order").select("id, order_date, title, url, raw").eq("matter_id", matter.id).order("order_date", { ascending: false, nullsFirst: false }),
    findSimilarCases(supabase, {
      id: matter.id,
      party_names: matter.party_names ?? [],
      advocate_names: matter.advocate_names ?? [],
      judge_names: matter.judge_names ?? [],
      act_names: matter.act_names ?? [],
    }, 6),
    supabase.from("deadline").select("id, kind, due_date, jurisdiction_rule, status, basis").eq("matter_id", matter.id).order("due_date", { ascending: true }),
    supabase.from("deadline_rule").select("id, kind, days, jurisdiction, description").order("jurisdiction"),
  ]);

  const parties = (Array.isArray(matter.parties) ? matter.parties : []) as Party[];
  const ai = matter.ai_summary as unknown as CaseSummary | null;
  const acts = (matter.act_names ?? []) as string[];
  const detail = (matter.detail ?? {}) as Record<string, unknown>;

  const caseDetails: [string, string | null][] = [
    [t("detail.registrationNo"), str(detail.registrationNumber)],
    [t("detail.filingNo"), str(detail.filingNumber)],
    [t("detail.registrationDate"), detail.registrationDate ? fmtDate(str(detail.registrationDate)) : null],
    [t("detail.filingDate"), detail.filingDate ? fmtDate(str(detail.filingDate)) : null],
    [t("detail.district"), str(detail.district)],
    [t("detail.state"), str(detail.state)],
    [t("detail.coram"), str(detail.coram)],
    [t("detail.decidedOn"), detail.decisionDate ? fmtDate(str(detail.decisionDate)) : null],
    [t("detail.firNo"), detail.firNo ? `${str(detail.firNo)}${detail.firYear ? `/${str(detail.firYear)}` : ""}` : null],
    [t("detail.policeStation"), str(detail.policeStation)],
  ].filter(([, v]) => v) as [string, string | null][];

  const processes = (Array.isArray(detail.processes) ? detail.processes : []) as { process_id?: string; process_date?: string; title?: string }[];
  const advocateBars = (detail.advocateBars ?? {}) as Record<string, string>;
  const regional = (detail.regional ?? {}) as { pet_name?: string | null; res_name?: string | null };

  const info: [string, string | null][] = [
    [t("info.court"), matter.court],
    [t("info.caseType"), matter.case_type],
    [t("info.stage"), matter.stage],
    [t("info.client"), client?.name ?? null],
    [t("info.next"), matter.next_hearing_override ? `${fmtDate(matter.next_hearing_override)} ${t("info.yourDiary")}` : fmtDate(matter.next_hearing_date)],
    [t("info.judge"), hearings?.find((h) => h.judge)?.judge ?? null],
  ];
  const refreshed = matter.last_synced_at ? new Date(matter.last_synced_at).toLocaleString("en-IN") : t("source.never");

  return (
    <div className="space-y-6 text-ec-ink">
      <Link href="/dashboard/cases" className="inline-flex items-center gap-1.5 text-sm font-medium text-ec-brass-deep hover:text-ec-brass">
        <Icon name="back" className="h-4 w-4" /> {t("back")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[1.7rem] font-medium leading-tight tracking-tight">{matter.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {matter.cnr && <span className={`num ${chip("brand")} inline-flex items-center gap-1`}><Icon name="cases" className="h-3 w-3" /> {matter.cnr}</span>}
            <span className={chip(STATUS_TONE[matter.status] ?? "neutral")}>{st(matter.status)}</span>
            {matter.source && <span className="text-xs text-ec-ink-3">{t("via", { source: matter.source })}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EditCaseForm
            matterId={matter.id}
            initial={{
              title: matter.title, court: matter.court ?? "", case_type: matter.case_type ?? "",
              stage: matter.stage ?? "", status: matter.status ?? "active", next_hearing_date: matter.next_hearing_date ?? "",
            }}
          />
          {matter.cnr && <RefreshButton matterId={matter.id} />}
          <ConfirmDelete action={deleteMatter} id={matter.id} label={t("delete")} confirmLabel={t("deleteConfirm")} note={t("deleteNote")} redirectTo="/dashboard/cases" size="md" />
        </div>
      </header>

      <CaseTabs tabs={CASE_TAB_DEFS.map((d) => ({ ...d, label: t(`tab.${d.label}`) }))}>
      <CaseTabPanel id="overview">

      {/* AI briefing */}
      <div className="ec-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-ec-hair bg-ec-brass-tint/30 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Icon name="sparkles" className="h-4 w-4 text-ec-brass-deep" />
            <h2 className="font-display text-base font-medium">{t("ai.title")}</h2>
            {ai?.generated_at && <span className="text-xs text-ec-ink-3">· {fmtAgo(ai.generated_at)}</span>}
          </div>
          <GenerateSummaryButton matterId={matter.id} has={!!ai} />
        </div>
        <div className="px-5 py-5">
          {ai ? (
            <div className="space-y-5">
              <p className="font-display text-[0.98rem] leading-relaxed text-ec-ink-2">{ai.summary}</p>
              {ai.posture && (
                <div className="rounded-ec-m bg-ec-paper-3 px-4 py-3">
                  <p className="ec-label mb-1">{t("ai.posture")}</p>
                  <p className="text-sm text-ec-ink-2">{ai.posture}</p>
                </div>
              )}
              {ai.key_points && ai.key_points.length > 0 && (
                <div>
                  <p className="ec-label mb-2">{t("ai.keyPoints")}</p>
                  <ul className="space-y-1.5">
                    {ai.key_points.map((s, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-ec-ink-2">
                        <Icon name="dot" className="mt-1 h-2 w-2 shrink-0 text-ec-ink-3" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {ai.next_steps.length > 0 && (
                <div>
                  <p className="ec-label mb-2">{t("ai.nextSteps")}</p>
                  <ul className="space-y-1.5">
                    {ai.next_steps.map((s, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-ec-ink-2">
                        <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-ec-brass-deep" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {ai.risk_flags.length > 0 && (
                <div className="rounded-ec-m bg-ec-warn-t px-4 py-3">
                  <p className="ec-label mb-1.5 text-ec-warn">{t("ai.watch")}</p>
                  <ul className="space-y-1">
                    {ai.risk_flags.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-ec-ink-2">
                        <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ec-warn" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {ai.arguments && ai.arguments.length > 0 && (
                <div>
                  <p className="ec-label mb-2">{t("ai.arguments")}</p>
                  <ul className="space-y-1.5">
                    {ai.arguments.map((s, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-ec-ink-2">
                        <Icon name="scale" className="mt-0.5 h-4 w-4 shrink-0 text-ec-brass-deep" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {ai.what_to_present && ai.what_to_present.length > 0 && (
                <div>
                  <p className="ec-label mb-2">{t("ai.present")}</p>
                  <ul className="space-y-1.5">
                    {ai.what_to_present.map((s, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-ec-ink-2">
                        <Icon name="documents" className="mt-0.5 h-4 w-4 shrink-0 text-ec-brass-deep" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-ec-ink-3">{t("ai.disclaimer")}</p>
            </div>
          ) : (
            <p className="text-sm text-ec-ink-3">{t("ai.empty")}</p>
          )}
        </div>
      </div>

      {/* Info grid */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {info.map(([label, value]) => (
          <div key={label} className="ec-card p-4">
            <p className="ec-label">{label}</p>
            <p className="mt-1.5 text-sm text-ec-ink">{value ?? "—"}</p>
          </div>
        ))}
      </section>

      <div className="ec-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="num text-sm text-ec-ink-3">{t("source.line", { source: matter.source ?? "manual", time: refreshed })}</p>
          <MatterDiaryDate matterId={matter.id} synced={matter.next_hearing_date} override={matter.next_hearing_override ?? null} />
        </div>
        <p className="mt-2 text-xs text-ec-ink-3">{t("source.note")} <span className="font-medium text-ec-ink-2">{t("source.verify")}</span> {t("source.diaryHint")}</p>
      </div>

      </CaseTabPanel>
      <CaseTabPanel id="court">

      {caseDetails.length > 0 && (
        <div className="ec-card">
          <div className="border-b border-ec-hair px-5 py-4"><h2 className="font-display text-base font-medium">{t("details.title")}</h2></div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-3">
            {caseDetails.map(([label, value]) => (
              <div key={label}>
                <dt className="ec-label">{label}</dt>
                <dd className="mt-1 text-sm text-ec-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {acts.length > 0 && (
        <div className="ec-card">
          <div className="border-b border-ec-hair px-5 py-4"><h2 className="font-display text-base font-medium">{t("acts.title")}</h2></div>
          <div className="flex flex-wrap gap-2 px-5 py-5">
            {acts.map((a, i) => (
              <span key={i} className={chip("brand")}>{a}</span>
            ))}
          </div>
        </div>
      )}

      <div className="ec-card">
        <div className="border-b border-ec-hair px-5 py-4">
          <h2 className="font-display text-base font-medium">{t("deadlines.title")}</h2>
          <p className="mt-0.5 text-xs text-ec-ink-3">{t("deadlines.help")}</p>
        </div>
        <div className="space-y-4 px-5 py-5">
          {(() => {
            const proposed = (deadlines ?? []).filter((d) => d.status === "proposed");
            const firm = (deadlines ?? []).filter((d) => d.status !== "proposed" && d.status !== "dismissed");
            return (
              <>
                {proposed.length > 0 && (
                  <div className="rounded-ec-m bg-ec-warn-t px-4 py-3">
                    <p className="ec-label mb-2 text-ec-warn">{t("deadlines.proposed")}</p>
                    <ul className="space-y-2">
                      {proposed.map((d) => (
                        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm text-ec-ink">
                            {d.kind.replace(/_/g, " ")} · <span className="num font-medium">{fmtDate(d.due_date)}</span>
                            {d.basis ? <span className="block text-xs text-ec-warn">{d.basis}</span> : null}
                          </span>
                          <ProposedDeadlineActions deadlineId={d.id} />
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-ec-warn">{t("deadlines.proposedNote")}</p>
                  </div>
                )}
                {firm.length > 0 ? (
                  <ul className="space-y-1.5 text-sm">
                    {firm.map((d) => {
                      const overdue = d.status === "open" && d.due_date < new Date().toISOString().slice(0, 10);
                      return (
                        <li key={d.id} className="flex items-center justify-between gap-2">
                          <span className="text-ec-ink">{d.kind.replace(/_/g, " ")}{d.jurisdiction_rule ? <span className="text-ec-ink-3"> — {d.jurisdiction_rule}</span> : null}</span>
                          <span className={`num shrink-0 text-xs ${overdue ? "font-medium text-ec-warn" : "text-ec-ink-3"}`}>{fmtDate(d.due_date)}{d.status !== "open" ? ` · ${d.status}` : overdue ? ` · ${t("deadlines.overdue")}` : ""}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : proposed.length === 0 ? (
                  <p className="text-sm text-ec-ink-3">{t("deadlines.empty")}</p>
                ) : null}
              </>
            );
          })()}
          <DeadlineRuleForm matterId={matter.id} rules={deadlineRules ?? []} />
        </div>
      </div>

      {/* Parties + hearings */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="ec-card">
          <div className="border-b border-ec-hair px-5 py-4"><h2 className="font-display text-base font-medium">{t("parties.title")}</h2></div>
          {parties.length ? (
            <ul className="divide-y divide-ec-hair">
              {parties.map((p, i) => {
                const reg = p.side === "petitioner" ? regional.pet_name : p.side === "respondent" ? regional.res_name : null;
                const bar = p.advocate ? advocateBars[p.advocate] : undefined;
                return (
                  <li key={i} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium text-ec-ink">{p.name}</span>
                      {reg && reg !== p.name && reg !== "XXXXXXX" && <span className="block text-xs text-ec-ink-3">{reg}</span>}
                    </span>
                    <span className="shrink-0 text-right text-xs text-ec-ink-3">
                      {p.side}
                      {p.advocate && (bar
                        ? <> · <Link href={`/dashboard/advocate/${bar}`} className="text-ec-brass-deep hover:text-ec-brass">{p.advocate}</Link></>
                        : ` · ${p.advocate}`)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-ec-ink-3">{t("parties.empty")}</p>
          )}
        </div>

        <div className="ec-card">
          <div className="border-b border-ec-hair px-5 py-4"><h2 className="font-display text-base font-medium">{t("hearings.title")}</h2></div>
          {hearings && hearings.length ? (
            <ul className="divide-y divide-ec-hair">
              {hearings.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="num w-20 shrink-0 text-ec-ink-3">{fmtDate(h.date)}</span>
                  <span className="flex-1 text-ec-ink">{h.purpose ?? t("hearings.fallback")}</span>
                  <span className="text-xs text-ec-ink-3">{h.judge ? <Link href={`/api/court/judge?name=${encodeURIComponent(h.judge)}`} className="hover:text-ec-brass-deep">{h.judge}</Link> : ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-ec-ink-3">{t("hearings.empty")}</p>
          )}
        </div>
      </div>

      {/* Similar cases */}
      <div className="ec-card">
        <div className="border-b border-ec-hair px-5 py-4">
          <h2 className="font-display text-base font-medium">{t("similar.title")}</h2>
          <p className="mt-1 text-xs text-ec-ink-3">{t("similar.help")}</p>
        </div>
        {similar.length ? (
          <ul className="divide-y divide-ec-hair">
            {similar.map((s) => {
              const reasons: { tone: string; label: string }[] = [
                ...s.shared.parties.map((v) => ({ tone: "brand", label: `${t("reason.party")} · ${truncate(v)}` })),
                ...s.shared.advocates.map((v) => ({ tone: "green", label: `${t("reason.advocate")} · ${truncate(v)}` })),
                ...s.shared.judges.map((v) => ({ tone: "neutral", label: `${t("reason.judge")} · ${truncate(v)}` })),
                ...s.shared.acts.map((v) => ({ tone: "amber", label: `${t("reason.act")} · ${truncate(v)}` })),
              ];
              return (
                <li key={s.id} className="ec-row px-5 py-3.5">
                  <Link href={`/dashboard/cases/${s.id}`} className="group block">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ec-ink group-hover:text-ec-brass-deep">
                        {s.title}
                        {s.cnr && <span className="num ml-2 text-xs font-normal text-ec-ink-3">{s.cnr}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-ec-ink-3">{s.court ?? "—"}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {s.next_hearing_date && (
                        <span className="num mr-1 text-xs text-ec-ink-3">{t("similar.next", { date: fmtDate(s.next_hearing_date) })}</span>
                      )}
                      {reasons.map((r, i) => (
                        <span key={i} className={chip(r.tone)}>{r.label}</span>
                      ))}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-ec-m bg-ec-brass-tint text-ec-brass-deep">
              <Icon name="cases" className="h-5 w-5" />
            </span>
            <h3 className="font-display text-base font-medium text-ec-ink">{t("similar.emptyTitle")}</h3>
            <p className="mt-1 text-sm text-ec-ink-3">{t("similar.emptyBody")}</p>
          </div>
        )}
      </div>

      {orders && orders.length > 0 && (
        <div className="ec-card">
          <div className="border-b border-ec-hair px-5 py-4">
            <h2 className="font-display text-base font-medium">{t("orders.title")} <span className="text-ec-ink-3">({orders.length})</span></h2>
          </div>
          <ul className="divide-y divide-ec-hair">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Icon name="notices" className="h-4 w-4 shrink-0 text-ec-ink-3" />
                <span className="num w-24 shrink-0 text-ec-ink-3">{fmtDate(o.order_date)}</span>
                {(o.raw as { order_id?: unknown } | null)?.order_id ? (
                  <a href={`/api/court/order-pdf?order=${o.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium text-ec-brass-deep hover:text-ec-brass">
                    <span className="truncate">{o.title}</span>
                    <Icon name="external" className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : o.url ? (
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium text-ec-brass-deep hover:text-ec-brass">
                    <span className="truncate">{o.title}</span>
                    <Icon name="external" className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate font-medium text-ec-ink">{o.title}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {processes.length > 0 && (
        <div className="ec-card">
          <div className="border-b border-ec-hair px-5 py-4">
            <h2 className="font-display text-base font-medium">{t("processes.title")} <span className="text-ec-ink-3">({processes.length})</span></h2>
            <p className="mt-0.5 text-xs text-ec-ink-3">{t("processes.help")}</p>
          </div>
          <ul className="divide-y divide-ec-hair">
            {processes.map((p, i) => (
              <li key={p.process_id ?? i} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Icon name="alert" className="h-4 w-4 shrink-0 text-ec-warn" />
                <span className="num w-24 shrink-0 text-ec-ink-3">{fmtDate(p.process_date)}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-ec-ink">{p.title ?? t("processes.fallback")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      </CaseTabPanel>
      <CaseTabPanel id="documents">

      <div className="ec-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ec-hair px-5 py-4">
          <h2 className="font-display text-base font-medium">{t("documents.title")} <span className="text-ec-ink-3">({docs?.length ?? 0})</span></h2>
          <AddDocumentForm matterId={matter.id} />
        </div>
        {docs && docs.length ? (
          <ul className="divide-y divide-ec-hair">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Icon name="documents" className="h-4 w-4 shrink-0 text-ec-ink-3" />
                <span className="min-w-0 flex-1 truncate font-medium text-ec-ink">{d.filename}</span>
                <span className={chip("neutral")}>{d.doc_type ?? d.source}</span>
                <span className="num hidden text-xs text-ec-ink-3 sm:inline">{fmtSize(d.size_bytes)}</span>
                <DocActions documentId={d.id} matterId={d.matter_id} clientId={d.client_id} matters={matterOpts} clients={clientOpts} shared={d.portal_shared} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-ec-ink-3">{t("documents.empty")}</p>
        )}
      </div>

      </CaseTabPanel>
      <CaseTabPanel id="billing">

      <div className="ec-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ec-hair px-5 py-4">
          <h2 className="font-display text-base font-medium">{t("billing.title")}</h2>
          <div className="num flex items-center gap-4 text-sm">
            <span className="text-ec-ink-3">{t("billing.time")} <span className="font-medium text-ec-ink">{fmtHours(totalMinutes)}</span></span>
            <span className="text-ec-ink-3">{t("billing.unbilled")} <span className="font-medium text-ec-ink">{fmtMoney(wip)}</span></span>
            <CreateInvoiceButton matterId={matter.id} />
          </div>
        </div>
        <LogTimeExpense matterId={matter.id} />
        {((timeEntries?.length ?? 0) + (expenses?.length ?? 0)) > 0 && (
          <ul className="divide-y divide-ec-hair border-t border-ec-hair">
            {(timeEntries ?? []).map((t2) => (
              <li key={t2.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <Icon name="clock" className="h-4 w-4 shrink-0 text-ec-ink-3" />
                <span className="num w-20 shrink-0 text-ec-ink-3">{fmtDate(t2.entry_date)}</span>
                <span className="flex-1 truncate text-ec-ink-2">{t2.narrative ?? t("billing.entryFallback")}</span>
                {!t2.billable && <span className={chip("neutral")}>{t("billing.nonBillable")}</span>}
                <span className="num text-ec-ink-3">{fmtHours(t2.minutes)}</span>
                <span className="num w-20 text-right font-medium text-ec-ink">{fmtMoney(Math.round((t2.minutes / 60) * t2.rate_minor))}</span>
              </li>
            ))}
            {(expenses ?? []).map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <Icon name="notices" className="h-4 w-4 shrink-0 text-ec-ink-3" />
                <span className="num w-20 shrink-0 text-ec-ink-3">{fmtDate(e.entry_date)}</span>
                <span className="flex-1 truncate text-ec-ink-2">{e.notes ?? e.category} <span className="text-ec-ink-3">· {e.category}</span></span>
                {!e.billable && <span className={chip("neutral")}>{t("billing.nonBillable")}</span>}
                <span className="num w-20 text-right font-medium text-ec-ink">{fmtMoney(e.amount_minor)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {caseInvoices && caseInvoices.length > 0 && (
        <div className="ec-card">
          <div className="border-b border-ec-hair px-5 py-4"><h2 className="font-display text-base font-medium">{t("invoices.title")} <span className="text-ec-ink-3">({caseInvoices.length})</span></h2></div>
          <ul className="divide-y divide-ec-hair">
            {caseInvoices.map((inv) => (
              <li key={inv.id}>
                <Link href={`/dashboard/invoices/${inv.id}`} className="ec-row flex items-center justify-between px-5 py-3 text-sm">
                  <span className="num font-medium text-ec-brass-deep">{inv.number ?? t("invoices.draft")} · {fmtDate(inv.issue_date)}</span>
                  <span className="flex items-center gap-3"><span className="num font-medium text-ec-ink">{fmtMoney(inv.total_minor)}</span><span className={chip(inv.status === "paid" ? "green" : inv.status === "sent" ? "amber" : "neutral")}>{inv.status}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      </CaseTabPanel>
      <CaseTabPanel id="comms">

      {caseNotices && caseNotices.length > 0 && (
        <div className="ec-card">
          <div className="border-b border-ec-hair px-5 py-4"><h2 className="font-display text-base font-medium">{t("notices.title")} <span className="text-ec-ink-3">({caseNotices.length})</span></h2></div>
          <ul className="divide-y divide-ec-hair">
            {caseNotices.map((n) => (
              <li key={n.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <Link href="/dashboard/notices" className="font-medium capitalize text-ec-brass-deep">{n.type.replace(/_/g, " ")}</Link>
                <span className="flex items-center gap-3">{n.response_due && <span className="num text-xs text-ec-ink-3">{t("notices.due", { date: fmtDate(n.response_due) })}</span>}<span className={chip(/escalat/.test(n.escalation_state) ? "red" : ["responded", "closed"].includes(n.escalation_state) ? "green" : "amber")}>{n.escalation_state.replace(/_/g, " ")}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Communications matterId={matter.id} />

      <div className="ec-card">
        <div className="border-b border-ec-hair px-5 py-4"><h2 className="font-display text-base font-medium">{t("activity.title")}</h2></div>
        {activity && activity.length ? (
          <ul className="px-5 py-2">
            {activity.map((a) => (
              <li key={a.id} className="flex gap-3 py-2.5 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ec-brass" />
                <span className="flex-1 text-ec-ink-2">{a.summary}</span>
                <span className="shrink-0 text-xs text-ec-ink-3">{fmtAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-ec-ink-3">{t("activity.empty")}</p>
        )}
      </div>

      </CaseTabPanel>
      </CaseTabs>

      <p className="flex items-center gap-1.5 text-xs text-ec-ink-3">
        <Icon name="alert" className="h-3.5 w-3.5" /> {tc("disclaimer")}
      </p>
    </div>
  );
}
