import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { NoticeForm } from "./notice-form";
import { RespondButton } from "./respond-button";
import { DeleteButton } from "@/components/delete-button";
import { deleteNotice } from "./actions";

// Escalation state machine: ordered steps for the horizontal stepper.
// Each state maps to an index so we can render "completed / active / upcoming".
const STEPS = [
  "draft",
  "sent",
  "awaiting_response",
  "escalated_1",
  "escalated_2",
  "responded",
] as const;
type EscalationState = (typeof STEPS)[number] | "closed";

const STATE_TONE: Record<string, "neutral" | "brand" | "amber" | "orange" | "red" | "green"> = {
  draft: "neutral", sent: "brand", awaiting_response: "amber",
  escalated_1: "orange", escalated_2: "red", responded: "green", closed: "neutral",
};

// Map a state to its stepper index (closed is treated same as responded for display).
function stepIdx(state: string): number {
  const i = STEPS.indexOf(state as (typeof STEPS)[number]);
  return i === -1 ? STEPS.length - 1 : i; // "closed" → last step
}

export default async function NoticesPage() {
  const t = await getTranslations("notices");
  const supabase = createClient();
  const [{ data: notices }, { data: matters }] = await Promise.all([
    supabase
      .from("notice")
      .select("id, type, response_due, escalation_state, sent_at, next_escalation_at, body_ref, matter:matter_id (title)")
      .order("created_at", { ascending: false }),
    supabase.from("matter").select("id, title").order("title"),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card className="p-5">
        <NoticeForm matters={matters ?? []} />
      </Card>

      {notices && notices.length ? (
        <div className="space-y-4">
          {notices.map((n) => {
            const m = n.matter as unknown as { title?: string } | null;
            const active = !["responded", "closed"].includes(n.escalation_state);
            const currentStep = stepIdx(n.escalation_state);
            const tone = STATE_TONE[n.escalation_state] ?? "neutral";

            return (
              <Card key={n.id} className="overflow-hidden">
                {/* Notice header row */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-ink">{n.type}</span>
                      <Badge tone={tone}>{t(`state.${n.escalation_state}`)}</Badge>
                      {n.body_ref && (
                        <a
                          href={`/dashboard/documents?ref=${encodeURIComponent(n.body_ref)}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                          title={t("openNoticeDoc")}
                        >
                          <Icon name="external" className="h-3 w-3" />
                          {t("noticeDoc")}
                        </a>
                      )}
                    </div>
                    {m?.title && (
                      <p className="text-xs text-ink-muted">{m.title}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {active && <RespondButton noticeId={n.id} />}
                    <DeleteButton onDelete={deleteNotice.bind(null, n.id)} />
                  </div>
                </div>

                {/* Escalation timeline stepper */}
                <div className="px-5 py-4">
                  <ol className="flex items-start gap-0" aria-label={t("stepperAria")}>
                    {STEPS.map((step, idx) => {
                      const isDone = idx < currentStep;
                      const isCurrent = idx === currentStep;
                      const isUpcoming = idx > currentStep;
                      return (
                        <li key={step} className="flex flex-1 flex-col items-center relative">
                          {/* Connector line */}
                          {idx < STEPS.length - 1 && (
                            <div
                              className={`absolute left-1/2 top-3 h-px w-full -translate-y-1/2 ${
                                isDone || isCurrent ? "bg-brand-400" : "bg-line"
                              }`}
                              aria-hidden="true"
                            />
                          )}
                          {/* Step dot */}
                          <div
                            className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                              isDone
                                ? "border-brand-500 bg-brand-500 text-white"
                                : isCurrent
                                ? "border-brand-500 bg-white text-brand-600"
                                : "border-line bg-paper text-ink-faint"
                            }`}
                            aria-current={isCurrent ? "step" : undefined}
                          >
                            {isDone ? (
                              <Icon name="check" className="h-3 w-3" />
                            ) : (
                              idx + 1
                            )}
                          </div>
                          {/* Step label + date */}
                          <div className="mt-1.5 text-center space-y-0.5">
                            <p
                              className={`text-[11px] font-medium leading-tight ${
                                isCurrent ? "text-brand-700" : isUpcoming ? "text-ink-faint" : "text-ink-muted"
                              }`}
                            >
                              {t(`state.${step}`)}
                            </p>
                            {/* Annotate sent_at on 'sent', next_escalation_at on escalated steps */}
                            {step === "sent" && n.sent_at && (
                              <p className="text-[10px] text-ink-faint">{fmtDate(n.sent_at)}</p>
                            )}
                            {step === "awaiting_response" && n.response_due && (
                              <p className="text-[10px] text-ink-faint">{t("dueDate", { date: fmtDate(n.response_due) })}</p>
                            )}
                            {(step === "escalated_1" || step === "escalated_2") && isCurrent && n.next_escalation_at && (
                              <p className="text-[10px] text-amber-600 font-medium">{t("escalatesAt", { date: fmtDate(n.next_escalation_at) })}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon="notices" title={t("empty.title")} body={t("empty.body")} />
      )}
    </div>
  );
}
