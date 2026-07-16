import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { googleConfigured } from "@/lib/mail/oauth";
import { PageHeader, Card, fmtAgo } from "@/components/ui";
import { Icon } from "@/components/icons";
import { IngestButton } from "./ingest-button";
import { isDemoMode } from "@/lib/demo";
import { InboxWorkspace, type WorkspaceEmail } from "./inbox-workspace";
import { GmailQueryForm } from "./gmail-query-form";
import { DisconnectButton, SyncNowButton } from "./connect-controls";
import { Pagination } from "@/components/pagination";
import { parsePage, clampPerPage, rangeFor } from "@/lib/paginate";
import { resolveThreshold, istDayStartIso } from "@/lib/mail/inbox-status";

type Tab = "needs_review" | "filed" | "ignored";
const TABS: Tab[] = ["needs_review", "filed", "ignored"];

export default async function InboxPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string; page?: string; per?: string; tab?: string };
}) {
  const t = await getTranslations("inbox");
  const supabase = createClient();
  const tab: Tab = TABS.includes(searchParams.tab as Tab) ? (searchParams.tab as Tab) : "needs_review";
  const page = parsePage(searchParams.page);
  const per = clampPerPage(searchParams.per);
  const { from, to } = rangeFor(page, per);
  const threshold = resolveThreshold(process.env.CONFIDENCE_THRESHOLD);
  const thresholdPct = Math.round(threshold * 100);
  const todayIso = istDayStartIso(Date.now());

  const head = () => supabase.from("email_message").select("id", { count: "exact", head: true });

  const listQuery = supabase
    .from("email_message")
    .select("id, subject, from_addr, snippet, confidence, received_at, classified_client_id, classified_matter_id", { count: "exact" })
    .order("received_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  const [
    { data: userData },
    { data: conn },
    { data: clients },
    { data: matters },
    { data: rows, count: tabTotal },
    needsReviewC,
    filedC,
    ignoredC,
    atOrAboveC,
    confirmAllC,
    processedTodayC,
    filedTodayC,
    { data: lastRow },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("oauth_connection").select("id, status, gmail_query").eq("provider", "google").eq("status", "active").maybeSingle(),
    supabase.from("client").select("id, name").order("name"),
    supabase.from("matter").select("id, title").order("title"),
    tab === "ignored" ? listQuery.in("status", ["archived", "deleted"]) : listQuery.eq("status", tab),
    head().eq("status", "needs_review"),
    head().eq("status", "filed"),
    head().in("status", ["archived", "deleted"]),
    head().eq("status", "needs_review").gte("confidence", threshold),
    head().eq("status", "needs_review").gte("confidence", threshold).or("classified_matter_id.not.is.null,classified_client_id.not.is.null"),
    head().gte("created_at", todayIso),
    head().eq("status", "filed").gte("created_at", todayIso),
    supabase.from("email_message").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const clientOpts = (clients ?? []).map((c) => ({ id: c.id, label: c.name }));
  const matterOpts = (matters ?? []).map((m) => ({ id: m.id, label: m.title }));
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const matterName = new Map((matters ?? []).map((m) => [m.id, m.title]));

  const list = rows ?? [];
  const listIds = list.map((e) => e.id);
  const { data: attachRows } = listIds.length
    ? await supabase.from("document").select("id, filename, email_message_id").in("email_message_id", listIds)
    : { data: [] as { id: string; filename: string | null; email_message_id: string | null }[] };
  const attachByEmail = new Map<string, { id: string; filename: string }[]>();
  for (const d of attachRows ?? []) {
    if (!d.email_message_id) continue;
    (attachByEmail.get(d.email_message_id) ?? attachByEmail.set(d.email_message_id, []).get(d.email_message_id)!).push({ id: d.id, filename: d.filename ?? "attachment" });
  }

  const emails: WorkspaceEmail[] = list.map((e) => ({
    id: e.id,
    subject: e.subject ?? "",
    from: e.from_addr ?? "",
    snippet: e.snippet,
    confidence: e.confidence,
    receivedAt: e.received_at,
    clientId: e.classified_client_id,
    matterId: e.classified_matter_id,
    suggestion: e.classified_matter_id ? matterName.get(e.classified_matter_id) ?? null : e.classified_client_id ? clientName.get(e.classified_client_id) ?? null : null,
    attachments: attachByEmail.get(e.id) ?? [],
  }));

  const counts = { needs_review: needsReviewC.count ?? 0, filed: filedC.count ?? 0, ignored: ignoredC.count ?? 0 };
  const belowThreshold = Math.max(0, counts.needs_review - (atOrAboveC.count ?? 0));
  const account = userData.user?.email ?? "";

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} serif />

      {searchParams.connected && <p className="rounded-xl bg-ec-success-t px-3.5 py-2.5 text-sm text-ec-success">{t("connected")}</p>}
      {searchParams.error && <p className="rounded-xl bg-ec-warn-t px-3.5 py-2.5 text-sm text-ec-warn">{searchParams.error}</p>}

      {/* Sync status card */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${conn ? "bg-ec-bronze-tint text-ec-bronze" : "bg-paper text-ink-faint"}`}>
            <Icon name="gmail" className="h-5 w-5" />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-display text-base text-ink">{conn ? t("account", { account }) : "Gmail"}</p>
            <p className="text-xs text-ink-muted">
              {conn
                ? lastRow?.created_at
                  ? t("sync.line", { rel: fmtAgo(lastRow.created_at), processed: processedTodayC.count ?? 0, filed: filedTodayC.count ?? 0, pending: counts.needs_review })
                  : t("sync.never", { pending: counts.needs_review })
                : googleConfigured()
                ? t("state.notConnected")
                : t("state.oauthNotConfigured")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {conn ? (
            <>
              <GmailQueryForm initial={conn.gmail_query ?? ""} />
              <SyncNowButton />
              <DisconnectButton />
            </>
          ) : (
            <a href="/api/google/connect" aria-disabled={!googleConfigured()} className={googleConfigured() ? "btn-primary" : "btn-primary pointer-events-none opacity-50"}>
              <Icon name="gmail" className="h-4 w-4" /> {t("connectGmail")}
            </a>
          )}
          {/* WO-29: the mock "Demo ingest" button is dev/demo-only — never in a real advocate's prod inbox. */}
          {(process.env.NODE_ENV !== "production" || isDemoMode()) && <IngestButton />}
        </div>
      </Card>

      <InboxWorkspace
        key={tab}
        emails={emails}
        clients={clientOpts}
        matters={matterOpts}
        tab={tab}
        counts={counts}
        threshold={threshold}
        thresholdPct={thresholdPct}
        belowThreshold={belowThreshold}
        confirmAllCount={confirmAllC.count ?? 0}
      />

      {(tabTotal ?? 0) > per && <Pagination page={page} perPage={per} total={tabTotal ?? 0} />}

      <p className="text-xs text-ink-faint">{t("footer")}</p>
    </div>
  );
}
