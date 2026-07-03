"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import {
  submitRefreshRequest,
  requestServerRefresh,
  type CourtActionResult,
} from "./court-actions";

export function CourtRefreshForms() {
  const t = useTranslations("settings");
  const [cnr, setCnr] = useState("");
  const [payload, setPayload] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<CourtActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function runServerRefresh() {
    setResult(null);
    startTransition(async () => setResult(await requestServerRefresh(cnr)));
  }
  function runHitl() {
    setResult(null);
    startTransition(async () => {
      const r = await submitRefreshRequest(cnr, payload, note);
      setResult(r);
      if (r.ok) {
        setPayload("");
        setNote("");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          name="cnr"
          value={cnr}
          onChange={(e) => setCnr(e.target.value)}
          placeholder={t("court.cnrPlaceholder")}
          aria-label="CNR"
          className="input font-mono uppercase sm:flex-1"
        />
        <button
          type="button"
          onClick={runServerRefresh}
          disabled={pending || !cnr.trim()}
          className="btn-primary flex items-center justify-center gap-1.5"
        >
          <Icon name="refresh" className="h-4 w-4" />
          {pending ? t("court.refreshing") : t("court.refreshViaProvider")}
        </button>
      </div>

      <details className="rounded-xl border border-line bg-paper/60 p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          {t("court.hitlSummary")}
        </summary>
        <div className="mt-3 space-y-3">
          <p className="flex items-start gap-1.5 text-xs text-ink-faint">
            <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("court.hitlNote")}
          </p>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder={t("court.payloadPlaceholder")}
            aria-label={t("court.payloadLabel")}
            rows={5}
            className="input w-full font-mono text-xs"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("court.notePlaceholder")}
            aria-label={t("court.noteLabel")}
            className="input w-full"
          />
          <button
            type="button"
            onClick={runHitl}
            disabled={pending || !cnr.trim()}
            className="btn-secondary"
          >
            {pending ? t("court.submitting") : t("court.submitRequest")}
          </button>
          <p className="text-xs text-ink-faint">
            {t("court.hitlFollowup")}
          </p>
        </div>
      </details>

      {result?.message && (
        <p
          role="status"
          className={`rounded-xl px-3.5 py-2.5 text-sm ${result.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
