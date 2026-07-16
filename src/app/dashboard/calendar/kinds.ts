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

// V-A tokens only (design-system-v2). Red is rationed to the limitation/deadline
// kind; court appearances (hearing/cause list) read bronze; the advocate's own
// entries read graphite ink; IP renewals read amber. `chip` = tinted (tint bg +
// deep text), never a saturated fill.
export const KIND_STYLE: Record<Kind, { dot: string; chip: string }> = {
  hearing: { dot: "bg-ec-bronze", chip: "bg-ec-bronze-tint text-ec-bronze-deep" },
  causelist: { dot: "bg-ec-bronze/55", chip: "bg-ec-paper-3 text-ec-ink-2" },
  deadline: { dot: "bg-ec-danger", chip: "bg-ec-danger-t text-ec-danger" },
  event: { dot: "bg-ec-ink", chip: "bg-ec-paper-3 text-ec-ink-2" },
  iprenewal: { dot: "bg-ec-warn", chip: "bg-ec-warn-t text-ec-warn" },
};
