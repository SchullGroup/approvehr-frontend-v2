import { describe, expect, it } from "vitest";
import { goesDown, measureProblems } from "@/lib/performance/measure-problems";

/**
 * A target's direction is read from its two figures. The "Add a target" dialog
 * leaves `countDown` out and sends what `goesDown` says; the new-objective
 * wizard still asks, and still refuses a target on the wrong side of its start.
 */

describe("goesDown", () => {
  it("is down when the target is below the start", () => {
    expect(goesDown("40", "20")).toBe(true);
    expect(goesDown("0", "-5")).toBe(true);
  });

  it("is up when the target is above the start, or they are the same", () => {
    expect(goesDown("0", "10")).toBe(false);
    expect(goesDown("5", "5")).toBe(false);
  });

  it("reads a blank start as 0", () => {
    expect(goesDown("", "10")).toBe(false);
    expect(goesDown("  ", "-1")).toBe(true);
  });
});

describe("measureProblems", () => {
  const number = { kind: "NUMBER" as const, label: "Offers" };

  it("has nothing to say about direction when it is not asked", () => {
    expect(measureProblems({ ...number, start: "40", target: "20" })).toEqual(
      {},
    );
    expect(measureProblems({ ...number, start: "0", target: "10" })).toEqual(
      {},
    );
  });

  it("still refuses the same figure, asked or not", () => {
    const same = { ...number, start: "5", target: "5" };
    expect(measureProblems(same).target).toMatch(/same as the starting/);
    expect(measureProblems({ ...same, countDown: true }).target).toMatch(
      /same as the starting/,
    );
  });

  it("still refuses a target on the wrong side where somebody ticked a box", () => {
    expect(
      measureProblems({
        ...number,
        start: "40",
        target: "20",
        countDown: false,
      }).target,
    ).toMatch(/Tick the box/);
    expect(
      measureProblems({ ...number, start: "0", target: "10", countDown: true })
        .target,
    ).toMatch(/counts down/);
  });

  it("asks for a name and a number", () => {
    expect(
      measureProblems({ ...number, label: "", start: "0", target: "" }),
    ).toEqual({
      label: "Name what is being measured.",
      target: "Set the number you are aiming at.",
    });
  });
});
