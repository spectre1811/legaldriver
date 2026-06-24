import { createClient } from "@/lib/supabase/server";
import { NoticeForm } from "./notice-form";
import { RespondButton } from "./respond-button";

const STATE_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-blue-50 text-blue-700",
  awaiting_response: "bg-amber-50 text-amber-800",
  escalated_1: "bg-orange-100 text-orange-800",
  escalated_2: "bg-red-100 text-red-800",
  responded: "bg-green-50 text-green-700",
  closed: "bg-slate-100 text-slate-500",
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function NoticesPage() {
  const supabase = createClient();
  const [{ data: notices }, { data: matters }] = await Promise.all([
    supabase
      .from("notice")
      .select("id, type, response_due, escalation_state, next_escalation_at, sent_at, matter:matter_id (title)")
      .order("created_at", { ascending: false }),
    supabase.from("matter").select("id, title").order("title"),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Notices</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create a notice, set a response-due date, and let the escalation timer advance it
          automatically if there&apos;s no response.
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <NoticeForm matters={matters ?? []} />
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {notices && notices.length ? (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Notice</th>
                <th className="px-4 py-3">Case</th>
                <th className="px-4 py-3">Response due</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Next escalation</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {notices.map((n) => {
                const m = n.matter as unknown as { title?: string } | null;
                const active = !["responded", "closed"].includes(n.escalation_state);
                return (
                  <tr key={n.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">{n.type}</td>
                    <td className="px-4 py-3 text-slate-600">{m?.title ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{fmt(n.response_due)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATE_STYLES[n.escalation_state] ?? ""}`}>
                        {n.escalation_state.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {n.next_escalation_at ? new Date(n.next_escalation_at).toLocaleString("en-IN") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">{active && <RespondButton noticeId={n.id} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">No notices yet.</div>
        )}
      </section>
    </div>
  );
}
