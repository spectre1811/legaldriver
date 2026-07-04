import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { VoiceUploader } from "./uploader";
import { VoiceTable } from "./voice-table";
import { Pagination } from "@/components/pagination";
import { fetchVoicePage } from "./voice-query";
import { parsePage, clampPerPage } from "@/lib/paginate";

export const dynamic = "force-dynamic";

export default async function VoicePage({ searchParams }: { searchParams: { page?: string; per?: string } }) {
  const t = await getTranslations("voice");
  const supabase = createClient();
  const admin = createAdminClient();
  const page = parsePage(searchParams.page);
  const per = clampPerPage(searchParams.per);

  // Numbered-page pagination (WO-39): fetch + sign only this page; exact total count.
  // Replaces the old limit(200) + sign-all-200-on-load.
  const [{ rows: recs, total }, { data: clients }, { data: matters }] = await Promise.all([
    fetchVoicePage(supabase, admin, page, per),
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

      {total > 0 ? (
        <>
          <VoiceTable rows={recs} clients={clientOpts} matters={matterOpts} />
          <Pagination page={page} perPage={per} total={total} />
        </>
      ) : (
        <EmptyState icon="clip" title={t("empty.title")} body={t("empty.body")} />
      )}

      <p className="text-xs text-ink-faint">{t("footer")}</p>
    </div>
  );
}
