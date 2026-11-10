import { describe, expect, it } from "vitest";
import {
  BILLING,
  PAGE_WORDS,
  ROW_WORDS,
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
