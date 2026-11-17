import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  WEEKLY_LINE_COUNTER_FROM,
  WEEKLY_LINE_MAX_LENGTH,
  WEEKLY_LINE_TOO_LONG,
  addLine,
  lineFits,
  weeklyLineCounter,
  weeklyLineIsOver,
  weeklyLineRefusal,
} from "@/lib/performance/weekly-line";

/**
 * What the server will take for one weekly line, so the box can say so before the request and not
 * as a refusal after it.
 *
 * What is proved: the limit is the server's (300, counted on the trimmed text, the way its
 * `submitTaskSchema` counts it); the count appears only when it is worth showing and keeps counting
 * past the limit; a line that would take the box past the limit is not added, whatever is in the box,
 * and one that fits is joined on a new line without replacing anything; and a refusal is read out of
 * the server's own field sentence when it sent one.
 */

const words = (n: number) => "x".repeat(n);

describe("the limit", () => {
  it("is the server's: 300, counted on the trimmed text", () => {
    expect(WEEKLY_LINE_MAX_LENGTH).toBe(300);
    expect(weeklyLineIsOver(words(300))).toBe(false);
    expect(weeklyLineIsOver(words(301))).toBe(true);
    expect(weeklyLineIsOver(`   ${words(300)}   `)).toBe(false);
    expect(weeklyLineIsOver(`\n${words(301)}\n`)).toBe(true);
  });

  it("says it in the server's own sentence", () => {
    expect(WEEKLY_LINE_TOO_LONG).toBe(
      "Keep it short enough to read in a list.",
    );
  });
});

describe("the count", () => {
  it("is not shown until it is worth showing", () => {
    expect(weeklyLineCounter("")).toBeNull();
    expect(weeklyLineCounter(words(WEEKLY_LINE_COUNTER_FROM - 1))).toBeNull();
  });

  it("is shown from 250, as 'N of 300 characters'", () => {
    expect(weeklyLineCounter(words(250))).toBe("250 of 300 characters");
    expect(weeklyLineCounter(words(300))).toBe("300 of 300 characters");
  });

  it("keeps counting past the limit, which is the clearest way to say by how much", () => {
    expect(weeklyLineCounter(words(329))).toBe("329 of 300 characters");
  });

  it("counts what the server counts: the trimmed text", () => {
    expect(weeklyLineCounter(`  ${words(250)}  `)).toBe(
      "250 of 300 characters",
    );
  });
});

describe("adding a line to the box", () => {
  it("puts it in an empty box as it is", () => {
    expect(addLine("", "PLT-1 Ship it")).toBe("PLT-1 Ship it");
    expect(addLine("   \n ", "PLT-1 Ship it")).toBe("PLT-1 Ship it");
  });

  it("puts it on a new line after what is there, and never replaces it", () => {
    expect(addLine("Did the migration.", "PLT-1 Ship it")).toBe(
      "Did the migration.\nPLT-1 Ship it",
    );
    expect(addLine("Did the migration.  \n", "PLT-1 Ship it")).toBe(
      "Did the migration.\nPLT-1 Ship it",
    );
  });

  it("adds nothing when it would take the box past the limit, and the box is as it was", () => {
    const current = words(200);
    const line = words(100);
    expect(lineFits(current, line)).toBe(false);
    expect(addLine(current, line)).toBe(current);
  });

  it("counts the new line's own break: 200 and 99 and a break is 300, which fits", () => {
    const current = words(200);
    expect(lineFits(current, words(99))).toBe(true);
    expect(lineFits(current, words(100))).toBe(false);
    expect(addLine(current, words(99)).trim().length).toBe(300);
  });

  it("measures the trimmed text, not the spaces round it", () => {
    expect(lineFits(`${words(200)}      `, words(99))).toBe(true);
  });

  it("does not hold a line that is already over the limit against an empty box twice", () => {
    /* One line longer than the limit cannot go in whatever the box holds: the server cuts its own
       suggestions to the limit, so this is a server that did not. */
    expect(lineFits("", words(301))).toBe(false);
    expect(addLine("", words(301))).toBe("");
  });
});

describe("a refusal", () => {
  it("is the server's field sentence when it sent one", () => {
    const refusal = new ApiError(
      400,
      "validation",
      "Some fields are not valid.",
      [
        {
          field: "description",
          message: "Keep it short enough to read in a list.",
        },
      ],
    );
    expect(weeklyLineRefusal(refusal)).toBe(
      "Keep it short enough to read in a list.",
    );
  });

  it("is the description's own sentence, even when another field is listed first", () => {
    const refusal = new ApiError(
      400,
      "validation",
      "Some fields are not valid.",
      [
        {
          field: "keyResultId",
          message: "That is not a measure of this objective.",
        },
        { field: "description", message: "Say what you worked on." },
      ],
    );
    expect(weeklyLineRefusal(refusal)).toBe("Say what you worked on.");
  });

  it("is another field's sentence when that is all the server sent, which is still more than 'not valid'", () => {
    const refusal = new ApiError(
      400,
      "validation",
      "Some fields are not valid.",
      [
        {
          field: "keyResultId",
          message: "That is not a measure of this objective.",
        },
      ],
    );
    expect(weeklyLineRefusal(refusal)).toBe(
      "That is not a measure of this objective.",
    );
  });

  it("is the server's message when there are no field sentences", () => {
    expect(
      weeklyLineRefusal(
        new ApiError(
          403,
          "forbidden",
          "You can only log tasks against your own objectives.",
        ),
      ),
    ).toBe("You can only log tasks against your own objectives.");
  });

  it("is ours only when it was not the server that answered", () => {
    expect(weeklyLineRefusal(new Error("boom"))).toBe("Could not log that.");
    expect(weeklyLineRefusal("nope")).toBe("Could not log that.");
  });
});
