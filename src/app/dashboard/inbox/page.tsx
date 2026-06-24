import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { googleConfigured } from "@/lib/mail/oauth";
import { IngestButton } from "./ingest-button";
import { ReviewItem } from "./review-item";
import { DisconnectButton, LoadEarlierButton } from "./connect-controls";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: conn }, { data: clients }, { data: matters }, { data: emails }] = await Promise.all([
    supabase
      .from("oauth_connection")
      .select("id, status")
      .eq("provider", "google")
      .eq("status", "active")
      .maybeSingle(),
    supabase.from("client").select("id, name").order("name"),
    supabase.from("matter").select("id, title").order("title"),
    supabase
      .from("email_message")
      .select("id, subject, from_addr, received_at, snippet, confidence, status, classified_client_id, classified_matter_id")
      .order("received_at", { ascending: false })
      .limit(200),
  ]);

  const clientOpts = (clients ?? []).map((c) => ({ id: c.id, label: c.name }));
  const matterOpts = (matters ?? []).map((m) => ({ id: m.id, label: m.title }));
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const matterName = new Map((matters ?? []).map((m) => [m.id, m.title]));

  const review = (emails ?? []).filter((e) => e.status === "needs_review");
  const filed = (emails ?? []).filter((e) => e.status === "filed");

  // Group filed emails by case → client → unassigned (the "segregated" lens).
  const groups = new Map<string, typeof filed>();
  for (const e of filed) {
    const key = e.classified_matter_id
      ? `Case: ${matterName.get(e.classified_matter_id) ?? "—"}`
      : e.classified_client_id
        ? `Client: ${clientName.get(e.classified_client_id) ?? "—"}`
        : "Unassigned";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(e);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Inbox</h1>
        <p className="mt-1 text-sm text-slate-500">
          Connect Gmail to auto-file emails &amp; attachments against the right client/case.
        </p>
      </header>

      {searchParams.connected && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Gmail connected.</p>
      )}
      {searchParams.error && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{searchParams.error}</p>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-sm">
          <span className="font-medium text-ink">Gmail: </span>
          {conn ? (
            <span className="text-green-700">connected</span>
          ) : googleConfigured() ? (
            <span className="text-slate-500">not connected</span>
          ) : (
            <span className="text-slate-500">OAuth not configured yet (build-time)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {conn ? (
            <>
              <LoadEarlierButton />
              <DisconnectButton />
            </>
          ) : (
            <Link
              href="/api/google/connect"
              aria-disabled={!googleConfigured()}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                googleConfigured()
                  ? "bg-accent text-white hover:bg-blue-800"
                  : "pointer-events-none bg-slate-200 text-slate-400"
              }`}
            >
              Connect Gmail
            </Link>
          )}
          <IngestButton />
        </div>
      </section>

      {review.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-amber-200 bg-white">
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
            Needs review ({review.length}) — confirm the client/case
          </div>
          <ul className="divide-y divide-slate-100">
            {review.map((e) => (
              <ReviewItem
                key={e.id}
                email={{
                  id: e.id,
                  subject: e.subject ?? "",
                  from: e.from_addr ?? "",
                  confidence: e.confidence,
                  client_id: e.classified_client_id,
                  matter_id: e.classified_matter_id,
                }}
                clients={clientOpts}
                matters={matterOpts}
              />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-medium text-ink">Filed — by client / case</h2>
        {groups.size === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
            Nothing filed yet. Connect Gmail or run the demo ingest above.
          </div>
        ) : (
          [...groups.entries()].map(([group, items]) => (
            <div key={group} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-ink">
                {group} <span className="text-slate-400">({items.length})</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {items.map((e) => (
                  <li key={e.id} className="px-4 py-2 text-sm">
                    <p className="font-medium text-ink">{e.subject || "(no subject)"}</p>
                    <p className="text-xs text-slate-500">
                      {e.from_addr} · {e.received_at ? new Date(e.received_at).toLocaleString("en-IN") : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <p className="text-xs text-slate-400">
        gmail.readonly scope · refresh token stored encrypted in Supabase Vault · email bodies are never logged.
      </p>
    </div>
  );
}
