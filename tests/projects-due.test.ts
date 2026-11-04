import { describe, expect, it } from "vitest";
import { dueLabel, isPastDue, nowHHMMIn } from "@/lib/projects/due";
import { patchIssue } from "@/lib/projects/mutations";
import { buildSample } from "@/lib/projects/sample";
import { reportTiles } from "@/lib/projects/reports";

const TODAY = "2026-11-04";

describe("due labels", () => {
  it("says today and tomorrow, and the time when there is one", () => {
    expect(dueLabel({ dueDate: TODAY, dueTime: "17:00" }, TODAY)).toBe(
      "Due today, 17:00",
    );
    expect(dueLabel({ dueDate: "2026-11-05", dueTime: null }, TODAY)).toBe(
      "Due tomorrow",
    );
    expect(dueLabel({ dueDate: "2026-11-12", dueTime: "09:30" }, TODAY)).toBe(
      "Due 12 Nov, 09:30",
    );
    expect(dueLabel({ dueDate: "2027-01-03" }, TODAY)).toBe("Due 3 Jan 2027");
    expect(dueLabel({ dueDate: null }, TODAY)).toBe("No date");
  });

  it("has a short form for cards", () => {
    expect(dueLabel({ dueDate: TODAY, dueTime: "17:00" }, TODAY, "card")).toBe(
      "Today 17:00",
    );
    expect(dueLabel({ dueDate: "2026-11-05" }, TODAY, "card")).toBe("Tomorrow");
    expect(
      dueLabel({ dueDate: "2026-11-12", dueTime: "17:00" }, TODAY, "card"),
    ).toBe("12 Nov 17:00");
    expect(dueLabel({ dueDate: "2026-11-12" }, TODAY, "card")).toBe("12 Nov");
  });
});

describe("overdue", () => {
  it("is an earlier day, or today from its time on", () => {
    expect(isPastDue({ dueDate: "2026-11-03" }, TODAY, "08:00")).toBe(true);
    expect(
      isPastDue({ dueDate: TODAY, dueTime: "09:00" }, TODAY, "10:00"),
    ).toBe(true);
    expect(
      isPastDue({ dueDate: TODAY, dueTime: "10:00" }, TODAY, "10:00"),
    ).toBe(true);
    expect(
      isPastDue({ dueDate: TODAY, dueTime: "23:30" }, TODAY, "23:00"),
    ).toBe(false);
    expect(isPastDue({ dueDate: TODAY, dueTime: null }, TODAY, "23:59")).toBe(
      false,
    );
    expect(
      isPastDue({ dueDate: "2026-11-05", dueTime: "00:00" }, TODAY, "23:59"),
    ).toBe(false);
    expect(isPastDue({ dueDate: null }, TODAY, "12:00")).toBe(false);
  });

  it("reads the time of day on the company's clock", () => {
    const at = new Date("2026-11-04T22:59:00.000Z");
    expect(nowHHMMIn("Africa/Lagos", at)).toBe("23:59");
    expect(nowHHMMIn("UTC", at)).toBe("22:59");
  });
});

describe("the demo and the optimistic path", () => {
  it("clears the time when the date is cleared", () => {
    const s = buildSample({
      today: TODAY,
      now: `${TODAY}T09:00:00.000Z`,
      people: ["p-01"],
    });
    const data = { project: s.project, issues: s.issues, sprints: s.sprints };
    const target = data.issues[0]!;
    const dated = patchIssue(
      data,
      target.id,
      { dueDate: "2026-11-12", dueTime: "17:00" },
      `${TODAY}T09:01:00.000Z`,
    );
    expect(dated.issue).toMatchObject({
      dueDate: "2026-11-12",
      dueTime: "17:00",
    });
    const cleared = patchIssue(
      dated.data,
      target.id,
      { dueDate: null },
      `${TODAY}T09:02:00.000Z`,
    );
    expect(cleared.issue).toMatchObject({ dueDate: null, dueTime: null });
  });
});

describe("the Reports overdue tile", () => {
  it("counts a task due earlier today, and not one due later today", () => {
    const s = buildSample({
      today: TODAY,
      now: `${TODAY}T09:00:00.000Z`,
      people: ["p-01"],
    });
    const open = s.issues
      .filter((i) => i.type !== "EPIC" && i.doneAt === null)
      .slice(0, 2);
    const issues = [
      { ...open[0]!, dueDate: TODAY, dueTime: "09:00" },
      { ...open[1]!, dueDate: TODAY, dueTime: "17:00" },
    ];
    const base = {
      statuses: s.project.statuses,
      issues,
      today: TODAY,
      dayOf: (iso: string) => iso.slice(0, 10),
    };
    expect(reportTiles({ ...base, nowHHMM: "10:00" }).overdue).toBe(1);
    expect(reportTiles({ ...base, nowHHMM: "08:00" }).overdue).toBe(0);
  });
});
