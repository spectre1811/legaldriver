import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { ClientIntake } from "./client-intake";

export default async function ClientsPage() {
  const t = await getTranslations("clients");
  const supabase = createClient();
  const [{ data: clients }, { data: areas }, { data: matters }] = await Promise.all([
    supabase.from("client").select("id, name, type, emails, phones").order("name"),
    supabase.from("practice_area").select("id, name").order("name"),
    supabase.from("matter").select("client_id"),
  ]);
  const caseCount = new Map<string, number>();
  for (const m of matters ?? []) if (m.client_id) caseCount.set(m.client_id, (caseCount.get(m.client_id) ?? 0) + 1);

  return (
    <div className="space-y-7">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card className="p-5">
        <h2 className="mb-4 text-base font-medium">{t("newIntake")}</h2>
        <ClientIntake practiceAreas={areas ?? []} />
      </Card>

      {clients && clients.length ? (
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
                  <td className="px-5 py-3.5 text-ink-soft">{caseCount.get(c.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState icon="cases" title={t("emptyTitle")} body={t("emptyBody")} />
      )}
    </div>
  );
}
