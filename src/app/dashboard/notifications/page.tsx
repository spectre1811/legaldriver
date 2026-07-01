import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";

const KIND: Record<string, string> = {
  hearing_reminder: "Hearing reminder",
  deadline_reminder: "Deadline reminder",
  notice_escalation: "Notice escalation",
  ipr_renewal: "IP renewal",
  case_update: "Case update",
};
const STATUS_TONE: Record<string, "green" | "amber" | "red"> = { sent: "green", pending: "amber", failed: "red" };

export default async function NotificationsPage() {
  const supabase = createClient();
  const { data: items } = await supabase
    .from("notification")
    .select("id, channel, kind, payload, scheduled_for, status")
    .order("scheduled_for", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-7">
      <PageHeader title="Notifications" subtitle="Reminders for hearings & deadlines (T-3, T-1, day-of) and notice escalations — in-app and email." />

      {items && items.length ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {items.map((n) => {
              const p = (n.payload ?? {}) as { title?: string; eventDate?: string; offsetDays?: number; body?: string };
              return (
                <li key={n.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {KIND[n.kind] ?? n.kind}
                      {p.title ? <span className="font-normal text-ink-muted"> · {p.title}</span> : null}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-faint">
                      {p.body ?? (p.eventDate ? `${p.eventDate}${typeof p.offsetDays === "number" ? ` (T-${p.offsetDays})` : ""}` : "")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge>{n.channel}</Badge>
                    <Badge tone={STATUS_TONE[n.status] ?? "neutral"}>{n.status}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <EmptyState icon="bell" title="No notifications yet" body="Add a case with an upcoming hearing — reminders get scheduled automatically." />
      )}
    </div>
  );
}
