import { describe, expect, it } from "vitest";
import {
  askedChoiceOf,
  askedOfChoice,
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
