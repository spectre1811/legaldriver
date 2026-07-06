"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui";
import { Combobox } from "@/components/combobox";
import { resolveReview, rescanUnfiled } from "../actions";

export type ReviewDoc = {
  id: string; filename: string; docType: string | null; confidence: number | null;
  summary: string | null; parties: string[]; cnrs: string[]; sourceLabel: string;
  proposedClientId: string | null; proposedMatterId: string | null;
  refiled?: boolean; // the audit re-scan found a fresh match for this doc (WO-33 W4)
  suggestedClientName: string | null; suggestedMatterTitle: string | null;
  why: string | null;
};
type Opt = { id: string; label: string };

// WO-33 Wave 1 — the document Review Inbox. Surfaces every needs-review / unfiled document (upload
// OR email-orphaned) that today has no home, with the AI's PROPOSED filing pre-selected + an
// explanation. The human confirms (File) or corrects (pick) or skips — keyboard-driven (J/K move,
// Enter files, S skips). The LLM proposed; the human + code file (never a silent mis-file).
export function ReviewInbox({ docs, clients, matters }: { docs: ReviewDoc[]; clients: Opt[]; matters: Opt[] }) {
  const t = useTranslations("documents.review");
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [rescanMsg, setRescanMsg] = useState<string | null>(null);

  const rescan = useCallback(async () => {
    setRescanning(true);
    setRescanMsg(null);
    try { const r = await rescanUnfiled(); setRescanMsg(r.message); router.refresh(); }
    finally { setRescanning(false); }
  }, [router]);
  // Per-card picker state, seeded from the AI proposal.
  const [pick, setPick] = useState<Record<string, { c: string; m: string }>>(() =>
    Object.fromEntries(docs.map((d) => [d.id, { c: d.proposedClientId ?? "", m: d.proposedMatterId ?? "" }])),
  );

  const visible = docs.filter((d) => !skipped.has(d.id));

  const file = useCallback(async (d: ReviewDoc) => {
    const sel = pick[d.id] ?? { c: "", m: "" };
    if (!sel.c && !sel.m) return; // nothing to file to
    setBusy(d.id);
    try { await resolveReview(d.id, sel.m || null, sel.c || null); router.refresh(); }
    finally { setBusy(null); }
  }, [pick, router]);

  const skip = useCallback((id: string) => {
    setSkipped((prev) => new Set(prev).add(id));
    setActive((a) => Math.min(a, Math.max(0, visible.length - 2)));
  }, [visible.length]);

  // Keyboard: J/K move, Enter files the active card, S skips.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLSelectElement || e.target instanceof HTMLInputElement) return;
      const cur = visible[active];
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, visible.length - 1)); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      else if (e.key === "Enter" && cur) { e.preventDefault(); file(cur); }
      else if (e.key === "s" && cur) { e.preventDefault(); skip(cur.id); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, visible, file, skip]);

  if (!visible.length) {
    return (
      <div className="ec-card flex flex-col items-center gap-2 px-6 py-12 text-center">
        <Icon name="check" className="h-6 w-6 text-emerald-600" />
        <p className="text-sm font-medium text-ink">{t("allClear")}</p>
        <p className="text-xs text-ink-muted">{t("allClearBody")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-faint">{t("hint")}</p>
        <div className="flex items-center gap-2">
          {rescanMsg && <span className="text-xs text-ink-muted">{rescanMsg}</span>}
          <button onClick={rescan} disabled={rescanning} className="btn-ghost px-2.5 py-1 text-xs">
            <Icon name="refresh" className={`h-3.5 w-3.5 ${rescanning ? "animate-spin" : ""}`} />
            <span className="ml-1.5">{rescanning ? t("rescanning") : t("rescan")}</span>
          </button>
        </div>
      </div>
      {visible.map((d, i) => {
        const sel = pick[d.id] ?? { c: "", m: "" };
        const isActive = i === active;
        return (
          <div
            key={d.id}
            onClick={() => setActive(i)}
            className={`ec-card p-4 transition-shadow ${isActive ? "ring-2 ring-brand-500" : "hover:shadow-sm"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={`/dashboard/documents/${d.id}`} className="flex items-center gap-2 font-medium text-ink hover:text-brand-700 hover:underline">
                  <Icon name="documents" className="h-4 w-4 shrink-0 text-ink-faint" />
                  <span className="truncate">{d.filename}</span>
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                  {d.docType && <Badge>{d.docType}</Badge>}
                  <span>{d.sourceLabel}</span>
                  {d.refiled && <Badge tone="brand">{t("newMatch")}</Badge>}
                </div>
              </div>
            </div>

            {/* The AI's read + why it proposes this filing */}
            {(d.summary || d.why) && (
              <p className="mt-2 line-clamp-2 text-xs text-ink-muted">
                {d.why && <span className="font-medium text-ink-soft">{d.why} · </span>}
                {d.summary}
              </p>
            )}

            {/* Proposed filing — prefilled, editable */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-faint">{t("fileTo")}</span>
              <Combobox
                label={t("client")}
                placeholder={`${t("clientOption")}${d.suggestedClientName ? ` (${d.suggestedClientName})` : ""}`}
                options={clients.map((c) => ({ value: c.id, label: c.label }))}
                value={sel.c || null}
                onChange={(v) => setPick((p) => ({ ...p, [d.id]: { ...sel, c: v ?? "" } }))}
                className="min-w-[11rem] max-w-[13rem]"
              />
              <Combobox
                label={t("case")}
                placeholder={`${t("caseOption")}${d.suggestedMatterTitle ? ` (${d.suggestedMatterTitle})` : ""}`}
                options={matters.map((m) => ({ value: m.id, label: m.label }))}
                value={sel.m || null}
                onChange={(v) => setPick((p) => ({ ...p, [d.id]: { ...sel, m: v ?? "" } }))}
                className="min-w-[11rem] max-w-[13rem]"
              />
              <button onClick={() => file(d)} disabled={busy === d.id || (!sel.c && !sel.m)} className="btn-primary px-3 py-1.5 text-xs">
                {busy === d.id ? t("filing") : t("file")}
              </button>
              <button onClick={() => skip(d.id)} className="btn-ghost px-3 py-1.5 text-xs">{t("skip")}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
