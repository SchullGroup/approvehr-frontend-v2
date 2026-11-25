"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Numbered rating buttons on one straight line (owner, 24 Nov 2026).
 *
 * Every grading somebody has to make looks like this: 1 2 3 4 5, equal size,
 * never wrapping (on a phone they shrink and stay on the line). The names go
 * in a legend, once, above the row ("1 Unsatisfactory · 2 Below Expectations
 * …"); the legend wraps on a phone and the row does not. The names are the
 * company's own, so they follow a renamed scale. A selected number is filled;
 * arrow keys move between them (they are native radios in one group); each
 * button's name is "Rating 3, Meets Expectations".
 *
 * Scores shown after grading keep the band word and figure; this is only for
 * the act of grading.
 */
export type ScaleLevel = { level: number; label: string };

/** "1 Unsatisfactory · 2 Below Expectations · …", for the legend. */
export function legendOf(levels: readonly ScaleLevel[]): string {
  return levels.map((one) => `${String(one.level)} ${one.label}`).join(" · ");
}

export function RatingLegend({
  levels,
  className,
}: {
  levels: readonly ScaleLevel[];
  className?: string;
}) {
  return (
    <p className={cn("text-body-sm text-muted", className)}>
      {legendOf(levels)}
    </p>
  );
}

export function RatingScale({
  name,
  levels,
  value,
  onChange,
  legend = true,
  label,
  disabled = false,
  className,
}: {
  name: string;
  levels: readonly ScaleLevel[];
  value: number | null | undefined;
  onChange: (level: number) => void;
  /** False when one legend already sits at the top of the form. */
  legend?: boolean;
  /** What the group is a rating of, for assistive technology. */
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {legend && <RatingLegend levels={levels} />}
      <div
        role="radiogroup"
        {...(label ? { "aria-label": label } : {})}
        className="grid w-full gap-2"
        style={{
          gridTemplateColumns: `repeat(${String(levels.length)}, minmax(0, 1fr))`,
        }}
      >
        {levels.map((one) => {
          const inputId = `${id}-${String(one.level)}`;
          return (
            <div key={one.level} className="relative min-w-0">
              <input
                id={inputId}
                type="radio"
                name={name}
                value={String(one.level)}
                checked={value === one.level}
                disabled={disabled}
                aria-label={`Rating ${String(one.level)}, ${one.label}`}
                onChange={() => onChange(one.level)}
                className="peer sr-only"
              />
              <label
                htmlFor={inputId}
                aria-hidden="true"
                className={cn(
                  "flex h-11 min-w-0 cursor-pointer items-center justify-center rounded-md border border-line bg-surface text-body-md font-medium text-ink transition-colors hover:border-accent",
                  "peer-checked:border-accent peer-checked:bg-accent peer-checked:text-white",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                  "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
                )}
              >
                {one.level}
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
