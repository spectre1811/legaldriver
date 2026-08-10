// WO-336 · presentational bits for the Notifications Chambers reskin — ported (in spirit) from the
// Chambers prototype's design-mockups/iteration3/console/{ui,app.notifications}.tsx. Kept local to
// this page (not a shared primitive) since no sibling dashboard page has this exact composition yet.
// Pure/props-driven — no hooks, so this stays server-renderable; all copy is passed in (i18n lives
// in page.tsx under the dashboard.notifications.* namespace).
import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";

/** Small-caps section label + the double-hairline rule beneath it (ui.tsx's SectionLabel). */
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="ec-label">{children}</div>
        {right}
      </div>
      <div className="mt-1.5 h-[3px] border-y border-ec-line" />
    </div>
  );
}

export type DotTone = "on" | "partial" | "off";
const DOT_CLASS: Record<DotTone, string> = {
  on: "bg-ec-success",
  partial: "bg-ec-honey",
  off: "bg-ec-line-strong",
};

/** Channel-health tile — connection state + a real "Configure" link into Settings. */
export function ChannelCard({
  icon,
  name,
  state,
  detail,
  dot,
  configureLabel,
}: {
  icon: IconName;
  name: string;
  state: string;
  detail: string;
  dot: DotTone;
  configureLabel: string;
}) {
  return (
    <div className="ec-card flex min-w-0 flex-col p-4">
      <div className="flex items-center gap-2.5">
        <Icon name={icon} className="h-4 w-4 shrink-0 text-ec-bronze" />
        <span className="font-display text-[16px] text-ec-ink">{name}</span>
        <span className={`ml-auto h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[dot]}`} aria-hidden />
      </div>
      <div className="num mt-2 truncate font-mono text-[11.5px] text-ec-ink-2">{detail}</div>
      <div className="eyebrow mt-1">{state}</div>
      <Link
        href="/dashboard/settings"
        className="mt-3 inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-[12.5px] text-ec-bronze transition-colors hover:bg-ec-bronze-tint"
      >
        <Icon name="settings" className="h-3 w-3" /> {configureLabel}
      </Link>
    </div>
  );
}

/** Non-interactive channel pill for the per-case matrix — reflects the account-wide toggle,
 *  never a per-cell mutation (there's no per-case override to persist to — see page.tsx). */
export function ChannelPill({ icon, short, label, on }: { icon: IconName; short: string; label: string; on: boolean }) {
  return (
    <span
      title={label}
      className={`num inline-flex items-center gap-1 rounded border px-1.5 py-[3px] font-mono text-[10px] uppercase tracking-[0.08em] ${
        on ? "border-ec-bronze bg-ec-bronze-tint text-ec-bronze-deep" : "border-ec-line bg-ec-card text-ec-muted-ink"
      }`}
    >
      <Icon name={icon} className="h-2.5 w-2.5 shrink-0" />
      {short}
    </span>
  );
}

export type Step = "queued" | "sent" | "delivered" | "read";
export const STEPS: Step[] = ["queued", "sent", "delivered", "read"];

/** Queued→sent→delivered→read trail. `reached` is capped at what the platform actually confirms
 *  today (sent) — delivered/read stay unlit rather than fabricated (see page.tsx's honesty note). */
export function ReceiptTrail({ reached, stepLabel, failedLabel }: { reached: Step; stepLabel: (s: Step) => string; failedLabel?: string }) {
  const idx = STEPS.indexOf(reached);
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {STEPS.map((s, i) => {
        const done = i <= idx;
        return (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`num inline-flex items-center gap-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${done ? "text-ec-ink-2" : "text-ec-line-strong"}`}>
              <Icon name="check" className={`h-2.5 w-2.5 ${done ? "text-ec-honey" : "text-ec-line-strong"}`} />
              {stepLabel(s)}
            </span>
            {i < STEPS.length - 1 && <span className={`h-px w-3 ${i < idx ? "bg-ec-bronze/50" : "bg-ec-line"}`} />}
          </span>
        );
      })}
      {failedLabel && <span className="ec-chip ec-chip-danger ml-1">{failedLabel}</span>}
    </div>
  );
}

/** The registrar's stamp — ported verbatim (WO-339 already did the container once for /login;
 *  mirrored here rather than sharing a component across two very different pages' local trees). */
export function Stamp({ lines }: { lines: [string, string] }) {
  return (
    <div className="flex justify-start">
      <div className="relative -rotate-2 rounded-lg border-[1.5px] border-ec-bronze px-4 pb-2.5 pt-3 text-center text-ec-bronze opacity-75">
        <span className="absolute left-1/2 top-[5px] h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-ec-honey" />
        <div className="mk-stamp-line">{lines[0]}</div>
        <div className="num mk-stamp-line">{lines[1]}</div>
      </div>
    </div>
  );
}
