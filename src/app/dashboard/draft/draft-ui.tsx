"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { uploadAndDraft, regenerateDraft, saveDraftEdit, finalizeDraft, discardDraft } from "./actions";

export function UploadAndDraftForm() {
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
          const r = await uploadAndDraft(fd);
          setMsg(r.message);
          if (r.ok) { formRef.current?.reset(); if (r.draftId) router.push(`/dashboard/draft/${r.draftId}`); else router.refresh(); }
        });
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.tiff,.txt,.md,.eml" className="block max-w-xs text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
      <button type="submit" disabled={pending} className="btn-primary">
        <Icon name={pending ? "refresh" : "upload"} className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} /> {pending ? "Uploading…" : "Upload & draft"}
      </button>
      {msg && <span className="max-w-md text-xs text-ink-muted">{msg}</span>}
    </form>
  );
}

export function RegenerateButton({ draftId, sections, has }: { draftId: string; sections: string[]; has: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => start(async () => { const r = await regenerateDraft(draftId, { sections }); setMsg(r.message); router.refresh(); })}
        disabled={pending}
        className="btn-primary"
      >
        <Icon name="sparkles" className="h-4 w-4" /> {pending ? "Drafting…" : has ? "Regenerate" : "Generate draft"}
      </button>
      {msg && <span className="max-w-xs text-xs text-ink-muted">{msg}</span>}
    </div>
  );
}

// Editable statutory-section chips; "Apply & regenerate" re-runs under the new set.
export function SectionsEditor({ draftId, initial }: { draftId: string; initial: string[] }) {
  const [sections, setSections] = useState<string[]>(initial);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const add = () => { const v = input.trim(); if (v && !sections.includes(v)) setSections([...sections, v]); setInput(""); };
  return (
    <div className="space-y-2">
      <p className="label">Sections to draft under</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {sections.map((s) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700">
            {s}
            <button onClick={() => setSections(sections.filter((x) => x !== s))} className="text-brand-400 hover:text-brand-700" aria-label={`remove ${s}`}>×</button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="add a section…"
          className="w-36 rounded-lg border border-line px-2 py-1 text-xs focus:border-brand-400 focus:outline-none"
        />
      </div>
      <button
        onClick={() => start(async () => { await regenerateDraft(draftId, { sections }); router.refresh(); })}
        disabled={pending}
        className="btn-secondary"
      >
        <Icon name="refresh" className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} /> Apply &amp; regenerate
      </button>
    </div>
  );
}

const LANGS: { v: string; label: string }[] = [
  { v: "en", label: "English" }, { v: "hi", label: "हिन्दी" }, { v: "gu", label: "ગુજરાતી" }, { v: "bilingual", label: "Bilingual (EN+HI)" },
];

// Output-language selector — re-synthesizes the draft in the chosen language.
export function LanguageSelector({ draftId, current }: { draftId: string; current: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <span className="label">Language</span>
      <select
        defaultValue={current}
        disabled={pending}
        onChange={(e) => { const language = e.target.value; if (language !== current) start(async () => { await regenerateDraft(draftId, { language }); router.refresh(); }); }}
        className="rounded-lg border border-line px-2 py-1 text-xs focus:border-brand-400 focus:outline-none"
      >
        {LANGS.map((l) => <option key={l.v} value={l.v}>{l.label}</option>)}
      </select>
      {pending && <Icon name="refresh" className="h-3.5 w-3.5 animate-spin text-ink-faint" />}
    </div>
  );
}

export function EditDraftForm({ draftId, body }: { draftId: string; body: string }) {
  const [text, setText] = useState(body);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="btn-secondary">
        <Icon name="edit" className="h-4 w-4" /> Edit draft
      </button>
    );
  }
  return (
    <div className="space-y-2">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={18} className="w-full rounded-xl border border-line p-3 font-mono text-xs leading-relaxed focus:border-brand-400 focus:outline-none" />
      <div className="flex items-center gap-3">
        <button onClick={() => start(async () => { const r = await saveDraftEdit(draftId, text); setMsg(r.message); if (r.ok) { setEditing(false); router.refresh(); } })} disabled={pending} className="btn-primary">
          <Icon name="check" className="h-4 w-4" /> {pending ? "Saving…" : "Save edit"}
        </button>
        <button onClick={() => { setText(body); setEditing(false); }} className="btn-secondary">Cancel</button>
        {msg && <span className="text-xs text-ink-muted">{msg}</span>}
      </div>
    </div>
  );
}

export function FinalizeButton({ draftId }: { draftId: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => start(async () => { const r = await finalizeDraft(draftId); setMsg(r.message); router.refresh(); })} disabled={pending} className="btn-secondary">
        <Icon name="documents" className="h-4 w-4" /> {pending ? "Saving…" : "Save as document"}
      </button>
      {msg && <span className="text-xs text-ink-muted">{msg}</span>}
    </div>
  );
}

export function DiscardButton({ draftId }: { draftId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button onClick={() => { if (confirm("Discard this draft?")) start(async () => { await discardDraft(draftId); router.push("/dashboard/draft"); }); }} disabled={pending} className="text-xs text-ink-faint hover:text-red-600">
      Discard
    </button>
  );
}

// While a draft is being synthesized by the background worker, refresh periodically.
export function PendingPoller() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [router]);
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
      <Icon name="refresh" className="h-4 w-4 animate-spin" /> Our AI is drafting this in the background…
    </span>
  );
}
