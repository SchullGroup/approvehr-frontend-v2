import { describe, expect, it } from "vitest";
import { balanceWeights, splitEvenly } from "@/lib/performance/setup-weights";

describe("splitEvenly", () => {
  it("always adds up to exactly 100", () => {
    for (const n of [1, 2, 3, 4, 6, 7]) {
      const sources = [
        "OBJECTIVES",
        "TASKS",
        "CORE_COMPETENCY",
        "BEHAVIOURAL_COMPETENCY",
        "LEADERSHIP",
        "MANAGER_APPRAISAL",
        "SELF_ASSESSMENT",
      ].slice(0, n) as never[];
      const total = Object.values(splitEvenly(sources)).reduce(
        (a, b) => a + (b ?? 0),
        0,
      );
      expect(total).toBe(100);
    }
  });
  it("gives the remainder to the first parts", () => {
    expect(splitEvenly(["OBJECTIVES", "TASKS", "CORE_COMPETENCY"])).toEqual({
      OBJECTIVES: 34,
      TASKS: 33,
      CORE_COMPETENCY: 33,
    });
  });
});

describe("balanceWeights", () => {
  const four = [
    "OBJECTIVES",
    "CORE_COMPETENCY",
    "BEHAVIOURAL_COMPETENCY",
    "LEADERSHIP",
  ] as never[];
  const total = (shares: Record<string, number | undefined>) =>
    Object.values(shares).reduce<number>((sum, one) => sum + (one ?? 0), 0);

  it("gives the last part what the others leave, so the total is always 100", () => {
    const shares = balanceWeights(four, {
      OBJECTIVES: "45",
      CORE_COMPETENCY: "25",
      BEHAVIOURAL_COMPETENCY: "15",
    });
    expect(shares).toEqual({
      OBJECTIVES: 45,
      CORE_COMPETENCY: 25,
      BEHAVIOURAL_COMPETENCY: 15,
      LEADERSHIP: 15,
    });
    expect(total(shares)).toBe(100);
  });

  it("holds a part to what is left, and the last then has nothing", () => {
    const shares = balanceWeights(four, {
      OBJECTIVES: "70",
      CORE_COMPETENCY: "70",
      BEHAVIOURAL_COMPETENCY: "70",
    });
    expect(shares).toEqual({
      OBJECTIVES: 70,
      CORE_COMPETENCY: 30,
      BEHAVIOURAL_COMPETENCY: 0,
      LEADERSHIP: 0,
    });
    expect(total(shares)).toBe(100);
  });

  it("reads a blank, a minus or text as 0, and rounds to a whole number", () => {
    const shares = balanceWeights(four, {
      OBJECTIVES: "",
      CORE_COMPETENCY: "-5",
      BEHAVIOURAL_COMPETENCY: "12.6",
    });
    expect(shares).toEqual({
      OBJECTIVES: 0,
      CORE_COMPETENCY: 0,
      BEHAVIOURAL_COMPETENCY: 13,
      LEADERSHIP: 87,
    });
  });

  it("gives a single part the whole 100, and nothing for no parts", () => {
    expect(balanceWeights(["OBJECTIVES"], { OBJECTIVES: "10" })).toEqual({
      OBJECTIVES: 100,
    });
    expect(balanceWeights([], {})).toEqual({});
  });

  it("adds up to 100 whatever is typed", () => {
    for (const typed of ["0", "33", "50", "99", "100", "250"]) {
      const shares = balanceWeights(four, {
        OBJECTIVES: typed,
        CORE_COMPETENCY: typed,
        BEHAVIOURAL_COMPETENCY: typed,
      });
      expect(total(shares)).toBe(100);
    }
  });
});
