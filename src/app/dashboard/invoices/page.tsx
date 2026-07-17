import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatCourtDate } from "@/components/court";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";
import { Pagination } from "@/components/pagination";
import { parsePage, clampPerPage } from "@/lib/paginate";
import { fetchInvoicesPage, type GstKind } from "./invoices-query";

export const dynamic = "force-dynamic";

const rupees = (m: number) => `₹${(m / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const STATUS_TONE: Record<string, string> = { draft: "", sent: "ec-chip-warn", paid: "ec-chip-success", cancelled: "ec-chip-danger" };
// Inter-state (IGST) reads as the "hot" brass chip; intra-state (CGST+SGST) neutral. No GST → nothing.
const GST_TONE: Record<GstKind, string> = { igst: "ec-chip-hot", cgst_sgst: "", none: "" };

export default async function InvoicesPage({ searchParams }: { searchParams: { page?: string; per?: string } }) {
  const t = await getTranslations("invoices");
  const te = await getTranslations("enum");
  const st = (v: string) => (te.has(`status.${v}`) ? te(`status.${v}`) : v);
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);

  const page = parsePage(searchParams.page);
  const per = clampPerPage(searchParams.per);
  const { rows, total, stats } = tenantId
    ? await fetchInvoicesPage(supabase, page, per)
    : { rows: [], total: 0, stats: { outstandingMinor: 0, draftCount: 0, totalCount: 0, paidThisFyMinor: 0, fy: "" } };

  const today = new Date().toISOString().slice(0, 10);
  const gstLabel = (k: GstKind) => (k === "igst" ? t("gst.inter") : k === "cgst_sgst" ? t("gst.intra") : t("gst.none"));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ec-ink">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ec-ink-3">{t("subtitle")}</p>
      </header>

      {/* Label-top attention cards (DS v2 §6): smallcap label · serif figure · one-line hint. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t("stat.outstanding")} value={rupees(stats.outstandingMinor)} hint={t("stat.outstandingHint")} />
        <StatCard label={t("stat.draft")} value={String(stats.draftCount)} hint={t("stat.draftHint")} />
        <StatCard label={t("stat.paidFy")} value={rupees(stats.paidThisFyMinor)} hint={stats.fy ? t("stat.paidFyHint", { fy: stats.fy }) : ""} />
      </div>

      <div className="ec-card overflow-hidden">
        <div className="border-b border-ec-hair bg-ec-paper-3 px-5 py-3"><p className="ec-label">{t("feeBook")}</p></div>
        {total > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ec-hair text-left">
                  <th className="px-5 py-3"><span className="ec-label">{t("col.invoice")}</span></th>
                  <th className="hidden px-5 py-3 sm:table-cell"><span className="ec-label">{t("col.client")}</span></th>
                  <th className="hidden px-5 py-3 md:table-cell"><span className="ec-label">{t("col.issued")}</span></th>
                  <th className="hidden px-5 py-3 lg:table-cell"><span className="ec-label">{t("col.gst")}</span></th>
                  <th className="px-5 py-3"><span className="ec-label">{t("col.status")}</span></th>
                  <th className="px-5 py-3 text-right"><span className="ec-label">{t("col.amount")}</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => {
                  const overdue = i.status === "sent" && i.due_date != null && i.due_date < today;
                  return (
                    <tr key={i.id} className="ec-row border-b border-ec-hair last:border-0">
                      <td className="px-5 py-3.5">
                        <Link href={`/dashboard/invoices/${i.id}`} className="num font-medium text-ec-ink hover:text-ec-brass-deep">{i.number ?? t("draft")}</Link>
                        {overdue && <span className="ml-2 text-xs font-medium text-ec-danger">· {t("overdue")}</span>}
                      </td>
                      <td className="hidden px-5 py-3.5 text-ec-ink-2 sm:table-cell">{i.clientName ?? <span className="text-ec-ink-3">—</span>}</td>
                      <td className="num hidden px-5 py-3.5 text-ec-ink-3 md:table-cell">{formatCourtDate(i.issue_date) ?? "—"}</td>
                      <td className="hidden px-5 py-3.5 lg:table-cell">{i.gstKind === "none" ? <span className="text-ec-ink-3">—</span> : <span className={`ec-chip ${GST_TONE[i.gstKind]}`}>{gstLabel(i.gstKind)}</span>}</td>
                      <td className="px-5 py-3.5"><span className={`ec-chip ${STATUS_TONE[i.status] ?? ""}`}>{st(i.status)}</span></td>
                      <td className="num px-5 py-3.5 text-right font-medium text-ec-ink">{rupees(i.total_minor)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-ec-m bg-ec-brass-tint text-ec-brass-deep">
              <Icon name="documents" className="h-5 w-5" />
            </span>
            <h3 className="font-display text-lg font-medium text-ec-ink">{t("empty.title")}</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-ec-ink-3">{t("empty.body")}</p>
          </div>
        )}
      </div>

      {total > per && <Pagination page={page} perPage={per} total={total} />}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="ec-card px-5 py-4">
      <p className="ec-label">{label}</p>
      <p className="num mt-2 font-display text-[1.75rem] font-medium leading-none text-ec-ink">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-ec-ink-3">{hint}</p>}
    </div>
  );
}
