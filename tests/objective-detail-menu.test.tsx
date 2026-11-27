import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";
import type { DirectoryPerson } from "@/lib/types";

/**
 * What the objective's window offers, and what it is kept from saying.
 *
 * Where Send to be agreed would be, an objective with no period and no quarter
 * offers "Add a period" (it cannot be sent at all, and the sentence that used to
 * say so told the reader to add a quarter in a window with no field for it).
 * And "Give an objective to people" is offered only to somebody who leads at
 * least one person it could go to: the dialog behind it could only refuse.
 */

const state = vi.hoisted(() => ({
  employeeId: "emp-head" as string | null,
  everyone: false,
  people: [] as DirectoryPerson[],
}));

vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) =>
    permission === "EDIT_RECORDS" ? state.everyone : false,
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    employeeId: state.employeeId,
    actingId: state.employeeId,
  }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
  useHeadedDepartmentIds: () => new Set<string>(),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({
    employees: [],
    people: state.people,
    loading: false,
  }),
}));
vi.mock("@/lib/store/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/ai")>()),
  useAssistantAvailable: () => ({ available: false, loading: false }),
  useTaskSummarySuggestion: () => ({
    loading: false,
    outcome: null,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
}));

const { GoalCard } = await import("@/app/(app)/performance/kpis");

const person = (id: string, over: Partial<DirectoryPerson> = {}) => ({
  id,
  fullName: id,
  jobTitle: "Analyst",
  department: "Engineering",
  departmentId: "d-eng",
  managerId: null,
  ...over,
});

const goal = (over: Partial<ApiGoal> = {}): ApiGoal =>
  ({
    id: "g-1",
    title: "Grow the team",
    level: "company",
    status: "ON_TRACK",
    approval: "DRAFT",
    approvalLabel: "Draft",
    approvalNote: null,
    ownerId: null,
    ownerName: null,
    companyWide: true,
    departmentId: null,
    departmentName: null,
    dueQuarter: "2026-Q4",
    reviewCycleId: null,
    reviewCycleName: null,
    progress: 0,
    measuredProgress: null,
    targetFrozen: false,
    childCount: 0,
    revisionCount: 0,
    keyResults: [],
    ...over,
  }) as unknown as ApiGoal;

async function open(card: ApiGoal) {
  const user = userEvent.setup();
  const noop = vi.fn();
  render(
    <GoalCard
      goal={card}
      depth={0}
      editable
      actingId="emp-head"
      onAddMeasure={noop}
      onAddChild={noop}
      onAssign={noop}
      onComplete={noop}
      onStop={noop}
      onEdit={noop}
      onDelete={noop}
      onShare={noop}
      onSubmit={noop}
      onReopen={noop}
      onRecord={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: new RegExp(card.title) }),
  );
  const dialog = within(
    await screen.findByRole("dialog", { name: card.title }),
  );
  const more = dialog.queryByRole("button", {
    name: "More for this objective",
  });
  if (more) await user.click(more);
  return { dialog, user, noop };
}

beforeEach(() => {
  state.employeeId = "emp-head";
  state.everyone = false;
  state.people = [];
});

describe("Add a period", () => {
  it("is offered where Send would be, for an objective with no period and no quarter", async () => {
    const { dialog } = await open(
      goal({ ownerId: "emp-head", level: "personal", dueQuarter: null }),
    );
    expect(
      dialog.getByRole("button", { name: "Add a period" }),
    ).toBeInTheDocument();
    expect(
      dialog.queryByRole("button", { name: "Send to be agreed" }),
    ).toBeNull();
    expect(dialog.queryByText(/Give this a quarter/)).toBeNull();
  });

  it("is not there once it has a quarter, and Send is", async () => {
    const { dialog } = await open(
      goal({ ownerId: "emp-head", level: "personal" }),
    );
    expect(dialog.queryByRole("button", { name: "Add a period" })).toBeNull();
    expect(
      dialog.getByRole("button", { name: "Send to be agreed" }),
    ).toBeInTheDocument();
  });
});

describe("Give an objective to people", () => {
  it("is in the menu of a shared objective when there is somebody to give it to", async () => {
    state.people = [
      person("emp-head"),
      person("eng-1", { managerId: "emp-head" }),
    ];
    await open(goal());
    expect(
      screen.getByRole("menuitem", { name: "Give an objective to people" }),
    ).toBeInTheDocument();
  });

  it("is not there when nobody is eligible, and no sentence takes its place", async () => {
    state.people = [person("elsewhere")];
    state.employeeId = "emp-new";
    const { dialog } = await open(goal());
    expect(
      screen.queryByRole("menuitem", { name: "Give an objective to people" }),
    ).toBeNull();
    expect(dialog.queryByText(/yours to set goals for/)).toBeNull();
  });

  it("is never on a personal objective", async () => {
    state.people = [person("emp-head")];
    await open(goal({ ownerId: "emp-head", level: "personal" }));
    expect(
      screen.queryByRole("menuitem", { name: "Give an objective to people" }),
    ).toBeNull();
  });
});
