// Single source of truth for calendar event types: styling, labels, badge tone.
// Shared by the month grid, the agenda list and the filter chips so they never
// drift. Colors preserve the original mapping; IP renewal is split out from the
// generic "deadline" rose so it reads distinctly in the agenda.
export type Kind = "hearing" | "causelist" | "deadline" | "event" | "iprenewal";

export const KIND_ORDER: Kind[] = ["hearing", "causelist", "deadline", "event", "iprenewal"];

export const KIND_LABEL: Record<Kind, string> = {
  hearing: "Hearing",
  causelist: "Cause list",
  deadline: "Deadline",
  event: "Reminder",
  iprenewal: "IP renewal",
};

export const KIND_STYLE: Record<Kind, { dot: string; chip: string }> = {
  hearing: { dot: "bg-brand-500", chip: "bg-brand-50 text-brand-700 hover:bg-brand-100" },
  causelist: { dot: "bg-brass-400", chip: "bg-amber-50 text-amber-800 hover:bg-amber-100" },
  deadline: { dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700 hover:bg-rose-100" },
  event: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
  iprenewal: { dot: "bg-orange-500", chip: "bg-orange-50 text-orange-700 hover:bg-orange-100" },
};

// Maps each kind onto the shared Badge tone palette in components/ui.tsx.
export const KIND_TONE: Record<Kind, "brand" | "amber" | "red" | "green" | "orange"> = {
  hearing: "brand",
  causelist: "amber",
  deadline: "red",
  event: "green",
  iprenewal: "orange",
};
