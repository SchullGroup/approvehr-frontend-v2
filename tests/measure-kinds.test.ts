import { describe, expect, it } from "vitest";
import { goalFacts } from "@/app/(app)/performance/goal-facts";
import {
  averageProgressHint,
  measureAddedSaid,
  progressLabel,
  readCountLine,
  readCountShort,
} from "@/app/(app)/performance/objective-copy";
import {
  hasNoReading,
  isDoneMeasure,
  isUnread,
  readCount,
  type ApiGoal,
} from "@/lib/api/performance";

/**
 * What a measure is, and whether anybody has read it.
 *
 * The rule under all of it is absent-is-not-zero: a measure nobody has read is
 * not a measure at 0%, and a server that does not say (one that predates the
 * `lastReadAt` column) is not a server where nothing has been read. Each of these
 * satisfies every type in the codebase, because `lastReadAt: string | null |
 * undefined` is a perfectly good type for all three readings, so only a test can
 * keep them apart.
 */

describe("a measure's kind", () => {
  it("is done-or-not-done only when the server says so", () => {
    expect(isDoneMeasure({ kind: "DONE" })).toBe(true);
    expect(isDoneMeasure({ kind: "NUMBER" })).toBe(false);
  });

  it("is a number when the server does not say, as it always was", () => {
    expect(isDoneMeasure({})).toBe(false);
  });
});

describe("whether a measure has been read", () => {
  it("is unread when the server says no reading was ever entered", () => {
    expect(isUnread({ lastReadAt: null })).toBe(true);
  });

  it("is read when the server gives a date", () => {
    expect(isUnread({ lastReadAt: "2026-10-01T09:00:00.000Z" })).toBe(false);
  });

  it("is not called unread by a server that does not say", () => {
    /* Calling these unread would tell every user of an older server that nothing
       they track has been read. */
    expect(isUnread({})).toBe(false);
  });
});

describe("how many of an objective's measures are read", () => {
  const read = { lastReadAt: "2026-10-01T09:00:00.000Z" };
  const unread = { lastReadAt: null };

  it("says nothing when every one is read, so the line is a warning when it appears", () => {
    expect(readCount([read, read, read])).toBeNull();
  });

  it("counts the read ones against all of them", () => {
    expect(readCount([read, unread, unread])).toEqual({ read: 1, of: 3 });
  });

  it("counts none as none, which is not the same as saying nothing", () => {
    expect(readCount([unread, unread])).toEqual({ read: 0, of: 2 });
  });

  it("says nothing for an objective with no measures", () => {
    expect(readCount([])).toBeNull();
  });

  it("makes no claim when any measure comes from a server that does not say", () => {
    expect(readCount([read, {}])).toBeNull();
    expect(readCount([unread, {}])).toBeNull();
  });
});

describe("whether nothing has been recorded on a measure", () => {
  it("takes the server's word that it has not been", () => {
    expect(
      hasNoReading({ lastReadAt: null, startValue: "0", currentValue: "0" }),
    ).toBe(true);
  });

  it("treats a reading of the starting figure as a reading", () => {
    /* The inference this screen was built on (a figure equal to where it began
       means nothing was recorded) is not exact: 0 can be the honest answer. */
    expect(
      hasNoReading({
        lastReadAt: "2026-10-01T09:00:00.000Z",
        startValue: "0",
        currentValue: "0",
      }),
    ).toBe(false);
  });

  it("falls back to the old inference on a server that does not say", () => {
    expect(hasNoReading({ startValue: "5", currentValue: "5" })).toBe(true);
    expect(hasNoReading({ startValue: "5", currentValue: "6" })).toBe(false);
  });
});

describe("what the face of a card says about its figure", () => {
  const goal = (lastReadAt: (string | null)[]): ApiGoal =>
    ({
      id: "g-1",
      title: "Grow the team",
      level: "personal",
      status: "ON_TRACK",
      approval: "DRAFT",
      ownerId: "emp-1",
      dueQuarter: "2026-Q4",
      reviewCycleId: null,
      progress: 0,
      measuredProgress: null,
      keyResults: lastReadAt.map((at, index) => ({
        id: `m-${String(index)}`,
        lastReadAt: at,
      })),
    }) as unknown as ApiGoal;
  const stamp = "2026-10-22T09:00:00.000Z";

  it("carries how many measures are read, so the card and the window cannot differ", () => {
    expect(goalFacts(goal([null, null]), "emp-1").reads).toEqual({
      read: 0,
      of: 2,
    });
    expect(goalFacts(goal([stamp, null, null]), "emp-1").reads).toEqual({
      read: 1,
      of: 3,
    });
  });

  it("has nothing to say when every measure is read, or there are none", () => {
    expect(goalFacts(goal([stamp, stamp]), "emp-1").reads).toBeNull();
    expect(goalFacts(goal([]), "emp-1").reads).toBeNull();
  });

  it("puts the count where the 0% would have been, in four words", () => {
    expect(readCountShort({ read: 0, of: 3 })).toBe("No reading yet");
    expect(readCountShort({ read: 1, of: 3 })).toBe("1 of 3 read");
  });
});

describe("the caption under the average", () => {
  it("counts only the objectives the average was taken over", () => {
    expect(averageProgressHint(5, 6)).toBe(
      "across 5 of 6 KPIs, the rest not read yet",
    );
  });

  it("is the plain count when every objective contributes", () => {
    expect(averageProgressHint(6, 6)).toBe("across 6 KPIs");
    expect(averageProgressHint(1, 1)).toBe("across 1 KPI");
  });

  it("says nothing has been read, rather than leaving a bare dash, when none has", () => {
    expect(averageProgressHint(0, 3)).toBe("nothing read yet");
  });

  it("adds nothing when nothing is tracked at all", () => {
    expect(averageProgressHint(0, 0)).toBeNull();
  });
});

describe("what is said under an objective's progress", () => {
  it("says a bar with nothing read is not a result", () => {
    expect(readCountLine({ read: 0, of: 3 })).toBe(
      "0 of 3 measures read. Nothing is counted yet, so the figure above is not a result.",
    );
  });

  it("does not say '0 of 1 measures' for an objective with one measure", () => {
    expect(readCountLine({ read: 0, of: 1 })).toBe(
      "Its measure has not been read. Nothing is counted yet, so the figure above is not a result.",
    );
  });

  it("says the unread ones are left out, when some are read", () => {
    expect(readCountLine({ read: 1, of: 3 })).toBe(
      "1 of 3 measures read. The others are left out of the figure above until somebody enters a reading.",
    );
  });

  it("labels the bar by what it is made of, not by how many measures there are", () => {
    expect(progressLabel(0, null)).toBe("Progress, entered by hand");
    expect(progressLabel(1, null)).toBe("Progress, from 1 measure");
    expect(progressLabel(3, null)).toBe("Progress, from 3 measures");
    /* "From 3 measures" would be false while two of them are left out. */
    expect(progressLabel(3, { read: 1, of: 3 })).toBe(
      "Progress, from the measures read so far",
    );
    expect(progressLabel(3, { read: 0, of: 3 })).toBe(
      "Progress, nothing read yet",
    );
  });
});

describe("the toast when a measure is added", () => {
  const number = {
    label: "Customers",
    unit: "customers",
    startValue: "1000",
    targetValue: "5000",
    lowerIsBetter: false,
  };

  it("says a done-or-not-done measure counts as not done until it is confirmed", () => {
    const said = measureAddedSaid(
      {
        label: "Both engineers hired",
        unit: null,
        startValue: "0",
        targetValue: "1",
        lowerIsBetter: false,
        kind: "DONE",
        lastReadAt: "2026-10-23T09:00:00.000Z",
      },
      "Grow the team",
    );
    expect(said.title).toBe('"Both engineers hired" added to "Grow the team"');
    expect(said.detail).toBe(
      "Done or not done. It counts as not done until it is confirmed.",
    );
  });

  it('never reads the 0 and 1 the server keeps for it as "0 to 1"', () => {
    const said = measureAddedSaid({
      ...number,
      unit: null,
      startValue: "0",
      targetValue: "1",
      kind: "DONE",
    });
    expect(said.detail).not.toMatch(/0 to 1/);
  });

  it("says a number added with no reading is left out until it has one", () => {
    const said = measureAddedSaid({
      ...number,
      kind: "NUMBER",
      lastReadAt: null,
    });
    expect(said.detail).toBe(
      "1,000 customers to 5,000 customers. No reading yet, so it is left out of progress until there is one.",
    );
  });

  it("carries the figures alone for a number that was read", () => {
    const said = measureAddedSaid({
      ...number,
      kind: "NUMBER",
      lastReadAt: "2026-10-23T09:00:00.000Z",
    });
    expect(said.detail).toBe("1,000 customers to 5,000 customers.");
  });

  it("makes no claim about a reading on a server that does not say", () => {
    expect(measureAddedSaid(number).detail).toBe(
      "1,000 customers to 5,000 customers.",
    );
  });
});
