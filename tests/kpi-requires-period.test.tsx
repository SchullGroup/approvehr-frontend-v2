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

const { NewKpiDialog, EditGoalDialog } =
  await import("@/app/(app)/performance/goal-dialogs");

const H1 = { id: "c-h1", name: "H1 2026", stage: "SELF" };
const H2 = { id: "c-h2", name: "H2 2026", stage: "SELF" };
const CLOSED = { id: "c-old", name: "H2 2025", stage: "PUBLISHED" };

beforeEach(() => {
  state.cycles = [H1, H2];
  state.loading = false;
});

const periodField = () =>
  screen.queryByLabelText(/Appraisal period/) as HTMLSelectElement | null;
const optionTexts = (select: HTMLElement) =>
  Array.from(select.querySelectorAll("option")).map((o) => o.textContent);

function newKpi(mode: "kpi" | "objective" = "kpi") {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  render(
    <NewKpiDialog open mode={mode} onClose={vi.fn()} onCreate={onCreate} />,
  );
  return { onCreate, user: userEvent.setup() };
}

describe("New KPI", () => {
  it("asks for an appraisal period, and offers no way to choose none", () => {
    newKpi();
    const field = periodField()!;
    expect(field).not.toBeNull();
    expect(field.getAttribute("aria-required")).toBe("true");
    expect(optionTexts(field)).toEqual([
      "Choose an appraisal period",
      "H1 2026",
      "H2 2026",
    ]);
    /* "Description" still says (optional); this one must not. */
    const label = document.querySelector(`label[for="${field.id}"]`);
    expect(label?.textContent).not.toMatch(/optional/i);
  });

  it("refuses to create one with no period chosen, and says why", async () => {
    const { onCreate, user } = newKpi();
    await user.type(screen.getByLabelText(/KPI title/), "Close five deals");
    await user.click(screen.getByRole("button", { name: "Create KPI" }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/counts towards nobody's mark/)).toBeVisible();
  });

  it("creates it filed in the period that was chosen", async () => {
    const { onCreate, user } = newKpi();
    await user.type(screen.getByLabelText(/KPI title/), "Close five deals");
    await user.selectOptions(periodField()!, "c-h2");
    await user.click(screen.getByRole("button", { name: "Create KPI" }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![0]).toMatchObject({
      title: "Close five deals",
      reviewCycleId: "c-h2",
    });
  });

  it("starts on the one open period when there is only one", async () => {
    state.cycles = [H1, CLOSED];
    const { onCreate, user } = newKpi();
    expect(periodField()!.value).toBe("c-h1");

    await user.type(screen.getByLabelText(/KPI title/), "Close five deals");
    await user.click(screen.getByRole("button", { name: "Create KPI" }));
    expect(onCreate.mock.calls[0]![0]).toMatchObject({ reviewCycleId: "c-h1" });
    /* A published period is a record, and is not offered. */
    expect(optionTexts(periodField()!)).not.toContain("H2 2025");
  });

  it("does not hold a company-wide KPI to it", async () => {
    const { onCreate, user } = newKpi();
    await user.selectOptions(screen.getByLabelText(/Assigned to/), "company");

    expect(periodField()!.getAttribute("aria-required")).toBeNull();
    expect(optionTexts(periodField()!)[0]).toBe(
      "Not part of an appraisal period",
    );
    await user.type(screen.getByLabelText(/KPI title/), "Win the tender");
    await user.click(screen.getByRole("button", { name: "Create KPI" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![0]).not.toHaveProperty("reviewCycleId");
  });

  it("leaves a shared objective optional, as it was", () => {
    newKpi("objective");
    expect(periodField()!.getAttribute("aria-required")).toBeNull();
    expect(optionTexts(periodField()!)[0]).toBe(
      "Not part of an appraisal period",
    );
  });

  it("says so, and still saves, when no period is open to file it in", async () => {
    state.cycles = [CLOSED];
    const { onCreate, user } = newKpi();

    expect(periodField()).toBeNull();
    expect(screen.getByText(/No appraisal period is open/)).toBeVisible();
    await user.type(screen.getByLabelText(/KPI title/), "Close five deals");
    await user.click(screen.getByRole("button", { name: "Create KPI" }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it("does not offer Create, or the no-period warning, while the periods are still arriving", () => {
    state.cycles = [];
    state.loading = true;
    newKpi();

    expect(screen.getByRole("button", { name: "Create KPI" })).toBeDisabled();
    expect(
      screen.queryByText(/No appraisal period is open/),
    ).not.toBeInTheDocument();
  });
});

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
    expect(screen.getByText(/counts towards nobody's mark/)).toBeVisible();

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
