import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Card } from "@/components/ui";
import { VoiceUploader } from "./uploader";
import { VoiceTable } from "./voice-table";
import { fetchVoicePage } from "./voice-query";

export const dynamic = "force-dynamic";

export default async function VoicePage() {
  const t = await getTranslations("voice");
  const supabase = createClient();
  const admin = createAdminClient();

  // Keyset-paginated (WO-39): fetch + sign only the first page; "Load more" pulls the
  // rest via loadMoreVoice. Replaces the old limit(200) + sign-all-200-on-load.
  const [firstPage, { data: clients }, { data: matters }] = await Promise.all([
    fetchVoicePage(supabase, admin),
    supabase.from("client").select("id, name"),
    supabase.from("matter").select("id, title"),
  ]);

  const clientOpts = (clients ?? []).map((c) => ({ id: c.id, label: c.name }));
  const matterOpts = (matters ?? []).map((m) => ({ id: m.id, label: m.title }));

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink">{t("upload.heading")}</h2>
        <p className="mt-1 mb-4 text-xs text-ink-muted">{t("upload.consentNote")}</p>
        <VoiceUploader clients={clientOpts} />
      </Card>

      <VoiceTable
        initialRows={firstPage.rows}
        initialCursor={firstPage.nextCursor}
        clients={clientOpts}
        matters={matterOpts}
      />

      <p className="text-xs text-ink-faint">{t("footer")}</p>
    </div>
  );
}
