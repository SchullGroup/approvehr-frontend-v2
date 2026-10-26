import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * The appraisal periods list and "my tasks" on the one loading and failure rule.
 *
 * Both printed their empty state ("No appraisal period is open", "Nothing logged
 * yet") under a failure card, and said so while the read was still in flight.
 * "Nothing logged yet" is the sentence that tells somebody their week of work
 * does not exist.
 */

const serverError = new ApiError(500, "internal", "Something went wrong.");

const state = vi.hoisted(() => ({
  appraisals: {
    cycles: [] as unknown[],
    loading: false,
    error: null as unknown,
    reload: () => {},
  },
  tasks: {
    tasks: [] as unknown[],
    loading: false,
    error: null as unknown,
    reload: () => {},
  },
  kpis: { goals: [] as unknown[], loading: false },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {} }),
  usePathname: () => "/performance",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/store/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    actingId: "e1",
    isConnected: true,
    isLoading: false,
    mode: "api",
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/performance", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/performance")>()),
  useAppraisals: () => state.appraisals,
  useMyTasks: () => state.tasks,
  useKpis: () => state.kpis,
  useTaskActions: () => ({
    submit: async () => {},
    grade: async () => {},
    remove: async () => {},
  }),
}));

beforeEach(() => {
  state.appraisals.cycles = [];
  state.appraisals.loading = false;
  state.appraisals.error = null;
  state.tasks.tasks = [];
  state.tasks.loading = false;
  state.tasks.error = null;
  state.kpis.loading = false;
});

const SCREENS = [
  {
    name: "the periods list",
    key: "appraisals" as const,
    draw: async () => {
      const { PeriodsTab } = await import("@/app/(app)/performance/periods");
      return <PeriodsTab />;
    },
    empty: "No appraisal period is open",
    failed: "The appraisal periods did not load",
  },
  {
    name: "my tasks",
    key: "tasks" as const,
    draw: async () => {
      const { MyTasksPanel } = await import("@/app/(app)/performance/my-tasks");
      return <MyTasksPanel />;
    },
    empty: "Nothing logged yet",
    failed: "Your tasks did not load",
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
