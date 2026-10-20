import { describe, expect, it } from "vitest";
import { addDays, daysBetween } from "@/lib/projects/dates";
import {
  AHEAD_MONTHS,
  BACK_DAYS,
  LABEL_INSIDE_PX,
  MIN_BAR_PX,
  PX_PER_DAY,
  addMonths,
  barGeometry,
  earliestRunningLeft,
  epicBarLabel,
  epicSummary,
  firstOfMonth,
  formatDay,
  formatSpan,
  openingScroll,
  roadmapModel,
  roadmapRange,
  splitEpics,
  todayX,
  xOfDay,
} from "@/lib/projects/roadmap";
import { buildSample } from "@/lib/projects/sample";
import type { Issue } from "@/lib/projects/types";

/**
 * The roadmap's arithmetic: which epics are drawn, how wide the timeline is, and
 * the pixel a bar starts at. Every figure here is a day count times eight, so the
 * expectations are written as days and multiplied out where that is the point.
 */

const TODAY = "2026-10-15";
const NOW = "2026-10-15T12:00:00.000Z";

function sample() {
  return buildSample({
    today: TODAY,
    now: NOW,
    people: ["p-01", "p-03", "p-09", "p-04"],
  });
}

let counter = 0;
function epic(start: string | null, due: string | null, rank = 1): Issue {
  counter += 1;
  return {
    id: `e${counter}`,
    projectId: "p",
    number: counter,
    key: `X-${counter}`,
    type: "EPIC",
    title: `Epic ${counter}`,
    description: "",
    statusId: "st",
    priority: "MEDIUM",
    assigneeId: null,
    reporterId: null,
    epicId: null,
    parentId: null,
    sprintId: null,
    points: null,
    labels: [],
    startDate: start,
    dueDate: due,
    rank,
    doneAt: null,
    goalId: null,
    weeklyTask: null,
    commentCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("calendar helpers", () => {
  it("adds months and keeps to the last day of a shorter month", () => {
    expect(addMonths("2026-10-15", 3)).toBe("2027-01-15");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2027-11-30", 3)).toBe("2028-02-29");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12-10", 1)).toBe("2027-01-10");
    expect(addMonths("2026-01-10", -1)).toBe("2025-12-10");
  });

  it("leaves something that is not a day alone", () => {
    expect(addMonths("soon", 1)).toBe("soon");
    expect(firstOfMonth("soon")).toBe("soon");
  });

  it("finds the first of a month", () => {
    expect(firstOfMonth("2026-10-15")).toBe("2026-10-01");
    expect(firstOfMonth("2027-01-01")).toBe("2027-01-01");
  });

  it("writes a day without a zone, and a span with years only when they differ", () => {
    expect(formatDay("2026-09-04")).toBe("4 Sep");
    expect(formatDay("2026-09-04", true)).toBe("4 Sep 2026");
    expect(formatSpan("2026-09-11", "2026-10-29")).toBe("11 Sep – 29 Oct");
    expect(formatSpan("2026-12-20", "2027-01-14")).toBe(
      "20 Dec 2026 – 14 Jan 2027",
    );
  });
});

describe("which epics are drawn", () => {
  it("draws an epic with both dates and lists the rest as needing them", () => {
    const both = epic("2026-10-01", "2026-11-01");
    const startOnly = epic("2026-10-01", null);
    const dueOnly = epic(null, "2026-11-01");
    const neither = epic(null, null);
    const { scheduled, undated } = splitEpics([
      both,
      startOnly,
      dueOnly,
      neither,
    ]);
    expect(scheduled.map((s) => s.epic.id)).toEqual([both.id]);
    expect(undated.map((e) => e.id)).toEqual([
      startOnly.id,
      dueOnly.id,
      neither.id,
    ]);
  });

  it("orders drawn epics by start date, then by rank", () => {
    const late = epic("2026-11-01", "2026-12-01", 1);
    const earlyB = epic("2026-10-01", "2026-10-20", 5);
    const earlyA = epic("2026-10-01", "2026-10-25", 2);
    expect(
      splitEpics([late, earlyB, earlyA]).scheduled.map((s) => s.epic.id),
    ).toEqual([earlyA.id, earlyB.id, late.id]);
  });

  it("ignores anything that is not an epic", () => {
    const story = {
      ...epic("2026-10-01", "2026-10-09"),
      type: "STORY" as const,
    };
    expect(splitEpics([story])).toEqual({ scheduled: [], undated: [] });
  });

  it("draws a due date that is before its start from the earlier to the later", () => {
    const backwards = epic("2026-11-10", "2026-11-01");
    const [only] = splitEpics([backwards]).scheduled;
    expect(only).toMatchObject({ start: "2026-11-01", due: "2026-11-10" });
  });

  it("treats a date that is not a day as missing", () => {
    expect(splitEpics([epic("someday", "2026-11-01")]).undated).toHaveLength(1);
  });
});

describe("the timeline's range", () => {
  it("runs from three weeks back to three months ahead, in whole months", () => {
    const range = roadmapRange({ today: TODAY, scheduled: [] });
    /* 15 Oct less 21 days is 24 Sep, so the first month is September. Three
       months on is 15 Jan, so the last is January and the end is 1 Feb. */
    expect(BACK_DAYS).toBe(21);
    expect(AHEAD_MONTHS).toBe(3);
    expect(range.start).toBe("2026-09-01");
    expect(range.end).toBe("2027-02-01");
    expect(range.days).toBe(30 + 31 + 30 + 31 + 31);
    expect(range.width).toBe(range.days * PX_PER_DAY);
    expect(range.months.map((m) => m.label)).toEqual([
      "Sep 2026",
      "Oct",
      "Nov",
      "Dec",
      "Jan 2027",
    ]);
  });

  it("places each month at its own pixel and sizes it by its length", () => {
    const { months } = roadmapRange({ today: TODAY, scheduled: [] });
    expect(months.map((m) => m.x)).toEqual([
      0,
      30 * PX_PER_DAY,
      61 * PX_PER_DAY,
      91 * PX_PER_DAY,
      122 * PX_PER_DAY,
    ]);
    expect(months.map((m) => m.width / PX_PER_DAY)).toEqual([
      30, 31, 30, 31, 31,
    ]);
    /* They tile the timeline with no gap and no overlap. */
    const last = months[months.length - 1]!;
    expect(last.x + last.width).toBe(153 * PX_PER_DAY);
  });

  it("labels every January with its year", () => {
    const range = roadmapRange({ today: "2026-12-20", scheduled: [] });
    expect(range.months[0]!.label).toBe("Nov 2026");
    expect(range.months.find((m) => m.day === "2027-01-01")!.label).toBe(
      "Jan 2027",
    );
    expect(range.months.find((m) => m.day === "2027-02-01")!.label).toBe("Feb");
  });

  it("widens to take in an epic that starts before or ends after the window", () => {
    const early = { start: "2026-06-10", due: "2026-07-01" };
    const wideEarly = roadmapRange({ today: TODAY, scheduled: [early] });
    expect(wideEarly.start).toBe("2026-06-01");
    expect(wideEarly.end).toBe("2027-02-01");

    const late = { start: "2026-12-01", due: "2027-05-02" };
    const wideLate = roadmapRange({ today: TODAY, scheduled: [late] });
    expect(wideLate.start).toBe("2026-09-01");
    expect(wideLate.end).toBe("2027-06-01");
  });

  it("never narrows for an epic that sits inside the window", () => {
    const inside = { start: "2026-10-20", due: "2026-11-02" };
    expect(roadmapRange({ today: TODAY, scheduled: [inside] })).toEqual(
      roadmapRange({ today: TODAY, scheduled: [] }),
    );
  });

  it("ends on the first of a month even when the last epic ends on the last day of one", () => {
    const range = roadmapRange({
      today: TODAY,
      scheduled: [{ start: "2026-12-01", due: "2027-03-31" }],
    });
    expect(range.end).toBe("2027-04-01");
  });
});

describe("where things sit on it", () => {
  const range = roadmapRange({ today: TODAY, scheduled: [] });

  it("puts a day at eight pixels per day from the first of the range", () => {
    expect(xOfDay(range, "2026-09-01")).toBe(0);
    expect(xOfDay(range, "2026-09-02")).toBe(PX_PER_DAY);
    expect(xOfDay(range, "2026-10-15")).toBe(44 * PX_PER_DAY);
  });

  it("puts today's line in the middle of today's column", () => {
    expect(todayX(range, TODAY)).toBe(44 * PX_PER_DAY + PX_PER_DAY / 2);
  });

  it("starts a bar on its start day and ends it after its due day", () => {
    const bar = barGeometry(range, "2026-10-01", "2026-10-14");
    expect(bar.left).toBe(30 * PX_PER_DAY);
    /* Both ends are inclusive: 1 to 14 October is fourteen days. */
    expect(bar.width).toBe(14 * PX_PER_DAY);
    expect(bar.left + bar.width).toBe(xOfDay(range, "2026-10-15"));
  });

  it("makes a one-day epic one column wide, and never thinner than it can be seen", () => {
    const oneDay = barGeometry(range, "2026-10-15", "2026-10-15");
    expect(oneDay.width).toBe(Math.max(MIN_BAR_PX, PX_PER_DAY));
    expect(MIN_BAR_PX).toBeGreaterThanOrEqual(PX_PER_DAY);
  });

  it("keeps a label inside a bar only when the bar can hold it", () => {
    const row = (days: number) => ({
      width: barGeometry(range, "2026-10-01", addDays("2026-10-01", days - 1))
        .width,
    });
    expect(row(13).width >= LABEL_INSIDE_PX).toBe(false);
    expect(row(14).width >= LABEL_INSIDE_PX).toBe(true);
  });

  it("agrees with the day count between the two ends", () => {
    const { left, width } = barGeometry(range, "2026-11-03", "2026-12-18");
    expect(width / PX_PER_DAY).toBe(
      (daysBetween("2026-11-03", "2026-12-18") ?? 0) + 1,
    );
    expect(left).toBe(
      (daysBetween(range.start, "2026-11-03") ?? 0) * PX_PER_DAY,
    );
  });
});

describe("the sample project's roadmap", () => {
  const data = sample();
  const statuses = data.project.statuses;
  const epics = data.issues.filter((i) => i.type === "EPIC");
  const model = roadmapModel({
    epics,
    issues: data.issues,
    statuses,
    today: TODAY,
  });

  it("draws three epics and lists the one without dates", () => {
    expect(model.rows.map((r) => r.epic.key)).toEqual([
      "CHK-1",
      "CHK-2",
      "CHK-3",
    ]);
    expect(model.undated.map((e) => e.key)).toEqual(["CHK-4"]);
  });

  it("fills each bar by points, an issue with none counting as one, sub-tasks left out", () => {
    /* CHK-1: 5+3+3+8+3+3+3+2 = 30 points over eight issues, 5+3+3+3 = 14 done.
       The three sub-tasks that inherit this epic are not counted. */
    const [one, two, three] = model.rows;
    expect(one!.progress).toEqual({ done: 4, total: 8, ratio: 14 / 30 });
    expect(one!.percent).toBe(47);
    expect(one!.label).toBe("CHK-1 · 47%");
    expect(one!.summary).toBe("4 of 8 done");
    /* CHK-2: 5+8+2+5+1+5+2 = 28, 5+8+5+1 = 19 done. */
    expect(two!.progress).toEqual({ done: 4, total: 7, ratio: 19 / 28 });
    expect(two!.percent).toBe(68);
    /* CHK-3: nothing done. */
    expect(three!.percent).toBe(0);
    expect(three!.label).toBe("CHK-3 · 0%");
  });

  it("puts the bars at the pixel their dates give", () => {
    const [one] = model.rows;
    const first = daysBetween(model.range.start, one!.start)!;
    expect(one!.left).toBe(first * PX_PER_DAY);
    expect(one!.start).toBe(addDays(TODAY, -34));
    expect(one!.due).toBe(addDays(TODAY, 14));
    expect(one!.width).toBe((34 + 14 + 1) * PX_PER_DAY);
    expect(model.todayX).toBe(todayX(model.range, TODAY));
  });

  it("describes a bar with its dates and its count", () => {
    expect(model.rows[0]!.description).toBe(
      "CHK-1 Payments API v2, 11 Sep – 29 Oct, 4 of 8 done",
    );
  });

  it("says so when an epic has no issues, rather than showing 0%", () => {
    const lone = epic("2026-10-10", "2026-10-30");
    const alone = roadmapModel({
      epics: [lone],
      issues: [lone],
      statuses,
      today: TODAY,
    });
    expect(alone.rows[0]!.percent).toBeNull();
    expect(alone.rows[0]!.label).toBe("X-" + lone.number + " · No issues");
    expect(alone.rows[0]!.summary).toBe("No issues yet");
  });

  it("words the summary and the label", () => {
    expect(epicSummary({ done: 0, total: 0 })).toBe("No issues yet");
    expect(epicSummary({ done: 1, total: 3 })).toBe("1 of 3 done");
    expect(epicBarLabel("CHK-9", 1)).toBe("CHK-9 · 100%");
    expect(epicBarLabel("CHK-9", null)).toBe("CHK-9 · No issues");
  });
});

describe("where the scroller opens", () => {
  it("keeps today in view and clear of the name column when there is room for little else", () => {
    /* A phone: room for 190px beside the names. */
    const at = openingScroll({
      todayX: 700,
      earliestLeft: 100,
      viewWidth: 190,
    });
    expect(at).toBe(700 - (190 - 120));
    expect(700 - at).toBeGreaterThan(0);
    expect(700 - at).toBeLessThan(190);
  });

  it("opens as far left as shows the start of the epics running today", () => {
    const at = openingScroll({
      todayX: 700,
      earliestLeft: 520,
      viewWidth: 880,
    });
    expect(at).toBe(520 - 16);
  });

  it("does not open further left than today's own lead", () => {
    const at = openingScroll({
      todayX: 700,
      earliestLeft: 690,
      viewWidth: 880,
    });
    expect(at).toBe(700 - 48);
  });

  it("does not scroll past the start", () => {
    expect(openingScroll({ todayX: 30, earliestLeft: 0, viewWidth: 880 })).toBe(
      0,
    );
  });

  it("opens near today when nothing is running or the width is not known", () => {
    expect(
      openingScroll({ todayX: 700, earliestLeft: null, viewWidth: 880 }),
    ).toBe(700 - 48);
    expect(
      openingScroll({ todayX: 700, earliestLeft: 100, viewWidth: 0 }),
    ).toBe(700 - 48);
  });

  it("finds the earliest bar that today falls inside", () => {
    const rows = [
      { left: 100, width: 300 },
      { left: 250, width: 400 },
      { left: 800, width: 100 },
    ];
    expect(earliestRunningLeft(rows, 300)).toBe(100);
    expect(earliestRunningLeft(rows, 500)).toBe(250);
    expect(earliestRunningLeft(rows, 700)).toBeNull();
  });
});
