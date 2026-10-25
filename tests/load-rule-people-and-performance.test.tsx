import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * Five more screens on the one loading and failure rule.
 *
 * What an audit found: the objectives queue said "Nothing waiting" under its own
 * failure card; the skills framework printed "Skills on your framework 0" and
 * "No framework yet" while it loaded and after it failed; the reported-faults
 * card said "Nothing is waiting" in its heading while the faults were loading;
 * the offboarding checklist printed "0 on the list" and "Nothing on the
 * checklist yet" for a list that never arrived; the projects list drew a bare
 * failure with no way back.
 */

const serverError = new ApiError(500, "internal", "Something went wrong.");

const state = vi.hoisted(() => ({
  approvals: {
    queue: [] as unknown[],
    loading: false,
    error: null as unknown,
    couldHaveQueue: true,
    reload: () => {},
  },
  skills: {
    skills: null as null | { rows: unknown[] },
    loading: false,
    error: null as unknown,
    reload: () => {},
  },
  faults: {
    requests: [] as unknown[],
    loading: false,
    error: null as unknown,
  },
  checklist: {
    rows: [] as unknown[],
    counts: { active: 0, mandatory: 0 },
    source: "api",
    loading: false,
    error: null as unknown,
    reload: () => {},
  },
  projects: {
    status: "ready" as "loading" | "error" | "ready",
    error: null as unknown,
    projects: [] as unknown[],
    reload: () => {},
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {} }),
  usePathname: () => "/performance",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/permissions")>()),
  useCan: () => true,
  Can: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePermissions: () => ({
    can: () => true,
    loading: false,
    permissions: new Set<string>(),
  }),
}));
vi.mock("@/lib/store/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/session")>()),
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({
    isConnected: true,
    isLoading: false,
    mode: "api",
    employeeId: "e1",
    actingId: "e1",
  }),
}));
vi.mock("@/lib/store/features", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/features")>()),
  useFeatures: () => ({ loading: false, appraisals: true }),
}));
vi.mock("@/lib/store/performance", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/performance")>()),
  useObjectiveApprovals: () => state.approvals,
  useObjectiveMutations: () => ({
    agree: async () => {},
    sendBack: async () => {},
    reject: async () => {},
  }),
  useSkills: () => state.skills,
  useGaps: () => ({
    gaps: [],
    loading: false,
    error: null,
    reload: () => {},
  }),
  useHeatmap: () => ({
    heatmap: null,
    loading: false,
    error: null,
    reload: () => {},
  }),
  useRating: () => ({ rate: async () => {} }),
}));
vi.mock("@/lib/store/assets", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/assets")>()),
  useRepairRequests: () => state.faults,
  useRepairActions: () => ({ advance: async () => {} }),
}));
vi.mock("@/lib/store/offboarding", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/offboarding")>()),
  useExitTemplates: () => state.checklist,
}));
vi.mock("@/lib/store/project-session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/project-session")>()),
  useProjectsGate: () => ({ enabled: true, loading: false }),
  useProjectActor: () => ({ employeeId: "e1", editRecords: true }),
  usePeople: () => ({ byId: () => null, all: [] }),
}));
vi.mock("@/lib/store/projects", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/projects")>()),
  useProjectList: () => state.projects,
}));

beforeEach(() => {
  state.approvals.queue = [];
  state.approvals.loading = false;
  state.approvals.error = null;
  state.skills.skills = null;
  state.skills.loading = false;
  state.skills.error = null;
  state.faults.requests = [];
  state.faults.loading = false;
  state.faults.error = null;
  state.checklist.rows = [];
  state.checklist.loading = false;
  state.checklist.error = null;
  state.projects.status = "ready";
  state.projects.error = null;
  state.projects.projects = [];
});

const SCREENS = [
  {
    name: "the objectives queue",
    set: (loading: boolean, error: unknown) =>
      Object.assign(state.approvals, { loading, error }),
    draw: async () => {
      const { ApprovalsScreen } =
        await import("@/app/(app)/performance/approvals/approvals-screen");
      return <ApprovalsScreen />;
    },
    empty: "Nothing waiting",
    failed: "The objectives waiting on you did not load",
  },
  {
    name: "the skills framework",
    set: (loading: boolean, error: unknown) =>
      Object.assign(state.skills, { loading, error }),
    draw: async () => {
      const { SkillsTab } = await import("@/app/(app)/performance/skills");
      return <SkillsTab canSeeCompany={false} isManager={false} />;
    },
    empty: "No framework yet",
    failed: "Your skills framework did not load",
  },
  {
    name: "the reported faults",
    set: (loading: boolean, error: unknown) =>
      Object.assign(state.faults, { loading, error }),
    draw: async () => {
      const { FaultQueuePanel } =
        await import("@/app/(app)/people/assets/fault-queue");
      return <FaultQueuePanel />;
    },
    empty: "Nothing is waiting",
    failed: "The reported faults did not load",
  },
  {
    name: "the offboarding checklist",
    set: (loading: boolean, error: unknown) =>
      Object.assign(state.checklist, { loading, error }),
    draw: async () => {
      const { ChecklistSettingsScreen } =
        await import("@/app/(app)/people/offboarding/checklist/checklist-settings");
      return <ChecklistSettingsScreen />;
    },
    empty: "Nothing on the checklist yet",
    failed: "The checklist did not load",
  },
];

describe.each(SCREENS)("$name", (screenCase) => {
  it("says nothing is there only once it has asked", async () => {
    screenCase.set(true, null);
    render(await screenCase.draw());
    expect(screen.queryByText(screenCase.empty)).not.toBeInTheDocument();
    expect(screen.queryByText(screenCase.failed)).not.toBeInTheDocument();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("shows the failure card and not the empty state after a failure", async () => {
    screenCase.set(false, serverError);
    render(await screenCase.draw());
    expect(screen.getByText(screenCase.failed)).toBeInTheDocument();
    expect(screen.queryByText(screenCase.empty)).not.toBeInTheDocument();
  });

  it("says it is empty once it has asked and there is nothing", async () => {
    screenCase.set(false, null);
    render(await screenCase.draw());
    expect(screen.getByText(screenCase.empty)).toBeInTheDocument();
  });
});

describe("the projects list", () => {
  const draw = async () => {
    const { ProjectsScreen } =
      await import("@/app/(app)/projects/projects-screen");
    return render(<ProjectsScreen />);
  };

  it("shows a skeleton and no empty state while it asks", async () => {
    state.projects.status = "loading";
    await draw();
    expect(
      screen.queryByText("Start your first project"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Loading the projects")).toBeInTheDocument();
  });

  it("shows the failure card after a failure", async () => {
    state.projects.status = "error";
    state.projects.error = serverError;
    await draw();
    expect(screen.getByText("The projects did not load")).toBeInTheDocument();
    expect(
      screen.queryByText("Start your first project"),
    ).not.toBeInTheDocument();
  });
});

describe("the reported faults heading", () => {
  const draw = async () => {
    const { FaultQueuePanel } =
      await import("@/app/(app)/people/assets/fault-queue");
    return render(<FaultQueuePanel />);
  };

  it("does not say nothing is waiting while the faults are still loading", async () => {
    state.faults.loading = true;
    await draw();
    expect(screen.queryByText(/Nothing is waiting\./)).not.toBeInTheDocument();
  });

  it("does not say it after a failed read either", async () => {
    state.faults.error = serverError;
    await draw();
    expect(screen.queryByText(/Nothing is waiting\./)).not.toBeInTheDocument();
  });

  it("says it once the read has answered with nothing open", async () => {
    await draw();
    expect(screen.getByText(/Nothing is waiting\./)).toBeInTheDocument();
  });
});
