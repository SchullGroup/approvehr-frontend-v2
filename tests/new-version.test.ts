import { describe, expect, it } from "vitest";
import type { ApiCompetency, NewVersionResult } from "@/lib/api/performance";
import {
  answeredAsWords,
  lockedMark,
  lockedReason,
  newVersionEffects,
  newVersionTitle,
  otherKinds,
  ratingsWords,
  startedLine,
  startedToast,
} from "@/lib/performance/new-version";

/**
 * What the screens say about starting a new version of a subsection.
 *
 * A sentence that is wrong here is wrong on every screen that shows it, and none of
 * it is visible to `tsc`: a plural that reads "1 ratings", a reason that forgets
 * the one fact that makes the lock true (the setting applies to every period), a
 * consequence line that promises a draft period will ask a pick-one subsection that
 * has no choices to pick from. Each is a well-typed string.
 */

const competency = (over: Partial<ApiCompetency> = {}): ApiCompetency => ({
  id: "new",
  name: "Teamwork",
  sectionId: "s1",
  sectionName: "Core competency",
  description: null,
  isCore: false,
  scaleMax: 5,
  active: true,
  archived: false,
  ratingCount: 0,
  ...over,
});

const result = (
  over: { ratingsKept?: number; notes?: string[]; retiredName?: string } = {},
): NewVersionResult => ({
  competency: competency(),
  retired: {
    id: "old",
    name: over.retiredName ?? "Teamwork (retired)",
    ratingsKept: over.ratingsKept ?? 12,
  },
  notes: over.notes ?? [],
});

describe("ratingsWords", () => {
  it("is singular for one and plural for every other count", () => {
    expect(ratingsWords(1)).toBe("1 rating");
    expect(ratingsWords(2)).toBe("2 ratings");
    expect(ratingsWords(12)).toBe("12 ratings");
    expect(ratingsWords(0)).toBe("0 ratings");
  });
});

describe("the reason it is fixed", () => {
  it("says there are ratings, in any period, and that the setting applies to every period", () => {
    const reason = lockedReason(12);
    expect(reason).toBe(
      "Fixed: 12 ratings are recorded on this subsection, in any period, and how it is answered applies to every period.",
    );
  });

  it("agrees with a single rating", () => {
    expect(lockedReason(1)).toContain("1 rating is recorded");
    expect(lockedReason(1)).not.toContain("1 ratings");
  });

  it("is the short form beside a name, which is also the words a screen reader hears", () => {
    expect(lockedMark(12)).toBe(
      "Fixed: 12 ratings are recorded, in any period.",
    );
    expect(lockedMark(1)).toBe("Fixed: 1 rating is recorded, in any period.");
    expect(lockedMark(12).length).toBeLessThan(lockedReason(12).length);
  });
});

describe("the ways a new version can be answered", () => {
  it("is every way except the one the subsection has, in the order a picker offers them", () => {
    expect(otherKinds("RATING")).toEqual(["BOOLEAN", "CHOICE", "TEXT"]);
    expect(otherKinds("BOOLEAN")).toEqual(["RATING", "CHOICE", "TEXT"]);
    expect(otherKinds("CHOICE")).toEqual(["RATING", "BOOLEAN", "TEXT"]);
    expect(otherKinds("TEXT")).toEqual(["RATING", "BOOLEAN", "CHOICE"]);
  });
});

describe("what starting one does, before it is pressed", () => {
  const effects = (to: "RATING" | "BOOLEAN" | "CHOICE" | null) =>
    newVersionEffects({ name: "Teamwork", ratingCount: 12, to });

  it("says the old one keeps its ratings and every mark made from them, and is retired", () => {
    const [first] = effects("BOOLEAN");
    expect(first).toContain("Teamwork keeps its 12 ratings");
    expect(first).toContain("every mark made from them stays as it is");
    expect(first).toContain("marked retired");
  });

  it("agrees in number: one rating is made from it, more are made from them", () => {
    const one = newVersionEffects({
      name: "Teamwork",
      ratingCount: 1,
      to: null,
    });
    expect(one[0]).toContain(
      "keeps its 1 rating, and every mark made from it stays as it is",
    );
    expect(one[0]).not.toContain("from them");
    expect(effects("BOOLEAN")[0]).toContain(
      "12 ratings, and every mark made from them",
    );
  });

  it("does not claim ratings that are not there", () => {
    const [first] = newVersionEffects({
      name: "Teamwork",
      ratingCount: 0,
      to: null,
    });
    expect(first).toBe("Teamwork is marked retired and leaves this list.");
  });

  it("says the new one has the same name and section and starts empty", () => {
    const [, second] = effects("BOOLEAN");
    expect(second).toContain("same name and section");
    expect(second).toContain("starts with no ratings");
  });

  it("says published periods keep the old one, whichever way it will be answered", () => {
    for (const to of [null, "RATING", "BOOLEAN", "CHOICE"] as const) {
      expect(effects(to)[2]).toContain("Published periods keep the old one");
    }
  });

  it("does not promise a draft period will ask a pick-one version that has no choices", () => {
    expect(effects("CHOICE")[2]).toContain(
      "stop asking it until you add its choices",
    );
    expect(effects("CHOICE")[2]).not.toContain("ask the new version");
  });

  it("says the draft periods ask the new version for any other way", () => {
    expect(effects("BOOLEAN")[2]).toContain("ask the new version in its place");
    expect(effects("RATING")[2]).toContain("ask the new version in its place");
  });

  it("says only what is true of every way, until one is chosen", () => {
    const line = effects(null)[2] ?? "";
    expect(line).toContain("move over to the new version");
    expect(line).not.toContain("stop asking");
    expect(line).not.toContain("in its place");
  });

  it("is three lines whatever is chosen", () => {
    for (const to of [null, "RATING", "BOOLEAN", "CHOICE"] as const) {
      expect(effects(to)).toHaveLength(3);
    }
  });

  it("is titled with the subsection's name", () => {
    expect(newVersionTitle("Teamwork")).toBe("Start a new version of Teamwork");
  });
});

describe("what happened", () => {
  it("reads each way a version can be answered", () => {
    expect(answeredAsWords("RATING")).toBe("a level on a scale");
    expect(answeredAsWords("BOOLEAN")).toBe("a yes or no");
    expect(answeredAsWords("CHOICE")).toBe("one pick from a list");
  });

  it("names the new one, how it is answered and what the old one kept, under the name the API gave it", () => {
    expect(startedLine(result(), "RATING")).toBe(
      "Teamwork is now answered as a level on a scale. Teamwork (retired) keeps its 12 ratings and every mark made from them.",
    );
  });

  it("agrees in number here too: one rating is kept with the marks made from it", () => {
    expect(startedLine(result({ ratingsKept: 1 }), "BOOLEAN")).toBe(
      "Teamwork is now answered as a yes or no. Teamwork (retired) keeps its 1 rating and every mark made from it.",
    );
  });

  it("uses the retired name the API chose, which is numbered when the first was taken", () => {
    expect(
      startedLine(result({ retiredName: "Teamwork (retired 2)" }), "BOOLEAN"),
    ).toContain("Teamwork (retired 2) keeps its 12 ratings");
  });

  it("does not claim ratings that were not there", () => {
    const line = startedLine(result({ ratingsKept: 0 }), "BOOLEAN");
    expect(line).toContain("Teamwork (retired) is kept, retired.");
    expect(line).not.toContain("0 ratings");
  });

  it("is a short toast when there is nothing else to say", () => {
    expect(startedToast(result())).toEqual({
      title: "Started a new version of Teamwork",
      detail: "Teamwork (retired) keeps its 12 ratings.",
    });
    expect(startedToast(result({ ratingsKept: 1 })).detail).toBe(
      "Teamwork (retired) keeps its 1 rating.",
    );
    expect(startedToast(result({ ratingsKept: 0 })).detail).toBe(
      "Teamwork (retired) is kept, retired.",
    );
  });
});
