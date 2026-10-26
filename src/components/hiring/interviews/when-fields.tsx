"use client";

import { Field, FieldRow, Input } from "@/components/ui";
import { weekdayIn, formatDate, instantFromWall, zoneLabel } from "@/lib/time";
import { candidateSees } from "@/lib/hiring/interviews/words";

/**
 * The day and the time of an interview, on the company's clock.
 *
 * ## Whose clock
 *
 * A time typed into a form means "on the company's clock", never "on the clock of the
 * laptop it is typed on": two people booking the same interview from different countries
 * would otherwise book two different moments. So the zone is named **next to the time**
 * (`10:00 · Lagos time (WAT)`) and the instant sent is made from that zone, whatever the
 * browser thinks it is.
 *
 * ## The shared `Input`, and a row that stacks
 *
 * A native date or time control in iPhone Safari will not shrink inside a grid cell
 * unless the row says so, so the two sit in a `FieldRow` that is one column on a phone and
 * two from `sm` up. Both are the shared `Input`.
 */

export function WhenFields({
  day,
  time,
  onDay,
  onTime,
  timeZone,
  dayError,
  timeError,
}: {
  day: string;
  time: string;
  onDay: (value: string) => void;
  onTime: (value: string) => void;
  timeZone: string;
  dayError?: string | null | undefined;
  timeError?: string | null | undefined;
}) {
  const zone = zoneLabel(timeZone);
  return (
    <FieldRow>
      <Field label="Date" required {...(dayError ? { error: dayError } : {})}>
        <Input
          type="date"
          value={day}
          onChange={(event) => onDay(event.currentTarget.value)}
        />
      </Field>
      <Field label="Time" required {...(timeError ? { error: timeError } : {})}>
        <Input
          type="time"
          value={time}
          onChange={(event) => onTime(event.currentTarget.value)}
        />
        <p className="tabular text-meta text-muted">
          {time ? `${time} · ${zone}` : zone}
        </p>
      </Field>
    </FieldRow>
  );
}

/**
 * "The candidate will see: Tuesday 20 October 2026 at 10:00, Lagos time (WAT), for 60
 * minutes, online." Said once the day and the time make a real moment, and not before.
 */
export function WhatTheyWillSee({
  day,
  time,
  timeZone,
  durationMins,
  location,
  online,
}: {
  day: string;
  time: string;
  timeZone: string;
  durationMins: number | null;
  location: string | null;
  online: boolean;
}) {
  const iso = day && time ? instantFromWall(day, time, timeZone) : null;
  if (!iso) return null;
  return (
    <p className="rounded-md bg-sunken px-3 py-2 text-body-sm text-body">
      <span className="font-medium text-ink">The candidate will see: </span>
      {candidateSees({
        weekday: weekdayIn(iso, timeZone),
        date: formatDate(iso, timeZone),
        time,
        zone: zoneLabel(timeZone),
        durationMins,
        location,
        online,
      })}
    </p>
  );
}
