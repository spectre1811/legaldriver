"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { uploadCauseList, type CauseListResult } from "./actions";

// Owns the upload + the result table (both are client-driven — the result of a
// one-off upload isn't persisted, so the page renders an empty state until then).
export function CauseListUploader() {
  const t = useTranslations("causeList");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<CauseListResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function submit(formData: FormData) {
    start(async () => {
      const r = await uploadCauseList(formData);
      setMsg(r.message);
      setOk(r.ok);
      setResult(r.ok ? r : null);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="ec-card p-5">
        <form action={submit} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="ec-btn ec-btn-ghost cursor-pointer">
              <Icon name="upload" className="h-4 w-4" />
              {fileName || t("choose")}
              <input
                ref={inputRef}
                type="file"
                name="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              />
            </label>
            <button type="submit" disabled={pending || !fileName} className="ec-btn ec-btn-ink">
              {pending ? t("parsing") : t("parse")}
            </button>
          </div>
          {msg && <p className={`text-sm ${ok === false ? "text-ec-danger" : "text-ec-ink-3"}`}>{msg}</p>}
        </form>
      </div>

      {result ? (
        <div className="ec-card overflow-hidden">
          <div className="num flex flex-wrap items-center gap-2 border-b border-ec-hair px-5 py-3 text-sm">
            <span className="ec-chip ec-chip-hot">{t("badge.matched", { count: result.matched })}</span>
            <span className="ec-chip" style={{ borderColor: "var(--success)", color: "var(--success)", background: "var(--success-t)" }}>
              {t("badge.updated", { count: result.updated })}
            </span>
            <span className="ec-chip">{t("badge.unmatched", { count: result.unmatched })}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ec-hair-strong text-left">
                <th className="ec-label px-5 py-3">{t("th.cnr")}</th>
                <th className="ec-label px-5 py-3">{t("th.date")}</th>
                <th className="ec-label hidden px-5 py-3 md:table-cell">{t("th.item")}</th>
                <th className="ec-label px-5 py-3">{t("th.case")}</th>
              </tr>
            </thead>
            <tbody>
              {result.entries.map((e) => (
                <tr key={e.cnr} className="ec-row border-b border-ec-hair last:border-0">
                  <td className="num px-5 py-3 text-xs">{e.cnr}</td>
                  <td className="num px-5 py-3">
                    {e.date ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(e.date)) : "—"}
                  </td>
                  <td className="hidden px-5 py-3 text-ec-ink-3 md:table-cell">
                    {[e.itemNo ? t("item", { n: e.itemNo }) : null, e.court].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-5 py-3">
                    {e.matched ? (
                      <span className="flex items-center gap-2">
                        <span className="text-ec-ink">{e.matterTitle}</span>
                        {e.updated && <span className="ec-chip ec-chip-hot">{t("dateUpdated")}</span>}
                      </span>
                    ) : (
                      <span className="text-ec-ink-3">{t("notMatched")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ec-card flex flex-col items-center justify-center px-6 py-14 text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-ec-m bg-ec-brass-tint text-ec-brass-deep">
            <Icon name="upload" className="h-5 w-5" />
          </span>
          <h3 className="font-display text-lg font-medium text-ec-ink">{t("empty.title")}</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-ec-ink-3">{t("empty.body")}</p>
        </div>
      )}
    </div>
  );
}
