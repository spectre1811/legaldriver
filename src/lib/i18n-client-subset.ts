import type { AbstractIntlMessages } from "next-intl";
import CLIENT_NAMESPACE_PATHS from "./CLIENT_NAMESPACE_PATHS.json";

// WO-365 W1 · Only namespaces actually consumed by client components cross the
// RSC boundary.  Server components read the full catalog independently via
// getTranslations(), so dropping server-only namespaces from the provider has
// no effect on SSR.  ~28 % of the serialized message payload was server-only.
//
// The canonical namespace list lives in ./CLIENT_NAMESPACE_PATHS.json — a
// single source of truth shared with the two CI gate scripts.  Adding a client
// component that calls useTranslations("ns")?  Add the dot-separated path to
// that JSON file.  The CI namespace-guard will fail the build if you forget.

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
