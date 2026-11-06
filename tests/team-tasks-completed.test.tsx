import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Team tasks has two views of the same people: what they have open, and what they
 * have finished. The choice is in the address, so a link to either is shareable,
 * and the open view is the one a bare address opens.
 */

let search = new URLSearchParams();
/** What the API said of the reader: HR (`everyone`), and whether they lead people. */
const scope = vi.hoisted(() => ({
  value: { everyone: false, leads: true as boolean | null },
}));
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
vi.mock("@/lib/store/team-tasks", () => ({
  useTeamScope: () => scope.value,
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
  scope.value = { everyone: false, leads: true };
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

describe("for HR", () => {
  it("who lead nobody, opens on Completed with no switch to open work", async () => {
    scope.value = { everyone: true, leads: false };
    render(<TeamTasksScreen />);
    expect(
      await screen.findByRole("radio", { name: "Quarter" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Open work" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Completed" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Overdue" })).toBeNull();
    expect(
      screen.getByText("Everybody's finished work, by person."),
    ).toBeInTheDocument();
  });

  it("who lead nobody, never reach the empty open work, even by an old address", async () => {
    scope.value = { everyone: true, leads: false };
    search = new URLSearchParams("view=open");
    render(<TeamTasksScreen />);
    expect(
      await screen.findByRole("radio", { name: "Quarter" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nobody reports to you/)).toBeNull();
  });

  it("opens on Completed before it is known whether they lead anybody, and draws no switch yet", async () => {
    scope.value = { everyone: true, leads: null };
    render(<TeamTasksScreen />);
    expect(
      await screen.findByRole("radio", { name: "Quarter" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Open work" })).toBeNull();
  });

  it("who do lead people, open on Completed and may switch to their open work", async () => {
    scope.value = { everyone: true, leads: true };
    render(<TeamTasksScreen />);
    expect(
      await screen.findByRole("radio", { name: "Completed" }),
    ).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Open work" }));
    expect(replace).toHaveBeenLastCalledWith("/projects/team?view=open", {
      scroll: false,
    });
  });

  it("who do lead people, can come back to Completed with a clean address", async () => {
    scope.value = { everyone: true, leads: true };
    search = new URLSearchParams("view=open");
    render(<TeamTasksScreen />);
    expect(
      await screen.findByRole("radio", { name: "Open work" }),
    ).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "Completed" }));
    expect(replace).toHaveBeenLastCalledWith("/projects/team", {
      scroll: false,
    });
  });

  it("is not how a manager sees it: they keep opening on open work", async () => {
    scope.value = { everyone: false, leads: true };
    render(<TeamTasksScreen />);
    expect(
      await screen.findByRole("radio", { name: "Open work" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByText("Everyone you manage or whose department you run."),
    ).toBeInTheDocument();
  });
});
