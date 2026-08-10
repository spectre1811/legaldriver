import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fmtSize } from "@/components/ui";
import { formatCourtDate } from "@/components/court";
import { Icon, type IconName } from "@/components/icons";
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_ORDER } from "@/lib/docs/categories";
import { DocumentsToolbar } from "./filter-bar";
import { DocumentsUpload } from "./documents-upload";
import { DocumentsBrowser, type DocRow } from "./documents-browser";
import { DocumentsList, type CaseSection, type ClientSection } from "./documents-list";
import { Pagination } from "@/components/pagination";
import { parsePage, clampPerPage, rangeFor } from "@/lib/paginate";
import { Reveal } from "../motion";

const CATEGORY_ICON: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.icon]));

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: { q?: string; source?: string; category?: string; matter?: string; trash?: string; group?: string; page?: string; per?: string };
}) {
  const t = await getTranslations("documents");
  const isTrash = searchParams.trash === "1";
  const page = parsePage(searchParams.page);
  const per = clampPerPage(searchParams.per);
  const { from, to } = rangeFor(page, per);
  const SOURCE: Record<string, string> = {
    gmail: t("source.gmail"),
    upload: t("source.upload"),
    court_order: t("source.courtOrder"),
  };
  const supabase = createClient();
  const { q, source, category, matter } = searchParams;

  // Matters carry client_id so we can resolve a document's client even when it's only tagged to
  // a case; cnr backs the restored viewer panel's eyebrow + the ref's per-case-section caption.
  const { data: matters } = await supabase.from("matter").select("id, title, client_id, cnr");
  const matterClient = new Map((matters ?? []).map((m) => [m.id, m.client_id]));
  const matterCnr = new Map((matters ?? []).map((m) => [m.id, m.cnr]));
  const matterOpts = (matters ?? []).map((m) => ({ id: m.id, label: m.title }));
  const matterName = new Map((matters ?? []).map((m) => [m.id, m.title]));

  // WO-56: numbered-page pagination (range + exact count) — the whole library is reachable, one
  // page at a time (the reference's toy dataset doesn't paginate; a real tenant's can grow past
  // one page, so this stays — dropping it would silently reintroduce the pre-WO-56 hidden cap).
  let query = supabase
    .from("document")
    .select("id, filename, doc_type, category, source, client_id, matter_id, mime, size_bytes, storage_path, parsed_text, portal_shared, created_at, extracted", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (q) query = query.textSearch("fts", q, { type: "websearch" });
  if (source) query = query.eq("source", source);
  if (category) query = query.eq("category", category);
  if (matter) query = query.eq("matter_id", matter);
  // WO-27 Wave 2 — soft-delete: the main list hides trashed docs; the Trash view shows only them.
  query = isTrash
    ? query.not("extracted->>deletedAt", "is", null)
    : query.filter("extracted->>deletedAt", "is", null);

  const [{ data: docs, count: docsTotal }, { data: clients }, { count: trashCount }, { count: reviewCount }, { count: grandTotal }] = await Promise.all([
    query,
    supabase.from("client").select("id, name"),
    supabase.from("document").select("id", { count: "exact", head: true }).not("extracted->>deletedAt", "is", null),
    // WO-33: needs-review = flagged OR unfiled, not trashed — the "needs filing review" banner.
    supabase.from("document").select("id", { count: "exact", head: true })
      .filter("extracted->>deletedAt", "is", null)
      .or("extracted->>status.eq.needs_review,and(client_id.is.null,matter_id.is.null)"),
    // The ref's masthead count is the practice's WHOLE library, not the filtered slice — a
    // stable figure the search/filters above don't move.
    supabase.from("document").select("id", { count: "exact", head: true }).filter("extracted->>deletedAt", "is", null),
  ]);

  const clientName = new Map((clients ?? []).map((c) => [c.id, c.name]));
  const clientOpts = (clients ?? []).map((c) => ({ id: c.id, label: c.name }));

  type Doc = NonNullable<typeof docs>[number];

  // Resolve display fields server-side (client-first: direct client, else via the tagged case's
  // client) into serialisable rows — shared by the Trash table and the ref-faithful main list, so
  // "who is this doc filed to" / "is it a Filed or Needs-review doc" have exactly one definition.
  const toRow = (d: Doc): DocRow => {
    const resolvedClientId = d.client_id ?? (d.matter_id ? matterClient.get(d.matter_id) ?? null : null);
    const clientLabel = resolvedClientId ? clientName.get(resolvedClientId) ?? null : null;
    const caseLabel = d.matter_id ? matterName.get(d.matter_id) ?? null : null;
    const ex = (d.extracted && typeof d.extracted === "object" && !Array.isArray(d.extracted)) ? (d.extracted as Record<string, unknown>) : {};
    // Same definition as the review-count query above: flagged OR genuinely unfiled.
    const needsReview = ex.status === "needs_review" || (!d.client_id && !d.matter_id);
    const iconName = (CATEGORY_ICON[d.category ?? ""] ?? "documents") as IconName;
    return {
      id: d.id, filename: d.filename ?? "—", docType: d.doc_type, mime: d.mime,
      primary: clientLabel ?? caseLabel, secondary: clientLabel ? caseLabel : null,
      caseLabel, cnr: d.matter_id ? matterCnr.get(d.matter_id) ?? null : null,
      sourceLabel: SOURCE[d.source] ?? d.source, sizeLabel: fmtSize(d.size_bytes), dateLabel: (formatCourtDate(d.created_at) ?? "—"),
      matterId: d.matter_id, clientId: d.client_id, resolvedClientId, shared: d.portal_shared,
      hasFile: Boolean(d.storage_path), needsReview, iconName,
    };
  };

  // ── Trash view — unchanged (category | client | case, default category): the reference never
  // depicts a trash-browsing state, so this legacy grouping + the bulk-select table
  // (documents-browser.tsx) are kept for it verbatim. Only the main list below is rebuilt. ──
  type LegacySection = { cat: string; label: string; icon: string; rows: DocRow[] };
  let trashSectionData: LegacySection[] = [];
  if (isTrash) {
    const trashGroupBy: "category" | "client" | "case" =
      searchParams.group === "client" || searchParams.group === "case" ? searchParams.group : "category";
    if (trashGroupBy === "category") {
      const groups = new Map<string, Doc[]>();
      for (const d of docs ?? []) {
        const key = d.category && CATEGORY_LABEL[d.category] ? d.category : "other";
        const arr = groups.get(key); if (arr) arr.push(d); else groups.set(key, [d]);
      }
      trashSectionData = CATEGORY_ORDER.filter((k) => groups.has(k)).map((k) => ({
        cat: k, label: CATEGORY_LABEL[k], icon: CATEGORY_ICON[k] ?? "documents", rows: groups.get(k)!.map(toRow),
      }));
    } else {
      const NONE = "__none__";
      const keyOf = (d: Doc): string =>
        (trashGroupBy === "client" ? (d.client_id ?? (d.matter_id ? matterClient.get(d.matter_id) ?? null : null)) : d.matter_id) ?? NONE;
      const labelOf = (k: string): string =>
        k === NONE ? (trashGroupBy === "client" ? t("group.noClient") : t("group.noCase"))
          : (trashGroupBy === "client" ? clientName.get(k) ?? k : matterName.get(k) ?? k);
      const groups = new Map<string, Doc[]>();
      for (const d of docs ?? []) {
        const k = keyOf(d);
        const arr = groups.get(k); if (arr) arr.push(d); else groups.set(k, [d]);
      }
      trashSectionData = [...groups.entries()]
        .sort((a, b) => (a[0] === NONE ? 1 : b[0] === NONE ? -1 : labelOf(a[0]).localeCompare(labelOf(b[0]))))
        .map(([k, ds]) => ({ cat: k, label: labelOf(k), icon: trashGroupBy === "client" ? "cases" : "scale", rows: ds.map(toRow) }));
    }
  }
  const trashOrderedIds = trashSectionData.flatMap((s) => s.rows.map((r) => r.id));

  // ── Main list — node-for-node: by case (flat, CNR caption) or by client (nested by case,
  // rule-left sub-groups) — the reference's exact two grouping modes, default "case". ──
  const listGroupBy: "case" | "client" = searchParams.group === "client" ? "client" : "case";
  const NONE = "__none__";

  function groupRowsByCase(rows: DocRow[]): CaseSection[] {
    const map = new Map<string, DocRow[]>();
    for (const r of rows) {
      const k = r.matterId ?? NONE;
      const arr = map.get(k); if (arr) arr.push(r); else map.set(k, [r]);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] === NONE ? 1 : b[0] === NONE ? -1 : (a[1][0].caseLabel ?? "").localeCompare(b[1][0].caseLabel ?? "")))
      .map(([k, rows2]) => ({
        key: k,
        caseLabel: k === NONE ? t("group.noCase") : (rows2[0].caseLabel ?? t("group.noCase")),
        cnr: k === NONE ? null : rows2[0].cnr,
        rows: rows2,
      }));
  }

  function groupRowsByClient(rows: DocRow[]): ClientSection[] {
    const map = new Map<string, DocRow[]>();
    for (const r of rows) {
      const k = r.resolvedClientId ?? NONE;
      const arr = map.get(k); if (arr) arr.push(r); else map.set(k, [r]);
    }
    return [...map.entries()]
      .sort((a, b) => (a[0] === NONE ? 1 : b[0] === NONE ? -1 : (clientName.get(a[0]) ?? "").localeCompare(clientName.get(b[0]) ?? "")))
      .map(([k, rows2]) => ({
        key: k,
        clientLabel: k === NONE ? t("group.noClient") : (clientName.get(k) ?? t("group.noClient")),
        cases: groupRowsByCase(rows2),
      }));
  }

  const listRows: DocRow[] = isTrash ? [] : (docs ?? []).map(toRow);
  const trueEmpty = (grandTotal ?? 0) === 0;

  return (
    <div className="space-y-6">
      <Reveal as="div" className="flex flex-wrap items-start justify-between gap-3">
        <header className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h1 className="font-display text-[1.6rem] font-medium leading-tight tracking-tight text-ec-ink">{isTrash ? t("trash.title") : t("title")}</h1>
            {!isTrash && (grandTotal ?? 0) > 0 && (
              <span className="num font-mono text-[13px] tracking-[0.08em] text-ec-honey">{grandTotal}</span>
            )}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-ec-ink-3">{isTrash ? t("trash.subtitle") : t("subtitle")}</p>
        </header>
        {isTrash && (
          <Link href="/dashboard/documents" className="ec-btn ec-btn-ghost text-sm">
            <Icon name="back" className="h-4 w-4" /> {t("trash.back")}
          </Link>
        )}
      </Reveal>

      {isTrash ? (
        trashSectionData.length ? (
          <Reveal delay={120}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ec-ink-3">
              <span>{t("trash.count", { docs: docsTotal ?? 0 })}</span>
            </div>
            <DocumentsBrowser sections={trashSectionData} orderedIds={trashOrderedIds} matterOpts={matterOpts} clientOpts={clientOpts} trash />
            <Pagination page={page} perPage={per} total={docsTotal ?? 0} />
          </Reveal>
        ) : (
          <Reveal as="div" delay={120} className="ec-card flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="rounded-full bg-ec-paper-3 p-3 text-ec-ink-3"><Icon name="trash" className="h-6 w-6" /></span>
            <p className="font-display text-lg text-ec-ink">{t("trash.emptyTitle")}</p>
            <p className="max-w-sm text-sm text-ec-ink-3">{t("trash.emptyBody")}</p>
          </Reveal>
        )
      ) : (
        <>
          <Reveal delay={60}>
            <DocumentsToolbar groupBy={listGroupBy} matterOpts={matterOpts} showUpload={!trueEmpty} />
          </Reveal>

          {trueEmpty ? (
            <Reveal as="div" delay={120} className="ec-rule-left mt-2 p-6">
              <div className="ec-label">{t("empty.emptyTitle")}</div>
              <p className="mt-2 max-w-lg font-display text-[22px] leading-snug text-ec-ink">{t("empty.emptyBody")}</p>
              <DocumentsUpload size="md" className="mt-5" />
            </Reveal>
          ) : (
            <>
              {(reviewCount ?? 0) > 0 && (
                <Reveal delay={120}>
                  <Link
                    href="/dashboard/documents/review"
                    className="flex items-center justify-between gap-3 border-y border-ec-hair bg-ec-bronze-tint/40 px-4 py-2.5 text-[13px] text-ec-bronze-deep transition-colors hover:bg-ec-bronze-tint/70"
                  >
                    <span className="min-w-0 truncate">
                      <span className="font-display figures text-[16px]">{reviewCount}</span> {t("reviewBanner", { count: reviewCount })}
                    </span>
                    <Icon name="chevron" className="h-3.5 w-3.5 shrink-0" />
                  </Link>
                </Reveal>
              )}

              {listRows.length > 0 ? (
                <Reveal delay={180}>
                  {listGroupBy === "case" ? (
                    <DocumentsList mode="case" sections={groupRowsByCase(listRows)} />
                  ) : (
                    <DocumentsList mode="client" sections={groupRowsByClient(listRows)} />
                  )}
                  <Pagination page={page} perPage={per} total={docsTotal ?? 0} />
                </Reveal>
              ) : (
                <p className="mt-10 text-center text-[13px] text-ec-muted-ink">
                  {q ? t("filter.noMatch", { q }) : t("empty.filteredBody")}
                </p>
              )}
            </>
          )}

          <div className="flex flex-wrap items-center gap-4 border-t border-ec-hair pt-4 text-[12.5px] text-ec-muted-ink">
            <Link href="/dashboard/documents?trash=1" className="inline-flex items-center gap-1.5 hover:text-ec-bronze">
              <Icon name="trash" className="h-3.5 w-3.5" /> {t("trash.link", { n: trashCount ?? 0 })}
            </Link>
            <span className="inline-flex items-center gap-1.5">
              <Icon name="documents" className="h-3.5 w-3.5" /> {t("storageNote")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
