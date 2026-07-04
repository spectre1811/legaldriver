import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { NoticeForm } from "./notice-form";
import { NoticesList } from "./notices-list";
import { Pagination } from "@/components/pagination";
import { fetchNoticesPage } from "./notices-query";
import { parsePage, clampPerPage } from "@/lib/paginate";

export default async function NoticesPage({ searchParams }: { searchParams: { page?: string; per?: string } }) {
  const t = await getTranslations("notices");
  const supabase = createClient();
  const page = parsePage(searchParams.page);
  const per = clampPerPage(searchParams.per);

  // Numbered-page pagination (WO-39): this page's slice + an exact count.
  const [{ rows: notices, total }, { data: matters }] = await Promise.all([
    fetchNoticesPage(supabase, page, per),
    supabase.from("matter").select("id, title").order("title"),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card className="p-5">
        <NoticeForm matters={matters ?? []} />
      </Card>

      {total > 0 ? (
        <>
          <NoticesList rows={notices} />
          <Pagination page={page} perPage={per} total={total} />
        </>
      ) : (
        <EmptyState icon="notices" title={t("empty.title")} body={t("empty.body")} />
      )}
    </div>
  );
}
