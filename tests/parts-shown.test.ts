import { describe, expect, it } from "vitest";
import type {
  ApiScoringWeights,
  CycleWeights,
  ScoreComponent,
} from "@/lib/api/performance";
import { partsShown, periodWeightsLine } from "@/lib/performance/score-wording";

/**
 * Which parts a mark is made of, and what each counts for, read off the weights it
 * is made from. The Overview listed the company's current weights over a mark that
 * was made from the period's, including a part at 0% that no longer exists (F44).
 */

const LABELS: Record<ScoreComponent, string> = {
  OBJECTIVES: "Delivery against objectives",
  TASKS: "Tasks done",
  CORE_COMPETENCY: "Core competencies",
  BEHAVIOURAL_COMPETENCY: "Behavioural competencies",
  LEADERSHIP: "Leadership",
  MANAGER_APPRAISAL: "Manager appraisal",
  SELF_ASSESSMENT: "Their own rating",
};

/** The company as it is today: six parts, and Tasks done is not one of them. */
const company = (
  weightsBp: Partial<Record<ScoreComponent, number>>,
): ApiScoringWeights => ({
  source: "saved",
  rows: (Object.keys(LABELS) as ScoreComponent[]).map((component) => ({
    component,
    label: LABELS[component],
    weightBp: weightsBp[component] ?? 0,
    isPart: component in weightsBp,
  })),
  totalBp: 0,
  selfAssessmentNote: "",
});

const TODAY = company({
  OBJECTIVES: 2000,
  CORE_COMPETENCY: 2000,
  BEHAVIOURAL_COMPETENCY: 2000,
  LEADERSHIP: 1500,
  MANAGER_APPRAISAL: 1000,
  SELF_ASSESSMENT: 1500,
});

const period = (
  values: Partial<Record<ScoreComponent, number>>,
  over: Partial<CycleWeights> = {},
): CycleWeights => ({
  basis: "frozen",
  values: {
    OBJECTIVES: 0,
    TASKS: 0,
    CORE_COMPETENCY: 0,
    BEHAVIOURAL_COMPETENCY: 0,
    LEADERSHIP: 0,
    SELF_ASSESSMENT: 0,
    ...values,
  },
  ...over,
});

const shown = (result: ReturnType<typeof partsShown>) =>
  result.parts.map((part) => [part.label, part.shareBp]);

describe("the parts of a mark", () => {
  it("are the period's own, not the company's as they are now", () => {
    const result = partsShown(
      TODAY,
      period(
        {
          OBJECTIVES: 4000,
          CORE_COMPETENCY: 2500,
          BEHAVIOURAL_COMPETENCY: 2000,
          LEADERSHIP: 1500,
        },
        {
          parts: [
            "OBJECTIVES",
            "CORE_COMPETENCY",
            "BEHAVIOURAL_COMPETENCY",
            "LEADERSHIP",
          ],
        },
      ),
    );
    expect(result.from).toBe("period");
    expect(shown(result)).toEqual([
      ["Delivery against objectives", 4000],
      ["Core competencies", 2500],
      ["Behavioural competencies", 2000],
      ["Leadership", 1500],
    ]);
  });

  it("leave out a part at 0%, even one the period lists, and a part the period was not made of", () => {
    const result = partsShown(
      TODAY,
      period(
        {
          OBJECTIVES: 5000,
          TASKS: 0,
          CORE_COMPETENCY: 5000,
          SELF_ASSESSMENT: 3000,
        },
        { parts: ["OBJECTIVES", "TASKS", "CORE_COMPETENCY"] },
      ),
    );
    /* Tasks is listed and at nothing; Self-assessment has a weight and is not a
       part of this period. Neither is how this mark was made. */
    expect(shown(result)).toEqual([
      ["Delivery against objectives", 5000],
      ["Core competencies", 5000],
    ]);
  });

  it("read as shares of what is shown, so a set that is not 100% still says what each part is worth", () => {
    const result = partsShown(
      TODAY,
      period({ OBJECTIVES: 4000, CORE_COMPETENCY: 2000, LEADERSHIP: 2000 }),
    );
    expect(shown(result)).toEqual([
      ["Delivery against objectives", 5000],
      ["Core competencies", 2500],
      ["Leadership", 2500],
    ]);
  });

  it("take the period's parts from its weights when the server does not list them", () => {
    const result = partsShown(
      TODAY,
      period({ OBJECTIVES: 6000, LEADERSHIP: 4000 }),
    );
    expect(shown(result)).toEqual([
      ["Delivery against objectives", 6000],
      ["Leadership", 4000],
    ]);
  });

  it("are the company's as they are today only where the period has none to say", () => {
    const result = partsShown(TODAY, undefined);
    expect(result.from).toBe("company");
    expect(shown(result)).toEqual([
      ["Delivery against objectives", 2000],
      ["Core competencies", 2000],
      ["Behavioural competencies", 2000],
      ["Leadership", 1500],
      ["Manager appraisal", 1000],
      ["Their own rating", 1500],
    ]);
  });

  it("never list a source the company has no part for, or a part at 0%, in the company's own set", () => {
    const result = partsShown(
      company({ OBJECTIVES: 6000, TASKS: 0, LEADERSHIP: 4000 }),
      undefined,
    );
    /* Tasks done is in the rows at 0% and is a part: not listed. */
    expect(shown(result)).toEqual([
      ["Delivery against objectives", 6000],
      ["Leadership", 4000],
    ]);
  });

  it("name a part as the company names it, and the part itself where the company is not loaded", () => {
    expect(
      partsShown(TODAY, period({ OBJECTIVES: 10000 })).parts[0]?.label,
    ).toBe("Delivery against objectives");
    expect(
      partsShown(null, period({ OBJECTIVES: 10000 })).parts[0]?.label,
    ).toBe("OBJECTIVES");
    expect(partsShown(null, undefined).parts).toEqual([]);
  });
});

describe("whose weights a period uses", () => {
  it("is said once, for each answer the server gives", () => {
    expect(periodWeightsLine("period")).toBe("Set for this period.");
    expect(periodWeightsLine("company")).toBe(
      "Same as your company's weights.",
    );
    expect(periodWeightsLine("frozen")).toBe(
      "Locked when this period started.",
    );
  });

  it("is nothing where the server does not say", () => {
    expect(periodWeightsLine(undefined)).toBeNull();
  });
});
