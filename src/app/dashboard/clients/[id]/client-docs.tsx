"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { uploadClientDocuments } from "./actions";

// Bulk file upload for a client's document library. Multiple files at once;
// the server content-hashes each and skips exact duplicates.
export function ClientDocUpload({ clientId }: { clientId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();

  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await uploadClientDocuments(clientId, fd);
          setMsg(r.message);
          ref.current?.reset();
          router.refresh();
        });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <label className="btn-ghost cursor-pointer text-sm">
        <Icon name="upload" className="h-4 w-4" />
        <input name="files" type="file" multiple required className="hidden" onChange={(e) => { if (e.target.files?.length) e.currentTarget.form?.requestSubmit(); }} />
        <span className="ml-1.5">{pending ? "Uploading…" : "Upload files"}</span>
      </label>
      {msg && <span className="text-xs text-ink-muted">{msg}</span>}
    </form>
  );
}
