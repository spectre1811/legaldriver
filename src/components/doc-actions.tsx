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
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [pending, start] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const t = useTranslations("documents");

  const unfiled = !clientId && !matterId;
  const close = () => { setOpen(false); setMode("menu"); };
  const openAt = (next: "menu" | "refile") => { setMode(next); setOpen(true); };

  // Anchor the portal to the action group (right-aligned), reposition on scroll/resize.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = wrapRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]);

  const canSave = Boolean(c || m); // client OR case — never require both

  return (
    <div ref={wrapRef} className="inline-flex items-center gap-1.5">
      <a href={`/api/documents/${documentId}/download`} target="_blank" rel="noopener noreferrer" className="text-ink-faint hover:text-brand-700" title={t("docActions.open")}>
        <Icon name="external" className="h-4 w-4" />
      </a>
      {/* Unfiled docs get a VISIBLE, obvious File button — not a hidden ⋯ item. */}
      {unfiled && (
        <button
          onClick={() => openAt("refile")}
          className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-700"
        >
          <Icon name="documents" className="h-3.5 w-3.5" /> {t("docActions.file")}
        </button>
      )}
      <button onClick={() => openAt("menu")} className="rounded-md px-1.5 text-ink-faint hover:bg-paper hover:text-ink" aria-label={t("docActions.more")} aria-haspopup="true">⋯</button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="fixed z-50 w-64 rounded-xl border border-line bg-surface p-2 shadow-lift" style={{ top: pos.top, right: pos.right }}>
            {mode === "menu" && (
              <div className="flex flex-col">
                <button onClick={() => setMode("refile")} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-soft hover:bg-paper">
                  <Icon name="documents" className="h-4 w-4" /> {unfiled ? t("docActions.file") : t("docActions.editFiling")}
                </button>
                <button onClick={() => start(async () => { await toggleDocShare(documentId, !shared); close(); router.refresh(); })} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-soft hover:bg-paper">
                  <Icon name={shared ? "check" : "inbox"} className="h-4 w-4" /> {shared ? t("docActions.unshare") : t("docActions.share")}
                </button>
                <button onClick={() => setMode("delete")} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                  <Icon name="trash" className="h-4 w-4" /> {t("docActions.delete")}
                </button>
              </div>
            )}
            {mode === "refile" && (
              <div className="space-y-2.5 p-1.5">
                {/* Client-first: the client is the primary, required-in-spirit target. */}
                <div>
                  <p className="mb-1 text-xs font-semibold text-ink">{t("docActions.fileUnderClient")}</p>
                  <select value={c} onChange={(e) => setC(e.target.value)} className="input w-full py-2 text-sm" aria-label={t("docActions.client")} autoFocus>
                    <option value="">{t("docActions.clientOption")}</option>
                    {clients.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <p className="mb-1 text-xs text-ink-muted">{t("docActions.caseLabelOptional")}</p>
                  <select value={m} onChange={(e) => setM(e.target.value)} className="input w-full py-2 text-sm" aria-label={t("docActions.case")}>
                    <option value="">{t("docActions.noCaseOption")}</option>
                    {matters.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <button disabled={pending || !canSave} onClick={() => start(async () => { await relinkDocument(documentId, m || null, c || null); close(); router.refresh(); })} className="btn-primary flex-1 justify-center px-3 py-2 text-sm disabled:opacity-50">{pending ? t("docActions.filing") : t("docActions.fileHere")}</button>
                  <button onClick={close} className="btn-ghost px-3 py-2 text-sm">{t("docActions.cancel")}</button>
                </div>
              </div>
            )}
            {mode === "delete" && (
              <div className="space-y-2 p-1.5">
                <p className="text-xs text-ink-soft">{t("docActions.deleteConfirm")}</p>
                <div className="flex gap-2">
                  <button disabled={pending} onClick={() => start(async () => { await deleteDocument(documentId); close(); router.refresh(); })} className="btn flex-1 justify-center bg-red-600 px-3 py-2 text-xs text-white hover:bg-red-700">{pending ? "…" : t("docActions.delete")}</button>
                  <button onClick={() => setMode("menu")} className="btn-ghost px-3 py-2 text-xs">{t("docActions.cancel")}</button>
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
