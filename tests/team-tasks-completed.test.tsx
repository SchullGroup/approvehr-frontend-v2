import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Team tasks has two views of the same people: what they have open, and what they
 * have finished. The choice is in the address, so a link to either is shareable,
 * and the open view is the one a bare address opens.
 */

let search = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/team",
  useSearchParams: () => search,
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
}));
vi.mock("@/components/projects/personal-issue-drawer", () => ({
  PersonalIssueDrawer: () => null,
}));
vi.mock("@/components/projects/reduced-issue-drawer", () => ({
  ReducedIssueDrawer: () => null,
}));
vi.mock("@/lib/store/project-session", () => ({
  useProjectsGate: () => ({ enabled: true, loading: false }),
  usePeople: () => ({
    people: [],
    byId: new Map(),
    nameOf: () => "",
    loading: false,
  }),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: true }),
}));
vi.mock("@/lib/api/projects", async (original) => ({
  ...(await original<typeof import("@/lib/api/projects")>()),
  projectsApi: { teamTasks: vi.fn().mockResolvedValue([]) },
}));
vi.mock("@/lib/store/completions", () => ({
  useDemoTeamOpen: () => null,
  useBulkLink: () => vi.fn(),
  useTeamCompleted: () => ({
    people: [],
    total: 0,
    shown: 0,
    loading: false,
    error: null,
    hasMore: false,
    loadingMore: false,
    moreError: null,
    loadMore: vi.fn(),
    reload: vi.fn(),
  }),
}));

const { TeamTasksScreen } =
  await import("@/app/(app)/projects/team/team-tasks-screen");

beforeEach(() => {
  search = new URLSearchParams();
  replace.mockClear();
});

describe("the two views", () => {
  it("opens on open work, with the view choice and the open filters", async () => {
    render(<TeamTasksScreen />);
    expect(
      await screen.findByRole("radio", { name: "Open work" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Overdue" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Quarter" })).toBeNull();
  });

  it("opens the Completed view from the address, with its period choice and no open filters", async () => {
    search = new URLSearchParams("view=completed");
    render(<TeamTasksScreen />);
    expect(
      await screen.findByRole("radio", { name: "Completed" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Quarter" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Overdue" })).toBeNull();
  });

  it("keeps the choice in the address: Completed adds it, Open work takes it away", async () => {
    render(<TeamTasksScreen />);
    await userEvent.click(
      await screen.findByRole("radio", { name: "Completed" }),
    );
    expect(replace).toHaveBeenLastCalledWith("/projects/team?view=completed", {
      scroll: false,
    });
    search = new URLSearchParams("view=completed");
    render(<TeamTasksScreen />);
    const back = screen.getAllByRole("radio", { name: "Open work" }).at(-1)!;
    await userEvent.click(back);
    expect(replace).toHaveBeenLastCalledWith("/projects/team", {
      scroll: false,
    });
  });

  it("falls back to open work for a value it does not know", async () => {
    search = new URLSearchParams("view=anything");
    render(<TeamTasksScreen />);
    expect(
      await screen.findByRole("radio", { name: "Open work" }),
    ).toHaveAttribute("aria-checked", "true");
  });
});
