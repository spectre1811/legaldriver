import type { AbstractIntlMessages } from "next-intl";

// WO-365 W1 · Only namespaces actually consumed by client components cross the
// RSC boundary.  Server components read the full catalog independently via
// getTranslations(), so dropping server-only namespaces from the provider has
// no effect on SSR.  28 % of the serialized message payload was server-only.
//
// ADDING A NAMESPACE:  when a new client component calls useTranslations("ns"),
// add the dot-separated path here.  The CI namespace-guard script
// (scripts/check-i18n-client-namespaces.mjs) will fail the build if you forget.

const CLIENT_NAMESPACE_PATHS = [
  "assistant",
  "auth",
  "calendar",
  "caseDetail",
  "casePreview",
  "cases",
  "causeList",
  "clients",
  "combobox",
  "common",
  "comms",
  "copilot",
  "dashboard.clients",
  "dashboard.inbox",
  "dashboard.onboarding",
  "documents",
  "draft",
  "enum",
  "inbox",
  "invoices",
  "ip",
  "landing",
  "messages",
  "nav",
  "notices",
  "pagination",
  "portal",
  "requestAccess",
  "research",
  "search",
  "settings",
  "shell",
  "voice",
] as const;

export function selectClientMessages(
  messages: AbstractIntlMessages,
): AbstractIntlMessages {
  const result: Record<string, unknown> = {};

  for (const path of CLIENT_NAMESPACE_PATHS) {
    const parts = path.split(".");
    let src: Record<string, unknown> | undefined =
      messages as Record<string, unknown>;
    let dst = result;

    let i = 0;
    for (; i < parts.length - 1; i++) {
      if (!src || !(parts[i] in src)) break;
      if (!(parts[i] in dst)) dst[parts[i]] = {};
      src = src[parts[i]] as Record<string, unknown>;
      dst = dst[parts[i]] as Record<string, unknown>;
    }

    if (i !== parts.length - 1) continue;

    const last = parts[parts.length - 1];
    if (src && last in src) dst[last] = src[last];
  }

  return result as AbstractIntlMessages;
}
