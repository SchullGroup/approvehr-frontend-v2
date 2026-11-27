import { describe, expect, it } from "vitest";
import {
  footerAction,
  keyboardHint,
  toAnswerLine,
} from "@/app/(focus)/performance/reviews/[id]/answer/focus-logic";

/**
 * What the footer of the answer form offers, decided in one place.
 *
 * A button that can only refuse is not drawn: Next waits for the answer it needs,
 * Send is shut with sending, and with answers left the preview offers the way to
 * the first of them. These are the decisions on their own; the form that applies
 * them is read in `focus-form-footer.test.tsx`.
 */

const base = {
  resumed: false,
  blocked: false,
  skippable: false,
  toAnswer: null,
  sendClosed: false,
} as const;

describe("footerAction", () => {
  it("starts a form, and continues one that was opened again", () => {
    expect(footerAction({ ...base, page: "intro" })).toEqual({
      kind: "go",
      label: "Start",
    });
    expect(footerAction({ ...base, page: "intro", resumed: true })).toEqual({
      kind: "go",
      label: "Continue",
    });
  });

  it("goes on with Next, or Skip where the page is optional and empty", () => {
    expect(footerAction({ ...base, page: "question" })).toEqual({
      kind: "go",
      label: "Next",
    });
    expect(footerAction({ ...base, page: "summary", skippable: true })).toEqual(
      { kind: "go", label: "Skip" },
    );
  });

  it("offers nothing on a page that cannot be left yet", () => {
    for (const page of ["question", "mark", "potential"] as const) {
      expect(footerAction({ ...base, page, blocked: true })).toEqual({
        kind: "none",
      });
    }
  });

  it("sends from the preview when nothing is in the way", () => {
    expect(footerAction({ ...base, page: "check" })).toEqual({ kind: "send" });
  });

  it("draws no Send while sending is closed", () => {
    expect(footerAction({ ...base, page: "check", sendClosed: true })).toEqual({
      kind: "none",
    });
  });

  it("puts the way to the first answer in Send's place, closed or not", () => {
    for (const sendClosed of [false, true]) {
      expect(
        footerAction({
          ...base,
          page: "check",
          toAnswer: "2 to answer",
          sendClosed,
        }),
      ).toEqual({ kind: "answer", label: "2 to answer" });
    }
  });
});

describe("toAnswerLine", () => {
  it("is nothing for nothing, and a count and two words otherwise", () => {
    expect(toAnswerLine(0, false)).toBeNull();
    expect(toAnswerLine(2, false)).toBe("2 to answer");
    expect(toAnswerLine(0, true)).toBe("1 to answer");
    expect(toAnswerLine(2, true)).toBe("3 to answer");
  });
});

describe("keyboardHint", () => {
  it("is nowhere on the first screen or the preview, where no key does anything", () => {
    expect(keyboardHint("intro", false, "⌘ Enter")).toBeNull();
    expect(keyboardHint("check", false, "⌘ Enter")).toBeNull();
  });

  it("names the key beside an option where a page is answered by one", () => {
    expect(keyboardHint("question", true, "⌘ Enter")).toMatch(
      /Press an answer's key/,
    );
    expect(keyboardHint("mark", true, "Ctrl Enter")).toMatch(
      /Press an answer's key/,
    );
  });

  it("names the machine's own shortcut where a page is written", () => {
    expect(keyboardHint("question", false, "⌘ Enter")).toBe(
      "⌘ Enter goes on. Esc saves and closes.",
    );
    expect(keyboardHint("summary", false, "Ctrl Enter")).toBe(
      "Ctrl Enter goes on. Esc saves and closes.",
    );
  });
});
