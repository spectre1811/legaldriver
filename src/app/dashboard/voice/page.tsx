import { Fragment } from "react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Card, Badge, EmptyState, fmtAgo } from "@/components/ui";
import { Icon } from "@/components/icons";
import { VoiceUploader } from "./uploader";
import { RowActions } from "./row-actions";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "neutral" | "brand" | "green" | "amber" | "red"> = {
  uploaded: "neutral",
  transcribing: "amber",
  transcribed: "brand",
  summarized: "green",
  failed: "red",
};

function fmtDuration(sec: number | null | undefined) {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function VoicePage() {
  const t = await getTranslations("voice");
  const supabase = createClient();

  const SOURCE_LABEL: Record<string, string> = {
    upload: t("source.upload"),
    telephony: t("source.telephony"),
    native: t("source.native"),
  };
  const STATUS_LABEL: Record<string, string> = {
    uploaded: t("status.uploaded"),
    transcribing: t("status.transcribing"),
    transcribed: t("status.transcribed"),
    summarized: t("status.summarized"),
    failed: t("status.failed"),
  };

  const [{ data: recs }, { data: clients }, { data: matters }] = await Promise.all([
    supabase
      .from("voice_recording")
      .select("id, source, from_number, client_id, matter_id, storage_path, duration_sec, status, transcript, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("client").select("id, name"),
    supabase.from("matter").select("id, title"),
  ]);

  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const matterName = new Map((matters ?? []).map((m) => [m.id, m.title]));
  const clientOpts = (clients ?? []).map((c) => ({ id: c.id, label: c.name }));
  const matterOpts = (matters ?? []).map((m) => ({ id: m.id, label: m.title }));

  // Short-lived signed URLs for playback/download (private bucket; service role).
  const admin = createAdminClient();
  const signed = new Map<string, string>();
  await Promise.all(
    (recs ?? [])
      .filter((r) => r.storage_path)
      .map(async (r) => {
        const { data } = await admin.storage.from("documents").createSignedUrl(r.storage_path as string, 120);
        if (data?.signedUrl) signed.set(r.id, data.signedUrl);
      }),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">{t("upload.heading")}</h2>
        <p className="mt-1 mb-4 text-xs text-ink-muted">
          {t("upload.consentNote")}
        </p>
        <VoiceUploader clients={clientOpts} />
      </Card>

      {recs && recs.length ? (
        <Card className="overflow-hidden">
          <div className="border-b border-line px-5 py-2.5 text-xs text-ink-faint">
            {t("count", { count: recs.length })}
          </div>
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
              {(recs ?? []).map((r) => {
                const filed = r.matter_id ? matterName.get(r.matter_id) : r.client_id ? clientName.get(r.client_id) : null;
                const url = signed.get(r.id);
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
                          hasTranscript={Boolean(r.transcript)}
                          clients={clientOpts}
                          matters={matterOpts}
                        />
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState
          icon="clip"
          title={t("empty.title")}
          body={t("empty.body")}
        />
      )}

      <p className="text-xs text-ink-faint">
        {t("footer")}
      </p>
    </div>
  );
}
