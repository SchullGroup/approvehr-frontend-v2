import { describe, expect, it } from "vitest";
import {
  ASKED_CONSEQUENCE,
  askedConsequence,
  type AskedChoice,
} from "@/lib/performance/subsection-ask";

/**
 * What choosing who is asked means, for a written subsection.
 *
 * The lines under the control for a level say whose answer counts towards the mark.
 * Words never count, so the same lines for them would promise something false, and
 * every one of them is a well-typed string.
 */

const CHOICES: AskedChoice[] = ["none", "manager", "employee", "both"];

describe("what choosing it means, for words", () => {
  it("says where the words go, and never that they count", () => {
    expect(askedConsequence("manager", "TEXT")).toBe(
      "Recorded when the manager sends their review.",
    );
    expect(askedConsequence("employee", "TEXT")).toBe(
      "Recorded when they send their review.",
    );
    expect(askedConsequence("both", "TEXT")).toBe(
      "The manager's words are recorded. The employee's are shown beside them.",
    );
  });

  it("says nothing for Not asked, which is the default and needs no sentence", () => {
    expect(askedConsequence("none", "TEXT")).toBeNull();
  });

  it("never says an answer counts towards the mark, for any choice", () => {
    for (const choice of CHOICES) {
      const line = askedConsequence(choice, "TEXT");
      expect(line ?? "").not.toMatch(/counts/i);
      expect(line ?? "").not.toMatch(/mark/i);
    }
  });

  it("says the person's words are shown beside the manager's, and not that they are recorded", () => {
    const line = askedConsequence("both", "TEXT") ?? "";
    expect(line).toContain("The employee's are shown beside them");
    expect(line).not.toContain("The employee's are recorded");
  });
});

describe("what choosing it means, for every other kind", () => {
  it("is exactly what it was", () => {
    for (const kind of ["RATING", "BOOLEAN", "CHOICE"] as const) {
      for (const choice of CHOICES) {
        expect(askedConsequence(choice, kind)).toBe(ASKED_CONSEQUENCE[choice]);
      }
    }
  });

  it("still says the employee's own answer counts towards the mark for a level", () => {
    expect(askedConsequence("employee", "RATING")).toBe(
      "Their own answer counts towards the mark.",
    );
    expect(askedConsequence("both", "RATING")).toBe(
      "The manager's answer counts. The employee's is shown beside it.",
    );
  });
});
