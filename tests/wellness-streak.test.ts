import { describe, expect, it } from "vitest";
import type { ApiSummary, WellnessMetric } from "@/lib/api/wellness";
import { addDays } from "@/lib/projects/dates";
import {
  bestDay,
  daysAgoText,
  heatGrid,
  lastRun,
  loggedDays,
  mondayOf,
  streakOf,
  weekDots,
} from "@/lib/wellness/streak";

/**
 * A person's own run of days, derived from their own summary and nothing else.
 *
 * What these pin is the tone as much as the arithmetic: a run is days on which
 * something was logged, an empty today does not break it (the day is not over),
 * and when a run has ended the answer is zero and the last run, never a loss.
 */

/** A Friday. Monday is 2026-11-02, Sunday 2026-11-08. */
const TODAY = "2026-11-06";
const FROM = addDays(TODAY, -90);

const summary = (
  rows: { day: string; metric?: WellnessMetric; total?: number }[],
): ApiSummary => ({
  from: FROM,
  to: TODAY,
  days: rows.map((row) => ({
    day: row.day,
    metric: row.metric ?? "STEPS",
    total: row.total ?? 1000,
  })),
});

const run = (endingOn: string, length: number) =>
  Array.from({ length }, (_, index) => ({ day: addDays(endingOn, -index) }));

describe("mondayOf", () => {
  it("is the Monday of the week, for a Sunday and for a Monday too", () => {
    expect(mondayOf("2026-11-06")).toBe("2026-11-02");
    expect(mondayOf("2026-11-08")).toBe("2026-11-02");
    expect(mondayOf("2026-11-02")).toBe("2026-11-02");
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
  });
});

describe("the streak", () => {
  it("counts the days in a row ending today", () => {
    const days = loggedDays(summary(run(TODAY, 5)));
    expect(streakOf(days, TODAY, FROM)).toEqual({
      days: 5,
      includesToday: true,
      capped: false,
    });
  });

  it("is not broken by a today with nothing in it yet: the day is not over", () => {
    const days = loggedDays(summary(run(addDays(TODAY, -1), 4)));
    expect(streakOf(days, TODAY, FROM)).toEqual({
      days: 4,
      includesToday: false,
      capped: false,
    });
  });

  it("counts a day on which either metric was logged", () => {
    const days = loggedDays(
      summary([
        { day: TODAY, metric: "WATER_ML" },
        { day: addDays(TODAY, -1), metric: "STEPS" },
      ]),
    );
    expect(streakOf(days, TODAY, FROM).days).toBe(2);
  });

  it("is zero once a run has ended, and says nothing about what was lost", () => {
    const days = loggedDays(summary(run(addDays(TODAY, -3), 12)));
    const streak = streakOf(days, TODAY, FROM);
    expect(streak.days).toBe(0);
    expect(lastRun(days, TODAY, FROM)).toEqual({
      days: 12,
      endedOn: addDays(TODAY, -3),
    });
  });

  it("is zero, with no last run, for somebody who has logged nothing", () => {
    const days = loggedDays(summary([]));
    expect(streakOf(days, TODAY, FROM).days).toBe(0);
    expect(lastRun(days, TODAY, FROM)).toBeNull();
  });

  it("says when it reaches back to the start of what it looked at, so it can be longer", () => {
    const days = loggedDays(summary(run(TODAY, 200)));
    const streak = streakOf(days, TODAY, FROM);
    expect(streak.capped).toBe(true);
    expect(streak.days).toBeGreaterThanOrEqual(90);
  });
});

describe("the week's dots", () => {
  it("run Monday to Sunday, mark today, and call a day after today not yet", () => {
    const dots = weekDots(loggedDays(summary([{ day: "2026-11-03" }])), TODAY);
    expect(dots.map((dot) => dot.initial).join("")).toBe("MTWTFSS");
    expect(dots[0]?.day).toBe("2026-11-02");
    expect(dots.find((dot) => dot.isToday)?.name).toBe("Friday");
    expect(dots[1]?.logged).toBe(true);
    expect(dots.filter((dot) => dot.upcoming).map((dot) => dot.name)).toEqual([
      "Saturday",
      "Sunday",
    ]);
  });
});

describe("the heat map", () => {
  it("is thirteen weeks of seven days, Monday at the top, ending in this week", () => {
    const grid = heatGrid(summary([]), "STEPS", TODAY, 13);
    expect(grid.columns).toHaveLength(13);
    expect(grid.columns.every((column) => column.length === 7)).toBe(true);
    expect(grid.columns[12]?.[0]?.day).toBe("2026-11-02");
    expect(grid.columns[12]?.[6]?.upcoming).toBe(true);
    expect(grid.columns[0]?.[0]?.day).toBe("2026-08-10");
  });

  it("draws a day with nothing as level 0, and levels against the person's own best", () => {
    const grid = heatGrid(
      summary([
        { day: "2026-11-02", total: 12000 },
        { day: "2026-11-03", total: 6000 },
        { day: "2026-11-04", total: 1000 },
      ]),
      "STEPS",
      TODAY,
      13,
    );
    const week = grid.columns[12] ?? [];
    expect(grid.max).toBe(12000);
    expect(week[0]?.level).toBe(4);
    expect(week[1]?.level).toBe(2);
    expect(week[2]?.level).toBe(1);
    expect(week[3]?.level).toBe(0);
    expect(week[3]?.value).toBeNull();
    expect(grid.loggedCount).toBe(3);
  });

  it("looks at one metric only", () => {
    const grid = heatGrid(
      summary([{ day: "2026-11-02", metric: "WATER_ML", total: 500 }]),
      "STEPS",
      TODAY,
      13,
    );
    expect(grid.loggedCount).toBe(0);
  });
});

describe("the mark an arc is drawn against", () => {
  it("is the person's own best day in the weeks before today, and never today", () => {
    const answer = summary([
      { day: TODAY, total: 99999 },
      { day: addDays(TODAY, -2), total: 8000 },
      { day: addDays(TODAY, -9), total: 14200 },
      { day: addDays(TODAY, -40), total: 30000 },
    ]);
    expect(bestDay(answer, "STEPS", addDays(TODAY, -28), TODAY)).toEqual({
      day: addDays(TODAY, -9),
      value: 14200,
    });
  });

  it("is absent, not zero, when there is no earlier day to compare with", () => {
    expect(
      bestDay(summary([{ day: TODAY }]), "STEPS", addDays(TODAY, -28), TODAY),
    ).toBeNull();
  });
});

describe("daysAgoText", () => {
  it("words the distance kindly", () => {
    expect(daysAgoText("2026-11-05", TODAY)).toBe("yesterday");
    expect(daysAgoText("2026-11-03", TODAY)).toBe("3 days ago");
    expect(daysAgoText("2026-10-09", TODAY)).toBe("4 weeks ago");
  });
});
