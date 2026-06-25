import { createClient } from "@/lib/supabase/server";
import { Card, Badge, EmptyState, fmtAgo } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

const CHANNEL_META: Record<string, { label: string; icon: IconName; tone: "brand" | "green" | "neutral" }> = {
  email: { label: "Email", icon: "gmail", tone: "brand" },
  whatsapp: { label: "WhatsApp", icon: "inbox", tone: "green" },
  sms: { label: "SMS", icon: "inbox", tone: "neutral" },
};

const STATUS_TONE: Record<string, "green" | "amber" | "neutral" | "red"> = {
  delivered: "green",
  sent: "green",
  read: "green",
  received: "neutral",
  filed: "neutral",
  pending: "amber",
  failed: "red",
};

const truncate = (s: string, n = 120) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export async function Communications({ matterId, clientId }: { matterId?: string; clientId?: string }) {
  if (!matterId && !clientId) return null;

  const supabase = createClient();
  let query = supabase.from("communication_log").select("*").order("occurred_at", { ascending: false }).limit(30);
  // The view is security_invoker — RLS scopes rows to the tenant automatically.
  query = matterId ? query.eq("matter_id", matterId) : query.eq("client_id", clientId!);
  const { data: rows } = await query;

  const scope = matterId ? "case" : "client";

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-base font-medium">
          Communications <span className="text-ink-faint">({rows?.length ?? 0})</span>
        </h2>
        <p className="mt-1 text-xs text-ink-faint">
          Inbound email + WhatsApp/SMS filed to this matter. Outbound email logging is coming.
        </p>
      </div>
      {rows && rows.length ? (
        <ul className="divide-y divide-line">
          {rows.map((c) => {
            const channel = c.channel ?? "email";
            const meta = CHANNEL_META[channel] ?? CHANNEL_META.email;
            const body = channel === "email" ? c.subject ?? c.preview : c.preview;
            return (
              <li key={c.id} className="flex items-start gap-3 px-5 py-3.5 text-sm">
                <Icon name={meta.icon} className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span
                      className="inline-flex items-center gap-1 text-xs text-ink-faint"
                      title={c.direction === "out" ? "Outbound" : "Inbound"}
                    >
                      <Icon name="external" className={`h-3 w-3 ${c.direction === "out" ? "" : "rotate-180"}`} />
                      {c.direction === "out" ? "out" : "in"}
                    </span>
                    <span className="min-w-0 truncate font-medium text-ink">{c.counterparty ?? "—"}</span>
                  </div>
                  {body && <p className="mt-1 truncate text-ink-soft">{truncate(body)}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs text-ink-faint">{fmtAgo(c.occurred_at)}</span>
                  {c.status && <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Badge>}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon="inbox"
          title="No communications yet"
          body={`Gmail emails and WhatsApp messages filed to this ${scope} appear here.`}
        />
      )}
    </Card>
  );
}
