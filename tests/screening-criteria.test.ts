import { describe, expect, it } from "vitest";
import {
  LIMITS,
  aliasesFromText,
  chipsFromText,
  cleaned,
  criteriaKey,
  draftFrom,
  isEmptyCriteria,
  parseWeight,
  parseYears,
  placesFromText,
  sameCriteria,
  validateCriteria,
  weightsLine,
  withChips,
  FALLBACK_WEIGHTS,
} from "@/lib/hiring/screening/criteria";
import { NO_CRITERIA, type Criteria } from "@/lib/hiring/screening/model";

/**
 * The rules a draft of criteria keeps, before any screen draws it.
 *
 * What these hold: chips come from typing and pasting without repeats, other
 * spellings never repeat the name, every refusal is a sentence, the limits are the
 * API's own, and two drafts are the same when they say the same thing whatever
 * keys their chips carry.
 */

const kw = (label: string, aliases: string[] = [], weight = 1) => ({
  id: `k-${label}`,
  label,
  aliases,
  weight,
});

const some = (over: Partial<Criteria> = {}): Criteria => ({
  ...NO_CRITERIA,
  mustHave: [kw("Payroll")],
  ...over,
});

describe("chips from typing and pasting", () => {
  it("splits on commas, semicolons and new lines and trims each one", () => {
    const chips = chipsFromText("Payroll,  PAYE ;Excel\nICAN");
    expect(chips.map((c) => c.label)).toEqual([
      "Payroll",
      "PAYE",
      "Excel",
      "ICAN",
    ]);
    expect(chips.every((c) => c.weight === 1 && c.aliases.length === 0)).toBe(
      true,
    );
  });

  it("leaves out anything already there, whatever its case", () => {
    const have = [kw("Excel")];
    expect(
      chipsFromText("excel, EXCEL , Payroll, payroll", have).map(
        (c) => c.label,
      ),
    ).toEqual(["Payroll"]);
  });

  it("ignores blanks and gives every chip its own key", () => {
    const chips = chipsFromText(" , ,A,B");
    expect(chips.map((c) => c.label)).toEqual(["A", "B"]);
    expect(new Set(chips.map((c) => c.id)).size).toBe(2);
  });
});

describe("other spellings", () => {
  it("never repeat the name or each other", () => {
    expect(
      aliasesFromText("NodeJS, node.js, Node, nodejs, Node.js", "Node.js"),
    ).toEqual(["NodeJS", "Node"]);
  });

  it("stop at the API's limit", () => {
    const many = Array.from({ length: 20 }, (_, n) => `alias ${String(n)}`);
    expect(aliasesFromText(many.join(","), "X")).toHaveLength(LIMITS.aliases);
  });

  it("make places the same way", () => {
    expect(placesFromText("Lagos, ikeja; LAGOS, A", ["Abuja"])).toEqual([
      "Abuja",
      "Lagos",
      "ikeja",
    ]);
  });
});

describe("what a draft may be", () => {
  it("must ask for something", () => {
    expect(validateCriteria(NO_CRITERIA).form).toMatch(/at least one thing/i);
    expect(validateCriteria(some()).form).toBeUndefined();
    expect(isEmptyCriteria(NO_CRITERIA)).toBe(true);
  });

  it("refuses a skill that is in a list twice, or in both lists", () => {
    expect(
      validateCriteria(some({ mustHave: [kw("Excel"), kw("excel")] })).mustHave,
    ).toMatch(/in this list twice/);
    expect(
      validateCriteria(
        some({ mustHave: [kw("Excel")], niceToHave: [kw(" EXCEL ")] }),
      ).niceToHave,
    ).toMatch(/in both lists/);
  });

  it("holds each list to the API's limit, and a skill to its spellings", () => {
    const forty = Array.from({ length: LIMITS.keywords + 1 }, (_, n) =>
      kw(`skill ${String(n)}`),
    );
    expect(validateCriteria(some({ mustHave: forty })).mustHave).toMatch(
      /40 at most/,
    );
    const spellings = Array.from({ length: LIMITS.aliases + 1 }, (_, n) =>
      String(n),
    );
    expect(
      validateCriteria(some({ mustHave: [kw("Go", spellings)] })).mustHave,
    ).toMatch(/other spellings/);
  });

  it("takes whole or half years from a half to forty", () => {
    expect(validateCriteria(some({ minYears: 3.5 })).minYears).toBeUndefined();
    expect(validateCriteria(some({ minYears: 0.5 })).minYears).toBeUndefined();
    expect(validateCriteria(some({ minYears: 0 })).minYears).toBeDefined();
    expect(validateCriteria(some({ minYears: 3.3 })).minYears).toBeDefined();
    expect(validateCriteria(some({ minYears: 41 })).minYears).toBeDefined();
  });

  it("reads years from what was typed, and says when it is not one", () => {
    expect(parseYears("")).toBeNull();
    expect(parseYears("3")).toBe(3);
    expect(parseYears("3,5")).toBe(3.5);
    expect(parseYears("three")).toBe("bad");
    expect(parseYears("3.55")).toBe("bad");
  });

  it("wants a place before a question about places", () => {
    expect(validateCriteria(some({ locationQuestionId: "q1" })).places).toMatch(
      /at least one place/,
    );
    expect(
      validateCriteria(some({ places: ["Lagos"], locationQuestionId: "q1" }))
        .places,
    ).toBeUndefined();
  });

  it("holds own weights to whole numbers from 0 to 100, not all zero", () => {
    const own = { ...FALLBACK_WEIGHTS };
    expect(validateCriteria(some({ weights: own })).weights).toBeUndefined();
    expect(
      validateCriteria(some({ weights: { ...own, mustHave: 101 } })).weights,
    ).toMatch(/whole number from 0 to 100/);
    expect(
      validateCriteria(
        some({
          weights: {
            mustHave: 0,
            niceToHave: 0,
            experience: 0,
            education: 0,
            location: 0,
          },
        }),
      ).weights,
    ).toMatch(/more than 0/);
    expect(parseWeight("40")).toBe(40);
    expect(parseWeight("101")).toBeNull();
    expect(parseWeight("4.5")).toBeNull();
  });

  it("says the defaults in one line", () => {
    expect(weightsLine(FALLBACK_WEIGHTS)).toBe(
      "must-have skills 50, nice-to-have skills 15, years of experience 15, education level 10, location 10",
    );
  });
});

describe("two drafts being the same", () => {
  it("ignores the chips' own keys, case and the order of spellings", () => {
    const a = some({ mustHave: [kw("Node.js", ["NodeJS", "Node"])] });
    const b = some({
      mustHave: [{ ...kw("node.js", ["node", "NODEJS"]), id: "x" }],
    });
    expect(sameCriteria(a, b)).toBe(true);
    expect(criteriaKey(a)).toBe(criteriaKey(b));
  });

  it("notices a changed weight, year, level or place", () => {
    const base = some();
    expect(sameCriteria(base, some({ minYears: 2 }))).toBe(false);
    expect(sameCriteria(base, some({ education: "HND" }))).toBe(false);
    expect(sameCriteria(base, some({ places: ["Lagos"] }))).toBe(false);
    expect(sameCriteria(base, some({ mustHave: [kw("Payroll", [], 3)] }))).toBe(
      false,
    );
    expect(sameCriteria(base, some({ weights: FALLBACK_WEIGHTS }))).toBe(false);
  });
});

describe("what would be sent", () => {
  it("tidies names and spellings and drops empty chips", () => {
    const sent = cleaned(
      some({
        mustHave: [kw("  Payroll  ", ["payroll", " PAYE "]), kw("   ")],
        places: ["  Lagos ", ""],
        locationQuestionId: "q1",
      }),
    );
    expect(sent.mustHave).toHaveLength(1);
    expect(sent.mustHave[0]?.label).toBe("Payroll");
    expect(sent.mustHave[0]?.aliases).toEqual(["PAYE"]);
    expect(sent.places).toEqual(["Lagos"]);
    expect(sent.locationQuestionId).toBe("q1");
  });

  it("drops the location questions when no place is named", () => {
    const sent = cleaned(
      some({ places: [], locationQuestionId: "q1", relocateQuestionId: "q2" }),
    );
    expect(sent.locationQuestionId).toBeNull();
    expect(sent.relocateQuestionId).toBeNull();
  });

  it("adds a suggestion without doubling what is there", () => {
    const next = withChips(some({ niceToHave: [kw("Excel")] }), "mustHave", [
      kw("payroll"),
      kw("excel"),
      kw("PAYE"),
    ]);
    expect(next.mustHave.map((c) => c.label)).toEqual(["Payroll", "PAYE"]);
  });

  it("copies for editing with a key on every chip", () => {
    const draft = draftFrom(some({ mustHave: [{ ...kw("Go"), id: "" }] }));
    expect(draft.mustHave[0]?.id).not.toBe("");
  });
});
