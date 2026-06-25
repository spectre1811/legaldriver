import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Badge, Disclaimer, fmtDate, fmtSize } from "@/components/ui";
import { Icon } from "@/components/icons";
import { DocActions } from "@/components/doc-actions";
import { PortalInvite, FirmComposer } from "./portal-controls";
import { ClientDocUpload } from "./client-docs";
import { Communications } from "@/components/communications";
import { ConfirmDelete } from "@/components/confirm-delete";
import { deleteClient } from "./actions";

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: client } = await supabase.from("client").select("*").eq("id", params.id).maybeSingle();
  if (!client) notFound();

  const [{ data: matters }, { data: portal }, { data: messages }, { data: allClients }, { data: allMatters }] = await Promise.all([
    supabase.from("matter").select("id, title, cnr, status, next_hearing_date").eq("client_id", client.id).order("next_hearing_date", { ascending: true, nullsFirst: false }),
    supabase.from("portal_user").select("id").eq("client_id", client.id).maybeSingle(),
    supabase.from("portal_message").select("id, sender, body, created_at").eq("client_id", client.id).order("created_at", { ascending: true }).limit(100),
    supabase.from("client").select("id, name"),
    supabase.from("matter").select("id, title"),
  ]);

  // Every document filed under this client directly, or under one of its cases.
  const matterIds = (matters ?? []).map((m) => m.id);
  const orFilter = matterIds.length
    ? `client_id.eq.${client.id},matter_id.in.(${matterIds.join(",")})`
    : `client_id.eq.${client.id}`;
  const { data: docs } = await supabase
    .from("document")
    .select("id, filename, doc_type, source, client_id, matter_id, size_bytes, portal_shared, created_at")
    .or(orFilter)
    .order("created_at", { ascending: false })
    .limit(300);

  const matterName = new Map((matters ?? []).map((m) => [m.id, m.title]));
  const clientOpts = (allClients ?? []).map((c) => ({ id: c.id, label: c.name }));
  const matterOpts = (allMatters ?? []).map((m) => ({ id: m.id, label: m.title }));

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
        <ConfirmDelete action={deleteClient} id={client.id} label="Delete client" confirmLabel="Delete client" note="Cases & documents are kept (unlinked)" redirectTo="/dashboard/clients" size="md" />
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

      {/* Document library — everything filed under this client or its cases */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
          <h2 className="text-base font-medium">Documents <span className="text-ink-faint">({docs?.length ?? 0})</span></h2>
          <ClientDocUpload clientId={client.id} />
        </div>
        {docs && docs.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-3 label">File</th>
                <th className="hidden px-5 py-3 label sm:table-cell">Type</th>
                <th className="px-5 py-3 label">Filed under</th>
                <th className="hidden px-5 py-3 label lg:table-cell">Size</th>
                <th className="hidden px-5 py-3 label lg:table-cell">Added</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const filedName = d.matter_id ? matterName.get(d.matter_id) ?? "case" : "client";
                return (
                  <tr key={d.id} className="border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-2.5">
                        <Icon name="documents" className="h-4 w-4 shrink-0 text-ink-faint" />
                        <span className="font-medium text-ink">{d.filename ?? "—"}</span>
                      </span>
                    </td>
                    <td className="hidden px-5 py-3.5 sm:table-cell">{d.doc_type ? <Badge>{d.doc_type}</Badge> : <span className="text-ink-faint">—</span>}</td>
                    <td className="px-5 py-3.5 text-ink-muted">{filedName}</td>
                    <td className="hidden px-5 py-3.5 text-xs text-ink-faint lg:table-cell">{fmtSize(d.size_bytes)}</td>
                    <td className="hidden px-5 py-3.5 text-xs text-ink-faint lg:table-cell">{fmtDate(d.created_at)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <DocActions documentId={d.id} matterId={d.matter_id} clientId={d.client_id} matters={matterOpts} clients={clientOpts} shared={d.portal_shared} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="px-5 py-8 text-center text-sm text-ink-faint">No documents for this client yet. Upload files above, or they’ll appear here as email is filed.</p>}
      </Card>

      {/* Communications timeline (email + WhatsApp/SMS filed to this client) */}
      <Communications clientId={client.id} />

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
