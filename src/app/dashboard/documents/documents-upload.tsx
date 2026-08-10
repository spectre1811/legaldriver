"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { uploadDocumentHub } from "./actions";

// WO-334 EXACT-FIDELITY · was a full drag-and-drop dropzone card (WO-27) — a surface
// app.documents.tsx doesn't have. The reference's Upload is one compact ink pill (two sizes:
// the toolbar's small trigger, the empty state's slightly larger CTA); both share this component
// so the upload logic (extract → classify → auto-file, WO-27) isn't duplicated. Same server
// action, same result message — file selection is now click-to-browse only (no drag/drop chrome
// to match), which is still keyboard/AT reachable via the native file input.
export function DocumentsUpload({ size = "sm", className = "" }: { size?: "sm" | "md"; className?: string }) {
  const t = useTranslations("documents.upload");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
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

  const sizeCls = size === "md" ? "px-4 py-2.5 text-[13px]" : "px-3.5 py-2 text-[12.5px]";
  const iconCls = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";

  return (
    <span className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        // Bespoke (not .ec-btn-ink): the reference's exact hover fill is #26282B
        // (tokens.css --ink-chip), one shade darker than .ec-btn-ink's shared --n800 hover —
        // full color fidelity per the WO's FAITHFUL-TO-PROTOTYPE BAR.
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md bg-ec-ink font-medium text-ec-paper transition-colors hover:bg-ec-ink-chip disabled:opacity-60 ${sizeCls}`}
      >
        <Icon name="upload" className={iconCls} />
        {pending ? t("uploading") : size === "md" ? t("cta") : t("short")}
      </button>
      {msg && <span className="min-w-0 truncate text-xs text-ec-ink-3">{msg}</span>}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        aria-label={t("cta")}
        onChange={(e) => { send(e.target.files); e.currentTarget.value = ""; }}
      />
    </span>
  );
}
