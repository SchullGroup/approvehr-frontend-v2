import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiGoal } from "@/lib/api/performance";
import type { KpiScope } from "@/lib/store/performance";

/**
 * Objectives with nothing in them, and the way to a new one (owner request, 24
 * Nov 2026).
 *
 * - A reading with no objectives shows one empty state with a figure, what an
 *   objective is, and New objective: not four tiles reading 0, a filter row
 *   with nothing to filter and an empty list.
 * - New objective is a page, `/performance/kpis/new`, that knows where to come
 *   back to. Nothing on Objectives opens the old dialog.
 */

const state = vi.hoisted(() => ({
  goals: [] as ApiGoal[],
  loading: false,
  editable: true,
  canUpload: true,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
}));
vi.mock("@/lib/store/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    employeeId: "emp-1",
    actingId: "emp-1",
    isConnected: true,
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
  useHeadedDepartmentIds: () => new Set<string>(),
}));
vi.mock("@/lib/store/employees-api", () => ({
  useEmployeeDirectory: () => ({ employees: [], people: [], loading: false }),
}));
vi.mock("@/lib/store/features", () => ({
  useFeatures: () => ({ projects: false, loading: false }),
}));
vi.mock("@/lib/store/ai", () => ({
  useAssistantAvailable: () => ({ available: false, loading: false }),
  useTaskSummarySuggestion: () => ({
    loading: false,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
  useObjectiveSuggestions: () => ({
    loading: false,
    ask: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock("@/app/(app)/performance/kpis/import/access", () => ({
  useCanUploadObjectives: () => state.canUpload,
}));
vi.mock("@/app/(app)/performance/add-multiple-objectives", () => ({
  AddMultipleObjectives: () => null,
}));
vi.mock("@/lib/store/performance", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/store/performance")>();
  return {
    ...real,
    useKpis: () => ({
      goals: state.goals,
      cascade: real.toCascade(state.goals),
      loading: state.loading,
      error: null,
      source: "api",
      reload: vi.fn(),
    }),
    useKpiMutations: () => ({ editable: state.editable }),
    useObjectiveMutations: () => ({}),
    useAppraisals: () => ({ cycles: [], loading: false }),
  };
});

const { KpisTab, EMPTY_TITLE } = await import("@/app/(app)/performance/kpis");

const goal = (over: Partial<ApiGoal> = {}): ApiGoal =>
  ({
    id: "g-1",
    title: "Fill the two Lagos roles",
    description: null,
    ownerId: "emp-1",
    ownerName: "Adaeze Okonkwo",
    departmentId: null,
    departmentName: null,
    level: "personal",
    companyWide: false,
    parentId: null,
    parentTitle: null,
    status: "ON_TRACK",
    progress: 0,
    measuredProgress: null,
    keyResults: [],
    approval: "DRAFT",
    approvalLabel: "Draft",
    reviewCycleId: null,
    reviewCycleName: null,
    createdAt: "2026-10-21T09:00:00.000Z",
    updatedAt: "2026-10-21T09:00:00.000Z",
    ...over,
  }) as ApiGoal;

beforeEach(() => {
  state.goals = [];
  state.loading = false;
  state.editable = true;
  state.canUpload = true;
});

const tab = (scope: KpiScope) =>
  render(
    <KpisTab
      scope={scope}
      scopes={["mine", "team", "company"]}
      onScopeChange={vi.fn()}
    />,
  );

describe("a reading with no objectives", () => {
  it.each<[KpiScope, string]>([
    ["mine", "No objectives yet"],
    ["team", "Nobody in your team has an objective yet"],
    ["company", "The company has no objectives yet"],
  ])("says so for %s in its own words", (scope, title) => {
    tab(scope);
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(EMPTY_TITLE[scope]).toBe(title);
  });

  it("says what an objective is, and that it is agreed before its period", () => {
    tab("mine");
    expect(
      screen.getByText(
        "An objective is what somebody aims for, with a target to measure it, and it is agreed before the period it covers.",
      ),
    ).toBeInTheDocument();
  });

  it("hides the four tiles and the search and filter row", () => {
    tab("mine");
    expect(
      screen.queryByText("Objectives being tracked"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Average progress")).not.toBeInTheDocument();
    expect(screen.queryByText("Targets met")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Search objectives by title or detail"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("All objectives")).not.toBeInTheDocument();
  });

  it("offers New objective as the page, once, with Add several and Upload as the quieter ways in", () => {
    tab("team");
    const links = screen.getAllByRole("link", { name: /new objective/i });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute(
      "href",
      "/performance/kpis/new?back=%2Fperformance%2Fkpis%3Fscope%3Dteam",
    );
    expect(
      screen.getByRole("button", { name: "Add several" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Upload objectives" }),
    ).toHaveAttribute("href", "/performance/kpis/import");
    expect(
      screen.queryByRole("button", { name: /add multiple/i }),
    ).not.toBeInTheDocument();
  });

  it("offers nothing to write to somebody who cannot", () => {
    state.editable = false;
    tab("mine");
    expect(
      screen.getByRole("heading", { name: "No objectives yet" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /new objective/i }),
    ).not.toBeInTheDocument();
  });

  it("is not shown while the list is still loading", () => {
    state.loading = true;
    tab("mine");
    expect(
      screen.queryByRole("heading", { name: "No objectives yet" }),
    ).not.toBeInTheDocument();
  });
});

describe("with objectives", () => {
  it("keeps the tiles, and New objective goes to the page rather than a dialog", () => {
    state.goals = [goal()];
    tab("mine");
    expect(screen.getByText("Objectives being tracked")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /new objective/i });
    expect(link).toHaveAttribute(
      "href",
      "/performance/kpis/new?back=%2Fperformance%2Fkpis%3Fscope%3Dmine",
    );
    expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("a declined objective, to its owner", () => {
  it("says Declined, shows the feedback, and offers Edit and resend on the same page as a new one", () => {
    state.goals = [
      goal({
        id: "g-declined",
        title: "Cut supplier queries by half",
        approval: "NEEDS_REVISION",
        approvalLabel: "Sent back",
        approvalNote: "Half of what? Say the number this quarter starts at.",
      }),
    ];
    tab("mine");
    expect(screen.getAllByText("Declined").length).toBeGreaterThan(0);
    expect(screen.queryByText("Sent back")).not.toBeInTheDocument();
    expect(
      screen.getByText("Feedback when it was declined"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Half of what? Say the number this quarter starts at."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Edit and resend" }),
    ).toHaveAttribute("href", "/performance/kpis/new?edit=g-declined");
  });
});
