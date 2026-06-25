import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState, fmtAgo } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Composer } from "./composer";

const CHANNELS = [
  { key: "", label: "All" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
] as const;

const CHANNEL_TONE: Record<string, "green" | "brand" | "neutral"> = {
  whatsapp: "green",
  sms: "brand",
  email: "neutral",
};

export default async function MessagesPage({ searchParams }: { searchParams: { channel?: string } }) {
  const supabase = createClient();
  const channel = searchParams.channel;

  let query = supabase
    .from("msg_message")
    .select("id, channel, direction, provider, from_addr, to_addr, body, status, thread_key, client_id, matter_id, confidence, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  if (channel) query = query.eq("channel", channel);

  const [{ data: messages }, { data: clients }, { data: matters }] = await Promise.all([
    query,
    supabase.from("client").select("id, name"),
    supabase.from("matter").select("id, title"),
  ]);

  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const matterName = new Map((matters ?? []).map((m) => [m.id, m.title]));
  const rows = messages ?? [];

  // Group by thread_key, latest thread first (threads ordered by newest message).
  type Row = (typeof rows)[number];
  const threads = new Map<string, Row[]>();
  for (const m of rows) {
    const key = m.thread_key ?? `${m.channel}:${m.direction === "out" ? m.to_addr : m.from_addr ?? "unknown"}`;
    (threads.get(key) ?? threads.set(key, []).get(key)!).push(m);
  }

  return (
    <div className="space-y-7">
      <PageHeader
        title="Messages"
        subtitle="WhatsApp/SMS threads, auto-filed to the right client or case. AI routing is assistive — verify before relying on it. Send only from the firm's Business number, with the recipient's consent (DPDP)."
      />

      <Composer />

      <div className="flex flex-wrap items-center gap-2">
        {CHANNELS.map((c) => (
          <a
            key={c.key || "all"}
            href={c.key ? `/dashboard/messages?channel=${c.key}` : "/dashboard/messages"}
            className={`badge ${channel === c.key || (!channel && !c.key) ? "bg-brand-50 text-brand-700" : "bg-paper text-ink-muted border border-line"}`}
          >
            {c.label}
          </a>
        ))}
      </div>

      {threads.size === 0 ? (
        <EmptyState
          icon="inbox"
          title="No messages yet"
          body="Inbound WhatsApp messages land here once the webhook is configured. You can also start a thread with the composer above."
        />
      ) : (
        <div className="space-y-4">
          {[...threads.entries()].map(([key, items]) => {
            const latest = items[0];
            const linked = latest.matter_id
              ? matterName.get(latest.matter_id)
              : latest.client_id
                ? clientName.get(latest.client_id)
                : null;
            const counterpart = key.includes(":") ? key.split(":").slice(1).join(":") : key;
            return (
              <Card key={key} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-5 py-3 text-sm">
                  <span className="flex items-center gap-2 font-medium text-ink">
                    <Icon name="inbox" className="h-4 w-4 text-ink-faint" />
                    {counterpart}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-ink-faint">
                    <Badge tone={CHANNEL_TONE[latest.channel] ?? "neutral"}>{latest.channel}</Badge>
                    {linked ? (
                      <span className="text-ink-muted">
                        {latest.matter_id ? "Case" : "Client"}: {linked}
                      </span>
                    ) : (
                      <span className="text-amber-600">unfiled</span>
                    )}
                  </span>
                </div>
                <ul className="divide-y divide-line">
                  {items.map((m) => (
                    <li key={m.id} className="px-5 py-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-xs text-ink-faint">
                          <Icon name="dot" className={`h-3 w-3 ${m.direction === "out" ? "text-brand-500" : "text-emerald-500"}`} />
                          {m.direction === "out" ? `You → ${m.to_addr ?? "—"}` : `${m.from_addr ?? "—"} → you`}
                          {m.direction === "out" && m.status !== "sent" && (
                            <Badge tone={m.status === "failed" ? "red" : "amber"}>{m.status}</Badge>
                          )}
                        </span>
                        <span className="text-xs text-ink-faint">{fmtAgo(m.created_at)}</span>
                      </div>
                      <p className="mt-1 text-ink">{m.body ? truncate(m.body) : <span className="text-ink-faint">(media / no text)</span>}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-ink-faint">
        Provenance: each row records its provider and direction. Inbound messages are classified by AI and filed
        deterministically; low-confidence routing leaves a message unfiled. Message bodies are never logged.
      </p>
    </div>
  );
}

function truncate(s: string, n = 280) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
