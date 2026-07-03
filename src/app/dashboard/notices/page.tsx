import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState, fmtDate } from "@/components/ui";
import { NoticeForm } from "./notice-form";
import { RespondButton } from "./respond-button";
import { DeleteButton } from "@/components/delete-button";
import { deleteNotice } from "./actions";

const STATE_TONE: Record<string, "neutral" | "brand" | "amber" | "orange" | "red" | "green"> = {
  draft: "neutral", sent: "brand", awaiting_response: "amber",
  escalated_1: "orange", escalated_2: "red", responded: "green", closed: "neutral",
};

export default async function NoticesPage() {
  const t = await getTranslations("notices");
  const supabase = createClient();
  const [{ data: notices }, { data: matters }] = await Promise.all([
    supabase.from("notice").select("id, type, response_due, escalation_state, next_escalation_at, matter:matter_id (title)").order("created_at", { ascending: false }),
    supabase.from("matter").select("id, title").order("title"),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card className="p-5">
        <NoticeForm matters={matters ?? []} />
      </Card>

      {notices && notices.length ? (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-3 label">{t("table.notice")}</th>
                <th className="hidden px-5 py-3 label md:table-cell">{t("table.case")}</th>
                <th className="px-5 py-3 label">{t("table.due")}</th>
                <th className="px-5 py-3 label">{t("table.state")}</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {notices.map((n) => {
                const m = n.matter as unknown as { title?: string } | null;
                const active = !["responded", "closed"].includes(n.escalation_state);
                return (
                  <tr key={n.id} className="border-b border-line last:border-0">
                    <td className="px-5 py-3.5 font-medium text-ink">{n.type}</td>
                    <td className="hidden px-5 py-3.5 text-ink-muted md:table-cell">{m?.title ?? "—"}</td>
                    <td className="px-5 py-3.5 text-ink-soft">{fmtDate(n.response_due)}</td>
                    <td className="px-5 py-3.5"><Badge tone={STATE_TONE[n.escalation_state] ?? "neutral"}>{t(`state.${n.escalation_state}`)}</Badge></td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="inline-flex items-center gap-2">
                        {active && <RespondButton noticeId={n.id} />}
                        <DeleteButton onDelete={deleteNotice.bind(null, n.id)} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState icon="notices" title={t("empty.title")} body={t("empty.body")} />
      )}
    </div>
  );
}
