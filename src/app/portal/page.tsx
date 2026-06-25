import { createClient } from "@/lib/supabase/server";
import { Card, Badge, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Composer } from "./composer";

export default async function PortalHome() {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  // All RLS-scoped to this portal user's single client.
  const [{ data: matters }, { data: hearings }, { data: docs }, { data: messages }] = await Promise.all([
    supabase.from("matter").select("id, title, cnr, court, stage, status, next_hearing_date").order("next_hearing_date", { ascending: true, nullsFirst: false }),
    supabase.from("hearing").select("id, date, purpose, matter_id").gte("date", today).order("date", { ascending: true }).limit(8),
    supabase.from("document").select("id, filename, doc_type, created_at").eq("portal_shared", true).order("created_at", { ascending: false }),
    supabase.from("portal_message").select("id, sender, body, created_at").order("created_at", { ascending: true }).limit(100),
  ]);

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-2xl font-semibold">Your matters</h1>
        <p className="mt-1 text-sm text-ink-muted">Track your cases, hearings and documents, and message your firm.</p>
      </header>

      <section className="space-y-3">
        {matters && matters.length ? matters.map((m) => (
          <Card key={m.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="font-medium text-ink">{m.title}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                {m.cnr && <span className="font-mono">{m.cnr}</span>}
                {m.court && <span>· {m.court}</span>}
                {m.stage && <span>· {m.stage}</span>}
              </p>
            </div>
            <div className="text-right text-sm">
              <Badge tone={m.status === "active" ? "green" : "neutral"}>{m.status}</Badge>
              <p className="mt-1 text-xs text-ink-muted">Next hearing: {fmtDate(m.next_hearing_date)}</p>
            </div>
          </Card>
        )) : (
          <Card className="p-8 text-center text-sm text-ink-muted">No matters shared with you yet.</Card>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="border-b border-line px-5 py-3"><h2 className="text-base font-medium">Upcoming hearings</h2></div>
          {hearings && hearings.length ? (
            <ul className="divide-y divide-line">
              {hearings.map((h) => (
                <li key={h.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-ink-soft">{h.purpose ?? "Hearing"}</span>
                  <span className="text-ink-muted">{fmtDate(h.date)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="px-5 py-8 text-center text-sm text-ink-faint">No upcoming hearings.</p>}
        </Card>

        <Card>
          <div className="border-b border-line px-5 py-3"><h2 className="text-base font-medium">Shared documents</h2></div>
          {docs && docs.length ? (
            <ul className="divide-y divide-line">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <Icon name="documents" className="h-4 w-4 shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1 truncate text-ink">{d.filename}</span>
                  <a href={`/api/documents/${d.id}/download`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700"><Icon name="external" className="h-4 w-4" /></a>
                </li>
              ))}
            </ul>
          ) : <p className="px-5 py-8 text-center text-sm text-ink-faint">No documents shared yet.</p>}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-3"><h2 className="text-base font-medium">Messages</h2></div>
        <ul className="max-h-80 space-y-2 overflow-y-auto px-5 py-4">
          {messages && messages.length ? messages.map((m) => (
            <li key={m.id} className={`flex ${m.sender === "client" ? "justify-end" : "justify-start"}`}>
              <span className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${m.sender === "client" ? "bg-brand-600 text-white" : "bg-paper text-ink-soft"}`}>
                {m.body}
              </span>
            </li>
          )) : <li className="py-6 text-center text-sm text-ink-faint">No messages yet. Say hello to your firm.</li>}
        </ul>
        <div className="border-t border-line px-5 py-3"><Composer /></div>
      </Card>

      <p className="text-xs text-ink-faint">Secure client portal · you only see your own matters. Not legal advice.</p>
    </div>
  );
}
