import { redirect } from "next/navigation";

// WO-82 · The Judges & Lawyers directory moved out of the buried Insight→Search tab shell
// to a first-class Practice surface at /dashboard/directory. This route now redirects there,
// preserving any query (name search or case-number lookup) so old links/bookmarks keep working.
export default function DirectoryRedirect({
  searchParams,
}: {
  searchParams: { q?: string; ct?: string; cn?: string; cy?: string };
}) {
  const qs = new URLSearchParams();
  for (const k of ["q", "ct", "cn", "cy"] as const) {
    const v = searchParams[k];
    if (v) qs.set(k, v);
  }
  const suffix = qs.toString();
  redirect(`/dashboard/directory${suffix ? `?${suffix}` : ""}`);
}
