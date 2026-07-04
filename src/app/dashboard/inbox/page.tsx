import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { googleConfigured } from "@/lib/mail/oauth";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { Icon } from "@/components/icons";
import { IngestButton } from "./ingest-button";
import { isDemoMode } from "@/lib/demo";
import { ReviewItem } from "./review-item";
import { DisconnectButton, LoadEarlierButton } from "./connect-controls";

export default async function InboxPage({ searchParams }: { searchParams: { connected?: string; error?: string } }) {
  const t = await getTranslations("inbox");
  const supabase = createClient();
  const [{ data: conn }, { data: clients }, { data: matters }, { data: emails }] = await Promise.all([
    supabase.from("oauth_connection").select("id, status").eq("provider", "google").eq("status", "active").maybeSingle(),
    supabase.from("client").select("id, name").order("name"),
    supabase.from("matter").select("id, title").order("title"),
    supabase.from("email_message").select("id, subject, from_addr, received_at, confidence, status, classified_client_id, classified_matter_id").order("received_at", { ascending: false }).limit(200),
  ]);

  const clientOpts = (clients ?? []).map((c) => ({ id: c.id, label: c.name }));
  const matterOpts = (matters ?? []).map((m) => ({ id: m.id, label: m.title }));
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const matterName = new Map((matters ?? []).map((m) => [m.id, m.title]));

  const review = (emails ?? []).filter((e) => e.status === "needs_review");
  const filed = (emails ?? []).filter((e) => e.status === "filed");

  const groups = new Map<string, typeof filed>();
  for (const e of filed) {
    const key = e.classified_matter_id ? `${t("group.case")}: ${matterName.get(e.classified_matter_id) ?? "—"}`
      : e.classified_client_id ? `${t("group.client")}: ${clientName.get(e.classified_client_id) ?? "—"}` : t("group.unassigned");
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(e);
  }

  return (
    <div className="space-y-7">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {searchParams.connected && <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">{t("connected")}</p>}
      {searchParams.error && <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">{searchParams.error}</p>}

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${conn ? "bg-emerald-50 text-emerald-600" : "bg-paper text-ink-faint"}`}>
            <Icon name="gmail" className="h-5 w-5" />
          </span>
          <div className="text-sm">
            <p className="font-medium text-ink">Gmail</p>
            <p className="text-ink-muted">{conn ? t("state.connected") : googleConfigured() ? t("state.notConnected") : t("state.oauthNotConfigured")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {conn ? (
            <><LoadEarlierButton /><DisconnectButton /></>
          ) : (
            <a href="/api/google/connect" aria-disabled={!googleConfigured()} className={googleConfigured() ? "btn-primary" : "btn-primary pointer-events-none opacity-50"}>
              <Icon name="gmail" className="h-4 w-4" /> {t("connectGmail")}
            </a>
          )}
          {/* WO-29: the mock "Demo ingest" button is dev/demo-only — never in a real advocate's prod inbox. */}
          {(process.env.NODE_ENV !== "production" || isDemoMode()) && <IngestButton />}
        </div>
      </Card>

      {review.length > 0 && (
        <Card className="overflow-hidden border-amber-200">
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-800">
            <Icon name="alert" className="h-4 w-4" /> {t("needsReview", { count: review.length })}
          </div>
          <ul className="divide-y divide-line">
            {review.map((e) => (
              <ReviewItem
                key={e.id}
                email={{ id: e.id, subject: e.subject ?? "", from: e.from_addr ?? "", confidence: e.confidence, client_id: e.classified_client_id, matter_id: e.classified_matter_id }}
                clients={clientOpts}
                matters={matterOpts}
              />
            ))}
          </ul>
        </Card>
      )}

      <section className="space-y-4">
        <h2 className="text-base font-medium">{t("filedHeading")}</h2>
        {groups.size === 0 ? (
          <EmptyState icon="inbox" title={t("empty.title")} body={t("empty.body")} />
        ) : (
          [...groups.entries()].map(([group, items]) => (
            <Card key={group} className="overflow-hidden">
              <div className="border-b border-line bg-paper px-5 py-3 text-sm font-medium text-ink">
                {group} <span className="text-ink-faint">({items.length})</span>
              </div>
              <ul className="divide-y divide-line">
                {items.map((e) => (
                  <li key={e.id} className="px-5 py-3 text-sm">
                    <p className="font-medium text-ink">{e.subject || t("noSubject")}</p>
                    <p className="text-xs text-ink-faint">{e.from_addr} · {e.received_at ? new Date(e.received_at).toLocaleString("en-IN") : ""}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ))
        )}
      </section>

      <p className="text-xs text-ink-faint">{t("footer")}</p>
    </div>
  );
}
