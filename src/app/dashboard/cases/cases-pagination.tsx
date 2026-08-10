"use client";

// WO-331 EXACT-FIDELITY · Cases-page-only pagination, matching the reference
// (design-mockups/iteration3/console/cases.tsx) shape: a rows-per-page select, ONE combined
// "Showing X–Y of N cases · Page P of T" line, and Prev / Go-to-page-input / Next — not the shared
// <Pagination> component's numbered-page-window UI, which is a materially different layout used
// across several other lists (client-detail matters/documents). Rather than fork <Pagination>'s
// internals with a tweak (the "never fork a shared primitive" rule), this is a separate, honest
// page-specific control that speaks the SAME `page`/`per` URL contract (lib/paginate.ts) — so
// nothing about the underlying pagination mechanism forks, only this page's rendering of it.
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { PAGE_SIZE_OPTIONS, pageCount } from "@/lib/paginate";
import { useCasesNav } from "./cases-nav";

export function CasesPagination({ page, perPage, total }: { page: number; perPage: number; total: number }) {
  const t = useTranslations("cases.pageNav");
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  // WO-331 EXACT-FIDELITY: the reference nests pagination INSIDE its `view === "list"` branch —
  // Agenda has no pages, it's every upcoming hearing on the current fetched page. Matched here via
  // the same shared `view` this page's Toolbar/Table already read, rather than page.tsx threading it
  // through as a prop.
  const { view } = useCasesNav();

  const totalPages = pageCount(total, perPage);
  const cur = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (cur - 1) * perPage + 1;
  const to = Math.min(total, cur * perPage);

  const go = (params: Record<string, string>) => {
    const next = new URLSearchParams(Array.from(sp.entries()));
    for (const [k, v] of Object.entries(params)) next.set(k, v);
    router.push(`${pathname}?${next.toString()}`);
  };
  const gotoPage = (n: number) => go({ page: String(Math.min(totalPages, Math.max(1, n))) });
  const changePer = (n: number) => go({ per: String(n), page: "1" }); // resizing resets to page 1

  if (total === 0 || view !== "list") return null;

  return (
    <div
      data-testid="pagination"
      data-page={cur}
      data-per-page={perPage}
      data-total={total}
      data-total-pages={totalPages}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-ec-hair pt-3"
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[12px] text-ec-muted-ink">
          {t("rows")}
          <select
            value={perPage}
            onChange={(e) => changePer(Number(e.target.value))}
            data-testid="per-page-select"
            aria-label={t("rowsAria")}
            className="num rounded-ec-s border border-ec-hair bg-ec-card px-2 py-1 font-mono text-[12px] text-ec-ink outline-none focus:border-ec-bronze"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <p data-testid="pagination-range" className="num font-mono text-[12px] text-ec-muted-ink">
          {t("showing", { from, to, total })} · {t("pageOf", { page: cur, total: totalPages })}
        </p>
      </div>
      {/* WO-331 EXACT-FIDELITY: the reference always renders Prev/Go-to/Next (disabled at the
          bounds), unlike the shared <Pagination>'s numbered-window control (which hides Prev/Next
          entirely on a single page) — matched here, not forked: same testid/data-* contract as
          <Pagination> so e2e/pagination.spec.ts keeps covering this surface. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => gotoPage(cur - 1)}
          disabled={cur === 1}
          data-testid="page-prev"
          className="inline-flex items-center gap-1 rounded-ec-s border border-ec-hair bg-ec-card px-2.5 py-1.5 text-[12.5px] text-ec-ink-2 transition-colors hover:bg-ec-paper-3 disabled:opacity-40"
        >
          <Icon name="chevron" className="h-3.5 w-3.5 rotate-180" /> {t("prev")}
        </button>
        <label className="flex items-center gap-1.5 text-[12px] text-ec-muted-ink">
          {t("goTo")}
          <input
            type="number"
            min={1}
            max={totalPages}
            value={cur}
            onChange={(e) => gotoPage(Number(e.target.value) || 1)}
            aria-label={t("goToAria")}
            className="num w-14 rounded-ec-s border border-ec-hair bg-ec-card px-2 py-1 text-center font-mono text-[12px] text-ec-ink outline-none focus:border-ec-bronze"
          />
        </label>
        <button
          type="button"
          onClick={() => gotoPage(cur + 1)}
          disabled={cur === totalPages}
          data-testid="page-next"
          className="inline-flex items-center gap-1 rounded-ec-s border border-ec-line-strong bg-ec-card px-2.5 py-1.5 text-[12.5px] text-ec-ink transition-colors hover:bg-ec-paper-3 disabled:opacity-40"
        >
          {t("next")} <Icon name="chevron" className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
