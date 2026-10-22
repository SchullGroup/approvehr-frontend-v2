import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * The surveys, the salary grades, the pay components, the cover requests and the
 * noticeboard list on the one loading and failure rule.
 *
 * What an audit found: the grades panel printed four zero figures, "₦0.00" for
 * the monthly cost, and "No grades yet" while it loaded and after it failed; the
 * components panel did the same with "0 switched on" and an empty state whose
 * title was "Loading…"; the cover requests printed the server's raw sentence in a
 * bare paragraph; the noticeboard list said "Nothing on the noticeboard yet" and
 * "Nothing has expired" under its own failure. Every one is a claim about the
 * company's own records that the page did not know.
 */

const serverError = new ApiError(500, "internal", "Something went wrong.");

const state = vi.hoisted(() => ({
  grades: {
    rows: [] as unknown[],
    loading: false,
    error: null as unknown,
    connected: true,
    editable: true,
    reload: () => {},
  },
  components: {
    rows: [] as unknown[],
    loading: false,
    error: null as unknown,
    connected: true,
    editable: true,
    reload: () => {},
  },
  swaps: {
    swaps: [] as unknown[],
    loading: false,
    error: null as unknown,
    reload: () => {},
  },
  board: {
    announcements: [] as unknown[],
    total: 0,
    loading: false,
    error: null as unknown,
    editable: true,
    source: "api",
    reload: () => {},
  },
  mine: {
    invites: [] as unknown[],
    loading: false,
    error: null as unknown,
    unavailable: false,
    reload: () => {},
  },
  running: {
    surveys: [] as unknown[],
    loading: false,
    error: null as unknown,
    reload: () => {},
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {} }),
  usePathname: () => "/payroll/pay-setup",
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
    can: () => true,
  }),
}));
vi.mock("@/lib/store/grades", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/grades")>()),
  useGrades: () => state.grades,
  useGradeIncrease: () => ({
    preview: async () => null,
    apply: async () => {},
  }),
}));
vi.mock("@/lib/store/pay-components", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/pay-components")>()),
  usePayComponents: () => state.components,
}));
vi.mock("@/lib/payroll/use-settings", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/payroll/use-settings")>()),
  usePayrollSettings: () => ({ settings: {} }),
}));
vi.mock("@/lib/store/shifts", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/shifts")>()),
  useSwaps: () => state.swaps,
  useShiftMutations: () => ({
    acceptSwap: async () => {},
    approveSwap: async () => {},
    declineSwap: async () => {},
    cancelSwap: async () => {},
  }),
}));
vi.mock("@/lib/store/announcements", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/announcements")>()),
  useAnnouncements: () => state.board,
  useAnnouncementMutations: () => ({
    create: async () => {},
    update: async () => {},
    publish: async () => {},
    remove: async () => {},
  }),
}));
vi.mock("@/lib/store/departments", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/departments")>()),
  useDepartments: () => ({ flat: [], loading: false, error: null }),
}));
vi.mock("@/lib/store/surveys", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/surveys")>()),
  useMySurveys: () => state.mine,
  useSurveys: () => state.running,
  useSurveyActions: () => ({ close: async () => {} }),
}));

beforeEach(() => {
  for (const key of [
    "grades",
    "components",
    "swaps",
    "board",
    "mine",
    "running",
  ] as const) {
    state[key].loading = false;
    state[key].error = null;
  }
  state.grades.rows = [];
  state.components.rows = [];
  state.swaps.swaps = [];
  state.board.announcements = [];
  state.mine.invites = [];
  state.running.surveys = [];
});

const SCREENS = [
  {
    name: "the salary grades",
    key: "grades" as const,
    draw: async () => {
      const { GradesPanel } =
        await import("@/app/(app)/payroll/pay-setup/grades-panel");
      return <GradesPanel />;
    },
    empty: "No grades yet",
    failed: "The salary bands did not load",
  },
  {
    name: "the allowances list",
    key: "components" as const,
    draw: async () => {
      const { ComponentsPanel } =
        await import("@/app/(app)/payroll/pay-setup/components-panel");
      return <ComponentsPanel kind="ALLOWANCE" />;
    },
    empty: "No allowances yet",
    failed: "The allowances did not load",
  },
  {
    name: "the cover requests",
    key: "swaps" as const,
    draw: async () => {
      const { SwapPanel } = await import("@/app/(app)/people/shifts/swaps");
      return <SwapPanel />;
    },
    empty: "Nothing waiting",
    failed: "The cover requests did not load",
  },
  {
    name: "the noticeboard list",
    key: "board" as const,
    draw: async () => {
      const { AnnouncementsScreen } =
        await import("@/app/(app)/settings/announcements/announcements-screen");
      return <AnnouncementsScreen />;
    },
    empty: "Nothing on the noticeboard yet",
    failed: "The noticeboard did not load",
  },
  {
    name: "the surveys you have been asked",
    key: "mine" as const,
    draw: async () => {
      const { SurveysScreen } =
        await import("@/app/(app)/surveys/surveys-screen");
      return <SurveysScreen />;
    },
    empty: "Nothing to answer",
    failed: "The surveys you have been asked did not load",
  },
  {
    name: "the surveys you are running",
    key: "running" as const,
    draw: async () => {
      const { SurveysScreen } =
        await import("@/app/(app)/surveys/surveys-screen");
      return <SurveysScreen />;
    },
    empty: "None yet",
    failed: "The surveys you are running did not load",
  },
];

describe.each(SCREENS)("$name", (screenCase) => {
  it("says nothing is there only once it has asked", async () => {
    state[screenCase.key].loading = true;
    render(await screenCase.draw());
    expect(screen.queryByText(screenCase.empty)).not.toBeInTheDocument();
    expect(screen.queryByText(screenCase.failed)).not.toBeInTheDocument();
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("shows the failure card and not the empty state after a failure", async () => {
    state[screenCase.key].error = serverError;
    render(await screenCase.draw());
    expect(screen.getByText(screenCase.failed)).toBeInTheDocument();
    expect(screen.queryByText(screenCase.empty)).not.toBeInTheDocument();
  });

  it("says it is empty once it has asked and there is nothing", async () => {
    render(await screenCase.draw());
    expect(screen.getByText(screenCase.empty)).toBeInTheDocument();
  });
});

describe("the figures over a read that did not answer", () => {
  it("prints dashes on the grades, not zeros, after a failure", async () => {
    state.grades.error = serverError;
    const { GradesPanel } =
      await import("@/app/(app)/payroll/pay-setup/grades-panel");
    render(<GradesPanel />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText(/₦0\.00/)).not.toBeInTheDocument();
  });

  it("prints dashes on the noticeboard counts, and not 'Nothing has expired', after a failure", async () => {
    state.board.error = serverError;
    const { AnnouncementsScreen } =
      await import("@/app/(app)/settings/announcements/announcements-screen");
    render(<AnnouncementsScreen />);
    expect(screen.queryByText("Nothing has expired")).not.toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
