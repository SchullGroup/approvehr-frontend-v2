import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";
import {
  goalFacts,
  defaultPeriodId,
  objectiveWhoseChoices,
  rungLabel,
} from "@/app/(app)/performance/goal-facts";

/**
 * The pure choices behind New objective: whose it can be, and which period it
 * starts in. The form itself is now a page of its own, and its tests are in
 * `objective-wizard.test.tsx`; the dialog these used to be rendered in is gone.
 */

const state = vi.hoisted(() => ({
  permissions: new Set<string>(),
  employeeId: "emp-head" as string | null,
  departments: [] as { id: string; name: string; headId: string | null }[],
  cycles: [] as { id: string; name: string; stage: string }[],
}));

vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) => state.permissions.has(permission),
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ employeeId: state.employeeId }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: state.departments }),
  useHeadedDepartmentIds: () =>
    new Set(
      state.departments
        .filter((department) => department.headId === state.employeeId)
        .map((department) => department.id),
    ),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: [], people: [] }),
}));
vi.mock("@/lib/store/performance", () => ({
  useAppraisals: () => ({ cycles: state.cycles }),
}));
vi.mock("@/lib/store/ai", () => ({
  /* No assistant wired, so the suggestion button under a parent is absent. */
  useAssistantAvailable: () => ({ available: false, loading: false }),
  useObjectiveSuggestions: () => ({
    loading: false,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
}));

const ENGINEERING = { id: "d-eng", name: "Engineering", headId: "emp-head" };
const FINANCE = { id: "d-fin", name: "Finance", headId: "emp-other" };

beforeEach(() => {
  state.permissions = new Set();
  state.employeeId = "emp-head";
  state.departments = [ENGINEERING, FINANCE];
  state.cycles = [];
});

describe("whose objective, as a pure choice", () => {
  const departments = [ENGINEERING, FINANCE];

  it("never offers what the API would refuse", () => {
    const choices = objectiveWhoseChoices({
      departments,
      employeeId: "emp-head",
      canSetCompanyWide: false,
    });
    expect(choices.choices.map((choice) => choice.value)).toEqual([
      "dept:d-eng",
      "me",
    ]);
  });

  it("starts on Mine for anybody with a staff record", () => {
    const start = (input: {
      employeeId: string | null;
      canSetCompanyWide: boolean;
    }) => objectiveWhoseChoices({ departments, ...input }).fallback;

    expect(start({ employeeId: "emp-head", canSetCompanyWide: false })).toBe(
      "me",
    );
    expect(start({ employeeId: "emp-head", canSetCompanyWide: true })).toBe(
      "me",
    );
    expect(start({ employeeId: "emp-hr", canSetCompanyWide: true })).toBe("me");
    expect(start({ employeeId: "emp-plain", canSetCompanyWide: false })).toBe(
      "me",
    );
    /* Nobody to own it: the widest thing they may set. */
    expect(start({ employeeId: null, canSetCompanyWide: true })).toBe(
      "company",
    );
    expect(start({ employeeId: null, canSetCompanyWide: false })).toBe("me");
  });

  it("lists a department once for somebody who heads two", () => {
    const two = objectiveWhoseChoices({
      departments: [
        ENGINEERING,
        { id: "d-prod", name: "Product", headId: "emp-head" },
        FINANCE,
      ],
      employeeId: "emp-head",
      canSetCompanyWide: false,
    });
    expect(two.choices.map((choice) => choice.value)).toEqual([
      "dept:d-eng",
      "dept:d-prod",
      "me",
    ]);
    expect(two.fallback).toBe("me");
  });
});

describe("the appraisal period a new objective starts in (U93)", () => {
  it("chooses nothing when several periods are open and none is running", () => {
    expect(
      defaultPeriodId([
        { id: "a", stage: "DRAFT" },
        { id: "b", stage: "DRAFT" },
      ]),
    ).toBe("");
    expect(defaultPeriodId([{ id: "a", stage: "DRAFT" }])).toBe("a");
    expect(
      defaultPeriodId([
        { id: "a", stage: "MANAGER" },
        { id: "b", stage: "DRAFT" },
      ]),
    ).toBe("a");
    expect(defaultPeriodId([{ id: "a", stage: "PUBLISHED" }])).toBe("");
  });
});

describe("what the detail modal is told about a goal", () => {
  const goal = (over: Partial<ApiGoal> = {}): ApiGoal => ({
    id: "g-1",
    title: "Ship the payments rebuild",
    description: null,
    ownerId: null,
    ownerName: null,
    departmentId: "d-eng",
    departmentName: "Engineering",
    level: "department",
    companyWide: false,
    parentId: null,
    parentTitle: null,
    status: "ON_TRACK",
    progress: 0,
    measuredProgress: null,
    dueQuarter: "2026-Q3",
    reviewCycleId: null,
    reviewCycleName: null,
    approval: "DRAFT",
    approvalLabel: "Draft",
    targetFrozen: false,
    submittedAt: null,
    agreedAt: null,
    approvalNote: null,
    revisionCount: 0,
    revisedAt: null,
    keyResults: [],
    childCount: 0,
    createdAt: "2026-10-09T08:00:00.000Z",
    updatedAt: "2026-10-09T08:00:00.000Z",
    ...over,
  });

  it("names the rung from the API's own level", () => {
    expect(rungLabel(goal())).toBe("Engineering objective");
    expect(rungLabel(goal({ departmentName: null }))).toBe(
      "Department objective",
    );
    expect(rungLabel(goal({ level: "company" }))).toBe("Company objective");
    expect(rungLabel(goal({ level: "personal" }))).toBe("Personal objective");
  });

  it("takes measured progress over the stored figure", () => {
    expect(goalFacts(goal({ progress: 10 })).progress).toBe(10);
    expect(
      goalFacts(goal({ progress: 10, measuredProgress: 40 })).progress,
    ).toBe(40);
  });

  it("no longer has a way to log a weekly task: work is tracked in Projects", () => {
    const mine = goal({ ownerId: "emp-1", approval: "AGREED" });
    expect("canLogTasks" in goalFacts(mine)).toBe(false);
  });

  it("will not offer to tell people about an objective with no measure", () => {
    expect(goalFacts(goal()).canShare).toBe(false);
    expect(goalFacts(goal({ dueQuarter: null })).canShare).toBe(false);
  });

  it("says when there is no period to be agreed in", () => {
    expect(goalFacts(goal()).noPeriod).toBe(false);
    expect(goalFacts(goal({ dueQuarter: null })).noPeriod).toBe(true);
    expect(
      goalFacts(goal({ dueQuarter: null, reviewCycleId: "c-1" })).noPeriod,
    ).toBe(false);
  });
});
