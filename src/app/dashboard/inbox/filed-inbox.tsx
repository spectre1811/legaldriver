"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { rangeIds, toggle } from "@/lib/select-range";
import { deleteEmails, archiveEmails, restoreEmails, type BulkResult } from "./actions";

export type InboxAttachment = { id: string; filename: string };
export type InboxEmail = { id: string; subject: string; from: string; receivedAt: string | null; attachments: InboxAttachment[] };
export type InboxGroup = { key: string; items: InboxEmail[] };

// WO-29 W2 · the filed inbox with real selection + bulk delete/archive + undo, and each email's
// pulled attachments surfaced (filename → the filed document). Read-only before; now actionable.
export function FiledInbox({ groups }: { groups: InboxGroup[] }) {
  const t = useTranslations("inbox");
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<{ entries: { id: string; status: string }[]; label: string } | null>(null);

  const order = groups.flatMap((g) => g.items.map((e) => e.id));
  const clear = () => { setSelected(new Set()); setAnchor(null); };

  // Esc deselects.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") clear(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onRowToggle(id: string, shift: boolean) {
    if (shift && anchor) {
      const run = rangeIds(order, anchor, id);
      const next = new Set(selected);
      const allOn = run.every((r) => next.has(r));
      run.forEach((r) => (allOn ? next.delete(r) : next.add(r)));
      setSelected(next);
    } else {
      setSelected(toggle(selected, id));
      setAnchor(id);
    }
  }

  const allSelected = order.length > 0 && order.every((id) => selected.has(id));
  const toggleAll = () => { allSelected ? clear() : (setSelected(new Set(order)), setAnchor(null)); };

  async function run(fn: (ids: string[]) => Promise<BulkResult>, label: string) {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true);
    const r = await fn(ids);
    setBusy(false);
    if (r.ok) {
      clear();
      if (r.undo?.length) setUndo({ entries: r.undo, label: r.message });
      router.refresh();
    }
  }

  async function doUndo() {
    if (!undo) return;
    setBusy(true);
    await restoreEmails(undo.entries);
    setBusy(false);
    setUndo(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">{t("filedHeading")}</h2>
        {order.length > 0 && (
          <button onClick={toggleAll} className="text-xs font-medium text-brand-600 hover:underline">
            {allSelected ? t("bulk.clearAll") : t("bulk.selectAll")}
          </button>
        )}
      </div>

      {groups.map((g) => (
        <div key={g.key} className="ec-card overflow-hidden rounded-xl border border-line">
          <div className="border-b border-line bg-paper px-5 py-3 text-sm font-medium text-ink">
            {g.key} <span className="text-ink-faint">({g.items.length})</span>
          </div>
          <ul className="divide-y divide-line">
            {g.items.map((e) => {
              const on = selected.has(e.id);
              return (
                <li key={e.id} className={`flex items-start gap-3 px-5 py-3 text-sm ${on ? "bg-brand-50" : ""}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    readOnly
                    aria-label={t("bulk.selectOne")}
                    onClick={(ev) => onRowToggle(e.id, ev.shiftKey)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-line"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{e.subject || t("noSubject")}</p>
                    <p className="text-xs text-ink-faint">{e.from} · {e.receivedAt ? new Date(e.receivedAt).toLocaleString("en-IN") : ""}</p>
                    {e.attachments.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {e.attachments.map((a) => (
                          <Link key={a.id} href={`/dashboard/documents/${a.id}`} className="inline-flex max-w-[16rem] items-center gap-1 truncate rounded-md bg-paper px-2 py-0.5 text-xs text-brand-700 hover:bg-brand-50">
                            <Icon name="clip" className="h-3 w-3 shrink-0" /> <span className="truncate">{a.filename}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {/* Sticky bulk bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-20 mx-auto flex w-fit items-center gap-2 rounded-xl border border-line bg-ink px-4 py-2.5 text-sm text-white shadow-lg">
          <span className="font-medium">{t("bulk.nSelected", { n: selected.size })}</span>
          <button disabled={busy} onClick={() => run(archiveEmails, "archive")} className="rounded-lg px-2.5 py-1 hover:bg-white/10 disabled:opacity-50">{t("bulk.archive")}</button>
          <button disabled={busy} onClick={() => run(deleteEmails, "delete")} className="rounded-lg px-2.5 py-1 text-red-300 hover:bg-white/10 disabled:opacity-50">{t("bulk.delete")}</button>
          <button onClick={clear} className="rounded-lg px-2.5 py-1 text-white/70 hover:bg-white/10">{t("bulk.cancel")}</button>
        </div>
      )}

      {/* Undo toast */}
      {undo && (
        <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-line bg-white px-4 py-2.5 text-sm shadow-lg">
          <span className="text-ink">{undo.label}</span>
          <button disabled={busy} onClick={doUndo} className="font-medium text-brand-600 hover:underline disabled:opacity-50">{t("bulk.undo")}</button>
          <button onClick={() => setUndo(null)} className="text-ink-faint hover:text-ink"><Icon name="close" className="h-3.5 w-3.5" /></button>
        </div>
      )}
    </div>
  );
}
