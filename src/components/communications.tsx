import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fmtAgo } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

const CHANNEL_META: Record<string, { label: string; icon: IconName; chip: string }> = {
  email: { label: "Email", icon: "gmail", chip: "ec-chip-hot" },
  whatsapp: { label: "WhatsApp", icon: "inbox", chip: "ec-chip-success" },
  sms: { label: "SMS", icon: "inbox", chip: "" },
};

const STATUS_CHIP: Record<string, string> = {
  delivered: "ec-chip-success",
  sent: "ec-chip-success",
  read: "ec-chip-success",
  received: "",
  filed: "",
  pending: "ec-chip-warn",
  failed: "ec-chip-danger",
};

const truncate = (s: string, n = 120) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export async function Communications({ matterId, clientId }: { matterId?: string; clientId?: string }) {
  if (!matterId && !clientId) return null;

  const supabase = createClient();
  let query = supabase.from("communication_log").select("*").order("occurred_at", { ascending: false }).limit(30);
  // The view is security_invoker — RLS scopes rows to the tenant automatically.
  query = matterId ? query.eq("matter_id", matterId) : query.eq("client_id", clientId!);
  const { data: rows } = await query;

  const t = await getTranslations("common");
  const te = await getTranslations("enum");
  const scope = matterId ? "case" : "client";

  return (
    <div className="ec-card overflow-hidden">
      <div className="border-b border-ec-hair px-5 py-4">
        <h2 className="font-display text-base font-medium">
          {t("communications.title")} <span className="text-ec-ink-3">({rows?.length ?? 0})</span>
        </h2>
        <p className="mt-1 text-xs text-ec-ink-3">
          {t("communications.note")}
        </p>
      </div>
      {rows && rows.length ? (
        <ul className="divide-y divide-ec-hair">
          {rows.map((c) => {
            const channel = c.channel ?? "email";
            const meta = CHANNEL_META[channel] ?? CHANNEL_META.email;
            const body = channel === "email" ? c.subject ?? c.preview : c.preview;
            return (
              <li key={c.id} className="flex items-start gap-3 px-5 py-3.5 text-sm">
                <Icon name={meta.icon} className="mt-0.5 h-4 w-4 shrink-0 text-ec-ink-3" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`ec-chip ${meta.chip}`}>{t.has(`communications.channel.${channel}`) ? t(`communications.channel.${channel}`) : meta.label}</span>
                    <span
                      className="inline-flex items-center gap-1 text-xs text-ec-ink-3"
                      title={c.direction === "out" ? t("communications.outbound") : t("communications.inbound")}
                    >
                      <Icon name="external" className={`h-3 w-3 ${c.direction === "out" ? "" : "rotate-180"}`} />
                      {c.direction === "out" ? t("communications.out") : t("communications.in")}
                    </span>
                    <span className="min-w-0 truncate font-medium text-ec-ink">{c.counterparty ?? "—"}</span>
                  </div>
                  {body && <p className="mt-1 truncate text-ec-ink-2">{truncate(body)}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-ec-ink-3">{fmtAgo(c.occurred_at)}</span>
                  {c.status && <span className={`ec-chip ${STATUS_CHIP[c.status] ?? ""}`}>{te.has(`status.${c.status}`) ? te(`status.${c.status}`) : c.status}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
          <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-ec-m bg-ec-bronze-tint text-ec-bronze-deep">
            <Icon name="inbox" className="h-5 w-5" />
          </span>
          <h3 className="font-display text-base font-medium text-ec-ink">{t("communications.emptyTitle")}</h3>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-ec-ink-3">{t("communications.emptyBody", { scope: t(`communications.scope.${scope}`) })}</p>
        </div>
      )}
    </div>
  );
}
