"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { relinkDocument, deleteDocument } from "@/app/dashboard/documents/actions";

type Opt = { id: string; label: string };

export function DocActions({
  documentId,
  matterId,
  clientId,
  matters,
  clients,
}: {
  documentId: string;
  matterId: string | null;
  clientId: string | null;
  matters: Opt[];
  clients: Opt[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "refile" | "delete">("menu");
  const [m, setM] = useState(matterId ?? "");
  const [c, setC] = useState(clientId ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();

  const close = () => { setOpen(false); setMode("menu"); };

  return (
    <div className="relative inline-flex items-center gap-2">
      <a href={`/api/documents/${documentId}/download`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700" title="Open">
        <Icon name="external" className="h-4 w-4" />
      </a>
      <button onClick={() => setOpen((v) => !v)} className="rounded-md px-1.5 text-ink-faint hover:bg-paper hover:text-ink" aria-label="More" aria-haspopup="true">⋯</button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute right-0 top-7 z-20 w-60 rounded-xl border border-line bg-surface p-2 shadow-lift">
            {mode === "menu" && (
              <div className="flex flex-col">
                <button onClick={() => setMode("refile")} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-soft hover:bg-paper">
                  <Icon name="cases" className="h-4 w-4" /> Re-file
                </button>
                <button onClick={() => setMode("delete")} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                  <Icon name="alert" className="h-4 w-4" /> Delete
                </button>
              </div>
            )}
            {mode === "refile" && (
              <div className="space-y-2 p-1">
                <p className="label">File under</p>
                <select value={m} onChange={(e) => setM(e.target.value)} className="input py-1.5 text-xs" aria-label="Case">
                  <option value="">— case —</option>
                  {matters.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <select value={c} onChange={(e) => setC(e.target.value)} className="input py-1.5 text-xs" aria-label="Client">
                  <option value="">— client —</option>
                  {clients.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <div className="flex gap-2">
                  <button disabled={pending} onClick={() => start(async () => { await relinkDocument(documentId, m || null, c || null); close(); router.refresh(); })} className="btn-primary px-3 py-1.5 text-xs">{pending ? "…" : "Apply"}</button>
                  <button onClick={() => setMode("menu")} className="btn-ghost px-2 py-1.5 text-xs">Back</button>
                </div>
              </div>
            )}
            {mode === "delete" && (
              <div className="space-y-2 p-1">
                <p className="text-xs text-ink-soft">Delete this document and its file permanently?</p>
                <div className="flex gap-2">
                  <button disabled={pending} onClick={() => start(async () => { await deleteDocument(documentId); close(); router.refresh(); })} className="btn px-3 py-1.5 text-xs bg-red-600 text-white hover:bg-red-700">{pending ? "…" : "Delete"}</button>
                  <button onClick={() => setMode("menu")} className="btn-ghost px-2 py-1.5 text-xs">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
