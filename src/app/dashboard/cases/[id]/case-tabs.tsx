"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

// Lightweight tab shell for the case detail. Panels are HIDDEN (not unmounted) when
// inactive, so every server-rendered section + client form inside keeps its state —
// a purely additive, non-breaking reorganisation of the existing page sections.

const TabCtx = createContext<{ active: string; setActive: (id: string) => void }>({ active: "overview", setActive: () => {} });

export function CaseTabs({ tabs, children }: { tabs: { id: string; label: string; icon: IconName }[]; children: ReactNode }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "overview");
  return (
    <TabCtx.Provider value={{ active, setActive }}>
      <div className="space-y-6">
        <div className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto border-b border-line bg-paper/80 px-1 py-1 backdrop-blur">
          {tabs.map((t) => {
            const on = active === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${on ? "bg-brand-600 text-white shadow-sm" : "text-ink-soft hover:bg-white hover:text-ink"}`}
              >
                <Icon name={t.icon} className={`h-4 w-4 ${on ? "text-white" : "text-ink-faint"}`} /> {t.label}
              </button>
            );
          })}
        </div>
        {children}
      </div>
    </TabCtx.Provider>
  );
}

export function CaseTabPanel({ id, children }: { id: string; children: ReactNode }) {
  const { active } = useContext(TabCtx);
  return <div hidden={active !== id} className="space-y-7">{children}</div>;
}
