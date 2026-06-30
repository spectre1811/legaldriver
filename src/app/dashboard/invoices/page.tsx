import Link from "next/link";
import { PageHeader, Card, Badge, EmptyState, fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/court/sync";

export const dynamic = "force-dynamic";

const rupees = (m: number) => `₹${(m / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const TONE: Record<string, "neutral" | "brand" | "green" | "amber" | "red"> = { draft: "neutral", sent: "amber", paid: "green", cancelled: "red" };

export default async function InvoicesPage() {
  const supabase = createClient();
  const tenantId = await getTenantId(supabase);
  const { data: invoices } = tenantId
    ? await supabase.from("invoice").select("id, number, status, issue_date, total_minor, client:client_id(name)").order("created_at", { ascending: false }).limit(100)
    : { data: [] };

  const outstanding = (invoices ?? []).filter((i) => i.status === "sent").reduce((a, i) => a + i.total_minor, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Invoices" subtitle="Assemble GST invoices from unbilled time & expenses. Start one from any case via “Create invoice”." />
      {outstanding > 0 && <Card><div className="px-5 py-3 text-sm">Outstanding (sent, unpaid): <strong>{rupees(outstanding)}</strong></div></Card>}
      <Card>
        <div className="border-b border-line px-5 py-4"><p className="font-medium">All invoices</p></div>
        {invoices && invoices.length > 0 ? (
          <ul className="divide-y divide-line">
            {invoices.map((i) => {
              const client = i.client as { name?: string } | null;
              return (
                <li key={i.id}>
                  <Link href={`/dashboard/invoices/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-paper">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{i.number ?? "Draft"} · {client?.name ?? "—"}</p>
                      <p className="text-xs text-ink-muted">{fmtDate(i.issue_date)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-medium">{rupees(i.total_minor)}</span>
                      <Badge tone={TONE[i.status] ?? "neutral"}>{i.status}</Badge>
                      <Icon name="chevron" className="h-4 w-4 text-ink-faint" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon="documents" title="No invoices yet" body="Open a case, log billable time/expenses, then click “Create invoice”." />
        )}
      </Card>
    </div>
  );
}
