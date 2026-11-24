import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatWorkingMinutes } from "@/lib/api/helpdesk";

/**
 * UAT 23 Nov, L15 (PERF-35, SELF-20, NC-35, HR-36, HR-34): engineer wording
 * reached people's screens. Each line here is a sentence somebody read on a
 * real screen and was not meant to.
 */

const root = join(__dirname, "..", "src");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** The text a person can read: comments are left out. */
const visible = (path: string) =>
  read(path)
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join("\n");

describe("words a person reads", () => {
  const gone = [
    ["app/(app)/people/leave/book-leave.tsx", "Raise request"],
    ["app/(app)/people/leave/holiday-calendar.tsx", "awaiting proclamation"],
    ["app/(app)/people/leave/holiday-calendar.tsx", "Awaiting proclamation"],
    ["app/(app)/people/leave/holiday-calendar.tsx", "read these dates"],
    ["app/(app)/settings/leave/holidays-panel.tsx", "awaiting proclamation"],
    ["app/(app)/settings/leave/holidays-panel.tsx", "read these dates"],
    ["app/(app)/settings/leave/holiday-form.tsx", "awaiting proclamation"],
    ["app/(app)/settings/checklist.ts", "awaiting proclamation"],
    ["app/(app)/wellness/overview-screen.tsx", "Wording ${version}"],
    ["app/(app)/payroll/expenses/approval-queue.tsx", "{claim.receiptKey}"],
    ["app/(app)/settings/performance/weights-form.tsx", "settings snapshot"],
    ["app/(app)/performance/reviews/[id]/review-screen.tsx", "whole numbers"],
    ["app/(app)/people/onboarding/onboarding-screen.tsx", "Add a new staff"],
    ["app/(app)/people/new/form.tsx", "Add a new staff"],
    ["app/(app)/people/[id]/record.tsx", "reports to the board"],
    ["app/(app)/performance/my-tasks.tsx", "pagination endpoint"],
    ["app/(app)/settings/notifications/settings.tsx", "prototype"],
    [
      "app/(app)/settings/helpdesk/helpdesk-screen.tsx",
      "option.charAt(0) + option.slice(1).toLowerCase()",
    ],
    ["app/(app)/settings/helpdesk/helpdesk-screen.tsx", "{policy.priority}"],
  ] as const;

  it.each(gone)("%s no longer says %s", (path, text) => {
    expect(visible(path)).not.toContain(text);
  });

  it("says the profile's two notes once each, not on every section", () => {
    const source = read("app/(app)/profile/my-details.tsx");
    expect(source).not.toContain("group.hint ?? TIER_NOTE[group.tier]");
  });
});

describe("how long a help desk ticket has waited", () => {
  it("is whole days, not 20.5 working days", () => {
    expect(formatWorkingMinutes(20.5 * 480, 480)).toBe("21 working days");
    expect(formatWorkingMinutes(1.4 * 480, 480)).toBe("1 working day");
  });

  it("is whole hours inside a day", () => {
    expect(formatWorkingMinutes(150, 480)).toBe("3 working hours");
    expect(formatWorkingMinutes(60, 480)).toBe("1 working hour");
  });
});

describe("the import's count of other columns", () => {
  it("says one column in the singular", () => {
    expect(read("components/imports/import-flow.tsx")).toContain(
      '"The other column is optional."',
    );
  });
});
