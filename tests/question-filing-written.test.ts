import { describe, expect, it } from "vitest";
import {
  filingNote,
  type Filing,
} from "@/app/(app)/performance/question-filing";

/**
 * What the Questions dialog says about a question filed under a subsection that is
 * answered in words.
 *
 * For a level the sentence says where the mark comes from: the section's weight,
 * and the level recorded on the subsection. For words that sentence would be false
 * in every state, because nothing a manager writes on a written subsection ever
 * reaches the mark, however much the section is worth. So it says that, in one
 * sentence, in every state the section can be in, and does not quote a weight it
 * cannot give.
 */

const written = (over: Partial<Filing> = {}): Filing => ({
  sectionId: "s-1",
  competencyId: "c-1",
  section: { name: "Behavioural competency", weightBp: 3000 },
  subsectionName: "Communication",
  answerKind: "TEXT",
  ...over,
});

const SAID =
  "Answers to questions written here do not count towards the mark. Nor does the written answer recorded on Communication.";

describe("a question filed under a written subsection", () => {
  it("says neither it nor a written answer recorded on the subsection counts", () => {
    expect(filingNote(written())).toEqual({ tone: "muted", text: SAID });
  });

  it("says the same in every state the section can be in, because the section's worth does not matter to words", () => {
    for (const section of [
      { name: "Behavioural competency", weightBp: 3000 },
      { name: "Culture", weightBp: null },
      { name: "Behavioural competency", weightBp: undefined },
      undefined,
    ]) {
      const note = filingNote(
        written(section === undefined ? { section: undefined } : { section }),
      );
      expect(note.text).toBe(SAID);
    }
  });

  it("does not quote the section's weight, which it cannot give a written answer", () => {
    const note = filingNote(written());
    expect(note.text).not.toMatch(/\d+%/);
    expect(note.text).not.toContain("of the mark, and it comes from");
    expect(note.text).not.toContain("comes from");
  });

  it("does not warn about an unweighted section or about no section, which could not have counted anyway", () => {
    expect(
      filingNote(written({ section: { name: "Culture", weightBp: null } }))
        .text,
    ).not.toContain("not weighted");
    expect(filingNote(written({ section: undefined })).text).not.toContain(
      "not filed under a section",
    );
  });

  it("is not the warning tone, which is for the one state that is a mistake somebody can save", () => {
    expect(filingNote(written()).tone).toBe("muted");
  });

  it("names the subsection it is about, as it reads now", () => {
    expect(filingNote(written({ subsectionName: "Candour" })).text).toContain(
      "recorded on Candour",
    );
    expect(filingNote(written({ subsectionName: undefined })).text).toContain(
      "recorded on the subsection",
    );
  });
});

describe("a question filed under any other kind of subsection", () => {
  it("still says where the mark comes from, in the words of its kind", () => {
    expect(filingNote({ ...written(), answerKind: "RATING" }).text).toContain(
      "it comes from the level recorded on Communication",
    );
    expect(filingNote({ ...written(), answerKind: "BOOLEAN" }).text).toContain(
      "it comes from the answer recorded on Communication",
    );
    expect(filingNote({ ...written(), answerKind: undefined }).text).toContain(
      "the level recorded on Communication",
    );
  });
});

describe("with no subsection chosen", () => {
  it("does not say anything about words, because there is no kind to name yet", () => {
    expect(
      filingNote({ sectionId: "", competencyId: "", answerKind: "TEXT" }).text,
    ).not.toContain("written answer");
    expect(filingNote({ sectionId: "s-1", competencyId: "" }).tone).toBe(
      "warning",
    );
  });
});
