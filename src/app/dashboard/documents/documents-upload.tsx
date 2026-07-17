"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { uploadDocumentHub } from "./actions";

// WO-27 — the upload surface the Documents hub was missing. Drag-and-drop or click; each file runs
// the shared extract → classify → auto-file path server-side, so it lands typed + linked (or in
// "needs review"). Deliberately simple UI; the intelligence is server-side.
export function DocumentsUpload() {
  const t = useTranslations("documents.upload");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function send(files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    setMsg("");
    start(async () => {
      const r = await uploadDocumentHub(fd);
      setMsg(r.message);
      router.refresh();
    });
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
      className={`ec-card flex cursor-pointer flex-col items-center justify-center gap-1.5 border-2 border-dashed px-4 py-6 text-center transition-colors ${
        drag ? "border-ec-bronze bg-ec-bronze-tint/40" : "border-ec-hair-strong hover:border-ec-bronze/50"
      }`}
      aria-label={t("cta")}
    >
      <Icon name="upload" className={`h-5 w-5 ${pending ? "animate-pulse text-ec-bronze" : "text-ec-ink-3"}`} />
      <div className="text-sm font-medium text-ec-ink">{pending ? t("uploading") : t("cta")}</div>
      <div className="text-xs text-ec-ink-3">{t("hint")}</div>
      {msg && <div className="mt-1 text-xs text-ec-ink-3">{msg}</div>}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => { send(e.target.files); e.currentTarget.value = ""; }}
      />
    </div>
  );
}
