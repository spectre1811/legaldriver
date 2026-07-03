import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";

const STATUS_TONE: Record<string, "green" | "amber" | "red"> = { sent: "green", pending: "amber", failed: "red" };

export default async function NotificationsPage() {
  const supabase = createClient();
  const t = await getTranslations("notifications");
  const tr = (grp: string, v: string) => (t.has(`${grp}.${v}`) ? t(`${grp}.${v}`) : v);
  const { data: items } = await supabase
    .from("notification")
    .select("id, channel, kind, payload, scheduled_for, status")
    .order("scheduled_for", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-7">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {items && items.length ? (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-line">
            {items.map((n) => {
              const p = (n.payload ?? {}) as { title?: string; eventDate?: string; offsetDays?: number; body?: string };
              return (
                <li key={n.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {tr("kind", n.kind)}
                      {p.title ? <span className="font-normal text-ink-muted"> · {p.title}</span> : null}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-faint">
                      {p.body ?? (p.eventDate ? `${p.eventDate}${typeof p.offsetDays === "number" ? ` (T-${p.offsetDays})` : ""}` : "")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge>{tr("channel", n.channel)}</Badge>
                    <Badge tone={STATUS_TONE[n.status] ?? "neutral"}>{tr("status", n.status)}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <EmptyState icon="bell" title={t("empty.title")} body={t("empty.body")} />
      )}
    </div>
  );
}
