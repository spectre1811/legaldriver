// WO-206 · One switch for hiding console modules (founder "have them later" — hide, don't delete).
// Server- and client-safe (no "use client", no React) so both the nav (client) and the route
// pages (server) read the same flag. Empty this array to restore all four modules — nav + ⌘K
// entries reappear and the route redirects stop; the module page code is never deleted.
// WO-328: trimmed the sidebar to the hero set (Overview/Cases/Clients/Documents/Inbox/
// Notifications/Judge & Advocate Search/Onboarding/Settings) by folding calendar, cause list,
// invoices, search, analytics and the AI section behind the same flag. Routes stay intact.
export const DISABLED_MODULES = [
  "/dashboard/voice",
  "/dashboard/messages",
  "/dashboard/portfolio",
  "/dashboard/notices",
  "/dashboard/ip",
  "/dashboard/calendar",
  "/dashboard/cause-list",
  "/dashboard/invoices",
  "/dashboard/search",
  "/dashboard/analytics",
  "/dashboard/assistant",
  "/dashboard/ai-usage",
];
export const isDisabled = (href: string) => DISABLED_MODULES.includes(href);
