import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState, fmtAgo } from "@/components/ui";
import { Icon } from "@/components/icons";
import type { Citation } from "@/lib/services/agent/types";
import { Chat } from "./chat";

export const dynamic = "force-dynamic";

// Citations live in jsonb; coerce defensively rather than trust the shape blindly.
function asCitations(raw: unknown): Citation[] {
  return Array.isArray(raw) ? (raw as Citation[]) : [];
}
function asMeta(raw: unknown): { pending?: boolean; abstained?: boolean } {
  return raw && typeof raw === "object" ? (raw as { pending?: boolean; abstained?: boolean }) : {};
}

// External http(s) links open in a new tab; internal deep-links navigate in place.
function isExternal(url?: string) {
  return Boolean(url && /^https?:\/\//i.test(url));
}

export default async function CopilotPage({
  searchParams,
}: {
  searchParams: { thread?: string; matter?: string; client?: string };
}) {
  const t = await getTranslations("copilot");
  const supabase = createClient();
  const suggestions = [
    t("suggestion1"),
    t("suggestion2"),
    t("suggestion3"),
    t("suggestion4"),
  ];
  const threadId = searchParams.thread ?? null;
  const matterId = searchParams.matter ?? null;
  const clientId = searchParams.client ?? null;

  const { data: threads } = await supabase
    .from("agent_thread")
    .select("id, title, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: turns } = threadId
    ? await supabase
        .from("agent_turn")
        .select("id, role, content, citations, meta, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
    : { data: null };

  return (
    <div className="space-y-7">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      >
        <Badge tone="brand">
          <span className="flex items-center gap-1">
            <Icon name="sparkles" className="h-3.5 w-3.5" /> {t("badgeAssistive")}
          </span>
        </Badge>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
        {/* Left rail — recent threads */}
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-medium">{t("conversations")}</h2>
              <Link
                href="/dashboard/assistant/ask"
                className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
              >
                <Icon name="plus" className="h-3.5 w-3.5" /> {t("new")}
              </Link>
            </div>
            {threads && threads.length ? (
              <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">
                {threads.map((thread) => (
                  <li key={thread.id}>
                    <Link
                      href={`/dashboard/assistant/ask?thread=${thread.id}`}
                      className={`block px-4 py-3 text-sm transition hover:bg-paper ${
                        thread.id === threadId ? "bg-brand-50" : ""
                      }`}
                    >
                      <p className="line-clamp-2 font-medium text-ink">{thread.title ?? t("untitled")}</p>
                      <p className="mt-0.5 text-xs text-ink-faint">{fmtAgo(thread.created_at)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-xs text-ink-faint">{t("noConversations")}</p>
            )}
          </Card>
        </aside>

        {/* Main panel — selected thread or intro */}
        <Card className="flex min-h-[32rem] flex-col overflow-hidden">
          {threadId && turns ? (
            <>
              <div className="flex-1 space-y-5 overflow-y-auto px-5 py-6">
                {turns.length ? (
                  turns.map((turn) => {
                    if (turn.role === "user") {
                      return (
                        <div key={turn.id} className="flex justify-end">
                          <div className="max-w-[80%] rounded-2xl bg-brand-600 px-4 py-2.5 text-sm text-white">
                            {turn.content}
                          </div>
                        </div>
                      );
                    }
                    const meta = asMeta(turn.meta);
                    const citations = asCitations(turn.citations);
                    const pending = Boolean(meta.pending) && !turn.content?.trim();
                    return (
                      <div key={turn.id} className="flex justify-start">
                        <div className="max-w-[85%] space-y-2.5">
                          <div className="flex items-start gap-2.5">
                            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                              <Icon name="sparkles" className="h-4 w-4" />
                            </span>
                            <div className="rounded-2xl bg-paper px-4 py-2.5 text-sm text-ink-soft">
                              {pending ? (
                                <p className="flex items-center gap-2 text-ink-faint">
                                  <Icon name="clock" className="h-4 w-4" />
                                  {t("pendingBriefing")}
                                </p>
                              ) : (
                                <p className="whitespace-pre-wrap">{turn.content}</p>
                              )}
                              {meta.abstained && !pending && (
                                <p className="mt-2 text-xs text-amber-700">
                                  {t("noGroundedSource")}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Citations — numbered source list under the bubble */}
                          {citations.length > 0 && (
                            <ul className="ml-9 space-y-1">
                              {citations.map((c) => {
                                const ext = isExternal(c.url);
                                const inner = (
                                  <span className="flex items-start gap-1.5">
                                    <span className="font-medium text-ink-muted">[{c.n}]</span>
                                    <span>
                                      <Icon name="scale" className="mr-1 inline h-3 w-3 text-ink-faint" />
                                      {c.title}
                                      <span className="text-ink-faint"> · {c.ref}</span>
                                      {ext && <Icon name="external" className="ml-1 inline h-3 w-3" />}
                                    </span>
                                  </span>
                                );
                                return (
                                  <li key={c.n} className="text-xs text-ink-muted">
                                    {c.url ? (
                                      <Link
                                        href={c.url}
                                        target={ext ? "_blank" : undefined}
                                        rel={ext ? "noopener noreferrer" : undefined}
                                        className="hover:text-brand-600 hover:underline"
                                      >
                                        {inner}
                                      </Link>
                                    ) : (
                                      inner
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="py-12 text-center text-sm text-ink-faint">{t("noTurns")}</p>
                )}
              </div>
              <Chat threadId={threadId} matterId={matterId} clientId={clientId} />
            </>
          ) : (
            <>
              <div className="flex flex-1 flex-col justify-center px-5 py-8">
                <EmptyState
                  icon="sparkles"
                  title={t("emptyTitle")}
                  body={t("emptyBody")}
                >
                  <div className="flex flex-col gap-2">
                    {suggestions.map((s) => (
                      <span
                        key={s}
                        className="rounded-xl border border-line bg-surface px-3.5 py-2 text-left text-sm text-ink-soft"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </EmptyState>
              </div>
              <Chat matterId={matterId} clientId={clientId} />
            </>
          )}
        </Card>
      </div>

      {/* Guardrail — assistive only, grounded + cited, not legal advice */}
      <p className="flex items-center gap-1.5 text-xs text-ink-faint">
        <Icon name="alert" className="h-3.5 w-3.5" />
        {t("disclaimer")}
      </p>
    </div>
  );
}
