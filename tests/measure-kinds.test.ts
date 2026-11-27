import { describe, expect, it } from "vitest";
import { goalFacts } from "@/app/(app)/performance/goal-facts";
import {
  measureAddedSaid,
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

describe("a target's kind", () => {
  it("is done-or-not-done only when the server says so", () => {
    expect(isDoneMeasure({ kind: "DONE" })).toBe(true);
    expect(isDoneMeasure({ kind: "NUMBER" })).toBe(false);
  });

  it("is a number when the server does not say, as it always was", () => {
    expect(isDoneMeasure({})).toBe(false);
  });
});

describe("whether a target has been read", () => {
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

describe("how many of an objective's targets are read", () => {
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

  it("says nothing for an objective with no targets", () => {
    expect(readCount([])).toBeNull();
  });

  it("makes no claim when any target comes from a server that does not say", () => {
    expect(readCount([read, {}])).toBeNull();
    expect(readCount([unread, {}])).toBeNull();
  });
});

describe("whether nothing has been recorded on a target", () => {
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

  it("carries how many targets are read, so the card and the window cannot differ", () => {
    expect(goalFacts(goal([null, null])).reads).toEqual({
      read: 0,
      of: 2,
    });
    expect(goalFacts(goal([stamp, null, null])).reads).toEqual({
      read: 1,
      of: 3,
    });
  });

  it("has nothing to say when every target is read, or there are none", () => {
    expect(goalFacts(goal([stamp, stamp])).reads).toBeNull();
    expect(goalFacts(goal([])).reads).toBeNull();
  });

  it("puts the count where the 0% would have been, in four words", () => {
    expect(readCountShort({ read: 0, of: 3 })).toBe("No reading yet");
    expect(readCountShort({ read: 1, of: 3 })).toBe("1 of 3 read");
  });
});

describe("the toast when a target is added", () => {
  const number = {
    label: "Customers",
    unit: "customers",
    startValue: "1000",
    targetValue: "5000",
    lowerIsBetter: false,
  };

  it("names the done-or-not-done target and the objective, and says no more", () => {
    const said = measureAddedSaid(
      {
        label: "Both engineers hired",
        unit: null,
        startValue: "0",
        targetValue: "1",
        lowerIsBetter: false,
        kind: "DONE",
      },
      "Grow the team",
    );
    expect(said).toEqual({
      title: '"Both engineers hired" added to "Grow the team"',
    });
  });

  it('never reads the 0 and 1 the server keeps for it as "0 to 1"', () => {
    const said = measureAddedSaid({
      ...number,
      unit: null,
      startValue: "0",
      targetValue: "1",
      kind: "DONE",
    });
    expect(said.detail).toBeUndefined();
  });

  it("carries the figures alone for a number, and says nothing of whether it was read", () => {
    const said = measureAddedSaid({ ...number, kind: "NUMBER" });
    expect(said.detail).toBe("1,000 customers to 5,000 customers.");
    expect(said.detail).not.toMatch(/reading|left out/i);
  });

  it("says a number is counting down", () => {
    const said = measureAddedSaid({
      ...number,
      startValue: "40",
      targetValue: "20",
      unit: "days",
      lowerIsBetter: true,
    });
    expect(said.detail).toBe("40 days to 20 days, counting down.");
  });
});
