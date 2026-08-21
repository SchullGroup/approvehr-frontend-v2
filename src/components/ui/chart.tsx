import { cn } from "@/lib/cn";

/*
 * Charts are drawn rather than imported, for the same reason the logo is:
 * they inherit the palette tokens, stay crisp at any size, and add nothing
 * to the bundle. Every chart carries a visually hidden table so the numbers
 * are available to screen readers and to anyone who cannot read the shape.
 *
 * Series colour comes from --color-cat-1..6, which is a categorical ramp.
 * It is deliberately separate from the semantic tones: a bar is never green
 * because things are going well, only because it is the second series.
 */

export const SERIES = [
  "var(--color-cat-1)",
  "var(--color-cat-2)",
  "var(--color-cat-3)",
  "var(--color-cat-4)",
  "var(--color-cat-5)",
  "var(--color-cat-6)",
];

export type Point = { label: string; value: number };

function niceCeiling(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const scaled = max / magnitude;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Visually hidden data table. Keeps every chart readable without sight. */
function DataTable({
  caption,
  points,
  format,
}: {
  caption: string;
  points: Point[];
  format: (n: number) => string;
}) {
  return (
    <table className="sr-only-focusable">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Label</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.label}>
            <th scope="row">{p.label}</th>
            <td>{format(p.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* -------------------------------------------------------------------------- */

/** Trend over time. Area fill anchors the line to the axis. */
export function AreaChart({
  points,
  height = 180,
  format = (n) => n.toLocaleString(),
  caption,
  className,
}: {
  points: Point[];
  height?: number;
  format?: (n: number) => string;
  caption: string;
  className?: string;
}) {
  const w = 600;
  const h = height;
  const padY = 16;
  const max = niceCeiling(Math.max(...points.map((p) => p.value)));
  const stepX = points.length > 1 ? w / (points.length - 1) : w;

  const coords = points.map((p, i) => ({
    x: i * stepX,
    y: padY + (1 - p.value / max) * (h - padY * 2),
  }));

  const line = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;

  return (
    <figure className={cn("min-w-0", className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={caption}
        className="w-full"
        style={{ height }}
      >
        <defs>
          <linearGradient id="ahr-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Baseline grid — three rules, no axis furniture. */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1="0"
            x2={w}
            y1={padY + t * (h - padY * 2)}
            y2={padY + t * (h - padY * 2)}
            stroke="var(--color-line)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={area} fill="url(#ahr-area)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Emphasised endpoint — where the eye should land. */}
        {coords.length > 0 && (
          <circle
            cx={coords[coords.length - 1].x}
            cy={coords[coords.length - 1].y}
            r="3.5"
            fill="var(--color-accent)"
            stroke="var(--color-surface)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <div className="mt-2 flex justify-between text-meta text-muted">
        {points.map((p, i) => (
          <span
            key={p.label}
            className={cn(
              i > 0 && i < points.length - 1 && "hidden sm:inline",
            )}
          >
            {p.label}
          </span>
        ))}
      </div>

      <DataTable caption={caption} points={points} format={format} />
    </figure>
  );
}

/* -------------------------------------------------------------------------- */

/** Categorical comparison. Horizontal, so long labels stay readable. */
export function BarChart({
  points,
  format = (n) => n.toLocaleString(),
  caption,
  colorBy = "single",
  className,
}: {
  points: Point[];
  format?: (n: number) => string;
  caption: string;
  /** "single" keeps one accent bar; "series" walks the categorical ramp. */
  colorBy?: "single" | "series";
  className?: string;
}) {
  const max = niceCeiling(Math.max(...points.map((p) => p.value)));

  return (
    <figure className={cn("min-w-0", className)}>
      <ul className="flex flex-col gap-3" aria-hidden="true">
        {points.map((p, i) => (
          <li key={p.label} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
            <span className="truncate text-body-sm text-body">
              {p.label}
            </span>
            <span className="tabular text-body-sm font-medium text-ink">
              {format(p.value)}
            </span>
            <span className="col-span-2 h-2 overflow-hidden rounded-full bg-sunken">
              <span
                className="block h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-soft)]"
                style={{
                  width: `${(p.value / max) * 100}%`,
                  backgroundColor:
                    colorBy === "series"
                      ? SERIES[i % SERIES.length]
                      : "var(--color-accent)",
                }}
              />
            </span>
          </li>
        ))}
      </ul>
      <DataTable caption={caption} points={points} format={format} />
    </figure>
  );
}

/* -------------------------------------------------------------------------- */

/** Composition of a whole. Centre carries the total so the ring has a job. */
export function DonutChart({
  points,
  size = 160,
  thickness = 18,
  format = (n) => n.toLocaleString(),
  caption,
  centreLabel,
  className,
}: {
  points: Point[];
  size?: number;
  thickness?: number;
  format?: (n: number) => string;
  caption: string;
  centreLabel?: string;
  className?: string;
}) {
  const total = points.reduce((sum, p) => sum + p.value, 0);
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;

  /* Cumulative offsets computed up front rather than accumulated during the
     map, so nothing is reassigned mid-render. */
  const fractions = points.map((p) => (total > 0 ? p.value / total : 0));
  const arcs = fractions.map((fraction, i) => ({
    dash: fraction * circumference,
    offset:
      fractions.slice(0, i).reduce((sum, f) => sum + f, 0) * circumference,
    color: SERIES[i % SERIES.length],
  }));

  return (
    <figure className={cn("flex items-center gap-5", className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={caption}
        className="shrink-0 -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-sunken)"
          strokeWidth={thickness}
        />
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
            strokeDashoffset={-arc.offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>

      <div className="min-w-0">
        {centreLabel && (
          <p className="mb-2 text-body-sm text-muted">{centreLabel}</p>
        )}
        <ul className="flex flex-col gap-1.5">
          {points.map((p, i) => (
            <li key={p.label} className="flex items-center gap-2 text-body-sm">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: SERIES[i % SERIES.length] }}
              />
              <span className="min-w-0 flex-1 truncate text-body">
                {p.label}
              </span>
              <span className="tabular font-medium text-ink">
                {format(p.value)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <DataTable caption={caption} points={points} format={format} />
    </figure>
  );
}

/* -------------------------------------------------------------------------- */

/** Inline trend for stat tiles. No axes, no labels — shape only. */
export function Sparkline({
  values,
  width = 96,
  height = 28,
  tone = "accent",
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  tone?: "accent" | "success" | "danger" | "muted";
  className?: string;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);

  const stroke = {
    accent: "var(--color-accent)",
    success: "var(--color-success-strong)",
    danger: "var(--color-danger)",
    muted: "var(--color-faint)",
  }[tone];

  const d = values
    .map((v, i) => {
      const x = i * stepX;
      const y = 2 + (1 - (v - min) / span) * (height - 4);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Conversion across ordered stages — how many of the people who entered made
 * it this far. It is NOT a picture of who is sitting in each stage right now:
 * current occupancy is not monotonic, so use BarChart for that.
 *
 * Width is normalised to the largest value rather than the first, so a bar can
 * never overflow its track if the data is passed in unsorted, and the drop-off
 * figure is only shown where the sequence actually falls.
 */
export function FunnelChart({
  stages,
  caption,
  className,
}: {
  stages: { label: string; value: number }[];
  caption: string;
  className?: string;
}) {
  const top = Math.max(...stages.map((s) => s.value), 1);

  return (
    <figure className={cn("min-w-0", className)}>
      <ol className="flex flex-col gap-2" aria-hidden="true">
        {stages.map((stage, i) => {
          const pct = (stage.value / top) * 100;
          const dropoff =
            i > 0 && stages[i - 1].value > 0
              ? Math.round((1 - stage.value / stages[i - 1].value) * 100)
              : null;
          return (
            <li key={stage.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="text-body-sm text-body">
                  {stage.label}
                </span>
                <span className="flex items-baseline gap-2">
                  <span className="tabular text-body-sm font-medium text-ink">
                    {stage.value}
                  </span>
                  {dropoff !== null && dropoff > 0 && (
                    <span className="tabular text-meta text-muted">
                      −{dropoff}%
                    </span>
                  )}
                </span>
              </div>
              <div className="h-6 overflow-hidden rounded-sm bg-sunken">
                <div
                  className="h-full rounded-sm transition-[width] duration-500 ease-[var(--ease-out-soft)]"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: SERIES[i % SERIES.length],
                    opacity: 0.85,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <DataTable
        caption={caption}
        points={stages}
        format={(n) => n.toLocaleString()}
      />
    </figure>
  );
}
