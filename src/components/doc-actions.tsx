"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { relinkDocument, deleteDocument, toggleDocShare } from "@/app/dashboard/documents/actions";

type Opt = { id: string; label: string };

export function DocActions({
  documentId,
  matterId,
  clientId,
  matters,
  clients,
  shared = false,
  docType = null,
}: {
  documentId: string;
  matterId: string | null;
  clientId: string | null;
  matters: Opt[];
  clients: Opt[];
  shared?: boolean;
  docType?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "refile" | "delete">("menu");
  const [m, setM] = useState(matterId ?? "");
  const [c, setC] = useState(clientId ?? "");
  const [dt, setDt] = useState(docType ?? "");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [pending, start] = useTransition();
  const btnRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const t = useTranslations("documents");

  const close = () => { setOpen(false); setMode("menu"); };

  // Anchor the portal menu to the button; reposition on open/scroll/resize.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, left: Math.max(8, r.right - 240) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]);

  return (
    <div className="inline-flex items-center gap-2">
      <a href={`/api/documents/${documentId}/download`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700" title={t("docActions.open")}>
        <Icon name="external" className="h-4 w-4" />
      </a>
      <button ref={btnRef} onClick={() => setOpen((v) => !v)} className="rounded-md px-1.5 text-ink-faint hover:bg-paper hover:text-ink" aria-label={t("docActions.more")} aria-haspopup="true">⋯</button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="fixed z-50 w-60 rounded-xl border border-line bg-surface p-2 shadow-lift" style={{ top: pos.top, left: pos.left }}>
            {mode === "menu" && (
              <div className="flex flex-col">
                <button onClick={() => setMode("refile")} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-soft hover:bg-paper">
                  <Icon name="cases" className="h-4 w-4" /> {matterId ? t("docActions.editFiling") : t("docActions.tagToCase")}
                </button>
                <button onClick={() => start(async () => { await toggleDocShare(documentId, !shared); close(); router.refresh(); })} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-soft hover:bg-paper">
                  <Icon name={shared ? "check" : "inbox"} className="h-4 w-4" /> {shared ? t("docActions.unshare") : t("docActions.share")}
                </button>
                <button onClick={() => setMode("delete")} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                  <Icon name="alert" className="h-4 w-4" /> {t("docActions.delete")}
                </button>
              </div>
            )}
            {mode === "refile" && (
              <div className="space-y-2 p-1">
                <p className="label">{t("docActions.client")}</p>
                <select value={c} onChange={(e) => setC(e.target.value)} className="input py-1.5 text-xs" aria-label={t("docActions.client")}>
                  <option value="">{t("docActions.clientOption")}</option>
                  {clients.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <p className="label">{t("docActions.case")} <span className="font-normal normal-case text-ink-faint">{t("docActions.optional")}</span></p>
                <select value={m} onChange={(e) => setM(e.target.value)} className="input py-1.5 text-xs" aria-label={t("docActions.case")}>
                  <option value="">{t("docActions.noCaseOption")}</option>
                  {matters.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <p className="label">{t("docActions.type")}</p>
                <input value={dt} onChange={(e) => setDt(e.target.value)} placeholder={t("docActions.typePlaceholder")} className="input py-1.5 text-xs" aria-label={t("docActions.documentType")} />
                <div className="flex gap-2">
                  <button disabled={pending} onClick={() => start(async () => { await relinkDocument(documentId, m || null, c || null, dt); close(); router.refresh(); })} className="btn-primary px-3 py-1.5 text-xs">{pending ? "…" : t("docActions.apply")}</button>
                  <button onClick={() => setMode("menu")} className="btn-ghost px-2 py-1.5 text-xs">{t("docActions.back")}</button>
                </div>
              </div>
            )}
            {mode === "delete" && (
              <div className="space-y-2 p-1">
                <p className="text-xs text-ink-soft">{t("docActions.deleteConfirm")}</p>
                <div className="flex gap-2">
                  <button disabled={pending} onClick={() => start(async () => { await deleteDocument(documentId); close(); router.refresh(); })} className="btn px-3 py-1.5 text-xs bg-red-600 text-white hover:bg-red-700">{pending ? "…" : t("docActions.delete")}</button>
                  <button onClick={() => setMode("menu")} className="btn-ghost px-2 py-1.5 text-xs">{t("docActions.cancel")}</button>
                </div>
              </div>
            )}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
