"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  dayAbbrev,
  dayOfMonth,
  isWeekend,
  spokenDay,
  timesLabel,
  type ApiRota,
  type ApiRotaCell,
  type ApiRotaRow,
} from "@/lib/api/shifts";
import { colourFor, type ShiftColour } from "./palette";

/**
 * The rota: people down the side, days across, shift blocks in the cells.
 *
 * ## Keyboard
 *
 * A real `role="grid"` with a roving tabindex, which is the pattern a grid has
 * to use: giving every cell `tabIndex={0}` would put a 200-person fortnight
 * behind 2,800 tab stops. One cell is in the tab order at a time; arrows move
 * between them.
 *
 * | Key | Does |
 * |---|---|
 * | Arrows | Move one cell |
 * | Home / End | First or last day of the row |
 * | Ctrl+Home / Ctrl+End | First or last cell of the grid |
 * | Enter or Space | Open that day |
 *
 * The focused position is **clamped during render** rather than reset in an
 * effect. Changing week changes the number of columns, and a `setState` in an
 * effect body to fix that is the lint error this repo treats as an error — so
 * the stored position is kept and read through `Math.min`, which cannot go
 * stale because there is nothing to keep in step.
 *
 * ## Every cell says who, when and what
 *
 * `aria-label` on each cell is `"Grace Adeyemi, Monday 24 August — Nights,
 * 22:00 – 06:00, next day"`. Not "Nights": a cell read out of the grid's visual
 * context has to name its own row and column, or the answer to "what am I on"
 * is a shift with no date attached to it.
 *
 * ## Colour is the second signal, never the first
 *
 * Each block carries the shift's short name. See `palette.ts`.
 */
export function RotaGrid({
  rota,
  colours,
  onOpenCell,
  className,
}: {
  rota: ApiRota;
  colours: Map<string, ShiftColour>;
  /** A day was activated — by click, Enter or Space. */
  onOpenCell: (row: ApiRotaRow, date: string, cell: ApiRotaCell | null) => void;
  className?: string;
}) {
  const { days, rows } = rota;
  const [at, setAt] = useState({ row: 0, col: 0 });
  const cells = useRef(new Map<string, HTMLDivElement>());

  /* Clamped here, not corrected in an effect. See the note above. */
  const focus = {
    row: Math.min(at.row, Math.max(0, rows.length - 1)),
    col: Math.min(at.col, Math.max(0, days.length - 1)),
  };

  const register = useCallback(
    (key: string) => (node: HTMLDivElement | null) => {
      if (node) cells.current.set(key, node);
      else cells.current.delete(key);
    },
    [],
  );

  const move = useCallback(
    (row: number, col: number) => {
      const next = {
        row: Math.max(0, Math.min(row, rows.length - 1)),
        col: Math.max(0, Math.min(col, days.length - 1)),
      };
      setAt(next);
      cells.current.get(`${next.row}:${next.col}`)?.focus();
    },
    [rows.length, days.length],
  );

  const onKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    row: number,
    col: number,
  ) => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(row, col + 1),
      ArrowLeft: () => move(row, col - 1),
      ArrowDown: () => move(row + 1, col),
      ArrowUp: () => move(row - 1, col),
      Home: () =>
        event.ctrlKey || event.metaKey ? move(0, 0) : move(row, 0),
      End: () =>
        event.ctrlKey || event.metaKey
          ? move(rows.length - 1, days.length - 1)
          : move(row, days.length - 1),
    };
    const handler = keys[event.key];
    if (handler) {
      event.preventDefault();
      handler();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const target = rows[row];
      const date = days[col];
      if (target && date) onOpenCell(target, date, target.days[col] ?? null);
    }
  };

  /** "2 on Nights, 4 on Early" — the question a rota exists to answer. */
  const coverageOf = (date: string) =>
    rota.coverage.find((entry) => entry.date === date)?.shifts ?? [];

  const nameOfShift = (shiftId: string) =>
    rota.shifts.find((shift) => shift.id === shiftId)?.name ?? "a shift";

  return (
    <div className={cn("overflow-x-auto", className)}>
      <div
        role="grid"
        aria-label={`Rota, ${spokenDay(rota.from)} to ${spokenDay(rota.to)}`}
        aria-rowcount={rows.length + 1}
        aria-colcount={days.length + 1}
        className="min-w-max"
      >
        {/* Column headings, with each day's cover under the date. */}
        <div role="row" className="flex border-b border-line">
          <div
            role="columnheader"
            className="sticky left-0 z-10 w-44 shrink-0 border-r border-line bg-surface px-3 py-2 text-left text-meta font-semibold text-muted"
          >
            Person
          </div>
          {days.map((date) => {
            const cover = coverageOf(date);
            return (
              <div
                key={date}
                role="columnheader"
                aria-label={
                  cover.length > 0
                    ? `${spokenDay(date)}. ${cover
                        .map((entry) => `${entry.people} on ${nameOfShift(entry.shiftId)}`)
                        .join(", ")}`
                    : `${spokenDay(date)}. Nobody on.`
                }
                className={cn(
                  "w-[4.75rem] shrink-0 border-r border-line px-1 py-2 text-center last:border-r-0",
                  isWeekend(date) && "bg-canvas",
                )}
              >
                <span className="block text-meta font-semibold text-muted">
                  {dayAbbrev(date)}
                </span>
                <span className="tabular block text-body-sm font-semibold text-ink">
                  {dayOfMonth(date)}
                </span>
                <span className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                  {cover.map((entry) => (
                    <span
                      key={entry.shiftId}
                      className="tabular rounded-sm bg-sunken px-1 text-meta font-medium text-body"
                    >
                      {entry.people}
                      {entry.shortName}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>

        {rows.map((row, r) => (
          <div
            key={row.employeeId}
            role="row"
            className="flex border-b border-line last:border-b-0"
          >
            <div
              role="rowheader"
              className="sticky left-0 z-10 w-44 shrink-0 border-r border-line bg-surface px-3 py-1.5"
            >
              <span className="block truncate text-body-sm font-medium text-ink">
                {row.name}
              </span>
              <span className="tabular block text-meta text-faint">
                {row.employeeNo} · {row.rosteredDays}{" "}
                {row.rosteredDays === 1 ? "day" : "days"}
              </span>
            </div>

            {days.map((date, c) => {
              const cell = row.days[c] ?? null;
              const colour = colourFor(colours, cell?.shiftId ?? null);
              const isFocus = focus.row === r && focus.col === c;
              return (
                <div
                  key={date}
                  role="gridcell"
                  ref={register(`${r}:${c}`)}
                  tabIndex={isFocus ? 0 : -1}
                  aria-label={
                    cell
                      ? `${row.name}, ${spokenDay(date)} — ${cell.shiftName}, ${timesLabel(cell)}`
                      : `${row.name}, ${spokenDay(date)} — no shift`
                  }
                  onKeyDown={(event) => onKeyDown(event, r, c)}
                  onFocus={() => setAt({ row: r, col: c })}
                  onClick={() => onOpenCell(row, date, cell)}
                  className={cn(
                    "w-[4.75rem] shrink-0 cursor-pointer border-r border-line p-1 last:border-r-0",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
                    isWeekend(date) && !cell && "bg-canvas",
                  )}
                >
                  {cell ? (
                    <span
                      className={cn(
                        "flex h-9 items-center gap-1 overflow-hidden rounded-sm border pr-1",
                        colour.block,
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn("h-full w-[3px] shrink-0", colour.bar)}
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-meta font-semibold leading-tight text-ink">
                          {cell.shortName}
                        </span>
                        <span className="tabular block text-meta leading-tight text-body">
                          {cell.startTime}
                        </span>
                      </span>
                    </span>
                  ) : (
                    <span className="flex h-9 items-center justify-center text-meta text-faint">
                      —
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Which shift is which. Text and colour together, always.
 *
 * Rendered from the same map the grid reads, so the two cannot drift — which is
 * the failure a legend has: a legend built from its own list eventually names a
 * colour the grid stopped using.
 */
export function ShiftLegend({
  shifts,
  colours,
}: {
  shifts: ApiRota["shifts"];
  colours: Map<string, ShiftColour>;
}) {
  if (shifts.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {shifts.map((shift) => {
        const colour = colourFor(colours, shift.id);
        return (
          <li key={shift.id} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn("size-2.5 shrink-0 rounded-sm", colour.swatch)}
            />
            <span className="text-body-sm text-body">
              <span className="font-semibold text-ink">{shift.shortName}</span>{" "}
              {shift.name} · <span className="tabular">{timesLabel(shift)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
