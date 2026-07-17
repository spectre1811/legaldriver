import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { Icon } from "@/components/icons";

// design-system-v2 · Notifications = the quiet ledger of the reminder cadence (T-3 / T-1 / day-of).
// The structure encodes TIME: rows are grouped into sand-banded day sections (Today / Tomorrow /
// dated), newest first, so the advocate reads the cadence at a glance. Every value is data-bound —
// kind/channel/status from the row, title/body from the payload. No fabricated channels: the schema
// constrains channel to inapp|email (whatsapp/sms were dead i18n labels — dropped).

const STATUS_CHIP: Record<string, string> = { sent: "ec-chip-success", pending: "ec-chip-warn", failed: "ec-chip-danger" };

// Local midnight-anchored day key + a human day label (Today / Tomorrow / dated). Uses the row's
// scheduled_for when set, else created_at, so an unscheduled notice still files under a real day.
function dayInfo(ts: string, t: (k: string) => string) {
  const d = new Date(ts);
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((midnight(d) - midnight(new Date())) / 86_400_000);
  const label =
    diffDays === 0 ? t("day.today") :
    diffDays === 1 ? t("day.tomorrow") :
    diffDays === -1 ? t("day.yesterday") :
    d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  return { key: String(midnight(d)), label, sortMs: midnight(d) };
}

export default async function NotificationsPage() {
  const supabase = createClient();
  const t = await getTranslations("notifications");
  const tr = (grp: string, v: string) => (t.has(`${grp}.${v}`) ? t(`${grp}.${v}`) : v);
  const { data: items } = await supabase
    .from("notification")
    .select("id, channel, kind, payload, scheduled_for, sent_at, status, created_at")
    .order("scheduled_for", { ascending: false, nullsFirst: false })
    .limit(100);

  const rows = items ?? [];

  // Group into real calendar-day sections, newest-first to match list order. Time-of-day is kept
  // for the per-row meta line, not for grouping.
  const groups = new Map<string, { label: string; sortMs: number; rows: typeof rows }>();
  for (const n of rows) {
    const { key, label, sortMs } = dayInfo(n.scheduled_for ?? n.created_at, (k) => t(k));
    const g = groups.get(key);
    if (g) g.rows.push(n);
    else groups.set(key, { label, sortMs, rows: [n] });
  }
  const sections = [...groups.values()].sort((a, b) => b.sortMs - a.sortMs);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ec-ink">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ec-ink-3">{t("subtitle")}</p>
      </header>

      {sections.length ? (
        <div className="space-y-7">
          {sections.map((s) => (
            <section key={s.label} className="space-y-2.5">
              {/* Sand day-band — the ledger divider. Encodes the reminder day, not decoration. */}
              <div className="flex items-baseline gap-3">
                <h2 className="ec-label">{s.label}</h2>
                <span className="h-px flex-1 bg-ec-hair" aria-hidden />
                <span className="num text-xs text-ec-ink-3">{t("count", { n: s.rows.length })}</span>
              </div>

              <ul className="ec-card divide-y divide-ec-hair overflow-hidden">
                {s.rows.map((n) => {
                  const p = (n.payload ?? {}) as { title?: string; eventDate?: string; offsetDays?: number; body?: string };
                  const time = new Date(n.scheduled_for ?? n.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
                  const detail = p.body ?? (p.eventDate ? `${p.eventDate}${typeof p.offsetDays === "number" ? ` · T-${p.offsetDays}` : ""}` : null);
                  return (
                    <li key={n.id} className="ec-row flex items-start justify-between gap-4 px-5 py-3.5">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="num mt-0.5 shrink-0 text-xs text-ec-ink-3">{time}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ec-ink">
                            {tr("kind", n.kind)}
                            {p.title ? <span className="font-normal text-ec-ink-2"> · {p.title}</span> : null}
                          </p>
                          {detail && <p className="mt-0.5 truncate text-xs text-ec-ink-3">{detail}</p>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="ec-chip">{tr("channel", n.channel)}</span>
                        <span className={`ec-chip ${STATUS_CHIP[n.status] ?? ""}`}>{tr("status", n.status)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        // Designed empty state (DS §6: one serif line + a quiet body, the diary voice).
        <div className="ec-card flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="rounded-full bg-ec-paper-3 p-3 text-ec-ink-3"><Icon name="bell" className="h-6 w-6" /></span>
          <p className="font-display text-lg text-ec-ink">{t("empty.title")}</p>
          <p className="max-w-sm text-sm text-ec-ink-3">{t("empty.body")}</p>
        </div>
      )}
    </div>
  );
}
