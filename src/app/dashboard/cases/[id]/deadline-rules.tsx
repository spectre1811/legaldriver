"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Combobox } from "@/components/combobox";
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
  const t = useTranslations("caseDetail");
  const te = useTranslations("enum");
  const selected = rules.find((r) => r.id === ruleId);
  const kindLabel = (kind: string) => (te.has(`deadlineRuleKind.${kind}`) ? te(`deadlineRuleKind.${kind}`) : kind.replace(/_/g, " "));

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Combobox
          label={t("deadlineRules.ruleAria")} placeholder={t("deadlineRules.rulePlaceholder")}
          options={rules.map((r) => ({ value: r.id, label: `${r.jurisdiction} · ${kindLabel(r.kind)} (+${r.days}d)` }))}
          value={ruleId || null} onChange={(v) => setRuleId(v ?? "")}
          className="sm:flex-1"
        />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input py-1.5 text-sm sm:w-44" aria-label={t("deadlineRules.clockStartAria")} />
        <button
          disabled={pending || !ruleId || !date}
          onClick={() => start(async () => { const r = await applyDeadlineRule(matterId, ruleId, date); setMsg(r.message); if (r.ok) { setRuleId(""); setDate(""); router.refresh(); } })}
          className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {pending ? t("deadlineRules.pending") : t("deadlineRules.setDeadline")}
        </button>
      </div>
      {selected && <p className="text-xs text-ink-faint">{selected.description}</p>}
      {msg && <p className="text-xs text-ink-soft">{msg}</p>}
    </div>
  );
}
