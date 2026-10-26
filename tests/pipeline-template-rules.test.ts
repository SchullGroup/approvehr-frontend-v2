import { describe, expect, it } from "vitest";
import type { StageType } from "@/lib/hiring/pipeline/stage-types";
import {
  firstProblem,
  freshStageName,
  insertionIndex,
  isValid,
  moveRefusal,
  moveStage,
  removalRefusal,
  typesStillAvailable,
  validateTemplate,
  withType,
  type TemplateStage,
} from "@/lib/hiring/pipeline/template-rules";

/**
 * The rules a pipeline template keeps, checked before the API is asked.
 *
 * They are the API's own rules: one Applied stage and it comes first, a pipeline
 * ends somewhere, the endings go last, names differ. What these tests hold is that
 * each problem lands on the stage that causes it, in words, and that the removals
 * and moves the screen offers are only the ones that cannot break the pipeline.
 */

const stage = (
  id: string,
  type: StageType,
  name = id,
  requiresScorecards = false,
): TemplateStage => ({ id, name, type, requiresScorecards });

const standard = (): TemplateStage[] => [
  stage("a", "APPLIED", "Applied"),
  stage("s", "SCREENING", "Phone screen"),
  stage("i", "INTERVIEW", "Interview", true),
  stage("o", "OFFER", "Offer"),
  stage("h", "HIRED", "Hired"),
  stage("r", "REJECTED", "Rejected"),
];

describe("a template that is right", () => {
  it("has no problems", () => {
    const problems = validateTemplate("Standard hiring", standard());
    expect(isValid(problems)).toBe(true);
    expect(firstProblem(problems)).toBeNull();
  });

  it("may end in only one of the two endings", () => {
    const onlyRejected = standard().filter((s) => s.type !== "HIRED");
    expect(isValid(validateTemplate("No hire", onlyRejected))).toBe(true);
  });
});

describe("the name", () => {
  it("is needed", () => {
    expect(validateTemplate("  ", standard()).name).toBe(
      "Give the template a name.",
    );
  });

  it("has a limit", () => {
    expect(validateTemplate("x".repeat(81), standard()).name).toMatch(/80/);
  });
});

describe("the Applied stage", () => {
  it("is missing from a template that has none", () => {
    const list = standard().filter((s) => s.type !== "APPLIED");
    expect(validateTemplate("T", list).list).toMatch(/no Applied stage/);
  });

  it("is named on the second one, not on the first", () => {
    const list = [...standard()];
    list[1] = stage("s", "APPLIED", "Second door");
    const problems = validateTemplate("T", list);
    expect(problems.stages["s"]).toMatch(/exactly one Applied/);
    expect(problems.stages["a"]).toBeUndefined();
  });

  it("has to come first", () => {
    const list = [
      stage("s", "SCREENING", "Screen"),
      ...standard().slice(0, 1),
      ...standard().slice(2),
    ];
    const problems = validateTemplate("T", list);
    expect(problems.stages["s"]).toMatch(/has to come first/);
  });
});

describe("the endings", () => {
  it("are needed", () => {
    const list = standard().filter(
      (s) => s.type !== "HIRED" && s.type !== "REJECTED",
    );
    expect(validateTemplate("T", list).list).toMatch(/somewhere to end/);
  });

  it("are one of each", () => {
    const list = [...standard(), stage("h2", "HIRED", "Hired again")];
    expect(validateTemplate("T", list).stages["h2"]).toMatch(
      /at most one Hired/,
    );
  });

  it("go last", () => {
    const list = [
      stage("a", "APPLIED", "Applied"),
      stage("h", "HIRED", "Hired"),
      stage("i", "INTERVIEW", "Interview"),
    ];
    expect(validateTemplate("T", list).stages["i"]).toMatch(/go last/);
  });
});

describe("stage names", () => {
  it("are written", () => {
    const list = standard();
    list[1] = stage("s", "SCREENING", "  ");
    expect(validateTemplate("T", list).stages["s"]).toBe("Name this stage.");
  });

  it("differ, whatever the case", () => {
    const list = standard();
    list[1] = stage("s", "SCREENING", "applied");
    expect(validateTemplate("T", list).stages["s"]).toMatch(
      /already has this name/,
    );
  });
});

describe("what may be removed", () => {
  it("never the Applied stage", () => {
    expect(removalRefusal(standard(), "a")).toMatch(/Applied stage/);
  });

  it("not the only way a pipeline ends", () => {
    const list = standard().filter((s) => s.type !== "HIRED");
    expect(removalRefusal(list, "r")).toMatch(/only place the pipeline ends/);
  });

  it("an ending is fine while another ending remains", () => {
    expect(removalRefusal(standard(), "h")).toBeNull();
  });

  it("an ordinary stage is fine", () => {
    expect(removalRefusal(standard(), "s")).toBeNull();
  });

  it("not the last stage there is", () => {
    expect(removalRefusal([stage("a", "APPLIED")], "a")).toMatch(
      /at least one stage/,
    );
  });
});

describe("what may be moved", () => {
  it("nothing is moved above the Applied stage", () => {
    expect(moveRefusal(standard(), "s", -1)).toMatch(
      /Applied stage stays first/,
    );
    expect(moveRefusal(standard(), "a", 1)).toMatch(
      /Applied stage stays first/,
    );
  });

  it("an ending does not move up into the stages people pass through", () => {
    /* The two endings may swap with each other. */
    expect(moveRefusal(standard(), "r", -1)).toBeNull();
    const list = [
      stage("a", "APPLIED"),
      stage("i", "INTERVIEW"),
      stage("h", "HIRED"),
    ];
    expect(moveRefusal(list, "h", -1)).toMatch(/Endings stay after/);
    expect(moveRefusal(list, "i", 1)).toMatch(/stay before the endings/);
  });

  it("two middle stages swap freely", () => {
    expect(moveRefusal(standard(), "s", 1)).toBeNull();
    expect(moveStage(standard(), "s", 1).map((s) => s.id)).toEqual([
      "a",
      "i",
      "s",
      "o",
      "h",
      "r",
    ]);
  });

  it("says so at the ends of the list", () => {
    expect(moveRefusal(standard(), "r", 1)).toBe("Already at the end.");
  });
});

describe("adding", () => {
  it("lands before the endings, so a stage added in a hurry is never after Hired", () => {
    expect(insertionIndex(standard())).toBe(4);
  });

  it("names the next stage so that it does not collide", () => {
    const list = [stage("x", "SCREENING", "New stage")];
    expect(freshStageName(list)).toBe("New stage 2");
  });

  it("offers each of the three once-only types only while it is free", () => {
    const types = typesStillAvailable(standard());
    expect(types).not.toContain("APPLIED");
    expect(types).not.toContain("HIRED");
    expect(types).not.toContain("REJECTED");
    expect(types).toContain("INTERVIEW");
    /* A stage may keep its own type. */
    expect(typesStillAvailable(standard(), "h")).toContain("HIRED");
  });
});

describe("changing a type", () => {
  it("drops the scorecard requirement from anything that is not an interview", () => {
    const interview = stage("i", "INTERVIEW", "Interview", true);
    expect(withType(interview, "TEST").requiresScorecards).toBe(false);
    expect(withType(interview, "INTERVIEW").requiresScorecards).toBe(true);
  });
});
