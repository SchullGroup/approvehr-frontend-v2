import { describe, expect, it } from "vitest";
import {
  RATING_LABELS,
  ratingWords,
  ratingWordsFrom,
  type ApiFormQuestion,
} from "@/lib/api/performance";
import {
  filled,
  periodWords,
  ratingOptionsFrom,
} from "@/app/(app)/performance/review-parts";
import { scaleProblem } from "@/app/(app)/settings/performance/scale-form";

/**
 * The three configurable pieces of an appraisal form, as pure functions.
 *
 * Each of these is a rule the API also enforces, and each is checked on this
 * side so nobody meets the refusal by surprise after pressing Save. The point
 * of testing them here is that **the wrong answer is silent**: a scale that
 * quotes the defaults at a company that renamed a level, a required file
 * question that reads as outstanding after somebody attached the file, and a
 * period range that makes a reader check two identical years — none of them is
 * a crash, a type error or a failing request.
 */

const question = (over: Partial<ApiFormQuestion> = {}): ApiFormQuestion => ({
  id: "q-1",
  competencyId: null,
  prompt: "Attach any supporting evidence.",
  kind: "FILE",
  required: true,
  options: [],
  allowCustom: false,
  order: 0,
  answer: null,
  ...over,
});

const scale = (labels: Record<number, string>) =>
  Object.keys(labels)
    .map(Number)
    .sort((a, b) => a - b)
    .map((level) => ({
      level,
      label: labels[level] ?? "",
      meaning: "",
    }));

describe("a mark is read back in the company's own words", () => {
  it("uses the company's scale, not the built-in one", () => {
    const theirs = scale({
      1: "Off track",
      2: "Behind",
      3: "On track",
      4: "Ahead",
      5: "Outstanding",
    });
    expect(ratingWordsFrom(theirs)(3)).toBe("On track");
    /* The defaults would have said this, and saying it to a company that
       renamed the level is the whole defect. */
    expect(RATING_LABELS[3]).toBe("Meets Expectations");
    expect(ratingWordsFrom(theirs)(3)).not.toBe(RATING_LABELS[3]);
  });

  it("falls back to the defaults when there is no company scale", () => {
    /* What an offline screen has, and what `ratingWords` is. */
    expect(ratingWordsFrom(null)(4)).toBe(RATING_LABELS[4]);
    expect(ratingWords(4)).toBe(RATING_LABELS[4]);
  });

  it("says nothing for no mark, rather than nought", () => {
    /* "Absent is not zero" — a form whose author put no number on it is not a
       form marked nought, and every caller renders its own sentence for the
       absence. */
    expect(ratingWordsFrom(null)(null)).toBeNull();
    expect(ratingWordsFrom(null)(undefined)).toBeNull();
  });

  it("states a legacy level outside the scale rather than inventing a word", () => {
    const theirs = scale({
      1: "One",
      2: "Two",
      3: "Three",
      4: "Four",
      5: "Five",
    });
    /* Only reachable on a row written before the range was enforced. It says
       what is stored — the alternative is a blank, or a word nobody chose. */
    expect(ratingWordsFrom(theirs)(7)).toBe("7 out of 5");
  });

  it("keeps the number on a picker and drops it on a record", () => {
    const theirs = scale({
      1: "Off track",
      2: "Behind",
      3: "On track",
      4: "Ahead",
      5: "Outstanding",
    });
    /* The coordinates people use while marking — "I gave her a four" — belong
       on the control being scanned. A record is read, and should say what was
       decided. */
    expect(
      ratingOptionsFrom({ levels: theirs, source: "saved", max: 5 })[2],
    ).toEqual({
      value: "3",
      label: "3: On track",
      meaning: "",
    });
    expect(ratingWordsFrom(theirs)(3)).toBe("On track");
  });
});

describe("the scale cannot be saved in a state nobody could read", () => {
  it("refuses two levels sharing a word", () => {
    /* The one mistake somebody editing five text boxes actually makes. A
       reader could not tell a 2 from a 4. */
    const problem = scaleProblem([
      { level: 1, label: "Unsatisfactory" },
      { level: 2, label: "Below Expectations" },
      { level: 3, label: "Meets Expectations" },
      { level: 4, label: "meets expectations" },
      { level: 5, label: "Exceptional" },
    ]);
    expect(problem).toContain("cannot share a word");
  });

  it("refuses a level with no word, and names the level", () => {
    const problem = scaleProblem([
      { level: 1, label: "Unsatisfactory" },
      { level: 2, label: "   " },
      { level: 3, label: "Meets Expectations" },
    ]);
    expect(problem).toBe("Level 2 needs a word.");
  });

  it("accepts five distinct words", () => {
    expect(
      scaleProblem([
        { level: 1, label: "Off track" },
        { level: 2, label: "Behind" },
        { level: 3, label: "On track" },
        { level: 4, label: "Ahead" },
        { level: 5, label: "Outstanding" },
      ]),
    ).toBeNull();
  });
});

describe("what a period covers, said once", () => {
  it("shows the year once when both dates share it", () => {
    /* "1 Jan 2026 – 31 Jul 2026" makes a reader check two years that are the
       same one. */
    expect(periodWords("2026-01-01", "2026-07-31")).toBe("1 Jan – 31 Jul 2026");
  });

  it("shows both years when the period crosses December", () => {
    expect(periodWords("2025-07-01", "2026-06-30")).toBe(
      "1 Jul 2025 – 30 Jun 2026",
    );
  });

  it("says nothing rather than guessing from half a range", () => {
    /* Both or neither. A cycle with no stated period renders nothing — never a
       range derived from its name, which is a guess presented as a record. */
    expect(periodWords(null, null)).toBeNull();
    expect(periodWords("2026-01-01", null)).toBeNull();
    expect(periodWords(null, "2026-07-31")).toBeNull();
  });
});

describe("an evidence question counts as answered when there is a file", () => {
  it("counts a file picked in this session", () => {
    expect(
      filled(question(), {
        file: {
          kind: "inline",
          contentBase64: "JVBERi0=",
          filename: "Q2 dashboard.pdf",
          mimeType: "application/pdf",
          sizeBytes: 8,
        },
      }),
    ).toBe(true);
  });

  it("counts a file already on the record, with nothing in the draft", () => {
    /* The case that made this a special branch. Every other kind round-trips
       through `draftFrom`, so the draft alone is the whole answer; a `File`
       cannot be rebuilt from a filename, so reading only the draft would tell
       somebody who attached their evidence last week that a required question
       is still outstanding — and hold the form shut. */
    expect(
      filled(
        question({
          answer: {
            ratingValue: null,
            textValue: null,
            choiceValue: null,
            boolValue: null,
            attachment: {
              id: "a-1",
              filename: "Q2 dashboard.pdf",
              contentType: "application/pdf",
              sizeBytes: 4096,
            },
            answeredAt: "2026-08-01T09:00:00.000Z",
          },
        }),
        {},
      ),
    ).toBe(true);
  });

  it("is unanswered when neither has a file", () => {
    expect(filled(question(), {})).toBe(false);
    /* And an answer without an attachment is not the same as no answer: the
       API distinguishes them and so does this. */
    expect(
      filled(
        question({
          answer: {
            ratingValue: null,
            textValue: null,
            choiceValue: null,
            boolValue: null,
            attachment: null,
            answeredAt: "2026-08-01T09:00:00.000Z",
          },
        }),
        {},
      ),
    ).toBe(false);
  });

  it("does not let a text answer stand in for a file", () => {
    /* "see attached" is not evidence. The API refuses it too. */
    expect(filled(question(), { text: "see attached" })).toBe(false);
  });
});
