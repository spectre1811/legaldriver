import { Fragment } from "react";
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

const SOURCE: Record<string, string> = { upload: "Upload", telephony: "Call", native: "In-app" };

function fmtDuration(sec: number | null | undefined) {
  if (!sec || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function VoicePage() {
  const supabase = createClient();

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
        title="Voice & calls"
        subtitle="Upload call recordings, transcribe them, and file each against the right client or case."
      />

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">Upload a recording</h2>
        <p className="mt-1 mb-4 text-xs text-ink-muted">
          Record only with disclosed consent (one-party consent + DPDP). Transcripts are sensitive PII.
        </p>
        <VoiceUploader clients={clientOpts} />
      </Card>

      {recs && recs.length ? (
        <Card className="overflow-hidden">
          <div className="border-b border-line px-5 py-2.5 text-xs text-ink-faint">
            {recs.length} recording{recs.length === 1 ? "" : "s"}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-3 label">Recording</th>
                <th className="hidden px-5 py-3 label sm:table-cell">Caller</th>
                <th className="px-5 py-3 label">Filed under</th>
                <th className="hidden px-5 py-3 label md:table-cell">Length</th>
                <th className="px-5 py-3 label">Status</th>
                <th className="hidden px-5 py-3 label lg:table-cell">Added</th>
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
                              {SOURCE[r.source] ?? r.source} · play
                            </a>
                          ) : (
                            <span className="font-medium text-ink-faint">{SOURCE[r.source] ?? r.source}</span>
                          )}
                        </span>
                      </td>
                      <td className="hidden px-5 py-3.5 text-ink-muted sm:table-cell">{r.from_number ?? "—"}</td>
                      <td className="px-5 py-3.5 text-ink-muted">{filed ?? <span className="text-amber-600">unfiled</span>}</td>
                      <td className="hidden px-5 py-3.5 text-xs text-ink-faint md:table-cell">
                        <span className="inline-flex items-center gap-1"><Icon name="clock" className="h-3.5 w-3.5" />{fmtDuration(r.duration_sec)}</span>
                      </td>
                      <td className="px-5 py-3.5"><Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge></td>
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
          title="No recordings yet"
          body="Upload a call recording above. With consent disclosed, it's stored privately, transcribed, and filed against the right client."
        />
      )}

      <p className="text-xs text-ink-faint">
        Audio is stored in a private bucket; playback uses short-lived signed URLs scoped to your tenant.
        Record only with disclosed consent (one-party consent + DPDP). Transcripts are sensitive PII.
      </p>
    </div>
  );
}
