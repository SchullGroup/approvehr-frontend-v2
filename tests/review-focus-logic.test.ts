import { describe, expect, it } from "vitest";
import type { ApiFormQuestion } from "@/lib/api/performance";
import {
  KEPT_HERE,
  KEPT_HERE_STATUS,
  keptInBrowser,
  keptInBrowserLine,
  onRecordOf,
  savedAnswerStands,
  sigOf,
  startIndex,
} from "@/app/(focus)/performance/reviews/[id]/answer/focus-logic";

/**
 * The decisions behind the one-question-at-a-time review page.
 *
 * Tested because each is the kind of thing that is right in a demo and wrong
 * for somebody who comes back tomorrow: which page it reopens on, and — the one
 * a real run found — what a person is told is on the record after emptying a
 * box whose answer is already saved.
 */

const question = (
  id: string,
  over: Partial<ApiFormQuestion> = {},
): ApiFormQuestion => ({
  id,
  competencyId: null,
  prompt: `Question ${id}`,
  kind: "TEXT",
  required: true,
  options: [],
  allowCustom: false,
  order: 0,
  answer: null,
  ...over,
});

const answered = (text: string): ApiFormQuestion["answer"] =>
  ({
    textValue: text,
    ratingValue: null,
    choiceValue: null,
    boolValue: null,
    attachment: null,
  }) as unknown as ApiFormQuestion["answer"];

const none = {
  mark: "",
  summary: "",
  step: 0,
  potential: "",
  potentialReason: "",
};

describe("startIndex", () => {
  it("opens a review with nothing in it on the introduction", () => {
    const review = { questions: [question("a"), question("b")] };
    expect(startIndex(review, none)).toBe(0);
  });

  it("goes to the first required question that has no answer", () => {
    const review = {
      questions: [
        question("a", { answer: answered("done") }),
        question("b"),
        question("c"),
      ],
    };
    expect(startIndex(review, none)).toBe(2); // intro, a, b
  });

  it("skips an optional question nobody answered", () => {
    const review = {
      questions: [
        question("a", { answer: answered("done") }),
        question("b", { required: false }),
        question("c"),
      ],
    };
    expect(startIndex(review, none)).toBe(3); // intro, a, b, c
  });

  it("goes to the note once every required question has an answer", () => {
    const review = {
      questions: [
        question("a", { answer: answered("done") }),
        question("b", { required: false }),
      ],
    };
    expect(startIndex(review, none)).toBe(3); // intro, a, b, note
  });

  it("goes back to the page this browser remembers, clamped to the last one", () => {
    const review = { questions: [question("a"), question("b")] };
    expect(startIndex(review, { ...none, step: 2 })).toBe(2);
    expect(startIndex(review, { ...none, step: 99 })).toBe(4); // intro a b note preview
  });

  it("treats a remembered note as having started", () => {
    const review = { questions: [question("a"), question("b")] };
    expect(startIndex(review, { ...none, summary: "a line" })).toBe(1);
  });
});

describe("startIndex where the company asks for an overall mark", () => {
  const review = { questions: [question("a"), question("b")] };

  it("has one more page, so the last one is one further on", () => {
    expect(startIndex(review, { ...none, step: 99 }, true)).toBe(5); // intro a b mark note preview
    expect(startIndex(review, { ...none, step: 99 }, false)).toBe(4);
  });

  it("goes to the mark once every required question has an answer", () => {
    const answeredAll = {
      questions: [
        question("a", { answer: answered("done") }),
        question("b", { answer: answered("done") }),
      ],
    };
    /* Pages: intro, a, b, mark, note, preview. Without a mark the same index is the note. */
    expect(startIndex(answeredAll, none, true)).toBe(3);
    expect(startIndex(answeredAll, none, false)).toBe(3);
  });

  it("treats a remembered mark as having started, but only while one is asked for", () => {
    const empty = { questions: [] };
    expect(startIndex(empty, { ...none, mark: "4" }, true)).toBe(1);
    /* A mark left in a draft from before the setting moved is not progress. */
    expect(startIndex(empty, { ...none, mark: "4" }, false)).toBe(0);
  });
});

describe("what is on the record", () => {
  const q = question("a");
  const saved = { text: "what I saved" };

  it("is the box when the box holds an answer", () => {
    expect(onRecordOf(q, { text: "a new one" }, saved)).toEqual({
      text: "a new one",
    });
  });

  it("is the saved answer when the box has been emptied", () => {
    expect(onRecordOf(q, { text: "" }, saved)).toEqual(saved);
    expect(onRecordOf(q, { text: "   " }, saved)).toEqual(saved);
  });

  it("is the saved answer when the box was never touched", () => {
    expect(onRecordOf(q, undefined, saved)).toEqual(saved);
  });

  it("says the saved answer stands only when the box is empty and one is saved", () => {
    expect(savedAnswerStands(q, { text: "" }, saved)).toBe(true);
    expect(savedAnswerStands(q, { text: "new" }, saved)).toBe(false);
    expect(savedAnswerStands(q, undefined, saved)).toBe(false);
    expect(savedAnswerStands(q, { text: "" }, {})).toBe(false);
  });
});

describe("sigOf", () => {
  it("tells a change from no change", () => {
    expect(sigOf({ text: "a" })).toBe(sigOf({ text: "a" }));
    expect(sigOf({ text: "a" })).not.toBe(sigOf({ text: "b" }));
    expect(sigOf({})).toBe(sigOf({ text: undefined }));
  });
});

describe("startIndex on a manager's form that asks how far they could go", () => {
  const review = { questions: [question("a"), question("b")] };

  it("counts the potential page, so the last page is the preview and not the note", () => {
    /* intro a b potential note preview: the preview is index 5. Counted without
       the potential page a page remembered on the preview came back one early. */
    expect(startIndex(review, { ...none, step: 99 }, false, true)).toBe(5);
    expect(startIndex(review, { ...none, step: 99 }, false, false)).toBe(4);
  });

  it("counts the mark and the potential page together", () => {
    expect(startIndex(review, { ...none, step: 99 }, true, true)).toBe(6);
  });

  it("treats a remembered answer as having started, only where it is asked", () => {
    const held = { ...none, potential: "MEDIUM" };
    expect(startIndex(review, held, false, true)).toBe(1);
    expect(startIndex(review, held, false, false)).toBe(0);
  });
});

describe("what is kept in this browser, and how it is said", () => {
  it("is the closing note on every form, named for who is writing it", () => {
    expect(keptInBrowser("SELF", { mark: false, potential: false })).toEqual([
      "what you add at the end",
    ]);
    expect(keptInBrowser("MANAGER", { mark: false, potential: false })).toEqual(
      ["your recommendations"],
    );
  });

  it("adds the mark and the potential only where the form asks", () => {
    expect(keptInBrowser("MANAGER", { mark: true, potential: true })).toEqual([
      "your overall rating",
      "how far they could go",
      "your recommendations",
    ]);
    expect(keptInBrowser("MANAGER", { mark: false, potential: true })).toEqual([
      "how far they could go",
      "your recommendations",
    ]);
  });

  it("reads as one sentence that needs no verb to agree with its list", () => {
    expect(keptInBrowserLine(["what you add at the end"])).toBe(
      "Kept in this browser only, until you send: what you add at the end.",
    );
    expect(keptInBrowserLine(["your recommendations"])).toBe(
      "Kept in this browser only, until you send: your recommendations.",
    );
    expect(
      keptInBrowserLine([
        "your overall rating",
        "how far they could go",
        "your recommendations",
      ]),
    ).toBe(
      "Kept in this browser only, until you send: your overall rating, how far they could go and your recommendations.",
    );
    expect(keptInBrowserLine(["a", "b"])).toBe(
      "Kept in this browser only, until you send: a and b.",
    );
  });

  it("opens with the words each page uses, so it is one statement said twice", () => {
    expect(
      keptInBrowserLine(["a"]).startsWith(KEPT_HERE.replace(/\.$/, ":")),
    ).toBe(true);
  });

  it("says nothing for an empty list", () => {
    expect(keptInBrowserLine([])).toBe("");
  });

  it("never calls it saved", () => {
    expect(KEPT_HERE).not.toMatch(/saved/i);
    expect(KEPT_HERE_STATUS).not.toMatch(/saved/i);
    expect(keptInBrowserLine(["a"])).not.toMatch(/saved/i);
  });
});
