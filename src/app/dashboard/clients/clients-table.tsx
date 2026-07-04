"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, Badge, EmptyState } from "@/components/ui";
import { PaginatedList } from "@/components/paginated-list";
import { loadMoreClients } from "./actions";
import type { ClientRow } from "./clients-query";

// Keyset-paginated clients directory (WO-39): the server renders page 1, "Load more"
// appends further pages (each already carrying its per-page case counts) via the
// loadMoreClients server action. Rows render identically on every page.
export function ClientsTable({
  initialRows,
  initialCursor,
}: {
  initialRows: ClientRow[];
  initialCursor: string | null;
}) {
  const t = useTranslations("clients");

  return (
    <PaginatedList
      initialRows={initialRows}
      initialCursor={initialCursor}
      loadMore={loadMoreClients}
      empty={<EmptyState icon="cases" title={t("emptyTitle")} body={t("emptyBody")} />}
    >
      {(rows) => (
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
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-paper">
                  <td className="px-5 py-3.5">
                    <Link href={`/dashboard/clients/${c.id}`} className="font-medium text-ink hover:text-brand-600">{c.name}</Link>
                  </td>
                  <td className="hidden px-5 py-3.5 sm:table-cell"><Badge>{c.type}</Badge></td>
                  <td className="hidden px-5 py-3.5 text-ink-muted md:table-cell">{c.emails?.[0] ?? c.phones?.[0] ?? "—"}</td>
                  <td className="px-5 py-3.5 text-ink-soft">{c.caseCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </PaginatedList>
  );
}
