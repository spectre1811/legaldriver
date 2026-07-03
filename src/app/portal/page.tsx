import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { fmtDate } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Composer } from "./composer";

export default async function PortalHome() {
  const supabase = createClient();
  const t = await getTranslations("portal");
  const te = await getTranslations("enum");
  const st = (v: string) => (te.has(`status.${v}`) ? te(`status.${v}`) : v);
  const today = new Date().toISOString().slice(0, 10);

  // All RLS-scoped to this portal user's single client.
  const [{ data: matters }, { data: hearings }, { data: docs }, { data: messages }] = await Promise.all([
    supabase.from("matter").select("id, title, cnr, court, stage, status, next_hearing_date").order("next_hearing_date", { ascending: true, nullsFirst: false }),
    supabase.from("hearing").select("id, date, purpose, matter_id").gte("date", today).order("date", { ascending: true }).limit(8),
    supabase.from("document").select("id, filename, doc_type, created_at").eq("portal_shared", true).order("created_at", { ascending: false }),
    supabase.from("portal_message").select("id, sender, body, created_at").order("created_at", { ascending: true }).limit(100),
  ]);

  return (
    <div className="space-y-6 text-ec-ink">
      <header>
        <h1 className="font-display text-2xl font-medium tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-ec-ink-3">{t("subtitle")}</p>
      </header>

      <section className="space-y-3">
        {matters && matters.length ? matters.map((m) => (
          <div key={m.id} className="ec-card flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="font-display font-medium text-ec-ink">{m.title}</p>
              <p className="num mt-1 flex flex-wrap items-center gap-2 text-xs text-ec-ink-3">
                {m.cnr && <span>{m.cnr}</span>}
                {m.court && <span>· {m.court}</span>}
                {m.stage && <span>· {m.stage}</span>}
              </p>
            </div>
            <div className="text-right text-sm">
              <span className={`ec-chip ${m.status === "active" ? "ec-chip-success" : ""}`}>{st(m.status)}</span>
              <p className="num mt-1 text-xs text-ec-ink-3">{t("nextHearing", { date: fmtDate(m.next_hearing_date) })}</p>
            </div>
          </div>
        )) : (
          <div className="ec-card p-8 text-center text-sm text-ec-ink-3">{t("noMatters")}</div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="ec-card">
          <div className="border-b border-ec-hair px-5 py-3"><h2 className="ec-label">{t("hearings.title")}</h2></div>
          {hearings && hearings.length ? (
            <ul className="divide-y divide-ec-hair">
              {hearings.map((h) => (
                <li key={h.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <span className="text-ec-ink-2">{h.purpose ?? t("hearingFallback")}</span>
                  <span className="num text-ec-ink-3">{fmtDate(h.date)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="px-5 py-8 text-center text-sm text-ec-ink-3">{t("hearings.empty")}</p>}
        </div>

        <div className="ec-card">
          <div className="border-b border-ec-hair px-5 py-3"><h2 className="ec-label">{t("docs.title")}</h2></div>
          {docs && docs.length ? (
            <ul className="divide-y divide-ec-hair">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <Icon name="documents" className="h-4 w-4 shrink-0 text-ec-ink-3" />
                  <span className="min-w-0 flex-1 truncate text-ec-ink">{d.filename}</span>
                  <a href={`/api/documents/${d.id}/download`} target="_blank" rel="noopener noreferrer" className="text-ec-brass-deep hover:text-ec-brass"><Icon name="external" className="h-4 w-4" /></a>
                </li>
              ))}
            </ul>
          ) : <p className="px-5 py-8 text-center text-sm text-ec-ink-3">{t("docs.empty")}</p>}
        </div>
      </div>

      <div className="ec-card overflow-hidden">
        <div className="border-b border-ec-hair px-5 py-3"><h2 className="ec-label">{t("messages.title")}</h2></div>
        <ul className="max-h-80 space-y-2 overflow-y-auto px-5 py-4">
          {messages && messages.length ? messages.map((m) => (
            <li key={m.id} className={`flex ${m.sender === "client" ? "justify-end" : "justify-start"}`}>
              <span className={`max-w-[80%] rounded-ec-m px-3.5 py-2 text-sm ${m.sender === "client" ? "bg-ec-ink text-ec-paper" : "bg-ec-paper-3 text-ec-ink-2"}`}>
                {m.body}
              </span>
            </li>
          )) : <li className="py-6 text-center text-sm text-ec-ink-3">{t("messages.empty")}</li>}
        </ul>
        <div className="border-t border-ec-hair px-5 py-3"><Composer /></div>
      </div>

      <p className="text-xs text-ec-ink-3">{t("footer")}</p>
    </div>
  );
}
