import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { googleConfigured } from "@/lib/mail/oauth";
import { fmtAgo, fmtSize } from "@/components/ui";
import { Icon } from "@/components/icons";
import { IngestButton } from "./ingest-button";
import { isDemoMode } from "@/lib/demo";
import { InboxWorkspace, type WorkspaceEmail } from "./inbox-workspace";
import { GmailQueryForm } from "./gmail-query-form";
import { DisconnectButton, SyncNowButton } from "./connect-controls";
import { Pagination } from "@/components/pagination";
import { parsePage, clampPerPage, rangeFor } from "@/lib/paginate";
import { resolveThreshold, istDayStartIso } from "@/lib/mail/inbox-status";
import { Reveal } from "../motion";

type Tab = "needs_review" | "filed" | "ignored";
const TABS: Tab[] = ["needs_review", "filed", "ignored"];

export default async function InboxPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string; page?: string; per?: string; tab?: string };
}) {
  const t = await getTranslations("inbox");
  const td = await getTranslations("dashboard.inbox");
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
    supabase.from("matter").select("id, title, cnr").order("title"),
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
  const matterCnr = new Map((matters ?? []).map((m) => [m.id, m.cnr]));

  const list = rows ?? [];
  const listIds = list.map((e) => e.id);
  // WO-335 Wave 2: also select mime + size_bytes + doc_type (already-existing `document` columns,
  // no schema change) — the Chambers reference's attachment chips show a kind·size caption, the
  // inline preview needs the mime to pick pdf/image/download-only (same as the Documents viewer,
  // WO-334), and doc_type backs the reference's "Document type" field with the SAME controlled
  // vocabulary the classifier already writes at ingest (src/lib/docs/categories.ts) — shown
  // read-only (not re-editable from here, restyle-only scope) rather than dropped.
  const { data: attachRows } = listIds.length
    ? await supabase.from("document").select("id, filename, mime, size_bytes, email_message_id, doc_type").in("email_message_id", listIds)
    : { data: [] as { id: string; filename: string | null; mime: string | null; size_bytes: number | null; email_message_id: string | null; doc_type: string | null }[] };
  const attachByEmail = new Map<string, WorkspaceEmail["attachments"]>();
  for (const d of attachRows ?? []) {
    if (!d.email_message_id) continue;
    const arr = attachByEmail.get(d.email_message_id) ?? attachByEmail.set(d.email_message_id, []).get(d.email_message_id)!;
    arr.push({ id: d.id, filename: d.filename ?? "attachment", mime: d.mime, sizeLabel: fmtSize(d.size_bytes), docType: d.doc_type });
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
    matterCnr: e.classified_matter_id ? matterCnr.get(e.classified_matter_id) ?? null : null,
    attachments: attachByEmail.get(e.id) ?? [],
  }));

  const counts = { needs_review: needsReviewC.count ?? 0, filed: filedC.count ?? 0, ignored: ignoredC.count ?? 0 };
  const belowThreshold = Math.max(0, counts.needs_review - (atOrAboveC.count ?? 0));
  const account = userData.user?.email ?? "";
  const initials = account ? account.slice(0, 2).toUpperCase() : "—";

  return (
    <div className="space-y-6">
      {/* WO-343: dark ink engraved masthead — the prototype renders Inbox via AppMasthead (the
          same dark band as Overview/Cases, design-mockups/iteration3/console/app.inbox.tsx); this
          page had forked a light header. Match today-view/cases verbatim; count moves into the
          honey mono pill. */}
      <Reveal as="div" className="mk-engraved rounded-xl bg-ec-ink px-5 py-7 text-ec-paper sm:px-8">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-[28px] leading-tight text-ec-paper sm:text-[32px]">{t("title")}</h1>
          {conn && counts.needs_review > 0 && (
            <span className="num rounded-md bg-ec-ink-chip px-2 py-0.5 font-mono text-[12px] text-ec-honey">{td("toReview", { count: counts.needs_review })}</span>
          )}
        </div>
        <p className="mt-1.5 max-w-2xl text-[13px] text-ec-line-strong">{t("subtitle")}</p>
      </Reveal>

      {searchParams.connected && <p className="rounded-md bg-ec-success-bg px-3.5 py-2.5 text-sm text-ec-success">{t("connected")}</p>}
      {searchParams.error && <p className="rounded-md bg-ec-warn-bg px-3.5 py-2.5 text-sm text-ec-warn">{searchParams.error}</p>}

      {!conn ? (
        // WO-335 · the Chambers reference's dedicated disconnected panel (was an inline compact
        // row swap) — same real gate (googleConfigured() + /api/google/connect OAuth start).
        <Reveal as="div" delay={60} className="mx-auto max-w-2xl py-10">
          <div className="ec-rule-left rounded-r-md p-6">
            <p className="ec-label">{td("disconnected.eyebrow")}</p>
            <h2 className="mt-2 font-display text-[22px] leading-tight text-ec-ink">{td("disconnected.title")}</h2>
            <ul className="mt-4 space-y-2 text-[13.5px] text-ec-ink-2">
              {[td("disconnected.point1"), td("disconnected.point2"), td("disconnected.point3")].map((line) => (
                <li key={line} className="flex gap-2">
                  <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0 text-ec-bronze" />
                  {line}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="/api/google/connect"
                aria-disabled={!googleConfigured()}
                className={googleConfigured() ? "ec-btn ec-btn-ink" : "ec-btn ec-btn-ink pointer-events-none opacity-50"}
              >
                <Icon name="gmail" className="h-4 w-4" /> {t("connectGmail")}
              </a>
              {!googleConfigured() && <span className="text-xs text-ec-warn">{t("state.oauthNotConfigured")}</span>}
              {(process.env.NODE_ENV !== "production" || isDemoMode()) && <IngestButton />}
            </div>
          </div>
        </Reveal>
      ) : (
        <Reveal as="div" delay={60} className="ec-card flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ec-bronze-tint font-display text-[13px] text-ec-bronze-deep">
              {initials}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="num truncate font-mono text-[12.5px] text-ec-ink">{account}</span>
                <span className="ec-chip ec-chip-success">
                  <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-ec-success align-middle" />
                  {td("connectedPill")}
                </span>
              </div>
              <GmailQueryForm initial={conn.gmail_query ?? ""} />
              <p className="num mt-1 font-mono text-[11px] uppercase tracking-[0.12em] text-ec-muted-ink">
                {lastRow?.created_at
                  ? t("sync.line", { rel: fmtAgo(lastRow.created_at), processed: processedTodayC.count ?? 0, filed: filedTodayC.count ?? 0, pending: counts.needs_review })
                  : t("sync.never", { pending: counts.needs_review })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SyncNowButton />
            <DisconnectButton />
            {(process.env.NODE_ENV !== "production" || isDemoMode()) && <IngestButton />}
          </div>
        </Reveal>
      )}

      {conn && (
        <Reveal as="div" delay={120}>
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
            account={account}
          />

          {(tabTotal ?? 0) > per && <Pagination page={page} perPage={per} total={tabTotal ?? 0} />}
        </Reveal>
      )}

      <div className="flex flex-wrap items-center gap-1.5 border-t border-ec-line pt-4 text-xs text-ec-muted-ink">
        <Icon name="shield" className="h-3.5 w-3.5" /> {t("footer")}
      </div>
    </div>
  );
}
