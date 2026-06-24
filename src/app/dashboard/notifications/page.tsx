import { createClient } from "@/lib/supabase/server";

const KIND_LABEL: Record<string, string> = {
  hearing_reminder: "Hearing reminder",
  deadline_reminder: "Deadline reminder",
  notice_escalation: "Notice escalation",
};

export default async function NotificationsPage() {
  const supabase = createClient();
  const { data: items } = await supabase
    .from("notification")
    .select("id, channel, kind, payload, scheduled_for, sent_at, status")
    .order("scheduled_for", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Notifications</h1>
        <p className="mt-1 text-sm text-slate-500">
          Reminders for hearings &amp; deadlines (T-3, T-1, day-of) and notice escalations,
          delivered in-app and by email.
        </p>
      </header>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {items && items.length ? (
          <ul className="divide-y divide-slate-100">
            {items.map((n) => {
              const p = (n.payload ?? {}) as { title?: string; eventDate?: string; offsetDays?: number; body?: string };
              return (
                <li key={n.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-ink">
                      {KIND_LABEL[n.kind] ?? n.kind}
                      {p.title ? <span className="font-normal text-slate-600"> · {p.title}</span> : null}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {p.body ??
                        (p.eventDate
                          ? `${p.eventDate}${typeof p.offsetDays === "number" ? ` (T-${p.offsetDays})` : ""}`
                          : "")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{n.channel}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 ${
                        n.status === "sent"
                          ? "bg-green-50 text-green-700"
                          : n.status === "failed"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {n.status}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">
            No notifications yet. Add a case with an upcoming hearing to schedule reminders.
          </div>
        )}
      </section>
    </div>
  );
}
