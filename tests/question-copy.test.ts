import { describe, expect, it } from "vitest";
import { copyNoteFor } from "@/lib/performance/question-copy";

/**
 * What a copy of a period's questions says when it left something behind.
 *
 * Every way this can be wrong is well typed: a line about a copy that left
 * nothing out, a line made up for a server that said nothing, the API's sentence
 * reworded, "Copied 0 questions".
 */

const NOTE = 'Left out: "Teamwork" (it is switched off).';

describe("when nothing was left out", () => {
  it("says nothing, whatever was copied", () => {
    expect(
      copyNoteFor({ cycleId: "c", copied: 3, skipped: 0, skippedNote: null }),
    ).toBeNull();
  });

  it("says nothing for a server that sends neither field, which is not the same as saying nothing was left out", () => {
    expect(copyNoteFor({ cycleId: "c", copied: 3 })).toBeNull();
  });

  it("says nothing for a note that is only spaces", () => {
    expect(
      copyNoteFor({ cycleId: "c", copied: 3, skipped: 0, skippedNote: "   " }),
    ).toBeNull();
  });
});

describe("when something was left out", () => {
  it("gives what arrived, then the API's own sentence, unchanged", () => {
    expect(
      copyNoteFor({ cycleId: "c", copied: 2, skipped: 1, skippedNote: NOTE }),
    ).toBe(`Copied 2 questions. ${NOTE}`);
  });

  it("says question, not questions, for one", () => {
    expect(
      copyNoteFor({ cycleId: "c", copied: 1, skipped: 1, skippedNote: NOTE }),
    ).toBe(`Copied 1 question. ${NOTE}`);
  });

  it("says plainly that nothing arrived, rather than Copied 0 questions", () => {
    const text = copyNoteFor({
      cycleId: "c",
      copied: 0,
      skipped: 1,
      skippedNote: NOTE,
    });
    expect(text).toBe(`Nothing was copied. ${NOTE}`);
    expect(text).not.toMatch(/Copied 0/);
  });

  it("keeps a sentence naming several subsections as it came", () => {
    const several =
      'Left out: "Teamwork" (it is switched off), "Initiative" (it no longer exists).';
    expect(
      copyNoteFor({
        cycleId: "c",
        copied: 4,
        skipped: 2,
        skippedNote: several,
      }),
    ).toBe(`Copied 4 questions. ${several}`);
  });

  it("says what it knows, and no more, when there is a count and no sentence", () => {
    expect(copyNoteFor({ cycleId: "c", copied: 2, skipped: 1 })).toBe(
      "Copied 2 questions. 1 question was left out.",
    );
    expect(
      copyNoteFor({ cycleId: "c", copied: 2, skipped: 3, skippedNote: null }),
    ).toBe("Copied 2 questions. 3 questions were left out.");
  });
});
