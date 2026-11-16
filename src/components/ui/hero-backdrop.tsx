/**
 * The blue gradient and its soft circles, drawn to fill whatever box it sits in. The same picture as the mobile
 * app's clock card, Profile banner and No connection screen (`approvehr-mobile`, `ui/HeroBackdrop`): a deep
 * indigo to a brighter brand blue, two big arcs from the corners and a few small circles on the right.
 *
 * Positioned and sized with inline styles, not classes, on purpose: the offline page is served by the service
 * worker on its own, with no stylesheet to lean on, and this has to draw there too. One SVG drawn to cover, so the
 * circles keep their shape however wide or tall the box gets. Decorative: hidden from assistive tech.
 *
 * The parent must be `position: relative` and clip (`overflow: hidden`) if it has rounded corners.
 */
export const HERO_BLUE = { from: "#1c2872", to: "#4059d3" } as const;

export function HeroBackdrop() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 150 100"
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <defs>
        <linearGradient id="ahr-hero-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={HERO_BLUE.from} />
          <stop offset="1" stopColor={HERO_BLUE.to} />
        </linearGradient>
      </defs>
      <rect width="150" height="100" fill="url(#ahr-hero-gradient)" />
      {CIRCLES.map((c) => (
        <circle
          key={`${c.cx}-${c.cy}-${c.r}`}
          cx={c.cx}
          cy={c.cy}
          r={c.r}
          fill="#fff"
          fillOpacity={c.opacity}
        />
      ))}
    </svg>
  );
}

/** In the 150 by 100 box: two big arcs from the corners, and a few small circles in the right half. */
const CIRCLES = [
  { cx: 140, cy: 4, r: 54, opacity: 0.1 },
  { cx: 140, cy: 4, r: 34, opacity: 0.08 },
  { cx: 4, cy: 104, r: 46, opacity: 0.09 },
  { cx: 98, cy: 88, r: 12, opacity: 0.07 },
  { cx: 118, cy: 52, r: 4.5, opacity: 0.09 },
  { cx: 134, cy: 78, r: 7, opacity: 0.07 },
] as const;
