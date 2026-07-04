"use client";

import { Fragment, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Card, Badge, EmptyState, fmtAgo } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PaginatedList } from "@/components/paginated-list";
import { RowActions } from "./row-actions";
import { loadMoreVoice } from "./actions";
import type { VoiceRow } from "./voice-query";

type Opt = { id: string; label: string };

const STATUS_TONE: Record<string, "neutral" | "brand" | "green" | "amber" | "red"> = {
  uploaded: "neutral", transcribing: "amber", transcribed: "brand", summarized: "green", failed: "red",
};

function fmtDuration(sec: number | null | undefined) {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Keyset-paginated voice recordings (WO-39): server renders page 1 (URLs signed for
// that page only), "Load more" appends further pages via loadMoreVoice.
export function VoiceTable({
  initialRows,
  initialCursor,
  clients,
  matters,
}: {
  initialRows: VoiceRow[];
  initialCursor: string | null;
  clients: Opt[];
  matters: Opt[];
}) {
  const t = useTranslations("voice");
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.label])), [clients]);
  const matterName = useMemo(() => new Map(matters.map((m) => [m.id, m.label])), [matters]);

  const SOURCE_LABEL: Record<string, string> = {
    upload: t("source.upload"), telephony: t("source.telephony"), native: t("source.native"),
  };
  const STATUS_LABEL: Record<string, string> = {
    uploaded: t("status.uploaded"), transcribing: t("status.transcribing"),
    transcribed: t("status.transcribed"), summarized: t("status.summarized"), failed: t("status.failed"),
  };

  return (
    <PaginatedList
      initialRows={initialRows}
      initialCursor={initialCursor}
      loadMore={loadMoreVoice}
      empty={<EmptyState icon="clip" title={t("empty.title")} body={t("empty.body")} />}
    >
      {(rows) => (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-3 label">{t("table.recording")}</th>
                <th className="hidden px-5 py-3 label sm:table-cell">{t("table.caller")}</th>
                <th className="px-5 py-3 label">{t("table.filedUnder")}</th>
                <th className="hidden px-5 py-3 label md:table-cell">{t("table.length")}</th>
                <th className="px-5 py-3 label">{t("table.status")}</th>
                <th className="hidden px-5 py-3 label lg:table-cell">{t("table.added")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const filed = r.matter_id ? matterName.get(r.matter_id) : r.client_id ? clientName.get(r.client_id) : null;
                const url = r.signedUrl;
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b border-line hover:bg-paper">
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-2.5">
                          <Icon name="clip" className="h-4 w-4 shrink-0 text-ink-faint" />
                          {url ? (
                            <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-600 hover:text-brand-700">
                              {SOURCE_LABEL[r.source] ?? r.source} · {t("play")}
                            </a>
                          ) : (
                            <span className="font-medium text-ink-faint">{SOURCE_LABEL[r.source] ?? r.source}</span>
                          )}
                        </span>
                      </td>
                      <td className="hidden px-5 py-3.5 text-ink-muted sm:table-cell">{r.from_number ?? "—"}</td>
                      <td className="px-5 py-3.5 text-ink-muted">{filed ?? <span className="text-amber-600">{t("unfiled")}</span>}</td>
                      <td className="hidden px-5 py-3.5 text-xs text-ink-faint md:table-cell">
                        <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-3.5 w-3.5" />{fmtDuration(r.duration_sec)}</span>
                      </td>
                      <td className="px-5 py-3.5"><Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</Badge></td>
                      <td className="hidden px-5 py-3.5 text-xs text-ink-faint lg:table-cell">{fmtAgo(r.created_at)}</td>
                    </tr>
                    <tr className="border-b border-line last:border-0">
                      <td colSpan={6} className="px-5 pb-4">
                        <RowActions
                          id={r.id}
                          clientId={r.client_id}
                          matterId={r.matter_id}
                          hasTranscript={r.hasTranscript}
                          clients={clients}
                          matters={matters}
                        />
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </PaginatedList>
  );
}
