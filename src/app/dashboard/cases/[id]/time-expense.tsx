"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { logTime, logExpense } from "../actions";

export function LogTimeExpense({ matterId }: { matterId: string }) {
  const [tab, setTab] = useState<"time" | "expense">("time");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const timeRef = useRef<HTMLFormElement>(null);
  const expRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const submit = (e: React.FormEvent<HTMLFormElement>, fn: typeof logTime) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    start(async () => {
      const r = await fn(matterId, fd);
      setMsg(r.message);
      if (r.ok) { form.reset(); router.refresh(); }
    });
  };

  return (
    <div className="px-5 py-4">
      <div className="mb-3 inline-flex rounded-lg border border-line p-0.5 text-sm">
        <button onClick={() => setTab("time")} className={`rounded-md px-3 py-1 ${tab === "time" ? "bg-brand-600 text-white" : "text-ink-soft"}`}>Log time</button>
        <button onClick={() => setTab("expense")} className={`rounded-md px-3 py-1 ${tab === "expense" ? "bg-brand-600 text-white" : "text-ink-soft"}`}>Log expense</button>
      </div>

      {tab === "time" ? (
        <form ref={timeRef} onSubmit={(e) => submit(e, logTime)} className="flex flex-wrap items-end gap-2">
          <div><label className="label">Minutes</label><input name="minutes" type="number" min="1" required className="input mt-1 w-24" /></div>
          <div className="min-w-[12rem] flex-1"><label className="label">Narrative</label><input name="narrative" placeholder="Drafting reply…" className="input mt-1" /></div>
          <div><label className="label">Date</label><input name="entry_date" type="date" className="input mt-1" /></div>
          <label className="flex items-center gap-1.5 pb-2.5 text-sm text-ink-soft"><input name="billable" type="checkbox" defaultChecked /> Billable</label>
          <button disabled={pending} className="btn-primary"><Icon name="clock" className="h-4 w-4" /> {pending ? "…" : "Add"}</button>
        </form>
      ) : (
        <form ref={expRef} onSubmit={(e) => submit(e, logExpense)} className="flex flex-wrap items-end gap-2">
          <div><label className="label">Amount (₹)</label><input name="amount" type="number" min="0" step="0.01" required className="input mt-1 w-28" /></div>
          <div><label className="label">Category</label>
            <select name="category" className="input mt-1">
              <option value="court_fee">Court fee</option><option value="travel">Travel</option>
              <option value="printing">Printing</option><option value="filing">Filing</option><option value="other">Other</option>
            </select>
          </div>
          <div className="min-w-[10rem] flex-1"><label className="label">Notes</label><input name="notes" className="input mt-1" /></div>
          <div><label className="label">Date</label><input name="entry_date" type="date" className="input mt-1" /></div>
          <label className="flex items-center gap-1.5 pb-2.5 text-sm text-ink-soft"><input name="billable" type="checkbox" defaultChecked /> Billable</label>
          <button disabled={pending} className="btn-primary">{pending ? "…" : "Add"}</button>
        </form>
      )}
      {msg && <p className="mt-2 text-xs text-ink-muted">{msg}</p>}
    </div>
  );
}
