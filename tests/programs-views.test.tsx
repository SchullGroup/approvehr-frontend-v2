import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NOW,
  TODAY,
  WHO,
  fakeProgramActions,
  loadMoreSpy,
  people,
  programHooks,
  scene,
  viewerOf,
  type Who,
} from "./programs-fixture";
import { ApiError } from "@/lib/api/client";
import { visibleProjects, workPage, workRollup } from "@/lib/projects/programs";
import { WorkTasks } from "@/components/projects/work-list";

/**
 * The Master view and a program's Board, Tasks, Workload and Timeline.
 *
 * Answered by the demo engine for whoever is looking, so what is drawn is what the
 * rules say that person sees. What is proved here is the screens' own behaviour:
 * who is let in and what is not even asked for, columns by stage category with no
 * way to drag, a tile and the list it opens agreeing, and the paging and filters.
 */

let who: Who = WHO.master;
let search = new URLSearchParams();
let allowed = true;
let permissionsLoading = false;
const replace = vi.fn();
const calls = vi.hoisted(() => ({ rollup: 0, list: 0, program: 0 }));
/** What a list reports beyond the engine's answer: a page that failed, or the row cap. */
const flags = vi.hoisted(() => ({
  pageError: false,
  capped: false,
  /** A company with this many programs (each with i open tasks), instead of the engine's two. */
  programs: 0,
  /** The program ids the Master workload asked a rollup for. */
  rollupIds: [] as string[],
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  usePathname: () => "/projects/master",
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
}));
vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: vi.fn() }),
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => allowed,
  hasAnyPermission: () => allowed,
  usePermissions: () => ({
    permissions: new Set(allowed ? ["SEE_ALL_WORK"] : []),
    loading: permissionsLoading,
    can: () => allowed,
  }),
}));
vi.mock("@/lib/store/programs", async () => {
  const fixture = await import("./programs-fixture");
  const hooks = fixture.programHooks(() => who);
  return {
    ...hooks,
    useWorkRollup: (...args: unknown[]) => {
      calls.rollup += 1;
      return (hooks.useWorkRollup as (...a: unknown[]) => unknown)(...args);
    },
    useProgramList: (...args: unknown[]) => {
      calls.list += 1;
      if (flags.programs > 0) {
        return {
          status: "ready",
          error: null,
          reload: vi.fn(),
          data: {
            canCreate: true,
            seesAll: true,
            programs: Array.from({ length: flags.programs }, (_, i) => ({
              id: `pg-${i}`,
              name: `Program ${String(i).padStart(2, "0")}`,
              openTaskCount: i,
            })),
          },
        };
      }
      return (hooks.useProgramList as (...a: unknown[]) => unknown)(...args);
    },
    useProgramRollups: (ids: readonly string[]) => {
      flags.rollupIds = [...ids];
      return hooks.useProgramRollups(ids);
    },
    useProgramActions: () => fixture.fakeProgramActions(),
    useWorkList: (...args: unknown[]) => {
      const list = (hooks.useWorkList as (...a: unknown[]) => unknown)(
        ...args,
      ) as Record<string, unknown>;
      if (flags.pageError) {
        return {
          ...list,
          hasMore: true,
          error: new ApiError(503, "unavailable", "Down for a moment."),
        };
      }
      if (flags.capped) return { ...list, hasMore: false, capped: true };
      return list;
    },
  };
});
vi.mock("@/lib/store/projects", async () => {
  const fixture = await import("./programs-fixture");
  return {
    useCreateProject: () => vi.fn(),
    useProjectList: () => ({
      status: "ready",
      error: null,
      projects: fixture.scene.projects.map((d) => d.project),
      reload: vi.fn(),
    }),
    useArchivedProjects: () => ({
      status: "ready",
      error: null,
      projects: fixture.scene.projects
        .map((d) => d.project)
        .filter((p) => p.archived),
      reload: vi.fn(),
    }),
  };
});
vi.mock("@/lib/store/project-session", async () => {
  const fixture = await import("./programs-fixture");
  return {
    useProjectsGate: () => ({ enabled: true, loading: false }),
    usePeople: () => fixture.people,
    useProjectActor: () => fixture.actorOf(who),
  };
});
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: false, actingId: who.id }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/departments", () => ({
  useDepartments: () => ({ flat: [] }),
}));

const { MasterScreen } =
  await import("@/app/(app)/projects/master/master-screen");
const { ProgramScreen } =
  await import("@/app/(app)/projects/programs/[id]/program-screen");

beforeEach(() => {
  who = WHO.master;
  search = new URLSearchParams();
  allowed = true;
  permissionsLoading = false;
  replace.mockClear();
  loadMoreSpy.mockClear();
  calls.rollup = 0;
  calls.list = 0;
});

const master = () => viewerOf(WHO.master);

/* ------------------------------------------------------------- Master -- */

describe("the Master view: who is let in", () => {
  it("shows its tabs and figures to somebody who holds the grant", () => {
    render(<MasterScreen />);
    expect(
      screen.getByRole("heading", { name: "Overview" }),
    ).toBeInTheDocument();
    for (const tab of ["Overview", "Programs", "All tasks", "Workload"]) {
      expect(screen.getAllByRole("link", { name: tab }).length).toBeGreaterThan(
        0,
      );
    }
    expect(screen.getByText("By program")).toBeInTheDocument();
  });

  it("shows everybody else the calm page, and asks the API for nothing", () => {
    allowed = false;
    render(<MasterScreen />);
    expect(
      screen.getByText("This is not part of your access"),
    ).toBeInTheDocument();
    expect(screen.queryByText("By program")).not.toBeInTheDocument();
    expect(screen.queryByText("Open")).not.toBeInTheDocument();
    /* The data hooks live below the gate: none of them was even called. */
    expect(calls.rollup).toBe(0);
    expect(calls.list).toBe(0);
  });

  it("shows a skeleton, never figures, while it is still finding out", () => {
    allowed = false;
    permissionsLoading = true;
    const { container } = render(<MasterScreen />);
    expect(container.querySelector("[aria-busy='true']")).not.toBeNull();
    expect(screen.queryByText("By program")).not.toBeInTheDocument();
    expect(calls.rollup).toBe(0);
  });
});

describe("the Master overview", () => {
  it("has a tile for each program with its open, overdue and done this week, and the Unassigned bucket", () => {
    render(<MasterScreen />);
    const rollup = workRollup(scene, master(), NOW);
    for (const program of rollup.programs) {
      const tile = screen.getByRole("link", { name: new RegExp(program.name) });
      expect(tile).toHaveAttribute("href", `/projects/programs/${program.id}`);
      expect(tile).toHaveTextContent(String(program.open));
    }
    expect(screen.getByRole("link", { name: /Unassigned/ })).toHaveAttribute(
      "href",
      "/projects/programs/unassigned",
    );
  });

  it("totals the whole company, and each tile opens the list it counts", () => {
    render(<MasterScreen />);
    const totals = workRollup(scene, master(), NOW).totals;
    const overdue = screen
      .getAllByText("Overdue")
      .map((el) => el.closest("a"))
      .find((a) => a?.getAttribute("href")?.includes("bucket=overdue"))!;
    expect(overdue).toHaveAttribute(
      "href",
      "/projects/master?view=tasks&bucket=overdue",
    );
    expect(overdue).toHaveTextContent(String(totals.overdue));
  });
});

describe("All tasks", () => {
  beforeEach(() => {
    search = new URLSearchParams("view=tasks");
  });

  it("lists tasks with the columns the plan names, and the server's count", () => {
    render(<MasterScreen />);
    const table = screen.getByRole("table", { name: "Tasks" });
    for (const column of [
      "Task",
      "Project",
      "Program",
      "Stage",
      "Assignees",
      "Due",
    ]) {
      expect(
        within(table).getByRole("columnheader", { name: column }),
      ).toBeInTheDocument();
    }
    const total = workPage(scene, master(), { limit: 200 }).total;
    expect(document.body).toHaveTextContent(new RegExp(`\\b${total} tasks`));
  });

  it("names a task's own stage and the project it is in", () => {
    render(<MasterScreen />);
    const row = screen
      .getByText("Newsletter, week 46")
      .closest("[role=row]")! as HTMLElement;
    expect(within(row).getByText("Drafting")).toBeInTheDocument();
    expect(within(row).getByText("Content calendar")).toBeInTheDocument();
    expect(within(row).getByText("Operations")).toBeInTheDocument();
  });

  it("opens a task in its project, with a way back to this list", () => {
    render(<MasterScreen />);
    const link = screen.getByText("Newsletter, week 46").closest("a")!;
    expect(link).toHaveAttribute(
      "href",
      "/projects/pj-cnt?issue=CNT-4&from=work",
    );
  });

  it("narrows by what the address says, and says which filters are on", () => {
    search = new URLSearchParams("view=tasks&stage=DONE&program=pg-ops");
    render(<MasterScreen />);
    const done = workPage(scene, master(), {
      programId: "pg-ops",
      category: ["DONE"],
      limit: 200,
    });
    expect(document.body).toHaveTextContent(
      new RegExp(`\\b${done.total} tasks\\b`),
    );
    expect(screen.getByText("Newsletter, week 45")).toBeInTheDocument();
    expect(screen.queryByText("Newsletter, week 46")).not.toBeInTheDocument();
  });

  it("agrees with the tile it was opened from", () => {
    search = new URLSearchParams("view=tasks&bucket=overdue");
    render(<MasterScreen />);
    const overdue = workRollup(scene, master(), NOW).totals.overdue;
    expect(document.body).toHaveTextContent(
      new RegExp(`\\b${overdue} tasks\\b`),
    );
  });

  it("writes a filter into the address when one is chosen", async () => {
    render(<MasterScreen />);
    await userEvent.click(screen.getByRole("button", { name: /filters/i }));
    await userEvent.selectOptions(screen.getByLabelText("Stage"), "cat:DONE");
    expect(replace).toHaveBeenCalledWith(
      "/projects/master?view=tasks&stage=DONE",
      {
        scroll: false,
      },
    );
  });

  it("offers the projects' own stages by name, and writes the one chosen", async () => {
    render(<MasterScreen />);
    await userEvent.click(screen.getByRole("button", { name: /filters/i }));
    const select = screen.getByLabelText("Stage") as HTMLSelectElement;
    const named = [...select.options].filter((o) =>
      o.value.startsWith("name:"),
    );
    expect(named.length).toBeGreaterThan(0);
    /* Once each, whatever the case each project spells it in. */
    const lower = named.map((o) => o.text.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
    const pick = named[0]!;
    await userEvent.selectOptions(select, pick.value);
    expect(replace).toHaveBeenCalledWith(
      `/projects/master?${new URLSearchParams({
        view: "tasks",
        stageName: pick.text,
      }).toString()}`,
      { scroll: false },
    );
  });

  it("asks for the next page when there is one", async () => {
    render(<MasterScreen />);
    /* The demo holds more tasks than one page of 50, so there is more to load,
       and pressing it asks for it. */
    const total = workPage(scene, master(), { limit: 200 }).total;
    expect(total).toBeGreaterThan(50);
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(loadMoreSpy).toHaveBeenCalledTimes(1);
  });

  it("says plainly when nothing matches, and offers to clear", () => {
    search = new URLSearchParams("view=tasks&q=zzzz-not-a-task");
    render(<MasterScreen />);
    expect(
      screen.getByText("No tasks match these filters"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();
  });
});

describe("the Archive's tasks", () => {
  beforeEach(() => {
    search = new URLSearchParams();
  });

  it("asks for the Archive, says why in place of Due, and offers the reasons", async () => {
    render(<WorkTasks showProgram archive />);
    await userEvent.click(screen.getByRole("button", { name: /filters/i }));
    const why = screen.getByLabelText("Why");
    expect(
      within(why)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Any reason",
      "Project archived",
      "Program archived",
      "Finished over 14 days ago",
    ]);
    expect(screen.queryByLabelText("Due")).toBeNull();
    const expected = workPage(scene, master(), { archive: true, limit: 200 });
    if (expected.total === 0) {
      expect(screen.getByText("Nothing archived yet")).toBeInTheDocument();
    } else {
      const table = screen.getByRole("table", { name: "Tasks" });
      expect(
        within(table).getByRole("columnheader", { name: "Why" }),
      ).toBeInTheDocument();
    }
  });

  it("writes the reason chosen into the address", async () => {
    render(<WorkTasks showProgram archive />);
    await userEvent.click(screen.getByRole("button", { name: /filters/i }));
    await userEvent.selectOptions(screen.getByLabelText("Why"), "done");
    expect(replace).toHaveBeenLastCalledWith("/projects/master?why=done", {
      scroll: false,
    });
  });
});

describe("the Master workload", () => {
  it("reads at most twenty programs' rollups, the busiest first", () => {
    flags.programs = 25;
    try {
      search = new URLSearchParams("view=workload");
      render(<MasterScreen />);
      expect(flags.rollupIds).toHaveLength(20);
      /* The busiest first: Program 24 has the most open tasks, Program 05 the least read. */
      expect(flags.rollupIds[0]).toBe("pg-24");
      expect(flags.rollupIds).not.toContain("pg-04");
    } finally {
      flags.programs = 0;
    }
  });

  it("merges each program's busiest people and says what that leaves out", () => {
    search = new URLSearchParams("view=workload");
    render(<MasterScreen />);
    expect(
      screen.getByText("Workload", { selector: "h3, h2, div" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ten busiest people/)).toBeInTheDocument();
    const link = screen.getAllByRole("link", { name: "Ngozi Eze" })[0]!;
    expect(link).toHaveAttribute(
      "href",
      "/projects/master?view=tasks&assignee=p-04",
    );
  });
});

/* ------------------------------------------------------- program tabs -- */

describe("a program's Board", () => {
  beforeEach(() => {
    who = WHO.lead;
    search = new URLSearchParams("view=board");
  });

  it("groups tasks by stage category, with the server's count on each column", () => {
    render(<ProgramScreen id="pg-ops" />);
    const v = viewerOf(WHO.lead);
    for (const [label, category] of [
      ["Not started", "TODO"],
      ["In progress", "IN_PROGRESS"],
      ["Done", "DONE"],
    ] as const) {
      const column = screen.getByRole("region", { name: label });
      const total = workPage(scene, v, {
        programId: "pg-ops",
        category: [category],
        limit: 200,
      }).total;
      expect(within(column).getByRole("heading")).toHaveTextContent(
        `${total} task`,
      );
    }
  });

  it("shows each card's project, its own stage name and who is on it", () => {
    render(<ProgramScreen id="pg-ops" />);
    const column = screen.getByRole("region", { name: "In progress" });
    const card = within(column)
      .getByText("Newsletter, week 46")
      .closest("article")!;
    expect(within(card).getByText("CNT")).toBeInTheDocument();
    expect(within(card).getByText("Drafting")).toBeInTheDocument();
    expect(within(card).getByText("Ngozi Eze")).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: /Open in project/ }),
    ).toHaveAttribute("href", "/projects/pj-cnt");
  });

  it("says when a column's next page did not arrive, and offers to try again", async () => {
    flags.pageError = true;
    try {
      render(<ProgramScreen id="pg-ops" />);
      const column = screen.getByRole("region", { name: "Not started" });
      expect(within(column).getByRole("alert")).toHaveTextContent(/next tasks/);
      expect(
        within(column).getByRole("button", { name: "Try again" }),
      ).toBeInTheDocument();
      /* How many are shown is read out as it changes. */
      const readout = column.querySelector('[aria-live="polite"]');
      expect(readout).not.toBeNull();
      expect(readout).toHaveTextContent(/shown|Showing/);
    } finally {
      flags.pageError = false;
    }
  });

  it("says a column stopped at the most rows it shows, and points at the filters", () => {
    flags.capped = true;
    try {
      render(<ProgramScreen id="pg-ops" />);
      const note = within(
        screen.getByRole("region", { name: "Not started" }),
      ).getByRole("note");
      expect(note).toHaveTextContent(/as many as this list shows/);
      expect(note).toHaveTextContent(/filters/);
    } finally {
      flags.capped = false;
    }
  });

  it("is read-only: nothing on it can be dragged or moved", () => {
    const { container } = render(<ProgramScreen id="pg-ops" />);
    expect(container.querySelectorAll("[draggable=true]").length).toBe(0);
    expect(
      screen.queryByRole("button", { name: /^Move / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Move to/ }),
    ).not.toBeInTheDocument();
  });

  it("makes the whole card a 40px-or-more target for opening the task, on a phone too", () => {
    render(<ProgramScreen id="pg-ops" />);
    const link = screen.getByText("Newsletter, week 46").closest("a")!;
    /* The title link is stretched over its card (a link on its own line is about 20px
       tall), and "Open in project" sits above that stretch with its own 40px height. */
    expect(link.className).toContain("after:inset-0");
    expect(link.closest("article")!.className).toContain("relative");
    const secondary = within(link.closest("article")!).getByRole("link", {
      name: /Open in project/,
    });
    expect(secondary.className).toContain("min-h-10");
    expect(secondary.className).toContain("z-10");
  });

  it("opens a task in its project to change its stage there", () => {
    render(<ProgramScreen id="pg-ops" />);
    const link = screen.getByText("Newsletter, week 46").closest("a")!;
    expect(link).toHaveAttribute(
      "href",
      "/projects/pj-cnt?issue=CNT-4&from=work",
    );
  });

  it("shows a project-only member the cards of their project and no others", () => {
    who = WHO.projectOnly;
    render(<ProgramScreen id="pg-ops" />);
    expect(
      screen.queryByText("Collect signed offer letters"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Newsletter, week 46")).toBeInTheDocument();
  });
});

describe("a program's Tasks", () => {
  beforeEach(() => {
    who = WHO.lead;
    search = new URLSearchParams("view=tasks");
  });

  it("is the same list scoped to the program, with no Program column", () => {
    render(<ProgramScreen id="pg-ops" />);
    const table = screen.getByRole("table", { name: "Tasks" });
    expect(
      within(table).queryByRole("columnheader", { name: "Program" }),
    ).toBeNull();
    expect(
      within(table).getByRole("columnheader", { name: "Project" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Payments API v2")).not.toBeInTheDocument();
  });

  it("opens from a tile with the bucket in the address, and the counts agree", () => {
    search = new URLSearchParams("view=tasks&bucket=dueThisWeek");
    render(<ProgramScreen id="pg-ops" />);
    const total = workPage(scene, viewerOf(WHO.lead), {
      programId: "pg-ops",
      bucket: "dueThisWeek",
      limit: 200,
    }).total;
    expect(document.body).toHaveTextContent(new RegExp(`\\b${total} tasks`));
  });
});

describe("a program's Workload", () => {
  it("lists people with open and overdue, and each name opens that person's tasks", () => {
    who = WHO.lead;
    search = new URLSearchParams("view=workload");
    render(<ProgramScreen id="pg-ops" />);
    const link = screen.getAllByRole("link", { name: "Ngozi Eze" })[0]!;
    expect(link).toHaveAttribute(
      "href",
      "/projects/programs/pg-ops?view=tasks&assignee=p-04",
    );
  });
});

describe("a program's Timeline", () => {
  beforeEach(() => {
    who = WHO.master;
    search = new URLSearchParams("view=timeline");
  });

  it("puts each dated initiative on its due day, in its project's lane", () => {
    render(<ProgramScreen id="pg-tech" />);
    expect(
      screen.getByRole("group", { name: "Initiatives by due date" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Checkout Revamp")).toBeInTheDocument();
    expect(screen.getByText(/Payments API v2/)).toBeInTheDocument();
  });

  it("lists an initiative with no date under Needs dates, rather than leaving it out", () => {
    render(<ProgramScreen id="pg-tech" />);
    const strip = screen
      .getByRole("heading", { name: "Needs dates" })
      .closest("section")!;
    expect(within(strip).getByText("Saved cards")).toBeInTheDocument();
  });

  it("says so when a program has no initiatives", () => {
    render(<ProgramScreen id="pg-ops" />);
    expect(
      screen.getByText("No initiatives in this program yet"),
    ).toBeInTheDocument();
  });
});

void people;
void TODAY;
void fakeProgramActions;
void programHooks;
void visibleProjects;
