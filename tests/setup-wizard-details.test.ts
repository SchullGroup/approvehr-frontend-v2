/**
 * L36 (NC-36), web part: right after the first answer, while a follow-up form
 * was still open, the wizard said "You answered this already". A "No" carried
 * a four-line legal paragraph. And the page had no way out but finishing.
 * Bands that overlap are the API's (its headcount question) and not here.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { firstSentence } from "@/app/(setup)/setup/questions";

const read = (p: string) =>
  readFileSync(path.resolve(import.meta.dirname, "..", p), "utf8");

describe("the consequence of an answer", () => {
  it("is one sentence before More", () => {
    expect(
      firstSentence(
        "PAYE is an employer duty. Staff then file their own returns. Penalties can apply.",
      ),
    ).toEqual({
      first: "PAYE is an employer duty.",
      rest: "Staff then file their own returns. Penalties can apply.",
    });
    expect(firstSentence("One line only.")).toEqual({
      first: "One line only.",
      rest: "",
    });
  });
});

describe("the wizard", () => {
  const wizard = read("src/app/(setup)/setup/wizard.tsx");
  it("says answered already only when no follow-up is open", () => {
    expect(wizard).toMatch(/\{answered && !followUpOpen && \(/);
  });
  it("offers More for the rest of a consequence", () => {
    expect(wizard).toContain("firstSentence(option.consequence)");
  });
  it("can be left to finish later", () => {
    expect(read("src/app/(setup)/layout.tsx")).toContain("Finish later");
  });
});
