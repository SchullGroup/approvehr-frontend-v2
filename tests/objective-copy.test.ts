import { describe, expect, it } from "vitest";
import {
  agreedCopy,
  describeObjective,
  kpiAddedSaid,
  kpisAssignedSaid,
  markedDoneSaid,
  measureAddedSaid,
  measuresPhrase,
  namesPhrase,
  objectiveCreatedSaid,
  periodOf,
  possessive,
  refusedSaid,
  reopenedSaid,
  sentBackSaid,
  sentToAgreeCopy,
  sharedSaid,
  type GoalFacts,
} from "@/app/(app)/performance/objective-copy";

/**
 * What is said when an objective or a KPI is saved, sent, agreed or finished.
 *
 * Tested because the sentences are the feature: each has to be true of the
 * thing that just happened. The ones easiest to get wrong are saying somebody
 * "was told" when the API does not report it, and drawing a success over an
 * objective that was sent to nobody.
 */

const personal: GoalFacts = {
  title: "Ship the billing flow",
  ownerId: "emp-chidi",
  ownerName: "Chidi Nwosu",
  level: "personal",
  departmentName: "Engineering",
  reviewCycleName: "H1 2026",
  dueQuarter: "2026-Q2",
  approval: "DRAFT",
  parentTitle: "Grow recurring revenue",
  keyResults: [{}, {}],
};

const company: GoalFacts = {
  ...personal,
  title: "Grow recurring revenue",
  ownerId: null,
  ownerName: null,
  level: "company",
  departmentName: null,
  parentTitle: null,
  keyResults: [],
};

describe("the small parts", () => {
  it("prefers the cycle to a bare quarter, and says nothing when there is neither", () => {
    expect(periodOf(personal)).toBe("H1 2026");
    expect(periodOf({ reviewCycleName: null, dueQuarter: "2026-Q3" })).toBe(
      "Q3 2026",
    );
    expect(periodOf({ reviewCycleName: null, dueQuarter: null })).toBeNull();
  });

  it("says whose, and 'Your' only to the owner", () => {
    expect(possessive(personal)).toBe("Chidi Nwosu's");
    expect(possessive(personal, "emp-chidi")).toBe("Your");
    expect(possessive(personal, "emp-other")).toBe("Chidi Nwosu's");
    expect(possessive({ ...personal, level: "department" })).toBe(
      "Engineering's",
    );
    expect(possessive(company, "emp-chidi")).toBe("The company's");
  });

  it("puts the noun with the number", () => {
    expect(measuresPhrase(0)).toBe("no measure");
    expect(measuresPhrase(1)).toBe("1 measure");
    expect(measuresPhrase(3)).toBe("3 measures");
  });

  it("lists names, and counts past three", () => {
    expect(namesPhrase([])).toBe("");
    expect(namesPhrase(["Ada"])).toBe("Ada");
    expect(namesPhrase(["Ada", "Bola"])).toBe("Ada and Bola");
    expect(namesPhrase(["Ada", "Bola", "Chi"])).toBe("Ada, Bola and Chi");
    expect(namesPhrase(["Ada", "Bola", "Chi", "Dayo", "Efe"])).toBe(
      "Ada, Bola and 3 others",
    );
  });

  it("describes an objective by whose, when and what it is measured by", () => {
    expect(describeObjective(personal)).toBe(
      "Chidi Nwosu's objective for H1 2026, with 2 measures.",
    );
    expect(
      describeObjective({
        ...company,
        reviewCycleName: null,
        dueQuarter: null,
      }),
    ).toBe("The company's objective, with no measure.");
  });
});

describe("an objective was created", () => {
  it("names it, and says it is a draft with somewhere to go next", () => {
    expect(
      objectiveCreatedSaid({
        ...company,
        level: "department",
        departmentName: "Engineering",
      }),
    ).toEqual({
      title: '"Grow recurring revenue" created',
      detail:
        "Engineering's objective for H1 2026. It is a draft, so add KPIs under it and send it to be agreed.",
    });
  });

  it("does not call it a draft when the API says it is not", () => {
    const said = objectiveCreatedSaid({ ...company, approval: "AGREED" });
    expect(said.detail).toBe("The company's objective for H1 2026.");
  });
});

describe("a KPI was added", () => {
  it("names it, whose it is, what it sits under and that it is a draft", () => {
    expect(kpiAddedSaid(personal)).toEqual({
      title: '"Ship the billing flow" added',
      detail:
        'Chidi Nwosu\'s KPI under "Grow recurring revenue", for H1 2026. It is a draft until it is sent to be agreed.',
    });
  });

  it("says 'Your' to the person who made their own", () => {
    expect(kpiAddedSaid(personal, "emp-chidi").detail).toMatch(
      /^Your KPI under/,
    );
  });

  it("leaves out an absent parent and an absent period", () => {
    expect(
      kpiAddedSaid({
        ...personal,
        parentTitle: null,
        reviewCycleName: null,
        dueQuarter: null,
      }).detail,
    ).toBe("Chidi Nwosu's KPI. It is a draft until it is sent to be agreed.");
  });
});

describe("KPIs given to people", () => {
  it("names who got one, and says it sits under the objective", () => {
    expect(
      kpisAssignedSaid({
        owners: ["Chidi Nwosu", "Emeka Anyanwu"],
        alreadyHad: [],
        parentTitle: "Grow recurring revenue",
      }),
    ).toEqual({
      title: "KPI given to Chidi Nwosu and Emeka Anyanwu",
      detail:
        'Each has their own copy under "Grow recurring revenue", to update and send to be agreed.',
    });
  });

  it("says it in the singular for one person", () => {
    expect(
      kpisAssignedSaid({
        owners: ["Chidi Nwosu"],
        alreadyHad: [],
        parentTitle: "Grow recurring revenue",
      }).detail,
    ).toBe(
      'It sits under "Grow recurring revenue", for them to update and send to be agreed.',
    );
  });

  it("counts past three people, and still names who already had it", () => {
    expect(
      kpisAssignedSaid({
        owners: ["A", "B", "C", "D"],
        alreadyHad: ["Fatima Bello"],
        parentTitle: null,
      }),
    ).toEqual({
      title: "KPI given to 4 people",
      detail:
        "Each has their own copy, to update and send to be agreed. Fatima Bello already had it.",
    });
  });

  it("is not a success when nobody needed one", () => {
    expect(
      kpisAssignedSaid({
        owners: [],
        alreadyHad: ["Fatima Bello", "Musa Ibrahim"],
        parentTitle: "x",
      }),
    ).toEqual({
      title: "No new KPI made",
      detail: "Fatima Bello and Musa Ibrahim already had it.",
      tone: "info",
    });
  });
});

describe("a measure was added", () => {
  const measure = {
    label: "Customers",
    unit: "customers",
    startValue: "1000",
    targetValue: "5000.50",
    lowerIsBetter: false,
  };

  it("carries the figures it was added with", () => {
    expect(measureAddedSaid(measure, "Grow recurring revenue")).toEqual({
      title: '"Customers" added to "Grow recurring revenue"',
      detail: "1,000 customers to 5,000.5 customers.",
    });
  });

  it("says when it counts down, and only then", () => {
    expect(
      measureAddedSaid(
        {
          ...measure,
          unit: "%",
          lowerIsBetter: true,
          startValue: "12",
          targetValue: "8",
        },
        null,
      ),
    ).toEqual({
      title: '"Customers" added',
      detail: "12% to 8%, counting down.",
    });
  });
});

describe("an objective was marked done", () => {
  it("says so when measures are short, and that the numbers stay", () => {
    expect(
      markedDoneSaid({ title: "X", measures: 3, shortOfTarget: 2 }),
    ).toEqual({
      title: '"X" is marked done',
      detail:
        "2 of its 3 measures are short of target. The numbers stay as they are.",
    });
    expect(
      markedDoneSaid({ title: "X", measures: 3, shortOfTarget: 1 }).detail,
    ).toBe(
      "1 of its 3 measures is short of target. The numbers stay as they are.",
    );
    expect(
      markedDoneSaid({ title: "X", measures: 2, shortOfTarget: 2 }).detail,
    ).toBe(
      "All 2 of its measures are short of target. The numbers stay as they are.",
    );
    expect(
      markedDoneSaid({ title: "X", measures: 1, shortOfTarget: 1 }).detail,
    ).toBe("Its measure is short of target. The numbers stay as they are.");
  });

  it("says it is at target when it is", () => {
    expect(
      markedDoneSaid({ title: "X", measures: 2, shortOfTarget: 0 }).detail,
    ).toBe(
      "Every measure is at target. Progress is 100%, and it has left the tracked list.",
    );
    expect(
      markedDoneSaid({ title: "X", measures: 1, shortOfTarget: 0 }).detail,
    ).toBe(
      "Its measure is at target. Progress is 100%, and it has left the tracked list.",
    );
  });

  it("has nothing to say about measures when it has none", () => {
    expect(
      markedDoneSaid({ title: "X", measures: 0, shortOfTarget: 0 }).detail,
    ).toBe("Progress is 100%, and it has left the tracked list.");
  });
});

describe("shared, reopened, sent back, refused", () => {
  it("quotes how many people were told, because the API counts them", () => {
    expect(sharedSaid("X", 0).detail).toBe("No one was told.");
    expect(sharedSaid("X", 1).detail).toBe("1 person was told.");
    expect(sharedSaid("X", 4).detail).toBe("4 people were told.");
  });

  it("says nothing about people told when the API sent no count", () => {
    expect(sharedSaid("X", undefined)).toEqual({ title: '"X" shared' });
  });

  it("says a reopened target has to be agreed again", () => {
    expect(reopenedSaid("X")).toEqual({
      title: '"X" reopened',
      detail: "It has to be agreed again. Your reason is on the record.",
    });
  });

  it("says what sending back keeps and what the owner can do, without saying they were told", () => {
    const said = sentBackSaid({ title: "X", ownerName: "Chidi Nwosu" });
    expect(said.title).toBe('"X" sent back');
    expect(said.detail).toBe(
      "Your reason is kept with it. Chidi Nwosu can change it and send it again.",
    );
    expect(said.detail).not.toMatch(/told/i);
    expect(sentBackSaid({ title: "X", ownerName: null }).detail).toBe(
      "Your reason is kept with it. It can be changed and sent again.",
    );
  });

  it("says a refusal is on the record and final", () => {
    expect(refusedSaid({ title: "X" })).toEqual({
      title: '"X" refused',
      detail:
        "Your reason is on the record. A refused objective cannot be sent again.",
    });
  });
});

describe("sending an objective to be agreed", () => {
  it("is a moment that says what, whose, when, and how many it went to", () => {
    const result = sentToAgreeCopy({ goal: personal, sentTo: ["emp-adaeze"] });
    expect(result).toEqual({
      kind: "moment",
      copy: {
        title: '"Ship the billing flow" is waiting to be agreed',
        lead: "Chidi Nwosu's objective for H1 2026, with 2 measures.",
        details: [
          "Sent to 1 person who can agree it.",
          "Once it is agreed the target is fixed. Progress still moves.",
        ],
      },
    });
  });

  it("counts people in the plural", () => {
    const result = sentToAgreeCopy({
      goal: company,
      sentTo: ["a", "b", "c"],
    });
    expect(result.kind === "moment" && result.copy.details[0]).toBe(
      "Sent to 3 people who can agree it.",
    );
  });

  it("names nobody and says nobody was told", () => {
    const result = sentToAgreeCopy({ goal: personal, sentTo: ["emp-adaeze"] });
    const text = JSON.stringify(result);
    expect(text).not.toMatch(/told/i);
    expect(text).not.toMatch(/emp-adaeze/);
  });

  it("is a warning, not a success, when nobody else was asked", () => {
    const result = sentToAgreeCopy({ goal: personal, sentTo: [] });
    expect(result).toEqual({
      kind: "notice",
      said: {
        title: '"Ship the billing flow" is waiting to be agreed',
        detail:
          "Nobody else was asked to agree it. Anybody who can will find it under Objectives to agree.",
        tone: "warning",
      },
    });
  });

  it("makes no claim about who it went to in demo mode, where there is no answer", () => {
    const result = sentToAgreeCopy({ goal: personal, sentTo: undefined });
    expect(result.kind).toBe("moment");
    expect(result.kind === "moment" && result.copy.details).toEqual([
      "Once it is agreed the target is fixed. Progress still moves.",
    ]);
  });
});

describe("agreeing an objective", () => {
  it("says what was agreed and what is now fixed", () => {
    expect(agreedCopy(personal)).toEqual({
      title: '"Ship the billing flow" is agreed',
      lead: "Chidi Nwosu's objective for H1 2026, with 2 measures.",
      details: [
        "The target is fixed. Progress still moves.",
        "Changing it now takes a revision, which is recorded.",
      ],
    });
  });

  it("does not say the owner was told, because the API does not report it", () => {
    expect(JSON.stringify(agreedCopy(personal))).not.toMatch(/told/i);
  });
});

describe("the voice", () => {
  it("has no exclamation marks anywhere", () => {
    const everything = JSON.stringify([
      objectiveCreatedSaid(company),
      kpiAddedSaid(personal),
      kpisAssignedSaid({ owners: ["A"], alreadyHad: ["B"], parentTitle: "P" }),
      measureAddedSaid(
        {
          label: "L",
          unit: null,
          startValue: "1",
          targetValue: "2",
          lowerIsBetter: false,
        },
        "G",
      ),
      markedDoneSaid({ title: "X", measures: 2, shortOfTarget: 1 }),
      sharedSaid("X", 2),
      reopenedSaid("X"),
      sentBackSaid({ title: "X", ownerName: "A" }),
      refusedSaid({ title: "X" }),
      sentToAgreeCopy({ goal: personal, sentTo: ["a"] }),
      sentToAgreeCopy({ goal: personal, sentTo: [] }),
      agreedCopy(personal),
    ]);
    expect(everything).not.toMatch(/!/);
    expect(everything).not.toMatch(/congratulations|success/i);
  });
});
