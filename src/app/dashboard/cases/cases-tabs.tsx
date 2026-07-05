"use client";

// WO-43-W2 · the saved-view tab strip. Promotes the old saved-view chips to a real tab strip and
// adds built-in views (All / Open / Hearing ≤7d / Overdue / No date) with LIVE counts (bounded
// HEAD counts from the server). Tabs are navigation over the same URL-param filters the Console
// writes; a saved view applies its stored query. Counts make the list scannable at a glance.

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { deleteView } from "./view-actions";
import type { SavedView } from "./console";
import type { ViewCounts } from "./cases-query";

// The URL-param keys a saved view can carry (mirrors the Console).
const VIEW_KEYS = ["q", "court", "case_type", "stage", "status", "advocate", "act", "next", "sort"] as const;

type Builtin = { key: keyof ViewCounts; labelKey: string; params: Record<string, string> };
const BUILTINS: Builtin[] = [
  { key: "all", labelKey: "all", params: {} },
  { key: "open", labelKey: "open", params: { status: "open" } },
  { key: "soon", labelKey: "soon", params: { next: "7d" } },
  { key: "overdue", labelKey: "overdue", params: { next: "overdue" } },
  { key: "noDate", labelKey: "noDate", params: { next: "none" } },
];

export function CasesTabs({ counts, views }: { counts: ViewCounts; views: SavedView[] }) {
  const t = useTranslations("cases.views");
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const push = (next: URLSearchParams) =>
    router.push(next.toString() ? `/dashboard/cases?${next.toString()}` : "/dashboard/cases");

  // Apply a built-in: drop the two view-defining params, set this view's, keep the rest (q/court/…).
  const applyBuiltin = (b: Builtin) => {
    const next = new URLSearchParams(sp.toString());
    next.delete("status");
    next.delete("next");
    next.delete("page");
    for (const [k, v] of Object.entries(b.params)) next.set(k, v);
    push(next);
  };
  const applySaved = (query: Record<string, string>) => {
    const next = new URLSearchParams();
    for (const k of VIEW_KEYS) if (query[k]) next.set(k, query[k]);
    push(next);
  };

  const status = sp.get("status");
  const next = sp.get("next");
  const isBuiltinActive = (b: Builtin) => {
    if (b.key === "all") return !status && !next;
    if (b.params.status) return status === b.params.status;
    if (b.params.next) return next === b.params.next;
    return false;
  };
  const isSavedActive = (v: SavedView) =>
    VIEW_KEYS.every((k) => (v.query[k] ?? "") === (sp.get(k) ?? ""));

  const onDelete = (id: string, name: string) => {
    if (!window.confirm(t("deleteConfirm", { name }))) return;
    startTransition(async () => { await deleteView(id); });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-ec-hair pb-2" role="tablist" aria-label={t("aria")}>
      {BUILTINS.map((b) => (
        <Tab key={b.key} active={isBuiltinActive(b)} onClick={() => applyBuiltin(b)} label={t(b.labelKey)} count={counts[b.key]} />
      ))}
      {views.length > 0 && <span className="mx-1 h-4 w-px bg-ec-hair" />}
      {views.map((v) => (
        <Tab
          key={v.id}
          active={isSavedActive(v)}
          onClick={() => applySaved(v.query)}
          label={v.name}
          onDelete={pending ? undefined : () => onDelete(v.id, v.name)}
          deleteLabel={t("deleteView", { name: v.name })}
        />
      ))}
    </div>
  );
}

function Tab({
  active, onClick, label, count, onDelete, deleteLabel,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  onDelete?: () => void;
  deleteLabel?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
        active ? "bg-ec-ink text-paper" : "text-ec-ink-2 hover:bg-ec-brass-tint"
      }`}
    >
      <button type="button" role="tab" aria-selected={active} onClick={onClick} className="inline-flex items-center gap-1.5">
        {label}
        {count != null && (
          <span className={`num rounded-full px-1.5 text-[0.65rem] ${active ? "bg-paper/20" : "bg-ec-hair text-ec-ink-3"}`}>{count}</span>
        )}
      </button>
      {onDelete && (
        <button type="button" onClick={onDelete} aria-label={deleteLabel} className={active ? "text-paper/70 hover:text-paper" : "text-ec-ink-3 hover:text-ec-danger"}>
          <Icon name="close" className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
