import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState, fmtDate } from "@/components/ui";
import { IpForm } from "./ip-form";
import { DeleteButton } from "@/components/delete-button";
import { deleteIpAsset } from "./actions";

const TYPE_TONE: Record<string, "brand" | "amber" | "green" | "neutral"> = {
  trademark: "brand", patent: "amber", copyright: "green", design: "neutral",
};

export default async function IpPage() {
  const supabase = createClient();
  const t = await getTranslations("ip");
  const tr = (v: string) => (t.has(`type.${v}`) ? t(`type.${v}`) : v);
  const { data: assets } = await supabase
    .from("ip_asset")
    .select("id, type, title, registration_no, jurisdiction, status, renewal_date")
    .order("renewal_date", { ascending: true, nullsFirst: false });

  const soon = new Date();
  soon.setDate(soon.getDate() + 90);
  const soonStr = soon.toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-7">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card className="p-5">
        <h2 className="mb-4 text-base font-medium">{t("addAsset")}</h2>
        <IpForm />
      </Card>

      {assets && assets.length ? (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-3 label">{t("th.asset")}</th>
                <th className="hidden px-5 py-3 label sm:table-cell">{t("th.type")}</th>
                <th className="hidden px-5 py-3 label md:table-cell">{t("th.regNo")}</th>
                <th className="px-5 py-3 label">{t("th.renewal")}</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => {
                const due = a.renewal_date && a.renewal_date <= soonStr;
                const overdue = a.renewal_date && a.renewal_date < today;
                return (
                  <tr key={a.id} className="border-b border-line last:border-0 hover:bg-paper">
                    <td className="px-5 py-3.5 font-medium text-ink">{a.title}</td>
                    <td className="hidden px-5 py-3.5 sm:table-cell"><Badge tone={TYPE_TONE[a.type] ?? "neutral"}>{tr(a.type)}</Badge></td>
                    <td className="hidden px-5 py-3.5 font-mono text-xs text-ink-faint md:table-cell">{a.registration_no ?? "—"}</td>
                    <td className="px-5 py-3.5">
                      <span className={overdue ? "text-red-600" : due ? "text-amber-700" : "text-ink-soft"}>{fmtDate(a.renewal_date)}</span>
                      {due && <span className="ml-2 text-xs">{overdue ? t("overdue") : t("soon")}</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <DeleteButton onDelete={deleteIpAsset.bind(null, a.id)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState icon="notices" title={t("empty.title")} body={t("empty.body")} />
      )}
    </div>
  );
}
