import { describe, expect, it } from "vitest";
import {
  PERIOD_NAME_MAX,
  PERIOD_NAME_MIN,
  PERIOD_NAME_TOO_LONG,
  PERIOD_NAME_TOO_SHORT,
  periodNameProblem,
  renameNote,
  renamedToast,
} from "@/lib/performance/period-name";

/**
 * What an appraisal period may be called, in the one place both dialogs ask.
 *
 * The API trims the name and refuses one under 3 or over 80 characters. The start
 * dialog and the rename dialog both check it first, so the answer arrives while
 * the dialog is open. Two hand-written checks would drift until one accepted a
 * name the other refused, which is why the edges are pinned here and not only
 * in a screen.
 */

describe("periodNameProblem", () => {
  it("says the limits are 3 and 80, because the API's are", () => {
    expect(PERIOD_NAME_MIN).toBe(3);
    expect(PERIOD_NAME_MAX).toBe(80);
  });

  it("accepts a name of exactly the shortest and the longest length", () => {
    expect(periodNameProblem("Q1")).toBe(PERIOD_NAME_TOO_SHORT);
    expect(periodNameProblem("Q12")).toBeNull();
    expect(periodNameProblem("a".repeat(80))).toBeNull();
    expect(periodNameProblem("a".repeat(81))).toBe(PERIOD_NAME_TOO_LONG);
  });

  it("counts what is left after trimming, as the API does", () => {
    expect(periodNameProblem("   ab   ")).toBe(PERIOD_NAME_TOO_SHORT);
    expect(periodNameProblem("  abc  ")).toBeNull();
    expect(periodNameProblem(`  ${"a".repeat(80)}  `)).toBeNull();
    expect(periodNameProblem(`  ${"a".repeat(81)}  `)).toBe(
      PERIOD_NAME_TOO_LONG,
    );
  });

  it("refuses nothing but spaces, and an empty box, as too short", () => {
    expect(periodNameProblem("")).toBe(PERIOD_NAME_TOO_SHORT);
    expect(periodNameProblem("      ")).toBe(PERIOD_NAME_TOO_SHORT);
  });

  it("keeps the sentence the start dialog has always used for a name that is too short", () => {
    expect(PERIOD_NAME_TOO_SHORT).toBe(
      "Name it: people will see this in their inbox.",
    );
  });
});

describe("renameNote", () => {
  it("says where the name is seen and that nothing else about the period changes", () => {
    const note = renameNote(false);
    expect(note).toContain("on their form, in their inbox and in reports");
    expect(note).toContain("Nothing else about the period changes.");
  });

  it("says that messages already sent keep the old name only once the period has started", () => {
    expect(renameNote(false)).not.toContain("Messages already sent");
    expect(renameNote(true)).toContain(
      "Messages already sent keep the old name.",
    );
  });
});

describe("renamedToast", () => {
  it("names the new name in the detail", () => {
    expect(renamedToast("H1 2027 Appraisal")).toEqual({
      title: "Renamed",
      detail: "This period is now called H1 2027 Appraisal.",
    });
  });
});
