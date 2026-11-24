import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * Workload says where open work is when it cannot count it by person (UAT 23
 * Nov, U104 / PERF-32). The bars come from each program's rollup, and there is
 * no per-person count for projects in no program, so a company whose projects
 * sit outside programs read "Open 12" beside "Nothing open". It now says how
 * many open tasks are outside any program and where to find them.
 */

const metrics = (open: number) => ({
  total: open,
  open,
  overdue: 0,
  dueThisWeek: 0,
  doneThisWeek: 0,
  byCategory: { TODO: open, IN_PROGRESS: 0, DONE: 0 },
});

let outside = { ...metrics(12), projects: 2 };
let rollups: unknown[] = [];

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("view=workload"),
  usePathname: () => "/projects/master",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/store/project-session", () => ({
  useProjectsGate: () => ({ enabled: true, loading: false }),
}));
vi.mock("@/components/portal/require-permission", () => ({
  RequirePermission: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/store/programs", () => ({
  useProgramList: () => ({
    status: "ready",
    error: null,
    reload: vi.fn(),
    data: { programs: [] },
  }),
  useProgramRollups: () => ({
    status: "ready",
    error: null,
    reload: vi.fn(),
    data: rollups,
  }),
  useWorkRollup: () => ({
    status: "ready",
    error: null,
    reload: vi.fn(),
    data: {
      asOf: "2026-11-23T09:00:00.000Z",
      week: { start: "2026-11-23", end: "2026-11-29" },
      master: true,
      totals: metrics(outside.open),
      programs: [],
      unassigned: outside,
      capped: false,
    },
  }),
}));

const { MasterScreen } =
  await import("@/app/(app)/projects/master/master-screen");

beforeEach(() => {
  outside = { ...metrics(12), projects: 2 };
  rollups = [];
});

describe("Workload with projects outside any program", () => {
  it("does not say nothing is open beside an open count", () => {
    render(<MasterScreen />);
    expect(screen.queryByText("Nothing open")).toBeNull();
    expect(
      screen.getByText(
        "12 open tasks are in 2 projects outside any program. This view counts tasks by person only inside programs; they are all under All tasks.",
      ),
    ).toBeInTheDocument();
  });

  it("still says nothing is open when nothing is", () => {
    outside = { ...metrics(0), projects: 0 };
    render(<MasterScreen />);
    expect(screen.getByText("Nothing open")).toBeInTheDocument();
  });
});
