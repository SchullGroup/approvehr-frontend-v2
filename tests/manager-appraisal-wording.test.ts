import { describe, expect, it } from "vitest";
import {
  SCORE_COMPONENT_ORDER,
  isLaterComponent,
  visibleComponents,
  weightSetFromRows,
  type ApiComponentScore,
  type ScoreComponent,
} from "@/lib/api/performance";
import {
  appraiserMarkHint,
  appraiserStripLine,
  evidenceLine,
  scoredFrom,
  scoredFromSentence,
} from "@/lib/performance/score-wording";
import {
  asksOverallMark,
  markPageWords,
  needsOverallMark,
  startingMark,
  stillNeededLine,
} from "@/app/(focus)/performance/reviews/[id]/answer/focus-logic";

/**
 * Manager appraisal, the seventh part of the mark, as words and rules.
 *
 * The manager's overall mark used to be reference only, always, and four screens
 * said so. It is scored only where a period weights this part, so every sentence
 * here is either read off the server's own figures or true at every weight, and a
 * server that predates the part must be read as saying nothing about it, never as
 * saying "not counted" or "0%".
 */

const part = (
  component: ScoreComponent,
  over: Partial<ApiComponentScore> = {},
): ApiComponentScore => ({
  component,
  label: component === "MANAGER_APPRAISAL" ? "Manager appraisal" : component,
  scoreBp: null,
  weightBp: 0,
  effectiveWeightBp: 0,
  included: false,
  excludedBecause: null,
  excludedNote: null,
  evidenceCount: 0,
  ...over,
});

describe("where the part sits and how a set is read from a server", () => {
  it("is the seventh part, after Leadership and before Self-assessment", () => {
    expect(SCORE_COMPONENT_ORDER).toEqual([
      "OBJECTIVES",
      "TASKS",
      "CORE_COMPETENCY",
      "BEHAVIOURAL_COMPETENCY",
      "LEADERSHIP",
      "MANAGER_APPRAISAL",
      "SELF_ASSESSMENT",
    ]);
  });

  it("is the one part a server may not have heard of", () => {
    expect(isLaterComponent("MANAGER_APPRAISAL")).toBe(true);
    expect(isLaterComponent("TASKS")).toBe(false);
    expect(isLaterComponent("SELF_ASSESSMENT")).toBe(false);
  });

  const sixRows = [
    { component: "OBJECTIVES", weightBp: 4000 },
    { component: "TASKS", weightBp: 0 },
    { component: "CORE_COMPETENCY", weightBp: 2500 },
    { component: "BEHAVIOURAL_COMPETENCY", weightBp: 2000 },
    { component: "LEADERSHIP", weightBp: 1500 },
    { component: "SELF_ASSESSMENT", weightBp: 0 },
  ] as const;

  it("leaves the part out of a set from a server that sent no row for it, rather than writing a 0", () => {
    const set = weightSetFromRows(sixRows);
    expect("MANAGER_APPRAISAL" in set).toBe(false);
    expect(Object.keys(set)).toHaveLength(6);
  });

  it("carries the weight when the server did send a row for it", () => {
    const set = weightSetFromRows([
      ...sixRows,
      { component: "MANAGER_APPRAISAL", weightBp: 3000 },
    ]);
    expect(set.MANAGER_APPRAISAL).toBe(3000);
    expect(Object.keys(set)).toHaveLength(7);
  });

  it("still reads a part the server has always had as 0 when its row is missing", () => {
    const set = weightSetFromRows([
      { component: "OBJECTIVES", weightBp: 10000 },
    ]);
    expect(set.TASKS).toBe(0);
    expect(set.SELF_ASSESSMENT).toBe(0);
    expect("MANAGER_APPRAISAL" in set).toBe(false);
  });
});

describe("a breakdown shows the part only where it carries a weight", () => {
  it("drops it weighted at nothing, as every period from before it existed carries it", () => {
    const parts = [
      part("OBJECTIVES"),
      part("MANAGER_APPRAISAL", { excludedBecause: "NOT_WEIGHTED" }),
    ];
    expect(visibleComponents(parts).map((one) => one.component)).toEqual([
      "OBJECTIVES",
    ]);
  });

  it("keeps it when it is weighted and nobody has sent a mark, in the API's own reason", () => {
    const parts = [
      part("MANAGER_APPRAISAL", {
        weightBp: 3000,
        excludedBecause: "NO_APPRAISER_MARK",
        excludedNote: "No appraiser has sent an overall mark yet.",
      }),
    ];
    expect(visibleComponents(parts)).toHaveLength(1);
  });

  it("keeps it when it counted", () => {
    expect(
      visibleComponents([
        part("MANAGER_APPRAISAL", { weightBp: 3000, included: true }),
      ]),
    ).toHaveLength(1);
  });

  it("still drops Weekly tasks weighted at nothing, and keeps every other part left out", () => {
    const parts = [
      part("TASKS", { excludedBecause: "NOT_WEIGHTED" }),
      part("LEADERSHIP", { excludedBecause: "NOT_A_MANAGER" }),
      part("SELF_ASSESSMENT", { excludedBecause: "NOT_WEIGHTED" }),
    ];
    expect(visibleComponents(parts).map((one) => one.component)).toEqual([
      "LEADERSHIP",
      "SELF_ASSESSMENT",
    ]);
  });

  it("says what was counted by its own name", () => {
    expect(
      evidenceLine({ component: "MANAGER_APPRAISAL", evidenceCount: 1 }),
    ).toBe("Based on 1 overall mark");
    expect(
      evidenceLine({ component: "MANAGER_APPRAISAL", evidenceCount: 2 }),
    ).toBe("Based on 2 overall marks");
    expect(
      evidenceLine({ component: "MANAGER_APPRAISAL", evidenceCount: 0 }),
    ).toBe("Nothing recorded for this");
    expect(
      evidenceLine({ component: "CORE_COMPETENCY", evidenceCount: 2 }),
    ).toBe("Based on 2 ratings");
  });
});

describe("whether the appraisers' overall mark counts is read off the score, never assumed", () => {
  const counted = [
    part("OBJECTIVES", { weightBp: 7000 }),
    part("MANAGER_APPRAISAL", { weightBp: 3000, included: true }),
  ];
  const notWeighted = [
    part("OBJECTIVES", { weightBp: 7000 }),
    part("MANAGER_APPRAISAL", {
      weightBp: 0,
      excludedBecause: "NOT_WEIGHTED",
    }),
  ];
  const absent = [part("OBJECTIVES", { weightBp: 7000 })];

  it("counts only where the part is there and carries a weight, and names it by the company's word", () => {
    expect(scoredFrom(counted)).toBe("Manager appraisal");
    expect(scoredFrom(notWeighted)).toBeNull();
    expect(scoredFrom(absent)).toBeNull();
    expect(
      scoredFrom([
        part("MANAGER_APPRAISAL", { weightBp: 100, label: "Line view" }),
      ]),
    ).toBe("Line view");
  });

  it("is a weighted part with nothing sent yet that still counts, because the period decided it", () => {
    expect(
      scoredFrom([
        part("MANAGER_APPRAISAL", {
          weightBp: 3000,
          excludedBecause: "NO_APPRAISER_MARK",
        }),
      ]),
    ).toBe("Manager appraisal");
  });

  it("says the part it is scored from, and nothing about reference", () => {
    expect(scoredFromSentence(counted)).toBe(
      "It is what Manager appraisal is scored from.",
    );
    expect(scoredFromSentence(notWeighted)).toBeNull();
  });

  it("keeps the old words for a mark that is for reference, whether the part is at 0% or the server has no part", () => {
    for (const parts of [notWeighted, absent]) {
      expect(
        appraiserMarkHint({ appraisers: 1, submittedWeightBp: 10000 }, parts),
      ).toBe("For reference. It does not count towards the score.");
      expect(
        appraiserMarkHint({ appraisers: 3, submittedWeightBp: 6667 }, parts),
      ).toBe(
        "66.67% of the weight is in, across 3 appraisers. For reference; it does not count towards the score.",
      );
    }
  });

  it("points at the part instead where the mark is scored, so the sentence and the figure agree", () => {
    expect(
      appraiserMarkHint({ appraisers: 1, submittedWeightBp: 10000 }, counted),
    ).toBe("It is what Manager appraisal is scored from.");
    const several = appraiserMarkHint(
      { appraisers: 3, submittedWeightBp: 6667 },
      counted,
    );
    expect(several).toBe(
      "66.67% of the weight is in, across 3 appraisers. It is what Manager appraisal is scored from.",
    );
    expect(several).not.toMatch(/reference|does not count/);
  });
});

describe("the strip above an appraiser's form", () => {
  const sole = { weightBp: 10000, appraiserCount: 1 };
  const three = { weightBp: 4000, appraiserCount: 3 };

  it("says it counts, and for how much, when the period weights the part", () => {
    expect(
      appraiserStripLine({
        appraiser: { ...sole, markShareBp: 3000 },
        mine: true,
        asksMark: true,
      }),
    ).toBe("Your overall mark counts for 30% of the mark.");
  });

  it("says a shared appraiser's own share of what the appraisers say, and the part's share of the mark beside it", () => {
    expect(
      appraiserStripLine({
        appraiser: { ...three, markShareBp: 3000 },
        mine: true,
        asksMark: true,
      }),
    ).toBe(
      "Your overall mark counts for 40% of what the appraisers say, alongside 2 others. What they say is 30% of the mark.",
    );
    expect(
      appraiserStripLine({
        appraiser: { weightBp: 5000, appraiserCount: 2, markShareBp: 3000 },
        mine: false,
        asksMark: true,
      }),
    ).toBe(
      "This overall mark counts for 50% of what the appraisers say, alongside 1 other. What they say is 30% of the mark.",
    );
  });

  it("says it does not count where the period does not weight the part and the form asks for a mark", () => {
    expect(
      appraiserStripLine({
        appraiser: { ...sole, markShareBp: 0 },
        mine: true,
        asksMark: true,
      }),
    ).toBe("Your overall mark does not count towards the score.");
    expect(
      appraiserStripLine({
        appraiser: { ...three, markShareBp: 0 },
        mine: true,
        asksMark: true,
      }),
    ).toBe(
      "Your overall mark does not count towards the score, alongside 2 others.",
    );
  });

  it("makes no claim about the mark where the form does not ask for one", () => {
    expect(
      appraiserStripLine({
        appraiser: { ...sole, markShareBp: 0 },
        mine: true,
        asksMark: false,
      }),
    ).toBeNull();
    expect(
      appraiserStripLine({
        appraiser: { weightBp: 3334, appraiserCount: 3, markShareBp: 0 },
        mine: true,
        asksMark: false,
      }),
    ).toBe("Your share among the 3 appraisers is 33.34%.");
  });

  it("makes no claim at all from a server that does not say, which is not a server saying it does not count", () => {
    for (const asksMark of [true, false]) {
      const line = appraiserStripLine({
        appraiser: { ...sole },
        mine: true,
        asksMark,
      });
      expect(line).toBeNull();
      const shared = appraiserStripLine({
        appraiser: { weightBp: 5000, appraiserCount: 2 },
        mine: false,
        asksMark,
      });
      expect(shared).toBe(
        "This appraiser's share among the 2 appraisers is 50%.",
      );
      expect(shared).not.toMatch(/count|mark|score/i);
    }
  });

  it("never says the review counts for the mark, which was never true of the review", () => {
    for (const markShareBp of [undefined, 0, 3000]) {
      for (const asksMark of [true, false]) {
        const line = appraiserStripLine({
          appraiser: {
            ...three,
            ...(markShareBp === undefined ? {} : { markShareBp }),
          },
          mine: true,
          asksMark,
        });
        expect(line ?? "").not.toMatch(/review counts/i);
      }
    }
  });

  it("claims a share of the mark only where the period weights the part", () => {
    for (const markShareBp of [undefined, 0]) {
      for (const asksMark of [true, false]) {
        const line = appraiserStripLine({
          appraiser: {
            ...three,
            ...(markShareBp === undefined ? {} : { markShareBp }),
          },
          mine: true,
          asksMark,
        });
        expect(line ?? "").not.toMatch(/of the mark/);
      }
    }
    expect(
      appraiserStripLine({
        appraiser: { ...three, markShareBp: 3000 },
        mine: true,
        asksMark: false,
      }),
    ).toMatch(/30% of the mark/);
  });
});

describe("the overall mark page in the answer flow", () => {
  it("is asked where the company asks, or where the period needs it", () => {
    expect(asksOverallMark({ overallMark: true })).toBe(true);
    expect(asksOverallMark({ overallMarkRequired: true })).toBe(true);
    expect(asksOverallMark({ overallMark: false })).toBe(false);
    expect(asksOverallMark({})).toBe(false);
  });

  it("is a page that cannot be missing from a form the server will not take without a mark", () => {
    /* A server that says needed but not asked is inconsistent; the form must
       still have the page, or nobody could ever send it. */
    expect(
      asksOverallMark({ overallMark: false, overallMarkRequired: true }),
    ).toBe(true);
  });

  it("is needed only where the server says so, and absent means not needed", () => {
    expect(needsOverallMark({ overallMarkRequired: true })).toBe(true);
    expect(needsOverallMark({ overallMarkRequired: false })).toBe(false);
    expect(needsOverallMark({})).toBe(false);
  });

  const alone = (markShareBp?: number) => ({
    weightBp: 10000,
    appraiserCount: 1,
    ...(markShareBp === undefined ? {} : { markShareBp }),
  });

  it("asks whether there is one when it is optional, and says why it is needed when it is", () => {
    expect(markPageWords(false, undefined)).toEqual({
      title: "Is there an overall mark?",
      lead: "Optional. Leave it if the answers say enough.",
    });
    expect(markPageWords(true, alone(3000))).toEqual({
      title: "Your overall mark",
      lead: "Needed. It counts for 30% of the mark in this period.",
    });
    expect(markPageWords(true, undefined).lead).toBe(
      "Needed. This period counts it towards the score.",
    );
    expect(markPageWords(true, alone(0)).lead).toBe(
      "Needed. This period counts it towards the score.",
    );
    expect(markPageWords(true, alone()).lead).toBe(
      "Needed. This period counts it towards the score.",
    );
  });

  it("with several appraisers says their own slice and the part's share, in the strip's own sentence", () => {
    /* `markShareBp` is the whole part's share of the mark. Two appraisers at 60/40
       and the part at 30% is 18% for this one, so "it counts for 30%" would be the
       whole part said as theirs, and the strip on the same form says otherwise. */
    const appraiser = { weightBp: 6000, appraiserCount: 2, markShareBp: 3000 };
    const strip = appraiserStripLine({ appraiser, mine: true, asksMark: true });
    expect(markPageWords(true, appraiser).lead).toBe(`Needed. ${strip}`);
    expect(markPageWords(true, appraiser).lead).toBe(
      "Needed. Your overall mark counts for 60% of what the appraisers say, alongside 1 other. What they say is 30% of the mark.",
    );
    expect(markPageWords(true, appraiser).lead).not.toMatch(
      /counts for 30% of the mark in this period/,
    );
  });

  it("with several appraisers and no share from the server makes no figure up", () => {
    const lead = markPageWords(true, {
      weightBp: 6000,
      appraiserCount: 2,
    }).lead;
    expect(lead).toBe("Needed. This period counts it towards the score.");
    expect(lead).not.toMatch(/%/);
  });

  it("keeps the sole appraiser's wording when there is one appraiser", () => {
    expect(
      markPageWords(true, {
        weightBp: 10000,
        appraiserCount: 1,
        markShareBp: 3000,
      }).lead,
    ).toBe("Needed. It counts for 30% of the mark in this period.");
  });

  it("says what still stops a send, the questions and the mark together", () => {
    expect(stillNeededLine(0, false)).toBeNull();
    expect(stillNeededLine(0, true)).toBe(
      "The overall mark still needs an answer before this can go.",
    );
    expect(stillNeededLine(1, false)).toBe(
      "1 question still needs an answer before this can go.",
    );
    expect(stillNeededLine(3, false)).toBe(
      "3 questions still need an answer before this can go.",
    );
    expect(stillNeededLine(1, true)).toBe(
      "1 question and the overall mark still need an answer before this can go.",
    );
    expect(stillNeededLine(2, true)).toBe(
      "2 questions and the overall mark still need an answer before this can go.",
    );
  });
  it("opens on no mark where the form does not ask for one, whatever is remembered or held", () => {
    expect(startingMark({ asks: false, local: "4", held: 3 })).toBe("");
    expect(startingMark({ asks: false, local: "", held: 3 })).toBe("");
  });

  it("opens on the mark this browser remembers, over the one the record holds", () => {
    expect(startingMark({ asks: true, local: "2", held: 4 })).toBe("2");
  });

  it("opens on the mark the record already holds where the browser remembers none, as a review sent back for revision does", () => {
    expect(startingMark({ asks: true, local: "", held: 4 })).toBe("4");
  });

  it("opens on none for a first-time form, so a needed mark still has to be given", () => {
    expect(startingMark({ asks: true, local: "", held: null })).toBe("");
    expect(startingMark({ asks: true, local: "", held: undefined })).toBe("");
  });
});
