"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

// Settings shell — a dedicated section with its own vertical left-nav (grouped, not one
// long scroll page). Panels are HIDDEN (not unmounted) when inactive so every server-rendered
// section + client form inside keeps its state. Purely additive reorganisation of the sections.

const Ctx = createContext<{ active: string; setActive: (id: string) => void }>({ active: "", setActive: () => {} });

export function SettingsTabs({ sections, children }: { sections: { id: string; label: string; icon: IconName }[]; children: ReactNode }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  return (
    <Ctx.Provider value={{ active, setActive }}>
      <div className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
        {/* Vertical sub-nav on desktop; horizontal scroll strip on mobile. */}
        <nav
          aria-label="Settings sections"
          className="flex gap-1 overflow-x-auto border-b border-ec-hair pb-2 md:sticky md:top-4 md:h-fit md:flex-col md:overflow-visible md:border-0 md:pb-0"
        >
          {sections.map((s) => {
            const on = active === s.id;
            return (
              <button
                key={s.id}
                aria-current={on ? "page" : undefined}
                onClick={() => setActive(s.id)}
                className={`flex shrink-0 items-center gap-2.5 rounded-ec-s px-3 py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ec-honey md:w-full ${
                  on ? "bg-ec-ink font-medium text-ec-paper" : "text-ec-ink-2 hover:bg-ec-paper-3 hover:text-ec-ink"
                }`}
              >
                <Icon name={s.icon} className={`h-[1.05rem] w-[1.05rem] ${on ? "text-ec-paper" : "text-ec-ink-3"}`} />
                {s.label}
              </button>
            );
          })}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </Ctx.Provider>
  );
}

export function SettingsPanel({ id, children }: { id: string; children: ReactNode }) {
  const { active } = useContext(Ctx);
  return <div hidden={active !== id} className="space-y-6">{children}</div>;
}
