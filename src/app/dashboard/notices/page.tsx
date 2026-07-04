import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { NoticeForm } from "./notice-form";
import { NoticesList } from "./notices-list";
import { paginate } from "@/lib/paginate";
import { noticesQuery, NOTICES_PAGE_SIZE, type NoticeRow } from "./notices-query";

export default async function NoticesPage() {
  const t = await getTranslations("notices");
  const supabase = createClient();

  // Keyset-paginated (WO-39): fetch only the first page; "Load more" pulls the rest
  // via the loadMoreNotices server action. No more unbounded fetch-all of every notice.
  const [firstPage, { data: matters }] = await Promise.all([
    paginate<NoticeRow>(noticesQuery(supabase), { column: "created_at", limit: NOTICES_PAGE_SIZE }),
    supabase.from("matter").select("id, title").order("title"),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card className="p-5">
        <NoticeForm matters={matters ?? []} />
      </Card>

      <NoticesList initialRows={firstPage.rows} initialCursor={firstPage.nextCursor} />
    </div>
  );
}
