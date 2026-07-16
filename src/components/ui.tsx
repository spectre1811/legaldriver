import { useTranslations } from "next-intl";
import { Icon, type IconName } from "./icons";
import { Disclaimer as KitDisclaimer } from "./court/disclaimer";

export function PageHeader({
  title,
  subtitle,
  children,
  serif,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  serif?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className={`text-[1.6rem] leading-tight ${serif ? "font-display font-medium" : "font-semibold"}`}>{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: IconName;
}) {
  return (
    <div className="card p-5 transition hover:shadow-lift">
      <div className="flex items-center justify-between">
        <p className="label">{label}</p>
        {icon && (
          <span className="text-brand-500">
            <Icon name={icon} className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="mt-3 font-serif text-3xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

const TONES: Record<string, string> = {
  neutral: "bg-paper text-ink-muted border border-line",
  brand: "bg-brand-50 text-brand-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  orange: "bg-orange-50 text-orange-700",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`badge ${TONES[tone] ?? TONES.neutral}`}>{children}</span>;
}

export function EmptyState({
  icon,
  title,
  body,
  children,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
          <Icon name={icon} className="h-6 w-6" />
        </span>
      )}
      <h3 className="text-lg font-medium">{title}</h3>
      {body && <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-muted">{body}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

export function Disclaimer() {
  // Canonical presentation lives in the court kit (BP-17); this thin wrapper just feeds it the
  // localized string. next-intl's useTranslations works in both Server and Client Components.
  const t = useTranslations("common");
  return <KitDisclaimer text={t("disclaimer")} />;
}

export function fmtMoney(minor: number | null | undefined) {
  const v = (minor ?? 0) / 100;
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
export function fmtHours(minutes: number | null | undefined) {
  const m = minutes ?? 0;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
export function fmtSize(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
export function fmtAgo(ts: string | null | undefined) {
  if (!ts) return "never";
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
