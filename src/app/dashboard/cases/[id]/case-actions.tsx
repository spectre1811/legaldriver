"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { generateCaseSummary, addCaseDocument, updateCase, refreshCase } from "../actions";

export function RefreshButton({ matterId }: { matterId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      onClick={() => start(async () => { await refreshCase(matterId); router.refresh(); })}
      disabled={pending}
      className="btn-secondary"
    >
      <Icon name="refresh" className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> {pending ? "Refreshing" : "Refresh"}
    </button>
  );
}

export function GenerateSummaryButton({ matterId, has }: { matterId: string; has: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => start(async () => { const r = await generateCaseSummary(matterId); setMsg(r.message); router.refresh(); })}
        disabled={pending}
        className="btn-primary"
      >
        <Icon name="sparkles" className="h-4 w-4" /> {pending ? "Analysing…" : has ? "Regenerate" : "Generate AI summary"}
      </button>
      {msg && <span className="max-w-xs text-xs text-ink-muted">{msg}</span>}
    </div>
  );
}

export function AddDocumentForm({ matterId }: { matterId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await addCaseDocument(matterId, fd);
          setMsg(r.message);
          if (r.ok) { formRef.current?.reset(); router.refresh(); }
        });
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="file" name="file" required className="block max-w-xs text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
      <button type="submit" disabled={pending} className="btn-secondary">
        <Icon name="upload" className="h-4 w-4" /> {pending ? "Uploading…" : "Upload"}
      </button>
      {msg && <span className="text-xs text-ink-muted">{msg}</span>}
    </form>
  );
}

export function EditCaseForm({
  matterId,
  initial,
}: {
  matterId: string;
  initial: { title: string; court: string; case_type: string; stage: string; status: string; next_hearing_date: string };
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary">
        <Icon name="settings" className="h-4 w-4" /> Edit
      </button>
    );
  }
  const field = (name: keyof typeof initial, label: string, type = "text") => (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} defaultValue={initial[name]} className="input mt-1.5" />
    </div>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => { await updateCase(matterId, fd); setOpen(false); router.refresh(); });
      }}
      className="card w-full space-y-4 p-5"
    >
      <h3 className="text-base font-medium">Edit case</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("title", "Title")}
        {field("court", "Court")}
        {field("case_type", "Case type")}
        {field("stage", "Stage")}
        {field("status", "Status")}
        {field("next_hearing_date", "Next hearing", "date")}
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn-primary">{pending ? "Saving…" : "Save"}</button>
        <button type="button" onClick={() => setOpen(false)} className="btn-ghost">Cancel</button>
      </div>
    </form>
  );
}
