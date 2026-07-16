import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatCourtDate } from "@/components/court";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";

export const dynamic = "force-dynamic";

const rupees = (m: number) => `₹${(m / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TONE: Record<string, string> = { draft: "", sent: "ec-chip-warn", paid: "ec-chip-success", cancelled: "ec-chip-danger" };

export default async function InvoicesPage() {
  const supabase = createClient();
  const t = await getTranslations("invoices");
  const te = await getTranslations("enum");
  const st = (v: string) => (te.has(`status.${v}`) ? te(`status.${v}`) : v);
  const tenantId = await getTenantId(supabase);
  const { data: invoices } = tenantId
    ? await supabase.from("invoice").select("id, number, status, issue_date, due_date, total_minor, client:client_id(name)").order("created_at", { ascending: false }).limit(100)
    : { data: [] };

  const outstanding = (invoices ?? []).filter((i) => i.status === "sent").reduce((a, i) => a + i.total_minor, 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ec-ink">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ec-ink-3">{t("subtitle")}</p>
      </header>

      {outstanding > 0 && (
        <div className="ec-card px-5 py-3 text-sm text-ec-ink-2">
          {t("outstanding")} <strong className="num font-semibold text-ec-ink">{rupees(outstanding)}</strong>
        </div>
      )}

      <div className="ec-card overflow-hidden">
        <div className="border-b border-ec-hair px-5 py-4"><p className="ec-label">{t("all")}</p></div>
        {invoices && invoices.length > 0 ? (
          <ul className="divide-y divide-ec-hair">
            {invoices.map((i) => {
              const client = i.client as { name?: string } | null;
              const overdue = i.status === "sent" && i.due_date != null && i.due_date < today;
              return (
                <li key={i.id}>
                  <Link href={`/dashboard/invoices/${i.id}`} className="ec-row flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="num truncate text-sm font-medium text-ec-ink">{i.number ?? t("draft")} · {client?.name ?? "—"}</p>
                      <p className="num text-xs text-ec-ink-3">
                        {(formatCourtDate(i.issue_date) ?? "—")}
                        {i.due_date ? <> · {t("due", { date: (formatCourtDate(i.due_date) ?? "—") })}{overdue ? <span className="font-medium text-ec-danger"> · {t("overdue")}</span> : null}</> : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="num text-sm font-medium text-ec-ink">{rupees(i.total_minor)}</span>
                      <span className={`ec-chip ${TONE[i.status] ?? ""}`}>{st(i.status)}</span>
                      <Icon name="chevron" className="h-4 w-4 text-ec-ink-3" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
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
    </div>
  );
}
