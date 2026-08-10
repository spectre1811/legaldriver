"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { logTime, logExpense } from "../actions";

export function LogTimeExpense({ matterId }: { matterId: string }) {
  const [tab, setTab] = useState<"time" | "expense">("time");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  const timeRef = useRef<HTMLFormElement>(null);
  const expRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const t = useTranslations("caseDetail");

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
        <button onClick={() => setTab("time")} className={`rounded-md px-3 py-1 ${tab === "time" ? "bg-ec-ink text-ec-paper" : "text-ink-soft"}`}>{t("timeExpense.logTime")}</button>
        <button onClick={() => setTab("expense")} className={`rounded-md px-3 py-1 ${tab === "expense" ? "bg-ec-ink text-ec-paper" : "text-ink-soft"}`}>{t("timeExpense.logExpense")}</button>
      </div>

      {tab === "time" ? (
        <form ref={timeRef} onSubmit={(e) => submit(e, logTime)} className="flex flex-wrap items-end gap-2">
          <div><label className="label">{t("timeExpense.minutes")}</label><input name="minutes" type="number" min="1" required className="input mt-1 w-24" /></div>
          <div className="min-w-[12rem] flex-1"><label className="label">{t("timeExpense.narrative")}</label><input name="narrative" placeholder={t("timeExpense.narrativePlaceholder")} className="input mt-1" /></div>
          <div><label className="label">{t("timeExpense.date")}</label><input name="entry_date" type="date" className="input mt-1" /></div>
          <label className="flex items-center gap-1.5 pb-2.5 text-sm text-ink-soft"><input name="billable" type="checkbox" defaultChecked /> {t("timeExpense.billable")}</label>
          <button disabled={pending} className="btn-primary"><Icon name="clock" className="h-4 w-4" /> {pending ? t("timeExpense.pending") : t("timeExpense.add")}</button>
        </form>
      ) : (
        <form ref={expRef} onSubmit={(e) => submit(e, logExpense)} className="flex flex-wrap items-end gap-2">
          <div><label className="label">{t("timeExpense.amount", { symbol: "₹" })}</label><input name="amount" type="number" min="0" step="0.01" required className="input mt-1 w-28" /></div>
          <div><label className="label">{t("timeExpense.category")}</label>
            <select name="category" className="input mt-1">
              <option value="court_fee">{t("timeExpense.categoryCourtFee")}</option><option value="travel">{t("timeExpense.categoryTravel")}</option>
              <option value="printing">{t("timeExpense.categoryPrinting")}</option><option value="filing">{t("timeExpense.categoryFiling")}</option><option value="other">{t("timeExpense.categoryOther")}</option>
            </select>
          </div>
          <div className="min-w-[10rem] flex-1"><label className="label">{t("timeExpense.notes")}</label><input name="notes" className="input mt-1" /></div>
          <div><label className="label">{t("timeExpense.date")}</label><input name="entry_date" type="date" className="input mt-1" /></div>
          <label className="flex items-center gap-1.5 pb-2.5 text-sm text-ink-soft"><input name="billable" type="checkbox" defaultChecked /> {t("timeExpense.billable")}</label>
          <button disabled={pending} className="btn-primary">{pending ? t("timeExpense.pending") : t("timeExpense.add")}</button>
        </form>
      )}
      {msg && <p className="mt-2 text-xs text-ink-muted">{msg}</p>}
    </div>
  );
}
