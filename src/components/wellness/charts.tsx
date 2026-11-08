import { ColumnChart, type Point } from "@/components/ui";
import { cn } from "@/lib/cn";
import { shortDate } from "@/lib/today";
import { WEEKDAY_INITIALS, type HeatCell } from "@/lib/wellness/streak";

/**
 * Two small charts of a person's own days: the week as bars, and the weeks
 * before it as a heat map.
 *
 * Both draw only what the API's summary says. A day with nothing logged is
 * absent, never zero: `WeekBars` draws it as a dashed outline (the shared
 * `ColumnChart` rule) and the heat map draws it as an empty square, which is
 * deliberately not a "missed" colour.
 */

export function WeekBars({
  points,
  todayIndex,
  format,
  caption,
  height = 160,
  className,
}: {
  points: Point[];
  /** Which column is today, drawn in green. -1 for none. */
  todayIndex: number;
  format?: (value: number) => string;
  caption: string;
  height?: number;
  className?: string;
}) {
  return (
    <ColumnChart
      points={points}
      shape="pill"
      height={height}
      {...(format ? { format } : {})}
      caption={caption}
      tones={points.map((_, index) =>
        index === todayIndex
          ? "var(--color-well-green-text)"
          : "var(--color-well-peri-text)",
      )}
      {...(className ? { className } : {})}
    />
  );
}

const LEVEL_CLASS = [
  "bg-sunken",
  "bg-well-green-text/35",
  "bg-well-green-text/55",
  "bg-well-green-text/78",
  "bg-well-green-text",
] as const;

export function HeatMap({
  columns,
  loggedCount,
  total,
  label,
  valueText,
  className,
}: {
  /** Weeks, oldest first, each Monday to Sunday. */
  columns: readonly (readonly HeatCell[])[];
  /** Days in the window with something logged. */
  loggedCount: number;
  /** Days in the window up to today. */
  total: number;
  /** `Steps`, for the summary. */
  label: string;
  /** Words a day's value for the tooltip: `8,200 steps`. */
  valueText: (value: number) => string;
  className?: string;
}) {
  return (
    <figure className={cn("mx-auto min-w-0 max-w-2xl", className)}>
      <div
        role="img"
        aria-label={`${label}, last ${String(columns.length)} weeks: logged on ${String(loggedCount)} of ${String(total)} days.`}
        className="flex gap-1.5"
      >
        <div
          aria-hidden="true"
          className="grid shrink-0 grid-rows-7 gap-1 text-meta text-muted"
        >
          {WEEKDAY_INITIALS.map((initial, index) => (
            <span
              key={index}
              className="flex items-center leading-none"
              style={{ visibility: index % 2 === 0 ? "visible" : "hidden" }}
            >
              {initial}
            </span>
          ))}
        </div>
        <div
          className="grid min-w-0 flex-1 gap-1"
          style={{
            gridTemplateColumns: `repeat(${String(columns.length)}, minmax(0, 1fr))`,
          }}
        >
          {columns.map((column, week) => (
            <div key={week} className="grid grid-rows-7 gap-1">
              {column.map((cell) => (
                <span
                  key={cell.day}
                  title={
                    cell.upcoming
                      ? undefined
                      : cell.value === null
                        ? `${shortDate(cell.day)}: nothing logged`
                        : `${shortDate(cell.day)}: ${valueText(cell.value)}`
                  }
                  className={cn(
                    "aspect-square w-full rounded-[4px]",
                    cell.upcoming
                      ? "border border-dashed border-line"
                      : LEVEL_CLASS[cell.level],
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <figcaption
        aria-hidden="true"
        className="mt-3 flex items-center justify-end gap-1.5 text-meta text-muted"
      >
        Less
        {LEVEL_CLASS.map((className, level) => (
          <span
            key={level}
            className={cn("size-3.5 rounded-[3px]", className)}
          />
        ))}
        More
      </figcaption>
    </figure>
  );
}
