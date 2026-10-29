import { describe, expect, it } from "vitest";
import {
  ASKED_CHOICES,
  ASKED_CONSEQUENCE,
  ASK_ACTION_LABEL,
  NEEDS_CHOICES,
  askActionFor,
  askedChoiceOf,
  askedOfChoice,
  askedWho,
  periodStartedReason,
  savedWords,
  type AskedChoice,
} from "@/lib/performance/subsection-ask";

/**
 * Whether a period asks a directly rated subsection on its review form, and of
 * whom.
 *
 * The mapping between the four choices and what the API takes is the whole of
 * this file, and every way it can be wrong is well typed: "both" sent as one
 * audience, "Not asked" sent as an empty list (which the API refuses), a
 * colleague read as an audience the control does not offer.
 */

describe("the four choices", () => {
  it("are named as the product owner named them, in his order", () => {
    expect(ASKED_CHOICES.map((choice) => choice.label)).toEqual([
      "Not asked",
      "The manager",
      "The employee",
      "Both",
    ]);
    expect(ASKED_CHOICES.map((choice) => choice.value)).toEqual([
      "none",
      "manager",
      "employee",
      "both",
    ]);
  });
});

describe("what the control shows for what a period holds", () => {
  it("is Not asked for nobody, and for a period that has nothing for it", () => {
    expect(askedChoiceOf([])).toBe("none");
    expect(askedChoiceOf(null)).toBe("none");
    expect(askedChoiceOf(undefined)).toBe("none");
  });

  it("is the manager, the employee, or both, whichever order they arrive in", () => {
    expect(askedChoiceOf(["MANAGER"])).toBe("manager");
    expect(askedChoiceOf(["SELF"])).toBe("employee");
    expect(askedChoiceOf(["SELF", "MANAGER"])).toBe("both");
    expect(askedChoiceOf(["MANAGER", "SELF"])).toBe("both");
  });

  it("never reads a colleague as one of the audiences the control offers", () => {
    /* The API refuses these, so they should not arrive. If one did, the control
       must not claim somebody was asked who is not on its list. */
    expect(askedChoiceOf(["PEER"])).toBe("none");
    expect(askedChoiceOf(["REPORT"])).toBe("none");
    expect(askedChoiceOf(["SELF", "PEER"])).toBe("employee");
  });
});

describe("what choosing one sends", () => {
  it("is the manager alone, the employee alone, or the person and then their manager", () => {
    expect(askedOfChoice("manager")).toEqual(["MANAGER"]);
    expect(askedOfChoice("employee")).toEqual(["SELF"]);
    expect(askedOfChoice("both")).toEqual(["SELF", "MANAGER"]);
  });

  it("is nothing at all for Not asked, which is a DELETE and never an empty list", () => {
    /* An empty `askedOf` is a request the API refuses by name. */
    expect(askedOfChoice("none")).toBeNull();
  });

  it("never includes a colleague", () => {
    for (const choice of ["manager", "employee", "both"] as AskedChoice[]) {
      expect(askedOfChoice(choice)).not.toContain("PEER");
      expect(askedOfChoice(choice)).not.toContain("REPORT");
    }
  });

  it("reads back as the same choice that was made", () => {
    for (const choice of ["manager", "employee", "both"] as AskedChoice[]) {
      expect(askedChoiceOf(askedOfChoice(choice))).toBe(choice);
    }
  });
});

describe("what choosing it means, in one line", () => {
  it("says whose answer counts, in the words of the brief", () => {
    expect(ASKED_CONSEQUENCE.manager).toBe(
      "Recorded when the manager sends their review.",
    );
    expect(ASKED_CONSEQUENCE.employee).toBe(
      "Their own answer counts towards the mark.",
    );
    expect(ASKED_CONSEQUENCE.both).toBe(
      "The manager's answer counts. The employee's is shown beside it.",
    );
  });

  it("says nothing for Not asked, which is the default and needs no sentence", () => {
    expect(ASKED_CONSEQUENCE.none).toBeNull();
  });
});

describe("who a row says it is put to", () => {
  it("is Manager, Employee or Both", () => {
    expect(askedWho(["MANAGER"])).toBe("Manager");
    expect(askedWho(["SELF"])).toBe("Employee");
    expect(askedWho(["SELF", "MANAGER"])).toBe("Both");
  });

  it("is nothing for a list that is none of those, so a row falls back to the ordinary words", () => {
    expect(askedWho([])).toBeNull();
    expect(askedWho(["PEER"])).toBeNull();
    expect(askedWho(null)).toBeNull();
  });
});

describe("why it cannot be changed", () => {
  it("names the period that has started", () => {
    expect(periodStartedReason("H2 2026 Appraisal")).toBe(
      "H2 2026 Appraisal has started, so this can no longer change.",
    );
  });

  it("says a pick-one subsection needs choices before a form can ask it", () => {
    expect(NEEDS_CHOICES).toBe(
      "It needs at least two choices before a form can ask it.",
    );
  });
});

describe("what pressing the button does", () => {
  const CHOICES = ASKED_CHOICES.map((choice) => choice.value);

  it("is nothing when the choice is what the period already holds, for every choice", () => {
    for (const choice of CHOICES)
      expect(askActionFor(choice, choice)).toBeNull();
  });

  it("is an add when the period does not ask it and somebody is chosen", () => {
    for (const chosen of ["manager", "employee", "both"] as const) {
      expect(askActionFor("none", chosen)).toBe("add");
    }
  });

  it("is a change when it is on the form and somebody else is chosen", () => {
    expect(askActionFor("manager", "both")).toBe("change");
    expect(askActionFor("manager", "employee")).toBe("change");
    expect(askActionFor("employee", "manager")).toBe("change");
    expect(askActionFor("both", "manager")).toBe("change");
  });

  it("is a remove when Not asked is chosen for something the period asks", () => {
    for (const saved of ["manager", "employee", "both"] as const) {
      expect(askActionFor(saved, "none")).toBe("remove");
    }
  });

  it("says what it does, and the three do not read alike", () => {
    expect(ASK_ACTION_LABEL).toEqual({
      add: "Add to the review form",
      change: "Save change",
      remove: "Take it off the form",
    });
  });

  it("is a remove exactly when the write is the stop, never a label that disagrees with the write", () => {
    /* A button that says "Take it off the form" and sends a PUT, or one that says
       "Add" and sends a DELETE, is well typed and does the opposite of its label. */
    for (const saved of CHOICES) {
      for (const chosen of CHOICES) {
        const action = askActionFor(saved, chosen);
        if (action === null) continue;
        const body = askedOfChoice(chosen);
        if (action === "remove") expect(body).toBeNull();
        else expect(body).not.toBeNull();
      }
    }
  });
});

describe("what is said once a choice is saved", () => {
  it("says it was added, to whom, and where to find it", () => {
    expect(savedWords("both", "Collaboration", "none")).toEqual({
      title: "Collaboration added to the review form",
      detail: "Asked of both. Find it under All questions.",
    });
    expect(savedWords("manager", "Adaptability", "none").detail).toBe(
      "Asked of the manager. Find it under All questions.",
    );
    expect(savedWords("employee", "Adaptability", "none").detail).toBe(
      "Asked of the employee. Find it under All questions.",
    );
  });

  it("says the form was updated, not that it was added, when it was already there", () => {
    for (const from of ["manager", "employee", "both"] as const) {
      expect(savedWords("both", "Collaboration", from).title).toBe(
        "Collaboration updated on the review form",
      );
    }
  });

  it("says it came off, and does not send anybody looking for it", () => {
    for (const from of ["manager", "employee", "both"] as const) {
      expect(savedWords("none", "Collaboration", from)).toEqual({
        title: "Collaboration taken off the review form",
        detail: "It is no longer asked in this period.",
      });
    }
  });

  it("keeps the name out of the detail, so the words that say where to look are never the ones a toast cuts", () => {
    /* A toast shows two lines of detail, about forty characters each. The name is
       the one thing that varies, so it is in the title, which is not clamped. */
    const name = "A subsection with a long and unwieldy name for a form";
    for (const to of ["manager", "employee", "both", "none"] as const) {
      const { title, detail } = savedWords(to, name, "none");
      expect(title).toContain(name);
      expect(detail).not.toContain(name);
      expect(detail.length).toBeLessThanOrEqual(52);
    }
  });
});
