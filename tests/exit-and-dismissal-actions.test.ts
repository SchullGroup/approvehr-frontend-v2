/**
 * U48 (HR-21, HR-37), web part.
 *
 * - An exit's page offered three ways to end it side by side: "Close this
 *   exit", "Not going ahead" and "Withdraw exit request". HR gets two, Close
 *   and Cancel; only the person themselves withdraws their own request.
 * - "Dismissal: Employment ended" was a warning level, and recording it
 *   started no exit, final pay or checklist. It is not offered as a level
 *   any more; the warning form links to "Start an exit" instead. A record
 *   already at that level still reads it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  LEVEL_LABEL,
  OFFERED_LEVELS,
  levelsToOffer,
} from "@/lib/store/conduct";

const source = (p: string) =>
  readFileSync(path.resolve(import.meta.dirname, "..", p), "utf8");

describe("warning levels", () => {
  it("does not offer Dismissal for a new warning", () => {
    expect(OFFERED_LEVELS).not.toContain("DISMISSAL");
    expect(OFFERED_LEVELS).toEqual([
      "VERBAL",
      "WRITTEN",
      "FINAL_WRITTEN",
      "SUSPENSION",
    ]);
  });

  it("keeps it on a record that already has it, so it still reads", () => {
    expect(levelsToOffer("DISMISSAL")).toContain("DISMISSAL");
    expect(levelsToOffer("WRITTEN")).not.toContain("DISMISSAL");
    expect(LEVEL_LABEL.DISMISSAL).toBe("Dismissal");
  });

  it("links the warning form to Start an exit", () => {
    const conduct = source("src/app/(app)/people/[id]/conduct.tsx");
    expect(conduct).toContain("Start an exit");
    expect(conduct).toMatch(/OFFERED_LEVELS\.map|levelsToOffer\(/);
    expect(conduct).not.toMatch(/\{LEVEL_ORDER\.map/);
  });
});

describe("ending an exit", () => {
  const screen = source(
    "src/app/(app)/people/offboarding/[id]/exit-detail-screen.tsx",
  );
  it("calls the refusal Cancel this exit, not Not going ahead", () => {
    expect(screen).toContain("Cancel this exit");
    expect(screen).not.toMatch(/>\s*Not going ahead\s*</);
  });
  it("lets only the person withdraw their own request", () => {
    expect(screen).toMatch(/const canWithdraw = !closed && mine;/);
  });
});
