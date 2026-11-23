import { describe, expect, it } from "vitest";
import { splitEvenly } from "@/lib/performance/setup-weights";

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
