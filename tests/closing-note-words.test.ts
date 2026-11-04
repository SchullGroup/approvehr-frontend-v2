import { describe, expect, it } from "vitest";
import { closingNoteWords } from "@/app/(focus)/performance/reviews/[id]/answer/focus-logic";

/**
 * What the closing page of an appraisal is called.
 *
 * One field, the review's closing note, named for who is writing it: a manager is
 * writing about somebody else, and what is worth saying after the answers is what
 * they recommend. The person's own page and a peer's ask for anything to add. The
 * page, the preview row and the progress line all read it from here, so they
 * cannot name the same box three ways.
 */

describe("closingNoteWords", () => {
  it("asks a manager for their recommendations", () => {
    const words = closingNoteWords("MANAGER");
    expect(words.title).toBe("Your recommendations");
    expect(words.row).toBe("Recommendations");
    expect(words.lead).toMatch(/recommend/);
    expect(words.placeholder).toMatch(/recommendation/);
  });

  it.each(["SELF", "PEER"] as const)(
    "asks a %s form for anything to add",
    (kind) => {
      const words = closingNoteWords(kind);
      expect(words.title).toBe("Anything to add?");
      expect(words.row).toBe("Anything to add");
      expect(words.lead).toBe("Optional. A line or two in your own words.");
      expect(words.placeholder).toBe("Type here if there is more to say");
    },
  );

  it("stays optional on every form, and says so", () => {
    for (const kind of ["MANAGER", "SELF", "PEER"] as const) {
      expect(closingNoteWords(kind).lead.startsWith("Optional.")).toBe(true);
    }
  });
});
