import { describe, expect, it } from "vitest";
import {
  BILLING,
  PAGE_WORDS,
  ROW_WORDS,
  SETTINGS_PAGES,
  matches,
  termsOf,
} from "@/app/(app)/settings/filter";

const overtime = {
  title: "Overtime",
  description: "Rates for extra hours.",
  words: PAGE_WORDS["/settings/overtime"],
};

describe("settings filter", () => {
  it("an empty query matches everything", () => {
    expect(termsOf("   ")).toEqual([]);
    expect(matches([], overtime)).toBe(true);
  });

  it("matches the start of a word in the title, description or keywords", () => {
    expect(matches(termsOf("over"), overtime)).toBe(true);
    expect(matches(termsOf("extra"), overtime)).toBe(true);
    expect(matches(termsOf("weekend"), overtime)).toBe(true);
  });

  it("does not match the middle of a word", () => {
    expect(matches(termsOf("time"), overtime)).toBe(false);
    expect(
      matches(termsOf("pay"), { title: "Appearance", words: ["display"] }),
    ).toBe(false);
  });

  it("every word typed has to match", () => {
    expect(matches(termsOf("overtime weekend"), overtime)).toBe(true);
    expect(matches(termsOf("overtime pension"), overtime)).toBe(false);
  });

  it("finds a row by a synonym keyed by its id", () => {
    const row = { title: "Leave", words: ROW_WORDS["leave"] };
    expect(matches(termsOf("holidays"), row)).toBe(true);
    expect(matches(termsOf("pension"), row)).toBe(false);
  });

  it("finds billing by plan or renewal", () => {
    expect(matches(termsOf("renew"), BILLING)).toBe(true);
    expect(matches(termsOf("overtime"), BILLING)).toBe(false);
  });
});

describe("what the search says Appraisal scoring is", () => {
  /* The weights became proportional, and the blurb went on saying they "must make
     100% exactly". It is what somebody reads under the page's name in the results,
     and what a search for "exactly" would have found it by. */
  const page = SETTINGS_PAGES.find(
    (one) => one.href === "/settings/performance",
  );

  it("says the weights add up to 100% (L14: the owner's one rule)", () => {
    expect(page).toBeDefined();
    expect(page?.description).toMatch(/The weights add up to 100%/);
    expect(page?.description).not.toMatch(/in proportion/);
  });

  it("is still found by what it is for", () => {
    expect(
      matches(termsOf("weights"), {
        title: page?.title ?? "",
        description: page?.description,
        words: PAGE_WORDS["/settings/performance"],
      }),
    ).toBe(true);
  });
});
