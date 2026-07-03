"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui";
import { resolveReview } from "../actions";

export type ReviewDoc = {
  id: string; filename: string; docType: string | null; confidence: number | null;
  summary: string | null; parties: string[]; cnrs: string[]; sourceLabel: string;
  proposedClientId: string | null; proposedMatterId: string | null;
  suggestedClientName: string | null; suggestedMatterTitle: string | null;
  why: string | null;
};
type Opt = { id: string; label: string };

// WO-32 Wave 1 — the document Review Inbox. Surfaces every needs-review / unfiled document (upload
// OR email-orphaned) that today has no home, with the AI's PROPOSED filing pre-selected + an
// explanation. The human confirms (File) or corrects (pick) or skips — keyboard-driven (J/K move,
// Enter files, S skips). The LLM proposed; the human + code file (never a silent mis-file).
export function ReviewInbox({ docs, clients, matters }: { docs: ReviewDoc[]; clients: Opt[]; matters: Opt[] }) {
  const t = useTranslations("documents.review");
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
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
      <p className="text-xs text-ink-faint">{t("hint")}</p>
      {visible.map((d, i) => {
        const sel = pick[d.id] ?? { c: "", m: "" };
        const isActive = i === active;
        const conf = d.confidence != null ? Math.round(d.confidence * 100) : null;
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
                  {conf != null && <span className={conf >= 80 ? "text-emerald-700" : "text-amber-700"}>{t("confidence", { percent: conf })}</span>}
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
              <select
                value={sel.c} onChange={(e) => setPick((p) => ({ ...p, [d.id]: { ...sel, c: e.target.value } }))}
                className="input max-w-[12rem] py-1.5 text-xs" aria-label={t("client")}
              >
                <option value="">{t("clientOption")}{d.suggestedClientName ? ` (${d.suggestedClientName})` : ""}</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <select
                value={sel.m} onChange={(e) => setPick((p) => ({ ...p, [d.id]: { ...sel, m: e.target.value } }))}
                className="input max-w-[12rem] py-1.5 text-xs" aria-label={t("case")}
              >
                <option value="">{t("caseOption")}{d.suggestedMatterTitle ? ` (${d.suggestedMatterTitle})` : ""}</option>
                {matters.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
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
