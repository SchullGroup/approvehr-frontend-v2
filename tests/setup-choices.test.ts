import { describe, expect, it } from "vitest";
import type { ApiScoringWeights, ScoreComponent } from "@/lib/api/performance";
import {
  DEFAULT_TICKED,
  WIZARD_ORDER,
  choicesFrom,
  evenly,
  firstWithoutShare,
  startingPoint,
  weightBody,
} from "@/lib/performance/setup-choices";

type Row = ApiScoringWeights["rows"][number];

/** In the order the API sends them, which is not the order the wizard asks in. */
const API_ORDER: ScoreComponent[] = [
  "OBJECTIVES",
  "TASKS",
  "CORE_COMPETENCY",
  "BEHAVIOURAL_COMPETENCY",
  "LEADERSHIP",
  "MANAGER_APPRAISAL",
  "SELF_ASSESSMENT",
];

const rows = (
  weightsBp: Partial<Record<ScoreComponent, number>>,
  own: Partial<Record<ScoreComponent, Partial<Row>>> = {},
): Row[] =>
  API_ORDER.map((component) => ({
    component,
    label: `${component} name`,
    defaultLabel: `${component} name`,
    description: `${component} words`,
    defaultDescription: `${component} words`,
    weightBp: weightsBp[component] ?? 0,
    isPart: component in weightsBp,
    ...own[component],
  }));

const weights = (
  rowsOf: Row[],
  source: "saved" | "default" = "saved",
): ApiScoringWeights => ({
  source,
  rows: rowsOf,
  totalBp: 10000,
  selfAssessmentNote: "",
});

describe("the choices", () => {
  it("are asked in the wizard's order, whatever order the API sends", () => {
    expect(choicesFrom(rows({})).map((choice) => choice.source)).toEqual([
      ...WIZARD_ORDER,
    ]);
    expect(WIZARD_ORDER[WIZARD_ORDER.length - 1]).toBe("TASKS");
  });

  it("carry the name and the words the API sent", () => {
    const [first] = choicesFrom(rows({}));
    expect(first).toEqual({
      source: "OBJECTIVES",
      name: "OBJECTIVES name",
      description: "OBJECTIVES words",
    });
  });

  it("say nothing under a choice that has no words", () => {
    const found = choicesFrom(
      rows({}, { LEADERSHIP: { description: "   " } }),
    ).find((choice) => choice.source === "LEADERSHIP");
    expect(found?.description).toBeNull();
  });

  it("call a tasks part nobody named, and nobody described, by what it counts now", () => {
    const tasks = choicesFrom(rows({})).find(
      (choice) => choice.source === "TASKS",
    );
    expect(tasks?.name).toBe("Tasks done");
    expect(tasks?.description).toMatch(/tasks finished in Projects/);
  });

  it("keep a company's own name and its own words for the tasks part, separately", () => {
    const named = choicesFrom(
      rows({}, { TASKS: { label: "Shipped", description: "What shipped." } }),
    ).find((choice) => choice.source === "TASKS");
    expect(named).toMatchObject({
      name: "Shipped",
      description: "What shipped.",
    });

    const half = choicesFrom(rows({}, { TASKS: { label: "Shipped" } })).find(
      (choice) => choice.source === "TASKS",
    );
    expect(half?.name).toBe("Shipped");
    expect(half?.description).toMatch(/tasks finished in Projects/);
  });

  it("never rename any other part", () => {
    const found = choicesFrom(
      rows({}, { OBJECTIVES: { label: "Delivery", defaultLabel: undefined } }),
    ).find((choice) => choice.source === "OBJECTIVES");
    expect(found?.name).toBe("Delivery");
  });

  it("do not include a source the server sent no row for", () => {
    const without = rows({}).filter(
      (row) => row.component !== "MANAGER_APPRAISAL",
    );
    expect(choicesFrom(without).map((choice) => choice.source)).not.toContain(
      "MANAGER_APPRAISAL",
    );
  });
});

describe("where it starts", () => {
  const SAVED = rows({
    OBJECTIVES: 2000,
    CORE_COMPETENCY: 2000,
    BEHAVIOURAL_COMPETENCY: 2000,
    LEADERSHIP: 1500,
    MANAGER_APPRAISAL: 1000,
    SELF_ASSESSMENT: 1500,
  });

  it("is what is saved, in the wizard's order, with whole percents, and the numbers are the company's own", () => {
    const start = startingPoint(weights(SAVED), false);
    expect(start.ticked).toEqual([
      "OBJECTIVES",
      "CORE_COMPETENCY",
      "BEHAVIOURAL_COMPETENCY",
      "LEADERSHIP",
      "MANAGER_APPRAISAL",
      "SELF_ASSESSMENT",
    ]);
    expect(start.percents).toEqual({
      OBJECTIVES: "20",
      CORE_COMPETENCY: "20",
      BEHAVIOURAL_COMPETENCY: "20",
      LEADERSHIP: "15",
      MANAGER_APPRAISAL: "10",
      SELF_ASSESSMENT: "15",
    });
    expect(start.touched).toBe(true);
  });

  it("is the built-in weights, untouched, for a company that chose nothing", () => {
    const start = startingPoint(
      weights(
        rows({
          OBJECTIVES: 4000,
          CORE_COMPETENCY: 2500,
          BEHAVIOURAL_COMPETENCY: 2000,
          LEADERSHIP: 1500,
        }),
        "default",
      ),
      false,
    );
    expect(start.percents.OBJECTIVES).toBe("40");
    expect(start.touched).toBe(false);
  });

  it("leaves a part the company has no part for, or at 0%, unticked", () => {
    const start = startingPoint(
      weights(rows({ OBJECTIVES: 10000, LEADERSHIP: 0 })),
      false,
    );
    expect(start.ticked).toEqual(["OBJECTIVES"]);
  });

  it("leaves Tasks done out while Projects is off, whatever it is saved at, and keeps it otherwise", () => {
    const saved = weights(rows({ OBJECTIVES: 6000, TASKS: 4000 }));
    expect(startingPoint(saved, true).ticked).toEqual(["OBJECTIVES"]);
    expect(startingPoint(saved, true).percents).not.toHaveProperty("TASKS");
    expect(startingPoint(saved, false).ticked).toEqual(["OBJECTIVES", "TASKS"]);
  });

  it("falls back to the defaults, split evenly, when nothing counts", () => {
    const start = startingPoint(weights(rows({})), false);
    expect(start.ticked).toEqual([...DEFAULT_TICKED]);
    expect(start.percents).toEqual({
      OBJECTIVES: "25",
      CORE_COMPETENCY: "25",
      BEHAVIOURAL_COMPETENCY: "25",
      LEADERSHIP: "25",
    });
    expect(start.touched).toBe(false);
  });
});

describe("what is saved", () => {
  const all = rows({ OBJECTIVES: 1, TASKS: 0 });
  const pct = (source: ScoreComponent) =>
    ({ OBJECTIVES: 60, LEADERSHIP: 40 })[source as "OBJECTIVES"] ?? 0;

  it("is every part in one set: ticked parts in basis points, the rest at nothing", () => {
    expect(weightBody(all, ["OBJECTIVES", "LEADERSHIP"], pct)).toEqual({
      OBJECTIVES: 6000,
      TASKS: 0,
      CORE_COMPETENCY: 0,
      BEHAVIOURAL_COMPETENCY: 0,
      LEADERSHIP: 4000,
      MANAGER_APPRAISAL: 0,
      SELF_ASSESSMENT: 0,
    });
  });

  it("leaves out a part the server has never heard of, rather than writing 0 over it", () => {
    const older = all.filter((row) => row.component !== "MANAGER_APPRAISAL");
    const body = weightBody(older, ["OBJECTIVES"], pct);
    expect(body).not.toHaveProperty("MANAGER_APPRAISAL");
    expect(body.OBJECTIVES).toBe(6000);
  });

  it("gives a part that is not ticked nothing, whatever was typed for it", () => {
    expect(weightBody(all, ["OBJECTIVES"], () => 50).LEADERSHIP).toBe(0);
  });
});

describe("a ticked part with no share", () => {
  it("is found, in the order they are listed", () => {
    const pct = (source: ScoreComponent) => (source === "OBJECTIVES" ? 100 : 0);
    expect(
      firstWithoutShare(["SELF_ASSESSMENT", "LEADERSHIP", "OBJECTIVES"], pct),
    ).toBe("LEADERSHIP");
  });

  it("is nothing when every ticked part has a share, and a part that is not ticked is not asked for one", () => {
    expect(firstWithoutShare(["OBJECTIVES"], () => 1)).toBeUndefined();
    expect(firstWithoutShare([], () => 0)).toBeUndefined();
  });
});

describe("an even split", () => {
  it("adds up to 100 as text", () => {
    const split = evenly(["OBJECTIVES", "LEADERSHIP", "TASKS"]);
    expect(split).toEqual({ OBJECTIVES: "34", LEADERSHIP: "33", TASKS: "33" });
  });
});
