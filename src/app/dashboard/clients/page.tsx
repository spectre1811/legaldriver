import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { ClientIntake } from "./client-intake";
import { Pagination } from "@/components/pagination";
import { fetchClientsPage } from "./clients-query";
import { parsePage, clampPerPage } from "@/lib/paginate";

export default async function ClientsPage({ searchParams }: { searchParams: { page?: string; per?: string } }) {
  const t = await getTranslations("clients");
  const supabase = createClient();
  const page = parsePage(searchParams.page);
  const per = clampPerPage(searchParams.per);

  // Numbered-page pagination (WO-39): this page's slice + an exact total count. Replaces
  // the old fetch-all-clients + full-table matter scan for counts.
  const [{ rows: clients, total }, { data: areas }] = await Promise.all([
    fetchClientsPage(supabase, page, per),
    supabase.from("practice_area").select("id, name").order("name"),
  ]);

  return (
    <div className="space-y-7">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card className="p-5">
        <h2 className="mb-4 text-base font-medium">{t("newIntake")}</h2>
        <ClientIntake practiceAreas={areas ?? []} />
      </Card>

      {total > 0 ? (
        <>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-5 py-3 label">{t("colClient")}</th>
                  <th className="hidden px-5 py-3 label sm:table-cell">{t("colType")}</th>
                  <th className="hidden px-5 py-3 label md:table-cell">{t("colContact")}</th>
                  <th className="px-5 py-3 label">{t("colCases")}</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-5 py-3.5"><Link href={`/dashboard/clients/${c.id}`} className="font-medium text-ink hover:text-brand-600">{c.name}</Link></td>
                    <td className="hidden px-5 py-3.5 sm:table-cell"><Badge>{c.type}</Badge></td>
                    <td className="hidden px-5 py-3.5 text-ink-muted md:table-cell">{c.emails?.[0] ?? c.phones?.[0] ?? "—"}</td>
                    <td className="px-5 py-3.5 text-ink-soft">{c.caseCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Pagination page={page} perPage={per} total={total} />
        </>
      ) : (
        <EmptyState icon="cases" title={t("emptyTitle")} body={t("emptyBody")} />
      )}
    </div>
  );
}
