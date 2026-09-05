import { cn } from "@/lib/cn";

/*
 * Progress indicators. All of them expose the value as text as well as
 * geometry, so nothing depends on reading a bar or an arc.
 */

export function ProgressMeter({
  value,
  max = 100,
  label,
  showValue = true,
  tone = "accent",
  size = "md",
  className,
}: {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  tone?: "accent" | "success" | "info" | "warning" | "danger" | "ink";
  size?: "sm" | "md";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fills = {
    accent: "bg-accent",
    success: "bg-success",
    info: "bg-info",
    warning: "bg-warning",
    danger: "bg-danger",
    ink: "bg-fill-strong",
  } as const;

  /*
   * The reading rides with the label, and only with the label.
   *
   * It used to render whenever `showValue` was on, which defaults to true — so a
   * meter given no label put a bare "30%" on a line of its own above the bar,
   * left-aligned by a `justify-between` with nothing to be between. Three call
   * sites did that, and all three had already written their own label row above
   * the meter ("12 of 20 days left") and did not want a second, vaguer number
   * under it. A percentage with nothing naming it is not information, so there
   * is now nowhere for it to appear alone.
   */
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="text-body-sm font-medium text-body">{label}</span>
          {showValue && (
            <span className="tabular shrink-0 text-body-sm text-muted">
              {Math.round(pct)}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label ?? "Progress"}
        className={cn(
          "w-full overflow-hidden rounded-full bg-sunken",
          size === "sm" ? "h-1.5" : "h-2",
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out-soft",
            fills[tone],
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Circular score, used for match scores and trust scores. The number sits in
 * the middle at full contrast; the arc is supporting decoration.
 */
export function ScoreRing({
  score,
  max = 100,
  size = 64,
  label,
  caption,
  className,
}: {
  score: number;
  max?: number;
  size?: number;
  label?: string;
  caption?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, score / max));
  const stroke = size >= 56 ? 5 : 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const tone =
    pct >= 0.85
      ? "var(--color-success)"
      : pct >= 0.6
        ? "var(--color-accent)"
        : "var(--color-muted)";

  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-sunken)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={tone}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
            style={{
              transition: "stroke-dashoffset 700ms var(--ease-out-soft)",
            }}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center tabular font-semibold text-ink"
          style={{ fontSize: size >= 56 ? "1.0625rem" : "0.8125rem" }}
        >
          {Math.round(score)}
        </span>
      </div>

      {(label || caption) && (
        <div className="min-w-0">
          {label && (
            <p className="text-body-sm font-medium text-ink">{label}</p>
          )}
          {caption && (
            <p className="text-meta leading-snug text-muted">{caption}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Horizontal factor bars, used to break a match score into its inputs. */
export function FactorBars({
  factors,
  className,
}: {
  factors: { label: string; value: number; max: number }[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {factors.map((f) => {
        const pct = Math.max(0, Math.min(100, (f.value / f.max) * 100));
        return (
          <li
            key={f.label}
            className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3"
          >
            <span className="truncate text-body-sm text-body">{f.label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-sunken">
              <span
                className="block h-full rounded-full bg-accent transition-[width] duration-500 ease-out-soft"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="tabular text-right text-body-sm text-muted">
              {Math.round(f.value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
