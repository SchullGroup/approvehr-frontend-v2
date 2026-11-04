"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { PersonName } from "@/components/projects/person";
import { addDays, daysBetween } from "@/lib/projects/dates";
import { formatDay } from "@/lib/projects/roadmap";
import {
  pointsAxis,
  sprintShortName,
  type Burndown,
  type VelocityRow,
  type Workload,
} from "@/lib/projects/reports";
import type { People } from "@/lib/store/project-session";

/*
 * The three charts the repo's own `ui/chart.tsx` has no shape for: a burndown
 * (a stepped line against an even pace), a velocity history (two measures per
 * sprint and an average) and a workload (people, not categories).
 *
 * Drawn the way that file draws its charts, and for the same reasons: tokens for
 * every colour so light and dark both work, no chart library, no animation (so
 * there is nothing for reduced-motion to turn off), and a visually hidden table
 * carrying the numbers for anybody not looking at the shape.
 *
 * Text is never scaled. The burndown measures the box it is in and draws in real
 * pixels, so its labels stay at the 14px floor on a phone instead of shrinking
 * with a fixed `viewBox`. The velocity and the workload are plain HTML for the
 * same reason.
 *
 * No figure is carried by hover: every number a chart shows is written on it, and
 * the same numbers are in the hidden table.
 */

/* ------------------------------------------------------------------ shared -- */

/**
 * The numbers behind a chart, as a table a screen reader can walk.
 *
 * The clip is on a wrapping `div`, not on the table — a `<table>` ignores
 * `width: 1px` and lays out at its content width, which is how a hidden table once
 * widened a whole page on a phone (see `DataTable` in `ui/chart.tsx`). `relative`
 * on the wrapper keeps the clipped box inside whatever scrolls.
 */
function SrTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: readonly string[];
  rows: readonly (readonly (string | number)[])[];
}) {
  return (
    <div className="sr-only-focusable">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row[0])}>
              {row.map((cell, index) =>
                index === 0 ? (
                  <th key={index} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={index}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The width of the box a chart sits in. `fallback` until it has been measured. */
function useChartWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const next = Math.round(el.clientWidth);
      if (next > 0) setWidth(next);
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* ---------------------------------------------------------------- burndown -- */

const HEIGHT = 272;
const PAD = { top: 30, right: 22, bottom: 38 };
/** Room for a 14px label, a gap, and the day beside it. */
const TICK_SPACING = 72;
const LABEL_CHAR_PX = 8;

type OkBurndown = Extract<Burndown, { kind: "ok" }>;

/**
 * Points left, day by day, against an even pace.
 *
 * The line steps: points do not drain away between one day and the next, they
 * drop on the day something is finished. It runs to today for a running sprint
 * (with a marker) and to the last day for a closed one, and ends on a label that
 * says how many points are left.
 */
export function BurndownChart({
  data,
  sprintName,
}: {
  data: OkBurndown;
  sprintName: string;
}) {
  const { ref, width } = useChartWidth(560);
  const W = Math.max(260, width);
  const axis = pointsAxis(data.total);
  const left = 16 + String(axis.max).length * 9;
  const iw = W - left - PAD.right;
  const ih = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) => left + (index / data.span) * iw;
  const y = (value: number) => PAD.top + ih - (value / axis.max) * ih;

  const path = data.points
    .map((point, index) =>
      index === 0
        ? `M${x(0).toFixed(1)},${y(point.remaining).toFixed(1)}`
        : `H${x(index).toFixed(1)}V${y(point.remaining).toFixed(1)}`,
    )
    .join("");
  const lastIndex = data.points.length - 1;
  const area = `${path}V${y(0).toFixed(1)}H${x(0).toFixed(1)}Z`;

  /* A label every few days, never closer than TICK_SPACING, and never past the
     sprint's last day (a one-day sprint has an axis two days wide but one date). */
  const lastDate = Math.max(0, daysBetween(data.start, data.end) ?? 0);
  const labelled = Math.max(2, Math.floor(iw / TICK_SPACING));
  const every = Math.max(1, Math.ceil(lastDate / (labelled - 1)));
  const ticks: number[] = [];
  for (let index = 0; index <= lastDate; index += every) ticks.push(index);
  const lastTick = ticks[ticks.length - 1]!;
  if (
    lastTick !== lastDate &&
    (lastDate - lastTick) * (iw / data.span) >= TICK_SPACING * 0.8
  ) {
    ticks.push(lastDate);
  }

  const end = data.points[lastIndex]!;
  const endText = `${end.remaining} left`;
  const endX = x(lastIndex);
  const flip = endX + 10 + endText.length * LABEL_CHAR_PX > W - 4;
  const endY = y(end.remaining);
  const endLabelY = endY - 12 < PAD.top - 6 ? endY + 24 : endY - 12;

  const todayAt = data.todayIndex === null ? null : x(data.todayIndex);
  const todayLabelX =
    todayAt === null ? 0 : Math.min(Math.max(todayAt, left + 24), W - 28);

  const summary =
    `${sprintName} burndown: ${end.remaining} of ${data.total} points left` +
    (data.todayIndex !== null ? " today" : " at the end");

  return (
    <figure className="min-w-0">
      <div ref={ref} className="w-full">
        <svg
          role="img"
          aria-label={summary}
          width={W}
          height={HEIGHT}
          viewBox={`0 0 ${W} ${HEIGHT}`}
          className="block max-w-full"
        >
          {axis.ticks.map((value) => (
            <g key={value}>
              <line
                x1={left}
                x2={W - PAD.right}
                y1={y(value)}
                y2={y(value)}
                stroke="var(--color-line)"
                strokeWidth="1"
              />
              <text
                x={left - 8}
                y={y(value) + 5}
                textAnchor="end"
                fontSize="14"
                fill="var(--color-muted)"
                className="tabular"
              >
                {value}
              </text>
            </g>
          ))}

          {ticks.map((index) => (
            <text
              key={index}
              x={x(index)}
              y={HEIGHT - 12}
              textAnchor={
                index === 0 ? "start" : index === lastDate ? "end" : "middle"
              }
              fontSize="14"
              fill="var(--color-muted)"
              className="tabular"
            >
              {formatDay(addDays(data.start, index))}
            </text>
          ))}

          {/* Even pace: the whole scope at the start, none at the end. */}
          <line
            x1={x(0)}
            y1={y(data.total)}
            x2={x(data.span)}
            y2={y(0)}
            stroke="var(--color-muted)"
            strokeWidth="1.5"
            strokeDasharray="5 5"
          />

          <path d={area} fill="var(--color-cat-1)" fillOpacity="0.12" />
          <path
            d={path}
            fill="none"
            stroke="var(--color-cat-1)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />

          {todayAt !== null && (
            <g>
              <line
                x1={todayAt}
                x2={todayAt}
                y1={PAD.top}
                y2={PAD.top + ih}
                stroke="var(--color-accent-text)"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              <text
                x={todayLabelX}
                y={PAD.top - 10}
                textAnchor="middle"
                fontSize="14"
                fontWeight="600"
                fill="var(--color-accent-text)"
              >
                Today
              </text>
            </g>
          )}

          <circle
            cx={endX}
            cy={endY}
            r="5"
            fill="var(--color-cat-1)"
            stroke="var(--color-surface)"
            strokeWidth="2"
          />
          <text
            x={flip ? endX - 10 : endX + 10}
            y={endLabelY}
            textAnchor={flip ? "end" : "start"}
            fontSize="14"
            fontWeight="600"
            fill="var(--color-ink)"
            stroke="var(--color-surface)"
            strokeWidth="4"
            paintOrder="stroke"
            className="tabular"
          >
            {endText}
          </text>
        </svg>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-meta text-muted">
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-0.5 w-5 rounded-full bg-cat-1"
          />
          Points left
        </li>
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-5 border-t-2 border-dashed border-muted"
          />
          Even pace
        </li>
        {data.todayIndex !== null && (
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-3.5 w-0 border-l-2 border-dashed border-accent-text"
            />
            Today
          </li>
        )}
      </ul>

      <SrTable
        caption={`${sprintName}: points left at the end of each day, against an even pace`}
        columns={["Day", "Points left", "Even pace"]}
        rows={data.points.map((point) => [
          formatDay(point.day),
          point.remaining,
          Math.round(point.ideal * 10) / 10,
        ])}
      />
    </figure>
  );
}

/* ---------------------------------------------------------------- velocity -- */

/**
 * Points committed and completed over the last sprints, one row each, with the
 * average as a line down the page.
 *
 * Rows rather than columns: a sprint's name is a phrase, and six of them side by
 * side do not fit a phone at a readable size. The committed bar is an outline and
 * the completed bar is solid, so the two read apart in greyscale as well as in
 * colour, and the figures are written at the end of each row.
 */
export function VelocityChart({
  rows,
  average,
  projectKey,
}: {
  rows: readonly VelocityRow[];
  average: number | null;
  projectKey: string;
}) {
  const known = rows.flatMap((row) => [row.committed, row.completed]);
  const max = Math.max(
    1,
    average ?? 0,
    ...known.filter((n): n is number => n !== null),
  );
  const pct = (n: number | null) => (n === null ? 0 : (n / max) * 100);
  const cols =
    "grid-cols-[6.5rem_minmax(0,1fr)_4.75rem] sm:grid-cols-[9rem_minmax(0,1fr)_5.5rem]";
  const inset =
    "left-[6.5rem] right-[4.75rem] sm:left-[9rem] sm:right-[5.5rem]";

  return (
    <figure className="min-w-0">
      <div className="relative">
        <ul aria-hidden="true" className="space-y-3.5">
          {rows.map(({ sprint, committed, completed }) => (
            <li key={sprint.id} className={cn("grid items-center", cols)}>
              <span
                title={sprint.name}
                className="truncate pr-3 text-body-sm font-medium text-ink"
              >
                {sprintShortName(sprint.name, projectKey)}
              </span>
              <span className="block space-y-1">
                <span
                  className="block h-3 rounded-sm border-2 border-faint"
                  style={{ width: `${pct(committed)}%` }}
                />
                <span
                  className="block h-3 rounded-sm bg-cat-1"
                  style={{ width: `${pct(completed)}%` }}
                />
              </span>
              <span className="tabular pl-3 text-right text-body-sm leading-tight text-ink">
                {completed === null && committed === null
                  ? "Not recorded"
                  : `${completed ?? "–"} of ${committed ?? "–"}`}
              </span>
            </li>
          ))}
        </ul>
        {average !== null && (
          <span
            aria-hidden="true"
            className={cn("pointer-events-none absolute inset-y-0", inset)}
          >
            <span
              className="absolute -inset-y-1 w-0.5 bg-ink"
              style={{ left: `${pct(average)}%` }}
            />
          </span>
        )}
      </div>

      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-meta text-muted">
        <li className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-3 w-5 rounded-sm border-2 border-faint"
          />
          Committed
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-5 rounded-sm bg-cat-1" />
          Completed
        </li>
        {average !== null && (
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-3.5 w-0.5 bg-ink" />
            Average {average} {average === 1 ? "point" : "points"}
          </li>
        )}
      </ul>

      <SrTable
        caption={`Points committed and completed in the last ${plural(rows.length, "closed sprint")}${average === null ? "" : `, averaging ${plural(average, "point")} completed`}`}
        columns={["Sprint", "Committed", "Completed"]}
        rows={rows.map(({ sprint, committed, completed }) => [
          sprint.name,
          committed ?? "Not recorded",
          completed ?? "Not recorded",
        ])}
      />
    </figure>
  );
}

/* ---------------------------------------------------------------- workload -- */

/**
 * Open work by person. Each row says its figures in words, so the list reads as
 * it is; the bar is only the shape, and is hidden from a screen reader.
 */
export function WorkloadList({
  data,
  people,
}: {
  data: Workload;
  people: People;
}) {
  return (
    <ul className="space-y-4">
      {data.rows.map((row) => {
        const value = row[data.measure];
        return (
          <li key={row.assigneeId ?? "none"}>
            <div className="flex items-center justify-between gap-3">
              <PersonName
                people={people}
                id={row.assigneeId}
                className="text-body-sm text-ink"
              />
              <span className="tabular shrink-0 text-body-sm">
                <span className="font-medium text-ink">
                  {plural(row.points, "point")}
                </span>
                <span className="text-muted">
                  {" · "}
                  {plural(row.issues, "issue")}
                </span>
              </span>
            </div>
            <span
              aria-hidden="true"
              className="mt-1.5 block h-2 overflow-hidden rounded-full bg-sunken"
            >
              <span
                className="block h-full rounded-full bg-cat-1"
                style={{
                  width:
                    value === 0
                      ? "0%"
                      : `${Math.max(2, (value / data.max) * 100)}%`,
                }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
