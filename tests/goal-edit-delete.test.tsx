import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";

/**
 * Editing and deleting an objective nobody has agreed.
 *
 * `tsc` cannot see what these pin: that the controls are offered only where the
 * API will take them (a click that comes back "no" is a design failure two clicks
 * earlier), that a save sends only what changed, and that a delete says what goes
 * with it.
 */

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ employeeId: "emp-1" }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
  useHeadedDepartmentIds: () => new Set<string>(),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: [], people: [] }),
}));
vi.mock("@/lib/store/performance", () => ({
  useAppraisals: () => ({
    cycles: [
      { id: "c-open", name: "H2 2026", stage: "SELF" },
      { id: "c-closed", name: "H1 2026", stage: "PUBLISHED" },
    ],
  }),
}));
vi.mock("@/lib/store/ai", () => ({
  useAssistantAvailable: () => ({ available: false, loading: false }),
  useObjectiveSuggestions: () => ({
    loading: false,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
}));

const { DeleteGoalDialog, EditGoalDialog, deleteBlocker, mayEditGoal } =
  await import("@/app/(app)/performance/goal-dialogs");

const goal = (over: Partial<ApiGoal> = {}): ApiGoal =>
  ({
    id: "g-1",
    title: "Grow qualified pipeline",
    description: "Source and qualify.",
    ownerId: "emp-1",
    level: "personal",
    status: "ON_TRACK",
    approval: "DRAFT",
    targetFrozen: false,
    dueQuarter: "2026-Q4",
    reviewCycleId: null,
    reviewCycleName: null,
    keyResults: [],
    childCount: 0,
    ...over,
  }) as ApiGoal;

describe("when an objective can be edited or deleted", () => {
  it("offers both on a draft with nothing under it", () => {
    expect(mayEditGoal(goal())).toBe(true);
    expect(deleteBlocker(goal())).toBeNull();
  });

  it("offers both on one that was sent back for changes", () => {
    const sentBack = goal({ approval: "NEEDS_REVISION" });
    expect(mayEditGoal(sentBack)).toBe(true);
    expect(deleteBlocker(sentBack)).toBeNull();
  });

  it("does not edit an agreed one, and says to stop it rather than delete it", () => {
    const agreed = goal({ approval: "AGREED", targetFrozen: true });
    expect(mayEditGoal(agreed)).toBe(false);
    expect(deleteBlocker(agreed)).toMatch(/record of that agreement/);
    expect(deleteBlocker(agreed)).toMatch(/Stop it instead/);
  });

  it("keeps a refusal, and a finished one, on record", () => {
    expect(deleteBlocker(goal({ approval: "REJECTED" }))).toMatch(/refusal/);
    const done = goal({ status: "DONE" });
    expect(deleteBlocker(done)).toMatch(/what was achieved/);
    expect(mayEditGoal(done)).toBe(false);
  });

  it("does not delete one other goals ladder up to, and counts them", () => {
    expect(deleteBlocker(goal({ childCount: 1 }))).toMatch(/1 goal ladders/);
    expect(deleteBlocker(goal({ childCount: 3 }))).toMatch(/3 goals ladder/);
  });
});

describe("the edit dialog", () => {
  const open = (over: Partial<ApiGoal> = {}) => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(
      <EditGoalDialog
        goal={goal(over)}
        open
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    return onSave;
  };

  it("opens on what the objective says now, with Save waiting for a change", () => {
    open();
    expect(screen.getByLabelText(/KPI title/)).toHaveValue(
      "Grow qualified pipeline",
    );
    expect(screen.getByLabelText(/Due quarter/)).toHaveValue("2026-Q4");
    expect(screen.getByLabelText(/Description/)).toHaveValue(
      "Source and qualify.",
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("calls a shared one an objective and a personal one a KPI", () => {
    open({ level: "department" });
    expect(screen.getByLabelText(/Objective title/)).toBeInTheDocument();
  });

  it("sends only what changed", async () => {
    const user = userEvent.setup();
    const onSave = open();
    const title = screen.getByLabelText(/KPI title/);
    await user.clear(title);
    await user.type(title, "Grow qualified pipeline by 40");
    await user.selectOptions(
      screen.getByLabelText(/Appraisal period/),
      "c-open",
    );
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith("g-1", {
      title: "Grow qualified pipeline by 40",
      reviewCycleId: "c-open",
    });
  });

  it("clears a description by sending null, not an empty string", async () => {
    const user = userEvent.setup();
    const onSave = open();
    await user.clear(screen.getByLabelText(/Description/));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith("g-1", { description: null });
  });

  it("refuses a title that is too short, and sends nothing", async () => {
    const user = userEvent.setup();
    const onSave = open();
    const title = screen.getByLabelText(/KPI title/);
    await user.clear(title);
    await user.type(title, "ab");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText(/title of at least three characters/),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not offer a published period to move an objective into", () => {
    open();
    const options = screen
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(options).toContain("H2 2026");
    expect(options).not.toContain("H1 2026");
  });
});

describe("the delete dialog", () => {
  it("says what goes with it, and that it cannot be undone", () => {
    render(
      <DeleteGoalDialog
        goal={goal({
          keyResults: [{ id: "k1" }, { id: "k2" }] as ApiGoal["keyResults"],
        })}
        open
        onClose={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Delete this KPI?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/along with its 2 measures/)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
  });

  it("deletes only when asked to, and keeping it deletes nothing", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(
      <DeleteGoalDialog
        goal={goal()}
        open
        onClose={onClose}
        onDelete={onDelete}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(onClose).toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete KPI" }));
    expect(onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: "g-1" }),
    );
  });
});
