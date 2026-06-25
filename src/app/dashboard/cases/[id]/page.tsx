import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Badge, EmptyState, Disclaimer, fmtDate, fmtAgo, fmtSize, fmtMoney, fmtHours } from "@/components/ui";
import { Icon } from "@/components/icons";
import { DocActions } from "@/components/doc-actions";
import { LogTimeExpense } from "./time-expense";
import type { CaseSummary } from "@/lib/docs/case-summary";
import { findSimilarCases } from "@/lib/court/similar";
import { RefreshButton, GenerateSummaryButton, AddDocumentForm, EditCaseForm } from "./case-actions";
import { Communications } from "@/components/communications";

type Party = { name?: string; side?: string; advocate?: string };

const STATUS_TONE: Record<string, "green" | "amber" | "neutral"> = { active: "green", disposed: "neutral" };

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const truncate = (s: string, n = 32) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export default async function CaseDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
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

  const [{ data: timeEntries }, { data: expenses }] = await Promise.all([
    supabase.from("time_entry").select("id, entry_date, minutes, billable, rate_minor, narrative").eq("matter_id", matter.id).order("entry_date", { ascending: false }),
    supabase.from("expense").select("id, entry_date, category, amount_minor, billable, notes").eq("matter_id", matter.id).order("entry_date", { ascending: false }),
  ]);
  const totalMinutes = (timeEntries ?? []).reduce((s, t) => s + t.minutes, 0);
  const billableTime = (timeEntries ?? []).filter((t) => t.billable).reduce((s, t) => s + Math.round((t.minutes / 60) * t.rate_minor), 0);
  const billableExp = (expenses ?? []).filter((e) => e.billable).reduce((s, e) => s + e.amount_minor, 0);
  const wip = billableTime + billableExp;

  const [{ data: orders }, similar] = await Promise.all([
    supabase.from("court_order").select("id, order_date, title, url").eq("matter_id", matter.id).order("order_date", { ascending: false, nullsFirst: false }),
    findSimilarCases(supabase, {
      id: matter.id,
      party_names: matter.party_names ?? [],
      advocate_names: matter.advocate_names ?? [],
      judge_names: matter.judge_names ?? [],
      act_names: matter.act_names ?? [],
    }, 6),
  ]);

  const parties = (Array.isArray(matter.parties) ? matter.parties : []) as Party[];
  const ai = matter.ai_summary as unknown as CaseSummary | null;
  const acts = (matter.act_names ?? []) as string[];
  const detail = (matter.detail ?? {}) as Record<string, unknown>;

  const caseDetails: [string, string | null][] = [
    ["Registration no.", str(detail.registrationNumber)],
    ["Filing no.", str(detail.filingNumber)],
    ["Registration date", detail.registrationDate ? fmtDate(str(detail.registrationDate)) : null],
    ["Filing date", detail.filingDate ? fmtDate(str(detail.filingDate)) : null],
    ["District", str(detail.district)],
    ["State", str(detail.state)],
  ].filter(([, v]) => v) as [string, string | null][];

  const info: [string, string | null][] = [
    ["Court", matter.court],
    ["Case type", matter.case_type],
    ["Stage", matter.stage],
    ["Client", client?.name ?? null],
    ["Next hearing", fmtDate(matter.next_hearing_date)],
    ["Judge", hearings?.find((h) => h.judge)?.judge ?? null],
  ];

  return (
    <div className="space-y-7">
      <Link href="/dashboard/cases" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <Icon name="back" className="h-4 w-4" /> Cases
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.7rem] font-semibold leading-tight">{matter.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {matter.cnr && <Badge tone="brand"><Icon name="cases" className="h-3 w-3" /> {matter.cnr}</Badge>}
            <Badge tone={STATUS_TONE[matter.status] ?? "neutral"}>{matter.status}</Badge>
            {matter.source && <span className="text-xs text-ink-faint">via {matter.source}</span>}
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
        </div>
      </header>

      {/* AI summary */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-brand-50/40 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Icon name="sparkles" className="h-4 w-4 text-brand-600" />
            <h2 className="text-base font-medium">AI briefing</h2>
            {ai?.generated_at && <span className="text-xs text-ink-faint">· {fmtAgo(ai.generated_at)}</span>}
          </div>
          <GenerateSummaryButton matterId={matter.id} has={!!ai} />
        </div>
        <div className="px-5 py-5">
          {ai ? (
            <div className="space-y-5">
              <p className="text-[0.95rem] leading-relaxed text-ink-soft">{ai.summary}</p>
              {ai.posture && (
                <div className="rounded-xl bg-paper px-4 py-3">
                  <p className="label mb-1">Procedural posture</p>
                  <p className="text-sm text-ink-soft">{ai.posture}</p>
                </div>
              )}
              {ai.key_points && ai.key_points.length > 0 && (
                <div>
                  <p className="label mb-2">Key points</p>
                  <ul className="space-y-1.5">
                    {ai.key_points.map((s, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-ink-soft">
                        <Icon name="dot" className="mt-1 h-2 w-2 shrink-0 text-ink-faint" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {ai.next_steps.length > 0 && (
                <div>
                  <p className="label mb-2">Suggested next steps</p>
                  <ul className="space-y-1.5">
                    {ai.next_steps.map((s, i) => (
                      <li key={i} className="flex gap-2.5 text-sm text-ink-soft">
                        <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {ai.risk_flags.length > 0 && (
                <div className="rounded-xl bg-amber-50 px-4 py-3">
                  <p className="label mb-1.5 text-amber-700">Watch</p>
                  <ul className="space-y-1">
                    {ai.risk_flags.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-amber-800">
                        <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-ink-faint">AI-generated from this case record — informational, not legal advice.</p>
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              Generate a plain-language briefing with suggested next steps and risk flags from everything on this case.
            </p>
          )}
        </div>
      </Card>

      {/* Info grid */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {info.map(([label, value]) => (
          <div key={label} className="card p-4">
            <p className="label">{label}</p>
            <p className="mt-1.5 text-sm text-ink">{value ?? "—"}</p>
          </div>
        ))}
      </section>

      <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="text-sm text-ink-muted">
          Source <span className="font-medium text-ink-soft">{matter.source ?? "manual"}</span> · last refreshed{" "}
          {matter.last_synced_at ? new Date(matter.last_synced_at).toLocaleString("en-IN") : "never"}
        </p>
      </Card>

      {/* Case details */}
      {caseDetails.length > 0 && (
        <Card>
          <div className="border-b border-line px-5 py-4"><h2 className="text-base font-medium">Case details</h2></div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-3">
            {caseDetails.map(([label, value]) => (
              <div key={label}>
                <dt className="label">{label}</dt>
                <dd className="mt-1 text-sm text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {/* Acts & Sections */}
      {acts.length > 0 && (
        <Card>
          <div className="border-b border-line px-5 py-4"><h2 className="text-base font-medium">Acts &amp; Sections</h2></div>
          <div className="flex flex-wrap gap-2 px-5 py-5">
            {acts.map((a, i) => (
              <Badge key={i} tone="brand">{a}</Badge>
            ))}
          </div>
        </Card>
      )}

      {/* Parties + hearings */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="border-b border-line px-5 py-4"><h2 className="text-base font-medium">Parties</h2></div>
          {parties.length ? (
            <ul className="divide-y divide-line">
              {parties.map((p, i) => (
                <li key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="font-medium text-ink">{p.name}</span>
                  <span className="text-xs text-ink-faint">{[p.side, p.advocate].filter(Boolean).join(" · ") || "—"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-ink-faint">No party details on record.</p>
          )}
        </Card>

        <Card>
          <div className="border-b border-line px-5 py-4"><h2 className="text-base font-medium">Hearing history</h2></div>
          {hearings && hearings.length ? (
            <ul className="divide-y divide-line">
              {hearings.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="w-20 shrink-0 text-ink-muted">{fmtDate(h.date)}</span>
                  <span className="flex-1 text-ink">{h.purpose ?? "Hearing"}</span>
                  <span className="text-xs text-ink-faint">{h.judge ?? ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-ink-faint">No hearings on record yet.</p>
          )}
        </Card>
      </div>

      {/* Similar cases */}
      <Card>
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-base font-medium">Similar cases</h2>
          <p className="mt-1 text-xs text-ink-faint">Matches by shared parties, advocates, judges, or acts — verify relevance.</p>
        </div>
        {similar.length ? (
          <ul className="divide-y divide-line">
            {similar.map((s) => {
              const reasons: { tone: "brand" | "green" | "amber" | "neutral"; label: string }[] = [
                ...s.shared.parties.map((v) => ({ tone: "brand" as const, label: `party · ${truncate(v)}` })),
                ...s.shared.advocates.map((v) => ({ tone: "green" as const, label: `advocate · ${truncate(v)}` })),
                ...s.shared.judges.map((v) => ({ tone: "neutral" as const, label: `judge · ${truncate(v)}` })),
                ...s.shared.acts.map((v) => ({ tone: "amber" as const, label: `act · ${truncate(v)}` })),
              ];
              return (
                <li key={s.id} className="px-5 py-3.5">
                  <Link href={`/dashboard/cases/${s.id}`} className="group block">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink group-hover:text-brand-700">
                        {s.title}
                        {s.cnr && <span className="ml-2 text-xs font-normal text-ink-faint">{s.cnr}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-ink-faint">{s.court ?? "—"}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {s.next_hearing_date && (
                        <span className="mr-1 text-xs text-ink-muted">Next {fmtDate(s.next_hearing_date)}</span>
                      )}
                      {reasons.map((r, i) => (
                        <Badge key={i} tone={r.tone}>{r.label}</Badge>
                      ))}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon="cases"
            title="No related cases yet"
            body="Similarity grows as you track more matters."
          />
        )}
      </Card>

      {/* Orders & Judgments */}
      {orders && orders.length > 0 && (
        <Card>
          <div className="border-b border-line px-5 py-4">
            <h2 className="text-base font-medium">Orders &amp; Judgments <span className="text-ink-faint">({orders.length})</span></h2>
          </div>
          <ul className="divide-y divide-line">
            {orders.map((o) => (
              <li key={o.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Icon name="notices" className="h-4 w-4 shrink-0 text-ink-faint" />
                <span className="w-24 shrink-0 text-ink-muted">{fmtDate(o.order_date)}</span>
                {o.url ? (
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate font-medium text-brand-600 hover:underline">
                    <span className="truncate">{o.title}</span>
                    <Icon name="external" className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : (
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{o.title}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Documents linked to this case */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-base font-medium">Documents <span className="text-ink-faint">({docs?.length ?? 0})</span></h2>
          <AddDocumentForm matterId={matter.id} />
        </div>
        {docs && docs.length ? (
          <ul className="divide-y divide-line">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Icon name="documents" className="h-4 w-4 shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{d.filename}</span>
                <Badge>{d.doc_type ?? d.source}</Badge>
                <span className="hidden text-xs text-ink-faint sm:inline">{fmtSize(d.size_bytes)}</span>
                <DocActions documentId={d.id} matterId={d.matter_id} clientId={d.client_id} matters={matterOpts} clients={clientOpts} shared={d.portal_shared} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-ink-faint">No documents yet — upload one above, or they&apos;ll arrive auto-filed from Gmail.</p>
        )}
      </Card>

      {/* Time & expenses */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 className="text-base font-medium">Time &amp; expenses</h2>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-ink-muted">Time <span className="font-medium text-ink">{fmtHours(totalMinutes)}</span></span>
            <span className="text-ink-muted">Unbilled <span className="font-medium text-ink">{fmtMoney(wip)}</span></span>
          </div>
        </div>
        <LogTimeExpense matterId={matter.id} />
        {((timeEntries?.length ?? 0) + (expenses?.length ?? 0)) > 0 && (
          <ul className="divide-y divide-line border-t border-line">
            {(timeEntries ?? []).map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <Icon name="clock" className="h-4 w-4 shrink-0 text-ink-faint" />
                <span className="w-20 shrink-0 text-ink-muted">{fmtDate(t.entry_date)}</span>
                <span className="flex-1 truncate text-ink-soft">{t.narrative ?? "Time entry"}</span>
                {!t.billable && <Badge>non-billable</Badge>}
                <span className="text-ink-muted">{fmtHours(t.minutes)}</span>
                <span className="w-20 text-right font-medium text-ink">{fmtMoney(Math.round((t.minutes / 60) * t.rate_minor))}</span>
              </li>
            ))}
            {(expenses ?? []).map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <Icon name="notices" className="h-4 w-4 shrink-0 text-ink-faint" />
                <span className="w-20 shrink-0 text-ink-muted">{fmtDate(e.entry_date)}</span>
                <span className="flex-1 truncate text-ink-soft">{e.notes ?? e.category} <span className="text-ink-faint">· {e.category}</span></span>
                {!e.billable && <Badge>non-billable</Badge>}
                <span className="w-20 text-right font-medium text-ink">{fmtMoney(e.amount_minor)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Communications timeline (email + WhatsApp/SMS) */}
      <Communications matterId={matter.id} />

      {/* Activity timeline */}
      <Card>
        <div className="border-b border-line px-5 py-4"><h2 className="text-base font-medium">Activity</h2></div>
        {activity && activity.length ? (
          <ul className="px-5 py-2">
            {activity.map((a) => (
              <li key={a.id} className="flex gap-3 py-2.5 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-300" />
                <span className="flex-1 text-ink-soft">{a.summary}</span>
                <span className="shrink-0 text-xs text-ink-faint">{fmtAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-ink-faint">No activity yet.</p>
        )}
      </Card>

      <Disclaimer />
    </div>
  );
}
