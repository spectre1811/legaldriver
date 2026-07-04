"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PAGE_SIZE_OPTIONS, pageCount, pageWindow } from "@/lib/paginate";

// The classic data-table pagination control (WO-39): numbered pages + Prev/Next, a
// rows-per-page selector, and "showing X–Y of N". URL-driven (`?page`/`?per`) so it's
// bookmarkable, server-rendered, and preserves whatever filters are already in the URL.
// Palette-neutral tokens so it sits on either the `ec-*` (cases) or `line/ink` surfaces.
export function Pagination({
  page,
  perPage,
  total,
}: {
  page: number;
  perPage: number;
  total: number;
}) {
  const t = useTranslations("pagination");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const totalPages = pageCount(total, perPage);
  const cur = Math.min(Math.max(1, page), totalPages);

  const go = (params: Record<string, string>) => {
    const sp = new URLSearchParams(Array.from(searchParams.entries()));
    for (const [k, v] of Object.entries(params)) sp.set(k, v);
    router.push(`${pathname}?${sp.toString()}`);
  };
  const gotoPage = (n: number) => go({ page: String(n) });
  const changePer = (n: number) => go({ per: String(n), page: "1" }); // resizing resets to page 1

  const from = total === 0 ? 0 : (cur - 1) * perPage + 1;
  const to = Math.min(total, cur * perPage);
  const win = pageWindow(cur, totalPages);

  if (total === 0) return null;

  return (
    <div
      data-testid="pagination"
      data-page={cur}
      data-per-page={perPage}
      data-total={total}
      data-total-pages={totalPages}
      className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm"
    >
      <div className="flex flex-wrap items-center gap-3 text-ink-faint">
        <label className="flex items-center gap-1.5">
          <span>{t("perPage")}</span>
          <select
            value={perPage}
            onChange={(e) => changePer(Number(e.target.value))}
            data-testid="per-page-select"
            className="rounded-lg border border-line bg-paper px-2 py-1 text-ink outline-none"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <span data-testid="pagination-range">{t("showing", { from, to, total })}</span>
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center gap-1" aria-label={t("nav")}>
          <button
            type="button"
            onClick={() => gotoPage(cur - 1)}
            disabled={cur <= 1}
            data-testid="page-prev"
            className="rounded-lg border border-line px-2.5 py-1 text-ink-soft hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("prev")}
          </button>
          {win.map((p, i) =>
            p === "…" ? (
              <span key={`ellipsis-${i}`} className="px-1.5 text-ink-faint">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => gotoPage(p)}
                aria-current={p === cur ? "page" : undefined}
                data-testid={p === cur ? "page-current" : "page-number"}
                className={`min-w-9 rounded-lg border px-2.5 py-1 ${
                  p === cur
                    ? "border-brand-500 bg-brand-50 font-medium text-brand-700"
                    : "border-line text-ink-soft hover:bg-paper"
                }`}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => gotoPage(cur + 1)}
            disabled={cur >= totalPages}
            data-testid="page-next"
            className="rounded-lg border border-line px-2.5 py-1 text-ink-soft hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("next")}
          </button>
        </nav>
      )}
    </div>
  );
}
