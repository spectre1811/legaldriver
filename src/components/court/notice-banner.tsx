// BP-17 · NoticeBanner — the ONE status/warning banner shell (icon + optional title + body),
// tokened and `role="status"`. StalenessBanner and the app's mock-data CourtProviderBanner both
// render through it, so every court-data notice looks identical. Pure/prop-driven.
import { AlertIcon } from "./icons";

export function NoticeBanner({
  tone = "warn",
  title,
  className = "",
  children,
}: {
  tone?: "warn" | "danger";
  title?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const palette =
    tone === "danger"
      ? "border-ec-danger/30 bg-ec-danger-t text-ec-danger"
      : "border-ec-warn/30 bg-ec-warn-t text-ec-warn";
  return (
    <div role="status" className={`flex items-start gap-2.5 rounded-ec-s border px-4 py-3 text-sm ${palette} ${className}`.trim()}>
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {title && <p className="font-medium">{title}</p>}
        <p className={title ? "mt-0.5 text-xs opacity-90" : ""}>{children}</p>
      </div>
    </div>
  );
}
