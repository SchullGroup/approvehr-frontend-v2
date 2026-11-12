import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { leaveLabel } from "@/lib/leave-label";
import { buildApprovalQueue } from "@/lib/workflows/queue";
import { leaveDecidedCopy } from "@/app/(app)/people/leave/leave-decided-copy";

/**
 * A leave type named "Study leave" is not "Study leave leave".
 *
 * Types are named by the company, and the ones people write are "Study leave" and
 * "Annual leave" as often as "Study" and "Annual". Every screen that wrote
 * `${type} leave` turned the first kind into a doubled word in a drawer title, a
 * dialog and an approvals row. The API has the same function for the strings it
 * stores.
 */

describe("leaveLabel", () => {
  it("adds the word to a name that does not end with it", () => {
    expect(leaveLabel("Annual")).toBe("Annual leave");
    expect(leaveLabel("Sick")).toBe("Sick leave");
    expect(leaveLabel("Paid time off")).toBe("Paid time off leave");
  });

  it("leaves a name that already ends with it alone, whatever its capitals", () => {
    expect(leaveLabel("Study leave")).toBe("Study leave");
    expect(leaveLabel("Maternity Leave")).toBe("Maternity Leave");
    expect(leaveLabel("SABBATICAL LEAVE")).toBe("SABBATICAL LEAVE");
    expect(leaveLabel("Leave")).toBe("Leave");
  });

  it("counts only a trailing whole word, and trims", () => {
    expect(leaveLabel("Leaves of absence")).toBe("Leaves of absence leave");
    expect(leaveLabel("Leave without pay")).toBe("Leave without pay leave");
    expect(leaveLabel("Unleave")).toBe("Unleave leave");
    expect(leaveLabel("  Study leave  ")).toBe("Study leave");
  });

  it("lower-cases for the middle of a sentence and keeps the company's capitals otherwise", () => {
    expect(leaveLabel("Study leave", "lower")).toBe("study leave");
    expect(leaveLabel("Annual", "lower")).toBe("annual leave");
    expect(leaveLabel("Study leave")).toBe("Study leave");
  });
});

describe("the places that word a leave type", () => {
  it("does not double it in the approvals inbox row", () => {
    const queue = buildApprovalQueue({
      leaveRequests: [
        {
          id: "lv-label-1",
          employeeId: "p-01",
          type: "Study leave",
          from: "2026-08-20",
          to: "2026-08-21",
          days: 2,
          status: "pending",
        },
        {
          id: "lv-label-2",
          employeeId: "p-01",
          type: "Annual",
          from: "2026-09-20",
          to: "2026-09-21",
          days: 2,
          status: "pending",
        },
      ] as never,
      decisions: {},
    });
    const study = queue.find((item) => item.id === "leave:lv-label-1");
    const annual = queue.find((item) => item.id === "leave:lv-label-2");
    expect(study?.title).toMatch(/^Study leave, /);
    expect(study?.title).not.toContain("leave leave");
    expect(annual?.title).toMatch(/^Annual leave, /);
  });

  it("does not double it in the sentence after an approval, and still adds it where missing", () => {
    const base = {
      employeeName: "Chidi Nwosu",
      from: "2026-08-20",
      to: "2026-08-21",
      days: 2,
    };
    const study = leaveDecidedCopy({
      request: { ...base, leaveType: "Study leave" },
      stage: "final",
      balances: [],
    });
    expect(study.title).toBe("Chidi Nwosu's study leave is approved");
    const annual = leaveDecidedCopy({
      request: { ...base, leaveType: "Annual" },
      stage: "final",
      balances: [],
    });
    expect(annual.title).toBe("Chidi Nwosu's annual leave is approved");
  });
});

describe("no screen builds the phrase by hand", () => {
  const SRC = path.resolve(import.meta.dirname, "../src");

  function* files(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) yield* files(full);
      else if (/\.tsx?$/.test(entry)) yield full;
    }
  }

  /* `${something about a type} leave`: the shape that doubles the word. The
     helper itself and the mock seed data (which are names, not templates) are
     the only places allowed to spell it. */
  const HAND_BUILT =
    /\$\{[^}]*(leaveType|\.type\b|chosenType|typeName)[^}]*\} leave\b/;

  it("finds none", () => {
    const offenders: string[] = [];
    for (const file of files(SRC)) {
      if (file.endsWith(`${path.sep}leave-label.ts`)) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (HAND_BUILT.test(line)) {
          offenders.push(
            `${path.relative(SRC, file)}:${index + 1}  ${line.trim()}`,
          );
        }
      });
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("can fail: the pattern matches the shape it exists to find", () => {
    expect(HAND_BUILT.test("`${request.leaveType} leave, ${who}`")).toBe(true);
    expect(HAND_BUILT.test("`${chosenType.name} leave needs evidence`")).toBe(
      true,
    );
    expect(HAND_BUILT.test("`${leaveLabel(request.leaveType)}, ${who}`")).toBe(
      false,
    );
  });
});
