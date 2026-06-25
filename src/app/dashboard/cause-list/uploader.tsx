"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, Badge, EmptyState, fmtDate } from "@/components/ui";
import { uploadCauseList, type CauseListResult } from "./actions";

// Owns the upload + the result table (both are client-driven — the result of a
// one-off upload isn't persisted, so the page renders an EmptyState until then).
export function CauseListUploader() {
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
    <div className="space-y-7">
      <Card className="p-5">
        <form action={submit} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="btn-secondary cursor-pointer">
              <Icon name="upload" className="h-4 w-4" />
              {fileName || "Choose cause-list PDF"}
              <input
                ref={inputRef}
                type="file"
                name="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              />
            </label>
            <button type="submit" disabled={pending || !fileName} className="btn-primary">
              {pending ? "Parsing…" : "Parse & match"}
            </button>
          </div>
          {msg && <p className={`text-sm ${ok === false ? "text-red-700" : "text-ink-muted"}`}>{msg}</p>}
        </form>
      </Card>

      {result ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3 text-sm">
            <Badge tone="brand">{result.matched} matched</Badge>
            <Badge tone="green">{result.updated} updated</Badge>
            <Badge tone="neutral">{result.unmatched} not in your cases</Badge>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="px-5 py-3 label">CNR</th>
                <th className="px-5 py-3 label">Hearing date</th>
                <th className="hidden px-5 py-3 label md:table-cell">Item / Court</th>
                <th className="px-5 py-3 label">Case</th>
              </tr>
            </thead>
            <tbody>
              {result.entries.map((e) => (
                <tr key={e.cnr} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-3 font-mono text-xs">{e.cnr}</td>
                  <td className="px-5 py-3">{e.date ? fmtDate(e.date) : "—"}</td>
                  <td className="hidden px-5 py-3 text-ink-muted md:table-cell">
                    {[e.itemNo ? `Item ${e.itemNo}` : null, e.court].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-5 py-3">
                    {e.matched ? (
                      <span className="flex items-center gap-2">
                        <span>{e.matterTitle}</span>
                        {e.updated && <Badge tone="green">date updated</Badge>}
                      </span>
                    ) : (
                      <span className="text-ink-faint">not in your cases</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyState
          icon="upload"
          title="No cause list parsed yet"
          body="Upload the daily cause list you received from the court. We read it, match the CNRs to your cases, and update their next-hearing dates. Nothing is scraped — you supply the file."
        />
      )}
    </div>
  );
}
