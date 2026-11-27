import { describe, expect, it } from "vitest";
import { stageWords } from "@/lib/performance/stage-words";

/** The stage between manager reviews and publishing is "Score review" in the product (owner, 27 Nov 2026). */
describe("stageWords", () => {
  it("puts the server's calibration labels into the product's words, keeping their case", () => {
    expect(stageWords("calibration")).toBe("score review");
    expect(stageWords("Calibration")).toBe("Score review");
    expect(stageWords("In calibration")).toBe("In score review");
  });

  it("leaves every other label alone", () => {
    for (const label of [
      "Draft",
      "Self-reviews open",
      "Manager reviews open",
      "Published",
      "manager review",
    ]) {
      expect(stageWords(label)).toBe(label);
    }
  });
});
