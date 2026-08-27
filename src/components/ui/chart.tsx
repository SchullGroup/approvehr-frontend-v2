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

/**
 * One reading.
 *
 * **`value` may be `null`, and `null` is not zero.** It means nothing was
 * recorded for this label — a month with no payroll run, a day nobody's
 * attendance was tracked, a cycle where nobody was scored. Every chart below
 * renders it as a *gap*, never as a point on the floor.
 *
 * That distinction is not stylistic. This codebase has a documented incident
 * where a whole company was paid ₦0 because "no attendance rows" was read as
 * "nobody came in", and a line drawn down to the axis for a missing month makes
 * exactly that claim — more persuasively than a number would, because a shape
 * reads as evidence.
 */
export type Point = { label: string; value: number | null };

/** The readings that exist. Every chart measures its scale against these. */
const recorded = (points: readonly Point[]): number[] =>
  points.flatMap((p) => (p.value === null ? [] : [p.value]));

/** How many readings are missing, for the sentence under a chart. */
export const missingCount = (points: readonly Point[]): number =>
  points.filter((p) => p.value === null).length;

function niceCeiling(max: number): number {
  /* Also catches `-Infinity`, which is what `Math.max()` of an empty list
     returns — the all-null series. Callers render an absence instead, but a
     chart that computed a scale of `NaN` would draw nothing and say nothing. */
  if (!Number.isFinite(max) || max <= 0) return 1;
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
            {/* "Nothing recorded", never "0". This table is the chart for
                anybody not looking at it, and it has to make the same
                distinction the gap makes. */}
            <td>{p.value === null ? "Nothing recorded" : format(p.value)}</td>
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
  const max = niceCeiling(Math.max(...recorded(points)));
  const stepX = points.length > 1 ? w / (points.length - 1) : w;

  /**
   * Positions, with a hole where nothing was recorded.
   *
   * The x position is the label's **index**, not its position among the
   * readings that exist — so a missing March leaves March's width empty and
   * February does not slide over to touch April. Spacing by the recorded
   * points would silently redraw the time axis, which is a subtler version of
   * the same lie as plotting a zero.
   */
  const coords = points.map((p, i) =>
    p.value === null
      ? null
      : {
          x: i * stepX,
          y: padY + (1 - p.value / max) * (h - padY * 2),
        },
  );

  /* One run of consecutive readings per segment. The line is drawn per run and
     never bridges a gap, so a missing month is a break somebody can see rather
     than a straight line through data that does not exist. */
  const runs: { x: number; y: number }[][] = [];
  for (const c of coords) {
    if (c === null) {
      if (runs[runs.length - 1]?.length) runs.push([]);
      continue;
    }
    if (runs.length === 0) runs.push([]);
    runs[runs.length - 1]?.push(c);
  }
  const segments = runs.filter((run) => run.length > 0);

  const pathOf = (run: { x: number; y: number }[]) =>
    run
      .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(" ");

  /* A single reading has no line to draw, so it gets a dot. Without this a
     series of one renders as nothing at all, which reads as a broken chart
     rather than as one measurement. */
  const last = segments[segments.length - 1]?.at(-1) ?? null;

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

        {segments.map((run, i) => (
          <g key={`${String(i)}-${String(run[0]?.x ?? 0)}`}>
            {/* The fill is per run and closes to its own ends, so no gap is
                shaded. A continuous wash under a break would put area under a
                month that has no figure. */}
            {run.length > 1 && (
              <path
                d={`${pathOf(run)} L${(run.at(-1)?.x ?? 0).toFixed(1)},${h} L${(run[0]?.x ?? 0).toFixed(1)},${h} Z`}
                fill="url(#ahr-area)"
              />
            )}
            <path
              d={pathOf(run)}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* An isolated reading, between two gaps. */}
            {run.length === 1 && (
              <circle
                cx={run[0]?.x ?? 0}
                cy={run[0]?.y ?? 0}
                r="3"
                fill="var(--color-accent)"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </g>
        ))}
        {/* Emphasised endpoint — where the eye should land. */}
        {last && (
          <circle
            cx={last.x}
            cy={last.y}
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
  const max = niceCeiling(Math.max(...recorded(points)));

  return (
    <figure className={cn("min-w-0", className)}>
      <ul className="flex flex-col gap-3" aria-hidden="true">
        {points.map((p, i) => (
          <li key={p.label} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
            <span className="truncate text-body-sm text-body">
              {p.label}
            </span>
            <span
              className={cn(
                "text-body-sm",
                p.value === null
                  ? "text-muted"
                  : "tabular font-medium text-ink",
              )}
            >
              {p.value === null ? "Nothing recorded" : format(p.value)}
            </span>
            {/* An empty track, not a zero-width bar on a full one. A bar of
                width 0 and a missing reading look identical, and they are
                opposite facts — so the track itself goes dashed and the row
                says so in words beside it. */}
            <span
              className={cn(
                "col-span-2 h-2 overflow-hidden rounded-full",
                p.value === null
                  ? "border border-dashed border-line-strong"
                  : "bg-sunken",
              )}
            >
              {p.value !== null && (
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
              )}
            </span>
          </li>
        ))}
      </ul>
      <DataTable caption={caption} points={points} format={format} />
    </figure>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A distribution across an ordered scale. Vertical, and the order is the point.
 *
 * `BarChart` above is horizontal, which is right for categories — department
 * names are long and unordered, and a horizontal bar gives the label room. This
 * one is for the other case: **the labels are a scale**, low to high, and the
 * question is what shape the data makes across it. Bunched in the middle,
 * top-heavy, or split at both ends are three different situations that a
 * vertical histogram shows at a glance and a stack of horizontal bars does not.
 *
 * So the columns **never sort by size**. Sorting is right for categories and
 * would destroy the only thing this chart is for.
 *
 * `tones` colours a column by meaning rather than by series position — a score
 * band, a severity. Every column carries its value as text above it and its
 * label beneath, so the chart reads correctly in greyscale and in print, which
 * is where a distribution usually ends up.
 */
export function ColumnChart({
  points,
  tones,
  height = 180,
  format = (n) => n.toLocaleString(),
  caption,
  className,
}: {
  points: Point[];
  /** Per-column colour, by index. Omit for one accent column throughout. */
  tones?: readonly string[];
  height?: number;
  format?: (n: number) => string;
  caption: string;
  className?: string;
}) {
  const max = niceCeiling(Math.max(...recorded(points)));

  return (
    <figure className={cn("min-w-0", className)}>
      <div
        aria-hidden="true"
        className="flex items-end gap-1.5"
        style={{ height }}
      >
        {points.map((p, i) => (
          <div
            key={p.label}
            className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1"
          >
            <span className="text-center text-meta text-muted">
              {p.value === null ? "—" : format(p.value)}
            </span>
            {/* A missing reading is a dashed outline at full height, not a
                column of no height. Zero and unknown must not look alike. */}
            <span
              className={cn(
                "block rounded-t-[3px]",
                p.value === null && "border border-dashed border-line-strong",
              )}
              style={
                p.value === null
                  ? { height: "100%" }
                  : {
                      height: `${Math.max((p.value / max) * 100, p.value > 0 ? 2 : 0)}%`,
                      backgroundColor:
                        tones?.[i] ?? "var(--color-accent)",
                    }
              }
            />
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex gap-1.5">
        {points.map((p) => (
          <span
            key={p.label}
            className="min-w-0 flex-1 text-center text-meta text-muted"
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

export type Segment = { label: string; value: number; color?: string };

/**
 * Parts of one whole, as a single bar.
 *
 * The shape for "this total splits into these" where a donut would be too
 * heavy or where several of them have to be compared down a column — a leave
 * balance per type, a payslip's gross split, a day's attendance.
 *
 * ## The total is stated, not implied
 *
 * `total` is a **required** prop rather than the sum of the segments, and that
 * is the whole design. The two are usually equal and when they are not the
 * difference is the interesting part: eleven of twenty leave days accounted
 * for means nine are untaken, and a bar that silently rescaled itself to make
 * the segments fill the track would hide exactly that. Anything unaccounted
 * for renders as empty track with the remainder named.
 *
 * ## And a segment past the end is drawn past the end
 *
 * Somebody who has taken more leave than they were entitled to is a real state
 * this product has to show — `leave-screen` already writes the sentence for it.
 * Clamping the bar to 100% would render that identically to somebody who used
 * exactly their entitlement. The overflow gets its own hatched segment and the
 * caption says so.
 */
export function StackedBar({
  segments,
  total,
  format = (n) => n.toLocaleString(),
  caption,
  label,
  className,
}: {
  segments: readonly Segment[];
  /** The track. Segments are a share of this, never of their own sum. */
  total: number;
  format?: (n: number) => string;
  caption: string;
  /** Rendered above the bar. Omit inside a table row. */
  label?: string;
  className?: string;
}) {
  const used = segments.reduce((sum, seg) => sum + seg.value, 0);
  const over = Math.max(0, used - total);
  const remainder = Math.max(0, total - used);
  const scale = total > 0 ? total : used > 0 ? used : 1;

  return (
    <figure className={cn("min-w-0", className)}>
      {label && (
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-body-sm text-body">{label}</span>
          <span className="tabular text-body-sm font-medium text-ink">
            {format(used)} of {format(total)}
          </span>
        </div>
      )}

      <div
        aria-hidden="true"
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-sunken"
      >
        {segments.map((seg, i) => (
          <span
            key={seg.label}
            className="block h-full first:rounded-l-full"
            style={{
              width: `${Math.min((seg.value / scale) * 100, 100)}%`,
              backgroundColor: seg.color ?? SERIES[i % SERIES.length],
            }}
          />
        ))}
        {/* Past the end, and visibly so. Striped rather than a seventh colour:
            this is not another category, it is the same measure gone past its
            limit, and it has to read that way without the legend. */}
        {over > 0 && (
          <span
            className="block h-full"
            style={{
              width: `${Math.min((over / scale) * 100, 100)}%`,
              backgroundImage:
                "repeating-linear-gradient(45deg, var(--color-danger) 0 4px, var(--color-danger-soft) 4px 8px)",
            }}
          />
        )}
      </div>

      <ul aria-hidden="true" className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((seg, i) => (
          <li
            key={seg.label}
            className="flex items-center gap-1.5 text-meta text-muted"
          >
            <span
              className="size-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: seg.color ?? SERIES[i % SERIES.length] }}
            />
            {seg.label} {format(seg.value)}
          </li>
        ))}
        {remainder > 0 && (
          <li className="flex items-center gap-1.5 text-meta text-muted">
            <span className="size-2 shrink-0 rounded-[2px] bg-sunken ring-1 ring-inset ring-line-strong" />
            Left {format(remainder)}
          </li>
        )}
        {over > 0 && (
          <li className="text-meta font-medium text-danger-text">
            {format(over)} past the limit
          </li>
        )}
      </ul>

      <DataTable
        caption={caption}
        points={[
          ...segments.map((seg) => ({ label: seg.label, value: seg.value })),
          ...(remainder > 0 ? [{ label: "Left", value: remainder }] : []),
          ...(over > 0 ? [{ label: "Past the limit", value: over }] : []),
        ]}
        format={format}
      />
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
  /**
   * A donut refuses a missing part, and this is the one chart where that is
   * the only correct answer.
   *
   * Every other chart here can leave a gap and stay truthful, because a bar or
   * a point stands on its own. A ring does not: each arc is a share **of the
   * total**, so one unknown part makes the size of every other arc a claim
   * nobody can support. Drawing the parts that are known and quietly leaving
   * the unknown one out is worse still — it inflates all of them and the ring
   * still closes, so nothing looks wrong.
   *
   * The caller gets a sentence instead, and the `sr-only` table below still
   * lists what is known. The reader is told what is missing rather than shown
   * a shape built around it.
   */
  const missing = points.filter((p) => p.value === null);
  if (missing.length > 0) {
    return (
      <figure className={cn("min-w-0", className)}>
        <p className="rounded-md border border-dashed border-line px-3.5 py-3 text-body-sm text-muted">
          {missing.length === 1
            ? `No figure for ${missing[0]?.label}, so the shares of the rest cannot be worked out.`
            : `No figure for ${String(missing.length)} of these, so the shares of the rest cannot be worked out.`}
        </p>
        <DataTable caption={caption} points={points} format={format} />
      </figure>
    );
  }

  const total = points.reduce((sum, p) => sum + (p.value ?? 0), 0);
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;

  /* Cumulative offsets computed up front rather than accumulated during the
     map, so nothing is reassigned mid-render. */
  const fractions = points.map((p) => (total > 0 ? (p.value ?? 0) / total : 0));
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
                {/* Non-null past the refusal above — the `?? 0` narrows a type,
                    it is not a default standing in for a missing figure. */}
                {format(p.value ?? 0)}
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
