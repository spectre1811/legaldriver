import en from "@/i18n/messages/en.json";
import hi from "@/i18n/messages/hi.json";
import { fillTemplate, type Slot } from "@/i18n/comms";

// SAMPLE-flagged preview of the communications catalog (comms-catalog-v2 §3–6).
// Every string renders through fillTemplate from clearly-labelled sample data —
// never hardcoded here, never real user data (copy-deck §8). Dev/design route.
export const metadata = {
  title: "Comms catalog · SAMPLE",
  robots: { index: false, follow: false },
};

// Sample data (copy-catalog examples). Behind the SAMPLE badge, per §8 honesty.
const SAMPLE: Record<string, Slot> = {
  matter: "Patel v. State of Gujarat",
  when: "2h ago",
  item: "14",
  court: "Gujarat HC · Court 7",
  days: 3,
  amount: "45,000",
  payer: "Nirav Maheshwari",
  invoice: "INV-2026-041",
  count: 297,
  time: "02:14",
};

const SECTIONS: { key: keyof typeof en.comms; title: string; note?: string }[] = [
  { key: "notification", title: "Notifications", note: "bell / push · ≤ 90 chars · tap = the thing itself" },
  { key: "toast", title: "Toasts & confirmations", note: "≤ 6 words where possible" },
  { key: "error", title: "Errors", note: "name the system, give the next step" },
  { key: "emptyState", title: "Empty states", note: "each one sells the next action, once" },
];

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm bg-ec-brass-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ec-brass-deep">
      {children}
    </span>
  );
}

function LangRow({ label, value, count }: { label: string; value: string | null; count?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-6 shrink-0 text-[11px] uppercase tracking-wide text-ec-ink-3">{label}</span>
      {value === null ? (
        <span className="text-ec-ink-3 italic">— slot missing → sentence dropped —</span>
      ) : (
        <span className="text-ec-ink">{value}</span>
      )}
      {count && value !== null && (
        <span className={`ml-auto shrink-0 text-[11px] tabular-nums ${value.length > 90 ? "text-ec-warn" : "text-ec-ink-3"}`}>
          {value.length}/90
        </span>
      )}
    </div>
  );
}

export default function CommsStyleguide() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-ec-ink">
      <header className="mb-10 border-b border-ec-hair pb-6">
        <div className="mb-2 flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Communications catalog</h1>
          <Badge>Sample</Badge>
        </div>
        <p className="text-sm text-ec-ink-2">
          In-app strings (notifications, toasts, errors, empty states) from comms-catalog-v2, rendered
          from sample data in both languages. Missing slots drop their sentence — never faked.
        </p>
      </header>

      {SECTIONS.map(({ key, title, note }) => {
        const enSec = en.comms[key] as Record<string, string>;
        const hiSec = hi.comms[key] as Record<string, string>;
        const isNotification = key === "notification";
        return (
          <section key={key} className="mb-10">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-ec-brass-deep">{title}</h2>
            {note && <p className="mb-4 text-xs text-ec-ink-3">{note}</p>}
            <div className="space-y-4">
              {Object.keys(enSec).map((k) => (
                <div key={k} className="rounded-md border border-ec-hair bg-paper-2 p-3">
                  <div className="mb-2 font-mono text-[11px] text-ec-ink-3">comms.{key}.{k}</div>
                  <div className="space-y-1">
                    <LangRow label="EN" value={fillTemplate(enSec[k], SAMPLE)} count={isNotification} />
                    <LangRow label="हि" value={fillTemplate(hiSec[k], SAMPLE)} count={isNotification} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      <section className="mb-10">
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-ec-brass-deep">Honesty rule — live</h2>
        <p className="mb-4 text-xs text-ec-ink-3">
          The same notification with <code className="font-mono">matter</code> unavailable: the sentence is dropped, not shown with a hole.
        </p>
        <div className="rounded-md border border-ec-hair bg-paper-2 p-3">
          <div className="mb-2 font-mono text-[11px] text-ec-ink-3">comms.notification.replyDue · {"{ matter: null }"}</div>
          <LangRow label="EN" value={fillTemplate(en.comms.notification.replyDue, { ...SAMPLE, matter: null })} />
        </div>
      </section>
    </main>
  );
}
