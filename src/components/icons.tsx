// Lightweight inline icon set (stroke style), no dependency. Usage: <Icon name="cases" />
type IconProps = { name: IconName; className?: string };
export type IconName =
  | "overview" | "cases" | "calendar" | "notices" | "bell" | "inbox" | "documents"
  | "settings" | "scale" | "plus" | "refresh" | "back" | "search" | "check" | "alert"
  | "sparkles" | "upload" | "clip" | "external" | "chevron" | "logout" | "gmail" | "clock" | "dot" | "edit"
  | "menu" | "close" | "trash" | "eye"
  | "clients" | "invoice" | "bulb" | "chart" | "chat" | "mic" | "gauge" | "printer"
  | "sunrise" | "judge" | "scroll"
  // WO-332 case-file console reskin — two glyphs the Chambers reference needs beyond the existing set.
  | "copy" | "more"
  // WO-334 Documents Notes/zoom viewer — glyphs the reference needs beyond the existing set.
  | "note" | "minus" | "download"
  // WO-335 Inbox Daybreak reskin — the disconnected-state reassurance bullets (ShieldCheck).
  | "shield"
  // WO-336 Notifications Chambers reskin — "in-app" channel glyph (console + bell), the one
  // shape the existing set (gmail=envelope for Email, chat=speech-bubble for WhatsApp) lacks.
  | "monitor"
  // WO-331 Cases Daybreak reskin — the Filters drawer's "Saved views" trigger (the reference's
  // lucide Bookmark), the one shape the existing set lacks.
  | "bookmark";

const P: Record<IconName, React.ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  cases: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  calendar: <><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></>,
  notices: <><path d="M5 3h9l5 5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v5h5M8 13h8M8 17h5" /></>,
  bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
  documents: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>,
  scale: <><path d="M12 3v18M7 21h10M5 7h14M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>,
  back: <><path d="M19 12H5M12 19l-7-7 7-7" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  check: <><path d="M20 6 9 17l-5-5" /></>,
  alert: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  sparkles: <><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" /><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" /></>,
  upload: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 9l5-5 5 5M12 4v12" /></>,
  clip: <><path d="M21.4 11.05 12.2 20.3a5 5 0 0 1-7.1-7.1l9.2-9.2a3.3 3.3 0 0 1 4.7 4.7l-9.2 9.2a1.7 1.7 0 0 1-2.4-2.4l8.5-8.5" /></>,
  external: <><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  chevron: <><path d="m9 18 6-6-6-6" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  gmail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 7 10-7" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  dot: <><circle cx="12" cy="12" r="4" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  menu: <><path d="M3 6h18M3 12h18M3 18h18" /></>,
  close: <><path d="M18 6 6 18M6 6l12 12" /></>,
  trash: <><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" /><path d="M10 11v6M14 11v6" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  clients: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M15 20a6.5 6.5 0 0 0-2.8-5.3" /></>,
  invoice: <><path d="M6 2h9l3 3v15l-2.5-1.5L13 20l-2.5-1.5L8 20l-2-1.3V4a2 2 0 0 1 2-2z" /><path d="M9 8h6M9 12h4" /></>,
  bulb: <><path d="M9.5 18h5M10.5 21h3" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2v.3h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" /></>,
  chart: <><path d="M3 21h18" /><rect x="5" y="11" width="3" height="7" rx="0.5" /><rect x="10.5" y="6" width="3" height="12" rx="0.5" /><rect x="16" y="14" width="3" height="4" rx="0.5" /></>,
  chat: <><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
  mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7" /></>,
  gauge: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 14a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6zM13.3 11 17 7" /></>,
  printer: <><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6z" /></>,
  // WO-324 Daybreak landing — three glyphs the reference needs beyond the existing set.
  sunrise: <><path d="M6 15a6 6 0 0 1 12 0" /><path d="M2 15h3M19 15h3M12 4v2M5 7l1.5 1.5M19 7l-1.5 1.5" /><path d="M3 20h18M6 22.5h12" /></>,
  judge: <><circle cx="12" cy="8" r="3.2" /><path d="M5.5 20c.8-3.6 3.2-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /></>,
  scroll: <><path d="M6.5 4h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7.5" /><path d="M6.5 4A2 2 0 0 0 4.5 6v2.5H9" /><path d="M9 10h6M9 13.5h6M9 17h3" /></>,
  // WO-332 — copy-to-clipboard + kebab "more actions" trigger.
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></>,
  more: <><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>,
  note: <><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10.5a2 2 0 0 0 2-2V8.5z" /><path d="M15 3v4a2 2 0 0 0 2 2h4" /><path d="M8 13h5M8 17h3" /></>,
  minus: <><path d="M5 12h14" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 11l5 5 5-5M12 4v12" /></>,
  shield: <><path d="M12 3 4.5 6v6c0 4.4 3 7.5 7.5 9 4.5-1.5 7.5-4.6 7.5-9V6z" /><path d="m8.5 12 2.4 2.4L16 9.5" /></>,
  monitor: <><rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  bookmark: <><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" /></>,
};

export function Icon({ name, className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {P[name]}
    </svg>
  );
}
