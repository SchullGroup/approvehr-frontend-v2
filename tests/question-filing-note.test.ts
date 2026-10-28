import { describe, expect, it } from "vitest";
import {
  filingNote,
  type Filing,
} from "@/app/(app)/performance/question-filing";

/**
 * What the Questions dialog says about where a question is filed.
 *
 * It used to read "Answers to this count towards Core competency, which is 40%
 * of the mark", and nothing made that so: the competency part of the mark is
 * built from the level somebody records on a subsection, and the score register
 * never reads the answer to a question. The API pins the rule in
 * `tests/performance-question-answers-not-scored.test.ts`; this pins the words
 * the screen puts on it, so the sentence cannot drift back to promising a
 * weight an answer does not carry.
 */

const core = { name: "Core competency", weightBp: 4000 };

const everyState: [string, Filing][] = [
  [
    "a subsection in a weighted section",
    {
      sectionId: "s-1",
      competencyId: "c-1",
      section: core,
      subsectionName: "Diligence",
    },
  ],
  [
    "a subsection in a section that is not weighted",
    {
      sectionId: "s-2",
      competencyId: "c-2",
      section: { name: "Culture", weightBp: null },
      subsectionName: "Candour",
    },
  ],
  [
    "a subsection in a section whose weight is not known",
    {
      sectionId: "s-1",
      competencyId: "c-1",
      section: { name: "Core competency", weightBp: undefined },
      subsectionName: "Diligence",
    },
  ],
  [
    "a subsection that is not in a section",
    { sectionId: "", competencyId: "c-3", subsectionName: "Punctuality" },
  ],
  [
    "a section with no subsection picked",
    { sectionId: "s-1", competencyId: "", section: core },
  ],
  ["nothing chosen", { sectionId: "", competencyId: "" }],
];

describe("what a question's filing says about the mark", () => {
  it("says where the mark comes from when it is filed under a weighted subsection", () => {
    expect(filingNote(everyState[0]![1])).toEqual({
      tone: "muted",
      text: "Answers to a question do not count towards the mark. Core competency is 40% of the mark, and it comes from the level recorded on Diligence, under Competency ratings.",
    });
  });

  it("keeps the section's own decimals", () => {
    const note = filingNote({
      sectionId: "s-1",
      competencyId: "c-1",
      section: { name: "Core competency", weightBp: 5833 },
      subsectionName: "Diligence",
    });
    expect(note.text).toContain("Core competency is 58.33% of the mark");
  });

  it("says a section that is not weighted is not weighted, never 0%", () => {
    const note = filingNote(everyState[1]![1]);
    expect(note.text).toContain("Culture is not weighted");
    expect(note.text).not.toContain("0%");
  });

  it("makes no claim about a weight it was not given", () => {
    const note = filingNote(everyState[2]![1]);
    expect(note.text).not.toMatch(/\d+%/);
    expect(note.text).toContain("the level recorded on Diligence");
  });

  it("says an unfiled subsection counts towards no part of the mark", () => {
    expect(filingNote(everyState[3]![1]).text).toContain(
      "Punctuality is not filed under a section",
    );
  });

  it("warns, and only here, about a section picked with no subsection", () => {
    const warned = everyState
      .map(([name, filing]) => [name, filingNote(filing).tone] as const)
      .filter(([, tone]) => tone === "warning")
      .map(([name]) => name);
    expect(warned).toEqual(["a section with no subsection picked"]);
    expect(filingNote(everyState[4]![1]).text).toBe(
      "Pick a subsection to file this question under. A section on its own files it under nothing.",
    );
  });

  it("falls back to a plain sentence when nothing is chosen", () => {
    expect(filingNote(everyState[5]![1]).text).toBe(
      "Answers to a question do not count towards the mark. The mark comes from the level recorded on each subsection, under Competency ratings.",
    );
  });

  describe.each(everyState)("%s", (_name, filing) => {
    it("never promises that an answer counts", () => {
      const { text } = filingNote(filing);
      /* The old sentence: "Answers to this count towards Core competency". */
      expect(text).not.toMatch(/answers? to (this|these|it|them) counts?/i);
      expect(text).not.toMatch(/count towards (the )?[A-Z]/);
      /* The one place the words "do not count" may and must appear. */
      if (filing.competencyId !== "" || filing.sectionId === "") {
        expect(text).toContain("Answers to a question do not count");
      }
    });

    it("has no em dash in what somebody reads", () => {
      expect(filingNote(filing).text).not.toContain("—");
    });
  });
});
