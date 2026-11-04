import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/lib/projects/types";
import { people, sampleData } from "./projects-fixture";

/**
 * The All projects page, at a size a large company reaches.
 *
 * The API answers every project the person can open in one list, so the page
 * draws sixty cards at a time with "Load more", and a new filter starts again from
 * sixty. A company with a few projects sees no footer at all.
 */

let search = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  usePathname: () => "/projects",
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
}));

let projects: Project[] = [];
vi.mock("@/lib/store/projects", () => ({
  useProjectList: () => ({
    status: "ready",
    error: null,
    projects,
    reload: vi.fn(),
  }),
  useCreateProject: () => vi.fn(),
}));
vi.mock("@/lib/store/project-session", () => ({
  useProjectsGate: () => ({ enabled: true, loading: false }),
  usePeople: () => people,
  useProjectActor: () => ({
    employeeId: "p-01",
    editRecords: false,
    leadsPeople: true,
    headsDepartment: false,
  }),
}));
vi.mock("@/lib/store/programs", () => ({
  useProgramList: () => ({
    status: "ready",
    error: null,
    data: { programs: [], canCreate: false, seesAll: false },
    reload: vi.fn(),
  }),
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
}));

const { ProjectsScreen } = await import("@/app/(app)/projects/projects-screen");

const many = (n: number): Project[] =>
  Array.from({ length: n }, (_, i) => ({
    ...sampleData().project,
    id: `pj-${i}`,
    key: `K${String(i).padStart(3, "0")}`,
    name: `Project ${String(i).padStart(3, "0")}`,
    memberIds: ["p-01"],
  }));

const cards = () =>
  screen
    .getAllByRole("link")
    .filter((a) => /^\/projects\/pj-/.test(a.getAttribute("href") ?? ""));

beforeEach(() => {
  search = new URLSearchParams();
  replace.mockClear();
});

describe("All projects, paged", () => {
  it("draws sixty cards and a footer that adds sixty more", async () => {
    projects = many(130);
    render(<ProjectsScreen />);
    expect(cards()).toHaveLength(60);
    expect(screen.getByText("Showing 60 of 130 projects")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(cards()).toHaveLength(120);
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(cards()).toHaveLength(130);
    expect(screen.getByText("All 130 projects shown")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("starts again from sixty when the filter changes, and counts the matches", async () => {
    projects = many(130);
    const view = render(<ProjectsScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(cards()).toHaveLength(120);
    /* A filter that still matches everybody: the page is a different list now. */
    search = new URLSearchParams("q=Project");
    view.rerender(<ProjectsScreen />);
    expect(cards()).toHaveLength(60);
    /* A filter that matches a few draws them all and no footer. */
    search = new URLSearchParams("q=Project 12");
    view.rerender(<ProjectsScreen />);
    expect(cards()).toHaveLength(10);
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });

  it("offers no footer to a company with a few projects", () => {
    projects = many(5);
    render(<ProjectsScreen />);
    expect(cards()).toHaveLength(5);
    expect(
      screen.queryByRole("button", { name: "Load more" }),
    ).not.toBeInTheDocument();
  });
});
