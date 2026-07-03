// Peshi logo mark — the "p" tile (WO-05, founder-approved direction 03):
// a lowercase Fraunces "p" over the brass hearing-date underline, in a rounded
// tile. In-app it renders live Fraunces via var(--f-display). Two colourways:
//   tone="light" → paper tile + ink p (for dark surfaces, and the approved look)
//   tone="dark"  → ink tile + paper p (for light surfaces / high contrast)
// The brass underline is constant. Purely presentational.

export function PeshiMark({
  size = 28,
  tone = "dark",
  className,
  title = "Peshi",
}: {
  size?: number;
  tone?: "light" | "dark";
  className?: string;
  title?: string;
}) {
  const tile = tone === "light" ? "#FAF7F1" : "#191926";
  const glyph = tone === "light" ? "#191926" : "#FAF7F1";
  const border = tone === "light" ? "#191926" : "none";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      role="img"
      aria-label={title}
      className={className}
    >
      <rect
        x="5" y="5" width="118" height="118" rx="27"
        fill={tile}
        stroke={border}
        strokeOpacity={tone === "light" ? 0.12 : 0}
        strokeWidth="2"
      />
      <text
        x="62" y="94" textAnchor="middle"
        fontSize="94" fontWeight={600} fill={glyph}
        style={{ fontFamily: "var(--f-display), Fraunces, Georgia, serif" }}
      >
        p
      </text>
      <rect x="38" y="96" width="52" height="6" rx="3" fill="#A8823C" />
    </svg>
  );
}
