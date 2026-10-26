"use client";

import { useId, useMemo, useState } from "react";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Field,
  FilterBar,
  LoadState,
  Select,
  Stat,
  StatGrid,
} from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import {
  sharePercent,
  weeklyActiveAbsent,
  type ApiWeeklyActive,
} from "@/lib/api/engagement";
import { useWeeklyActive } from "@/lib/store/engagement";
import { shortDate } from "@/lib/today";
import { useToday } from "@/lib/use-today";

/**
 * How the team used the app in a week: the pilot's measure, for HR.
 *
 * Behind `MANAGE_SETTINGS` and the company's `appOpenTracking` switch (see the
 * catalogue entry), so a plain employee and a company that has not turned it on
 * never load it. It is a **team total and nothing finer**. There is no list of
 * people and no day-by-day, and no department cut: a second cut of the same
 * people is how a withheld group is recovered by subtraction, so the API has no
 * such route and this card cannot ask for one.
 *
 * ## Below the privacy floor, no figure at all
 *
 * With fewer people counted than the floor the API sends the fact that it was
 * withheld and no number: "1 of 2 active" says what both people did. So the card
 * branches on `withheld` before it reads a figure, and the withheld card shows
 * none. The API's own sentence is behind an info icon.
 *
 * ## Percentages are rounded down
 *
 * 79.9 per cent rounds to 80 and would read as clearing a bar it missed, so the
 * share is shown to one decimal and **never rounded up** (`sharePercent`), with
 * the head count beside it so the exact figure can always be recomputed.
 *
 * ## Both readings of "three or more days" are here
 *
 * The owner has not chosen between *everybody met three days* and *the team's
 * median is three*, so the card shows the share who did and the median, and holds
 * neither against a bar. A week still in progress says so: three days cannot have
 * happened by a Tuesday, and neither reading should be judged on it.
 *
 * ## Nothing to say, nothing drawn
 *
 * Tracking switched off at the server, a permission that has since been taken
 * away, and an API without the route all draw nothing (`weeklyActiveAbsent`).
 * Nobody connected does too: there is no honest demo of how a real team used a
 * real app.
 */

const WEEKS_SHOWN = 8;

export type WeekChoice = { value: string; label: string };

const DAY_MS = 86_400_000;

function parts(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * The weeks worth asking about, newest first, as the Monday that starts each.
 *
 * Pure arithmetic on `YYYY-MM-DD` as UTC calendar days: `today` is already the
 * company's day (`useToday`), and reading the browser's clock or zone here would
 * be a second opinion about which week it is. The API takes any date in the week
 * and returns the Monday to Sunday it falls in, so the Monday is a safe value.
 */
export function recentWeeks(today: string, count = WEEKS_SHOWN): WeekChoice[] {
  const ms = parts(today);
  if (ms === null) return [];
  /* `getUTCDay` is 0 for Sunday; Monday is the start of the company's week. */
  const sinceMonday = (new Date(ms).getUTCDay() + 6) % 7;
  return Array.from({ length: count }, (_, back) => {
    const monday = new Date(ms - (sinceMonday + back * 7) * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return {
      value: monday,
      label:
        back === 0
          ? "This week"
          : back === 1
            ? "Last week"
            : `Week of ${shortDate(monday)}`,
    };
  });
}

/* -------------------------------------------------------------------- card */

export function AppUseCard() {
  const today = useToday();
  const weeks = useMemo(() => recentWeeks(today), [today]);
  const [choice, setChoice] = useState<string | null>(null);
  const fallback = weeks[0]?.value;
  /* The choice if it is still one of the weeks on offer (the list moves on at
     midnight), otherwise this week. */
  const week =
    choice !== null && weeks.some((option) => option.value === choice)
      ? choice
      : fallback;

  const read = useWeeklyActive(week, week !== undefined);

  /* Tracking off, not permitted, or no such route: not an error, and not a card. */
  if (weeklyActiveAbsent(read.error)) return null;
  /* Nobody connected, or nothing to ask about: nothing to say. */
  if (!read.loading && read.error === null && read.data === null) return null;

  const chosen = weeks.find((option) => option.value === week);
  const filtered = choice !== null && week !== fallback;

  return (
    <Card as="article" className="h-full">
      <CardHeader
        title="App use"
        level={3}
        {...(read.data
          ? { description: <WeekLine week={read.data.week} /> }
          : {})}
      />
      <CardBody className="flex flex-col gap-4">
        <FilterBar
          applied={
            filtered && chosen
              ? [
                  {
                    label: "Week",
                    value: chosen.label,
                    onClear: () => setChoice(null),
                  },
                ]
              : []
          }
        >
          <Field label="Week">
            <Select
              value={week ?? ""}
              onChange={(event) => setChoice(event.target.value)}
            >
              {weeks.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </FilterBar>

        <LoadState
          loading={read.loading}
          error={read.error}
          subject="app use"
          onRetry={read.reload}
          hasData={read.data !== null}
          skeleton="stats"
        >
          {read.data && <Figures data={read.data} />}
        </LoadState>
      </CardBody>
    </Card>
  );
}

/** The dates the figures are for, with what they count behind an info icon. */
function WeekLine({ week }: { week: ApiWeeklyActive["week"] }) {
  const id = useId();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>
        {shortDate(week.start)} to {shortDate(week.end)}
      </span>
      {!week.complete && (
        <Badge size="sm">In progress, day {week.daysElapsed} of 7</Badge>
      )}
      <InfoTooltip
        id={id}
        label="What this counts"
        text="People in post that week who opened the app on at least one day. You see team totals only, never one person's days."
      />
    </span>
  );
}

function Figures({ data }: { data: ApiWeeklyActive }) {
  const id = useId();
  if (data.withheld) {
    /* No figure at all. The API sent none, and a zero here would say something
       about a group too small to be described. */
    return (
      <p className="inline-flex flex-wrap items-center gap-2 text-body-sm text-muted">
        <span>Not shown: fewer than {data.floor} people counted.</span>
        <InfoTooltip id={id} label="Why not shown" text={data.note} />
      </p>
    );
  }
  return (
    <StatGrid columns={3}>
      <Stat
        label="Opened the app"
        value={sharePercent(data.weeklyActive.share)}
        hint={`${data.weeklyActive.people} of ${data.peopleCounted} people`}
      />
      <Stat
        label="3 or more days"
        value={sharePercent(data.threeOrMoreDays.share)}
        hint={`${data.threeOrMoreDays.people} of ${data.peopleCounted} people`}
      />
      <Stat
        label="Median days"
        value={String(data.medianDaysPerPerson)}
        hint="Days opened per person"
      />
    </StatGrid>
  );
}
