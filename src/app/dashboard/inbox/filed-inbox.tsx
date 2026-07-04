"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { deleteEmails, archiveEmails } from "./actions";
import { useInboxSelection } from "./use-inbox-selection";
import { BulkBar, UndoToast, SelectBox } from "./bulk-ui";

export type InboxAttachment = { id: string; filename: string };
export type InboxEmail = { id: string; subject: string; from: string; receivedAt: string | null; attachments: InboxAttachment[] };
export type InboxGroup = { key: string; items: InboxEmail[] };

// WO-29 · the filed inbox with real selection + bulk delete/archive + undo, and each email's
// pulled attachments surfaced (filename → the filed document). Read-only before; now actionable.
export function FiledInbox({ groups }: { groups: InboxGroup[] }) {
  const t = useTranslations("inbox");
  const order = groups.flatMap((g) => g.items.map((e) => e.id));
  const sel = useInboxSelection(order);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">{t("filedHeading")}</h2>
        {order.length > 0 && (
          <button onClick={sel.toggleAll} className="text-xs font-medium text-brand-600 hover:underline">
            {sel.allSelected ? t("bulk.clearAll") : t("bulk.selectAll")}
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
              const on = sel.selected.has(e.id);
              return (
                <li key={e.id} className={`flex items-start gap-3 px-5 py-3 text-sm ${on ? "bg-brand-50" : ""}`}>
                  <SelectBox checked={on} onToggle={(shift) => sel.onRowToggle(e.id, shift)} />
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

      <BulkBar count={sel.selected.size} busy={sel.busy} onArchive={() => sel.runBulk(archiveEmails)} onDelete={() => sel.runBulk(deleteEmails)} onClear={sel.clear} />
      {sel.undo && <UndoToast label={sel.undo.label} busy={sel.busy} onUndo={sel.doUndo} onDismiss={sel.dismissUndo} />}
    </div>
  );
}
