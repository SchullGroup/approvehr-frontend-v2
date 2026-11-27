import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOLD_WHERE } from "@/app/(app)/performance/periods/[id]/nudge";

/**
 * One sentence for where people are told (F28).
 *
 * Starting a period said "No emails are sent from here" while the reminder said
 * "and by email". Both cannot be true of the same notifications. The reminder
 * dialog no longer has a sentence of its own (it is the question, Cancel and the
 * act), but the start message still has to say the same thing the notifications
 * do: the app always, and email only where email is set up.
 */
const screen = readFileSync(
  "src/app/(app)/performance/periods/[id]/period-screen.tsx",
  "utf8",
);

describe("where people are told", () => {
  it("is the app always, and email only where email is set up", () => {
    expect(TOLD_WHERE).toBe("in the app, and by email where email is set up");
  });

  it("is in the start message, which no longer says no emails are sent", () => {
    expect(screen).toContain("told ${TOLD_WHERE}");
    expect(screen).not.toMatch(/No emails are sent/);
  });
});
