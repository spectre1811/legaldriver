"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyDeadlineRule } from "../actions";

export type Rule = { id: string; kind: string; days: number; jurisdiction: string; description: string | null };

// Apply a jurisdiction-aware statutory deadline: pick a rule + the date the clock
// starts, and we compute due = base + rule.days and file an (open) deadline.
export function DeadlineRuleForm({ matterId, rules }: { matterId: string; rules: Rule[] }) {
  const [ruleId, setRuleId] = useState("");
  const [date, setDate] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const selected = rules.find((r) => r.id === ruleId);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select value={ruleId} onChange={(e) => setRuleId(e.target.value)} className="input py-1.5 text-sm sm:flex-1" aria-label="Deadline rule">
          <option value="">— pick a statutory rule —</option>
          {rules.map((r) => (
            <option key={r.id} value={r.id}>{r.jurisdiction} · {r.kind.replace(/_/g, " ")} (+{r.days}d)</option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input py-1.5 text-sm sm:w-44" aria-label="Clock-start date" />
        <button
          disabled={pending || !ruleId || !date}
          onClick={() => start(async () => { const r = await applyDeadlineRule(matterId, ruleId, date); setMsg(r.message); if (r.ok) { setRuleId(""); setDate(""); router.refresh(); } })}
          className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {pending ? "…" : "Set deadline"}
        </button>
      </div>
      {selected && <p className="text-xs text-ink-faint">{selected.description}</p>}
      {msg && <p className="text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
