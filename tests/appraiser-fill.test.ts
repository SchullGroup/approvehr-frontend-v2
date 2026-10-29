import { describe, expect, it } from "vitest";
import {
  formsWrittenSentence,
  nameList,
  standInSentence,
  stillWithoutSentence,
} from "@/lib/performance/appraiser-fill";

/**
 * What filling in the appraisers says it did.
 *
 * Every sentence here is on screen, after a press that changes who marks whom.
 * The two things worth pinning are that a field the server did not send makes no
 * claim, and that a list of names never runs on past what a line can hold.
 */

describe("nameList", () => {
  it("reads naturally for one, two and a few", () => {
    expect(nameList([])).toBe("");
    expect(nameList(["Pat Test"])).toBe("Pat Test");
    expect(nameList(["Pat Test", "Fia Test"])).toBe("Pat Test and Fia Test");
    expect(nameList(["A", "B", "C"])).toBe("A, B and C");
  });

  it("stops at six and says how many more", () => {
    const eight = ["A", "B", "C", "D", "E", "F", "G", "H"];
    expect(nameList(eight)).toBe("A, B, C, D, E, F and 2 more");
    expect(nameList(eight.slice(0, 6))).toBe("A, B, C, D, E and F");
  });
});

describe("who was given their department head", () => {
  it("names them, and says why, so it can be checked", () => {
    expect(standInSentence(["Pat Test"])).toBe(
      "Pat Test was given their department head as appraiser, because nobody is recorded as their manager.",
    );
    expect(standInSentence(["Pat Test", "Fia Test"])).toBe(
      "Pat Test and Fia Test were given their department head as appraiser, because nobody is recorded as their manager.",
    );
  });

  it("says nothing when nobody was, and nothing when the server did not say", () => {
    expect(standInSentence([])).toBeNull();
    expect(standInSentence(undefined)).toBeNull();
  });
});

describe("who is still without an appraiser", () => {
  it("says no department head can stand in only for a server that looked for one", () => {
    expect(stillWithoutSentence(["Ola Test"], true)).toBe(
      "Still nobody appraising Ola Test. Nobody is recorded as their manager and no department head can stand in. Assign somebody by hand.",
    );
  });

  it("keeps the old reason for a server that has no such rule", () => {
    /* For that server it is not true that a department head was looked for, so
       claiming none could stand in would be a claim about a rule it does not have. */
    expect(stillWithoutSentence(["Ola Test"], false)).toBe(
      "Still nobody appraising Ola Test. They have no manager either. Assign somebody by hand.",
    );
  });

  it("says nothing when everybody has somebody", () => {
    expect(stillWithoutSentence([], true)).toBeNull();
    expect(stillWithoutSentence([], false)).toBeNull();
  });
});

describe("how many forms were written", () => {
  it("says it only for a count above zero", () => {
    expect(formsWrittenSentence(1)).toBe(
      "1 form written for managers to answer.",
    );
    expect(formsWrittenSentence(12)).toBe(
      "12 forms written for managers to answer.",
    );
  });

  it("says nothing for none, and nothing for a server that does not send it", () => {
    expect(formsWrittenSentence(0)).toBeNull();
    expect(formsWrittenSentence(undefined)).toBeNull();
  });
});

describe("the wording", () => {
  it("has no em dash in anything it prints", () => {
    const all = [
      standInSentence(["Pat Test", "Fia Test"]),
      stillWithoutSentence(["Ola Test"], true),
      stillWithoutSentence(["Ola Test"], false),
      formsWrittenSentence(3),
      nameList(["A", "B", "C", "D", "E", "F", "G"]),
    ];
    for (const line of all) expect(line).not.toMatch(/—/);
  });
});
