import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card } from "@/components/ui";
import { ClientIntake } from "./client-intake";
import { ClientsTable } from "./clients-table";
import { fetchClientsPage } from "./clients-query";

export default async function ClientsPage() {
  const t = await getTranslations("clients");
  const supabase = createClient();

  // Keyset-paginated (WO-39): first page only; "Load more" pulls the rest via the
  // loadMoreClients server action. Replaces the old fetch-all-clients + full-table
  // matter scan for counts.
  const [firstPage, { data: areas }] = await Promise.all([
    fetchClientsPage(supabase),
    supabase.from("practice_area").select("id, name").order("name"),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card className="p-5">
        <h2 className="mb-4 text-base font-medium">{t("newIntake")}</h2>
        <ClientIntake practiceAreas={areas ?? []} />
      </Card>

      <ClientsTable initialRows={firstPage.rows} initialCursor={firstPage.nextCursor} />
    </div>
  );
}
