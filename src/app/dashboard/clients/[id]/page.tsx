import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Badge, Disclaimer, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PortalInvite, FirmComposer } from "./portal-controls";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: client } = await supabase.from("client").select("*").eq("id", params.id).maybeSingle();
  if (!client) notFound();

  const [{ data: matters }, { data: portal }, { data: messages }] = await Promise.all([
    supabase.from("matter").select("id, title, cnr, status, next_hearing_date").eq("client_id", client.id).order("next_hearing_date", { ascending: true, nullsFirst: false }),
    supabase.from("portal_user").select("id").eq("client_id", client.id).maybeSingle(),
    supabase.from("portal_message").select("id, sender, body, created_at").eq("client_id", client.id).order("created_at", { ascending: true }).limit(100),
  ]);

  return (
    <div className="space-y-7">
      <Link href="/dashboard/clients" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
        <Icon name="back" className="h-4 w-4" /> Clients
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.7rem] font-semibold leading-tight">{client.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <Badge>{client.type}</Badge>
            {client.emails?.[0] && <span>{client.emails[0]}</span>}
            {client.phones?.[0] && <span>· {client.phones[0]}</span>}
          </div>
        </div>
      </header>

      {/* Portal access */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Icon name="inbox" className="h-4 w-4 text-brand-600" />
          <h2 className="text-base font-medium">Client portal</h2>
        </div>
        <PortalInvite clientId={client.id} portalUserId={portal?.id ?? null} />
      </Card>

      {/* Matters */}
      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-4"><h2 className="text-base font-medium">Cases <span className="text-ink-faint">({matters?.length ?? 0})</span></h2></div>
        {matters && matters.length ? (
          <ul className="divide-y divide-line">
            {matters.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <Link href={`/dashboard/cases/${m.id}`} className="font-medium text-ink hover:text-brand-600">{m.title}</Link>
                <span className="text-xs text-ink-muted">{m.cnr ?? "—"} · next {fmtDate(m.next_hearing_date)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="px-5 py-8 text-center text-sm text-ink-faint">No cases for this client yet.</p>}
      </Card>

      {/* Secure messaging (same thread the client sees in the portal) */}
      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-3"><h2 className="text-base font-medium">Messages</h2></div>
        <ul className="max-h-72 space-y-2 overflow-y-auto px-5 py-4">
          {messages && messages.length ? messages.map((m) => (
            <li key={m.id} className={`flex ${m.sender === "firm" ? "justify-end" : "justify-start"}`}>
              <span className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${m.sender === "firm" ? "bg-brand-600 text-white" : "bg-paper text-ink-soft"}`}>{m.body}</span>
            </li>
          )) : <li className="py-6 text-center text-sm text-ink-faint">No messages yet.</li>}
        </ul>
        <div className="border-t border-line px-5 py-3"><FirmComposer clientId={client.id} /></div>
      </Card>

      <Disclaimer />
    </div>
  );
}
