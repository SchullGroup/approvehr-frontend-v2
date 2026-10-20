import { describe, expect, it } from "vitest";
import {
  QUESTION_KINDS,
  addQuestion,
  answerText,
  blankQuestion,
  changeKind,
  countWords,
  defaultDefinition,
  isDefinitionValid,
  isWebLink,
  moveQuestion,
  removeQuestion,
  updateQuestion,
  validateAnswers,
  validateDefinition,
  validateQuestions,
  type FormQuestion,
} from "@/lib/marketing/apply-form";

/**
 * The rules a question and an answer have to meet, and the edits the builder makes.
 *
 * Pure functions, so these are plain input/output. They matter more than their
 * size: the same `validateAnswers` is what the public form, the builder's preview
 * and the tests of both call, which is why a preview can promise to complain about
 * exactly what the real form will.
 */

const question = (over: Partial<FormQuestion> = {}): FormQuestion => ({
  ...blankQuestion("SHORT_TEXT", "q1"),
  label: "Current job title",
  ...over,
});

const choice = (kind: "SINGLE_CHOICE" | "MULTI_CHOICE", over = {}) =>
  question({
    kind,
    options: [
      { id: "a", label: "Excel" },
      { id: "b", label: "SQL" },
      { id: "c", label: "Python" },
    ],
    ...over,
  });

describe("counting words", () => {
  it("counts runs of non-space, so a hyphenated word is one", () => {
    expect(countWords("a well-known firm")).toBe(3);
  });

  it("ignores leading, trailing and doubled whitespace and newlines", () => {
    expect(countWords("  one   two\n\nthree\t")).toBe(3);
  });

  it("is zero for nothing", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   \n ")).toBe(0);
  });
});

describe("a web link answer", () => {
  it("takes http and https with a real host", () => {
    expect(isWebLink("https://example.com/me")).toBe(true);
    expect(isWebLink("http://example.org")).toBe(true);
  });

  it("assumes https when the applicant left it off, as the API does", () => {
    expect(isWebLink("example.com/me")).toBe(true);
    expect(isWebLink("www.linkedin.com/in/chioma")).toBe(true);
  });

  it("refuses everything else, including scripts and bare words", () => {
    expect(isWebLink("portfolio")).toBe(false);
    expect(isWebLink("javascript:alert(1)")).toBe(false);
    expect(isWebLink("ftp://example.com")).toBe(false);
    expect(isWebLink("https://localhost")).toBe(false);
    expect(isWebLink("https://user:pass@example.com")).toBe(false);
    expect(isWebLink("   ")).toBe(false);
  });
});

describe("checking an answer, one kind at a time", () => {
  it("asks for a required question left blank, in words that fit its kind", () => {
    const problems = validateAnswers(
      [
        question({ id: "text", required: true }),
        choice("SINGLE_CHOICE", { id: "one", required: true }),
        choice("MULTI_CHOICE", { id: "many", required: true }),
        question({ id: "file", kind: "FILE", required: true }),
        question({ id: "yn", kind: "YES_NO", required: true }),
      ],
      { many: [] },
    );
    expect(problems).toEqual({
      text: "Answer this one.",
      one: "Pick an answer.",
      many: "Pick at least one.",
      file: "Attach a file.",
      yn: "Pick an answer.",
    });
  });

  it("lets an optional question stay blank, and checks it only when answered", () => {
    expect(validateAnswers([question({ kind: "URL" })], {})).toEqual({});
    expect(
      validateAnswers([question({ kind: "URL" })], { q1: "not a link" }),
    ).toEqual({
      q1: "Enter a web address, like https://example.com/portfolio.",
    });
  });

  it("refuses a long answer over its word limit and says by how many", () => {
    const long = question({ kind: "LONG_TEXT", wordLimit: 5 });
    expect(validateAnswers([long], { q1: "one two three four five" })).toEqual(
      {},
    );
    expect(
      validateAnswers([long], { q1: "one two three four five six" }),
    ).toEqual({ q1: "That is 1 word over the 5 word limit." });
    expect(validateAnswers([long], { q1: "a b c d e f g h" }).q1).toBe(
      "That is 3 words over the 5 word limit.",
    );
  });

  it("puts no limit on a long answer that has none", () => {
    const long = question({ kind: "LONG_TEXT", wordLimit: null });
    expect(validateAnswers([long], { q1: "word ".repeat(900) })).toEqual({});
  });

  it("takes an option by id, and refuses an id that is not on the list", () => {
    const one = choice("SINGLE_CHOICE");
    expect(validateAnswers([one], { q1: "b" })).toEqual({});
    expect(validateAnswers([one], { q1: "zzz" })).toEqual({
      q1: "Pick one of the options.",
    });
    const many = choice("MULTI_CHOICE");
    expect(validateAnswers([many], { q1: ["a", "c"] })).toEqual({});
    expect(validateAnswers([many], { q1: ["a", "zzz"] })).toEqual({
      q1: "Pick from the options given.",
    });
  });

  it("takes yes and no and nothing else", () => {
    const yn = question({ kind: "YES_NO" });
    expect(validateAnswers([yn], { q1: "yes" })).toEqual({});
    expect(validateAnswers([yn], { q1: "no" })).toEqual({});
    expect(validateAnswers([yn], { q1: "maybe" })).toEqual({
      q1: "Pick yes or no.",
    });
  });

  it("checks a number against its bounds", () => {
    const n = question({ kind: "NUMBER", min: 0, max: 40 });
    expect(validateAnswers([n], { q1: "12" })).toEqual({});
    expect(validateAnswers([n], { q1: "-1" })).toEqual({
      q1: "Enter 0 or more.",
    });
    expect(validateAnswers([n], { q1: "41" })).toEqual({
      q1: "Enter 40 or fewer.",
    });
    expect(validateAnswers([n], { q1: "twelve" })).toEqual({
      q1: "Enter a number.",
    });
    /* The API's own pattern: no exponents, no thousands separators. */
    for (const odd of ["1e3", "1,000", "0x10", "."]) {
      expect(validateAnswers([n], { q1: odd })).toEqual({
        q1: "Enter a number.",
      });
    }
    expect(validateAnswers([n], { q1: "12.5" })).toEqual({});
  });

  it("counts an attached file as an answer", () => {
    const f = question({ kind: "FILE", required: true });
    expect(
      validateAnswers([f], {
        q1: { key: "k", name: "cert.pdf", sizeBytes: 10 },
      }),
    ).toEqual({});
  });
});

describe("an answer as words", () => {
  it("writes yes and no, option labels and file names", () => {
    expect(answerText("yes", { kind: "YES_NO", options: [] })).toBe("Yes");
    const many = choice("MULTI_CHOICE");
    expect(answerText(["a", "c"], many)).toBe("Excel, Python");
    expect(answerText("b", choice("SINGLE_CHOICE"))).toBe("SQL");
    expect(
      answerText({ key: "k", name: "cert.pdf", sizeBytes: 3 }, question()),
    ).toBe("cert.pdf");
    expect(answerText(null)).toBe("");
  });
});

describe("whether a question is ready to save", () => {
  it("needs the question written", () => {
    expect(validateQuestions([question({ label: "  " })])).toEqual({
      q1: "Write the question.",
    });
  });

  it("needs at least two distinct, non-empty options on a choice", () => {
    expect(
      validateQuestions([
        choice("SINGLE_CHOICE", { options: [{ id: "a", label: "Only" }] }),
      ]),
    ).toEqual({ q1: "Give at least 2 options." });
    expect(
      validateQuestions([
        choice("SINGLE_CHOICE", {
          options: [
            { id: "a", label: "Same" },
            { id: "b", label: "same" },
          ],
        }),
      ]),
    ).toEqual({ q1: "Two options are the same." });
    expect(
      validateQuestions([
        choice("MULTI_CHOICE", {
          options: [
            { id: "a", label: "One" },
            { id: "b", label: "" },
          ],
        }),
      ]).q1,
    ).toBe("Fill in every option, or remove the empty one.");
  });

  it("keeps a word limit to a whole number in range", () => {
    for (const wordLimit of [0, 1001, 2500, 12.5]) {
      expect(
        validateQuestions([question({ kind: "LONG_TEXT", wordLimit })]).q1,
      ).toMatch(/whole number from 1 to 1000/);
    }
    expect(
      validateQuestions([question({ kind: "LONG_TEXT", wordLimit: 300 })]),
    ).toEqual({});
  });

  it("refuses a number range that runs backwards", () => {
    expect(
      validateQuestions([question({ kind: "NUMBER", min: 10, max: 2 })]).q1,
    ).toMatch(/smallest number/);
  });

  it("is valid when every question is, and caps questions and file questions", () => {
    const base = defaultDefinition();
    expect(isDefinitionValid(base)).toBe(true);
    const many = Array.from({ length: 21 }, (_, i) =>
      question({ id: `m${i}`, label: `Q${i}` }),
    );
    expect(validateDefinition({ ...base, questions: many }).form).toMatch(
      /20 questions at most/,
    );
    const files = Array.from({ length: 4 }, (_, i) =>
      question({ id: `f${i}`, kind: "FILE", label: `File ${i}` }),
    );
    expect(validateDefinition({ ...base, questions: files }).form).toMatch(
      /3 file uploads at most/,
    );
  });
});

describe("the builder's edits", () => {
  const three = () =>
    ["a", "b", "c"].map((id) => question({ id, label: id.toUpperCase() }));

  it("adds a question of each kind with the right starting settings", () => {
    for (const kind of QUESTION_KINDS) {
      const added = addQuestion([], kind)[0] as FormQuestion;
      expect(added.kind).toBe(kind);
      expect(added.required).toBe(false);
      expect(added.knockout).toBe(false);
      if (kind === "LONG_TEXT") expect(added.wordLimit).toBe(150);
      else expect(added.wordLimit).toBeNull();
      if (kind === "SINGLE_CHOICE" || kind === "MULTI_CHOICE")
        expect(added.options).toHaveLength(2);
      else expect(added.options).toEqual([]);
    }
  });

  it("gives every added question and option its own id", () => {
    const [a, b] = addQuestion(
      addQuestion([], "SINGLE_CHOICE"),
      "SINGLE_CHOICE",
    );
    expect(a?.id).not.toBe(b?.id);
    const ids = new Set(
      [...(a?.options ?? []), ...(b?.options ?? [])].map((o) => o.id),
    );
    expect(ids.size).toBe(4);
  });

  it("moves a question up and down, and does nothing at either end", () => {
    const order = (list: FormQuestion[]) => list.map((q) => q.id).join("");
    expect(order(moveQuestion(three(), "b", -1))).toBe("bac");
    expect(order(moveQuestion(three(), "b", 1))).toBe("acb");
    expect(order(moveQuestion(three(), "a", -1))).toBe("abc");
    expect(order(moveQuestion(three(), "c", 1))).toBe("abc");
    expect(order(moveQuestion(three(), "nope", 1))).toBe("abc");
  });

  it("does not change the list it was given", () => {
    const list = three();
    moveQuestion(list, "a", 1);
    removeQuestion(list, "a");
    updateQuestion(list, "a", { label: "x" });
    expect(list.map((q) => q.id).join("")).toBe("abc");
    expect(list[0]?.label).toBe("A");
  });

  it("removes and updates by id", () => {
    expect(removeQuestion(three(), "b").map((q) => q.id)).toEqual(["a", "c"]);
    expect(
      updateQuestion(three(), "b", { required: true }).map((q) => q.required),
    ).toEqual([false, true, false]);
  });

  it("keeps the words and drops the settings that belonged to the old kind", () => {
    const original = question({
      kind: "LONG_TEXT",
      label: "Why us?",
      helper: "Be brief",
      required: true,
      wordLimit: 80,
    });
    const asYesNo = changeKind(original, "YES_NO");
    expect(asYesNo).toMatchObject({
      id: "q1",
      kind: "YES_NO",
      label: "Why us?",
      helper: "Be brief",
      required: true,
      wordLimit: null,
    });
    /* Between the two choice kinds the options survive. */
    const single = choice("SINGLE_CHOICE");
    expect(changeKind(single, "MULTI_CHOICE").options).toEqual(single.options);
    expect(changeKind(single, "SHORT_TEXT").options).toEqual([]);
  });
});
