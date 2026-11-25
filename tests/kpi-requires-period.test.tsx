import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";

/**
 * A KPI is a person's own work, and an objective filed in no appraisal period
 * counts towards nobody's mark even once it is agreed. So when there is a period
 * to choose, a KPI has to be filed in one: the form asks, and says why.
 *
 * Shared objectives (the company's, a department's) are standing targets that
 * may belong to no cycle, and a company with no open period has nothing to file
 * anything under, so neither is held to it.
 *
 * Writing a new one is the wizard's, tested in `objective-wizard.test.tsx`;
 * what is left here is Edit.
 */

const state = vi.hoisted(() => ({
  cycles: [] as { id: string; name: string; stage: string }[],
  loading: false,
}));

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({ employeeId: "emp-1", isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
  useHeadedDepartmentIds: () => new Set<string>(),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: [], people: [] }),
}));
vi.mock("@/lib/store/performance", () => ({
  useAppraisals: () => ({ cycles: state.cycles, loading: state.loading }),
}));
vi.mock("@/lib/store/ai", () => ({
  useAssistantAvailable: () => ({ available: false, loading: false }),
  useObjectiveSuggestions: () => ({
    loading: false,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
}));

const { EditGoalDialog } = await import("@/app/(app)/performance/goal-dialogs");

const H1 = { id: "c-h1", name: "H1 2026", stage: "SELF" };
const H2 = { id: "c-h2", name: "H2 2026", stage: "SELF" };

beforeEach(() => {
  state.cycles = [H1, H2];
  state.loading = false;
});

const periodField = () =>
  screen.queryByLabelText(/Appraisal period/) as HTMLSelectElement | null;
const optionTexts = (select: HTMLElement) =>
  Array.from(select.querySelectorAll("option")).map((o) => o.textContent);

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

function edit(over: Partial<ApiGoal> = {}) {
  const onSave = vi.fn().mockResolvedValue(true);
  render(
    <EditGoalDialog goal={goal(over)} open onClose={vi.fn()} onSave={onSave} />,
  );
  return { onSave, user: userEvent.setup() };
}

describe("Edit a KPI", () => {
  it("asks an unfiled one for its period before saving anything else", async () => {
    const { onSave, user } = edit();
    expect(periodField()!.getAttribute("aria-required")).toBe("true");

    await user.type(screen.getByLabelText(/Description/), " More.");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/counts towards nobody's score/)).toBeVisible();

    await user.selectOptions(periodField()!, "c-h1");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledWith("g-1", {
      description: "Source and qualify. More.",
      reviewCycleId: "c-h1",
    });
  });

  it("does not let a filed one be taken out of its period", () => {
    edit({ reviewCycleId: "c-h1", reviewCycleName: "H1 2026" });
    expect(optionTexts(periodField()!)).not.toContain(
      "Not part of an appraisal period",
    );
    expect(periodField()!.value).toBe("c-h1");
  });

  it("leaves a department objective free to belong to no period", async () => {
    const { onSave, user } = edit({ level: "department", ownerId: null });
    expect(periodField()!.getAttribute("aria-required")).toBeNull();

    await user.type(screen.getByLabelText(/Description/), " More.");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
