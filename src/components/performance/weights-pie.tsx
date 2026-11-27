"use client";

import { cn } from "@/lib/cn";

/**
 * Where the mark comes from, as a donut that moves while somebody types.
 *
 * One segment per part in a fixed colour, so a part is the same colour wherever
 * it is drawn. The centre says the total: under 100 the gap is a pale
 * "not given out yet" arc, at exactly 100 there is a tick, and over 100 the
 * overflow is not drawn and one line says how much to take off. Segments resize
 * with a short ease-out transition, which a new value interrupts rather than
 * queues, and none at all under reduced motion.
 */

export type PieSlice = { id: string; label: string; percent: number };

const COLOURS = [
  "var(--color-cat-1)",
  "var(--color-cat-2)",
  "var(--color-cat-3)",
  "var(--color-cat-4)",
  "var(--color-cat-5)",
  "var(--color-cat-6)",
];

/** A part's colour, stable across the screens that draw the same parts. */
export const sliceColour = (index: number) => COLOURS[index % COLOURS.length]!;

const SIZE = 160;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export function WeightsPie({
  slices,
  className,
  fixed = false,
}: {
  slices: readonly PieSlice[];
  className?: string;
  /** A set nobody can change any more: it says what it adds up to and gives no advice. */
  fixed?: boolean;
}) {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.percent), 0);
  const over = total > 100;
  const exact = total === 100;

  const arcs = slices.map((slice, index) => {
    const before = slices
      .slice(0, index)
      .reduce((sum, one) => sum + Math.max(0, one.percent), 0);
    const start = Math.min(before, 100);
    const share = Math.max(0, Math.min(slice.percent, 100 - start));
    return { slice, index, start, share };
  });

  return (
    <figure className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg
          viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
          width={SIZE}
          height={SIZE}
          role="img"
          aria-label={`${slices
            .filter((s) => s.percent > 0)
            .map((s) => `${s.label} ${String(s.percent)}%`)
            .join(", ")}. Total ${String(total)}%.`}
          className="-rotate-90"
        >
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-sunken)"
            strokeWidth={STROKE}
          />
          {arcs.map(({ slice, index, start, share }) => (
            <circle
              key={slice.id}
              data-testid="pie-slice"
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={sliceColour(index)}
              strokeWidth={STROKE}
              strokeDasharray={`${String((share / 100) * CIRC)} ${String(CIRC)}`}
              strokeDashoffset={-(start / 100) * CIRC}
              className="transition-[stroke-dasharray,stroke-dashoffset] duration-250 ease-out motion-reduce:transition-none"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            data-testid="pie-total"
            className={cn(
              "tabular text-h3 font-semibold",
              over
                ? "text-danger-text"
                : exact
                  ? "text-success-text"
                  : "text-ink",
            )}
          >
            {total}%
          </span>
          {exact && (
            <span aria-hidden="true" className="text-success-text">
              ✓
            </span>
          )}
        </div>
      </div>
      <figcaption
        role="status"
        className={cn(
          "min-h-5 text-body-sm",
          over ? "text-danger-text" : "text-muted",
        )}
      >
        {exact
          ? ""
          : fixed
            ? `Adds up to ${String(total)}%`
            : over
              ? `Take ${String(total - 100)}% off somewhere`
              : `${String(100 - total)}% still to give out`}
      </figcaption>
    </figure>
  );
}
