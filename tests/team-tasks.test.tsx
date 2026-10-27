import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NAV, NOTHING_ANSWERED_YET, visibleNav } from "@/components/portal/nav";
import {
  toLeaderRead,
  type TeamPerson,
  type TeamTask,
} from "@/lib/api/projects";
import { people } from "./projects-fixture";

/**
 * Team tasks: a row per person with their load, the filters, giving a task, moving
 * a personal one, and what opening a task does.
 *
 * The API client is stubbed, so each test says what the API would answer. What is
 * proved is the screen's own handling: overdue-first order, rows with overdue work
 * open on arrival, the strip's text equivalent, the toasts, and which viewer a
 * task opens (the personal drawer, the board, or the read-only one for a leader
 * who is not on the project).
 */

const teamTasks = vi.fn();
const giveTask = vi.fn();
const moveTask = vi.fn();
const leaderRead = vi.fn();
const pushToast = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/team",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: pushToast }),
}));

vi.mock("@/lib/api/projects", async (original) => {
  const real = await original<typeof import("@/lib/api/projects")>();
  return {
    ...real,
    projectsApi: {
      ...real.projectsApi,
      teamTasks: (...a: unknown[]) => teamTasks(...a),
      giveTask: (...a: unknown[]) => giveTask(...a),
      moveTask: (...a: unknown[]) => moveTask(...a),
      leaderRead: (...a: unknown[]) => leaderRead(...a),
      links: vi.fn().mockResolvedValue([]),
    },
  };
});

vi.mock("@/components/projects/personal-issue-drawer", () => ({
  PersonalIssueDrawer: ({ issueId }: { issueId: string | null }) =>
    issueId ? <div role="dialog" aria-label={`Personal ${issueId}`} /> : null,
}));

let gate = { enabled: true, loading: false };
vi.mock("@/lib/store/project-session", () => ({
  useProjectsGate: () => gate,
  usePeople: () => people,
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));

const { TeamTasksScreen } =
  await import("@/app/(app)/projects/team/team-tasks-screen");

let n = 0;
const task = (over: Partial<TeamTask> = {}): TeamTask => {
  n += 1;
  return {
    id: `t-${n}`,
    key: `PAYV-${n}`,
    title: `Task ${n}`,
    projectId: "proj-1",
    projectName: "Payroll v2",
    personal: false,
    statusName: "To do",
    statusCategory: "TODO",
    dueDate: "2026-10-30",
    overdue: false,
    labels: [],
    ...over,
  };
};

const person = (
  id: string,
  name: string,
  counts: Partial<TeamPerson["counts"]>,
  tasks: TeamTask[],
): TeamPerson => ({
  employee: { id, name, jobTitle: "Engineer" },
  counts: {
    open: 0,
    overdue: 0,
    dueThisWeek: 0,
    laterOrNoDate: 0,
    doneThisWeek: 0,
    ...counts,
  },
  tasks,
});

const ada = () =>
  person(
    "e-ada",
    "Ada Okafor",
    { open: 6, overdue: 2, dueThisWeek: 3, laterOrNoDate: 1, doneThisWeek: 4 },
    [
      task({ key: "PAYV-12", title: "Payslip download", overdue: true }),
      task({
        key: "MY-4",
        title: "Draft the hiring plan",
        personal: true,
        projectId: null,
        projectName: "Personal",
      }),
    ],
  );
const bola = () =>
  person("e-bola", "Bola Ade", { open: 4, dueThisWeek: 1, laterOrNoDate: 3 }, [
    task({ key: "PAYV-30", title: "Design the slip" }),
  ]);

beforeEach(() => {
  vi.clearAllMocks();
  gate = { enabled: true, loading: false };
  teamTasks.mockResolvedValue([ada(), bola()]);
  giveTask.mockResolvedValue({});
  moveTask.mockResolvedValue({});
});

describe("team tasks", () => {
  it("shows a row per person with job title and counts", async () => {
    render(<TeamTasksScreen />);
    const adaRow = (await screen.findByText("Ada Okafor")).closest(
      "[data-person-row]",
    ) as HTMLElement;
    expect(within(adaRow).getByText("Engineer")).toBeInTheDocument();
    expect(within(adaRow).getByText("2 overdue")).toBeInTheDocument();
    expect(within(adaRow).getByText("3 this week")).toBeInTheDocument();
    expect(within(adaRow).getByText("6 open")).toBeInTheDocument();
    expect(within(adaRow).getByText("4 done this week")).toBeInTheDocument();
  });

  it("gives the load strip a text equivalent", async () => {
    render(<TeamTasksScreen />);
    expect(
      await screen.findByRole("img", {
        name: "Ada Okafor: 2 overdue, 3 due this week, 6 open",
      }),
    ).toBeInTheDocument();
  });

  it("puts the most overdue first, then by name", async () => {
    teamTasks.mockResolvedValue([
      bola(),
      person("e-cy", "Cy Eze", { open: 1 }, []),
      ada(),
    ]);
    render(<TeamTasksScreen />);
    await screen.findByText("Ada Okafor");
    const names = Array.from(
      document.querySelectorAll("[data-person-row]"),
    ).map(
      (row) =>
        within(row as HTMLElement).getAllByRole("button")[0]!.textContent,
    );
    expect(names[0]).toContain("Ada Okafor");
    expect(names[1]).toContain("Bola Ade");
    expect(names[2]).toContain("Cy Eze");
  });

  it("opens rows with overdue work and keeps the rest closed", async () => {
    render(<TeamTasksScreen />);
    expect(await screen.findByText("Payslip download")).toBeInTheDocument();
    expect(screen.queryByText("Design the slip")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Bola Ade/ }));
    expect(screen.getByText("Design the slip")).toBeInTheDocument();
  });

  it("stacks a row on a phone", async () => {
    render(<TeamTasksScreen />);
    const row = (await screen.findByText("Ada Okafor")).closest(
      "[data-person-row]",
    ) as HTMLElement;
    const head = row.firstElementChild as HTMLElement;
    expect(head.className).toContain("flex-col");
    expect(head.className).toContain("sm:flex-row");
  });

  it("asks for the chosen filter and says when it is empty", async () => {
    render(<TeamTasksScreen />);
    await screen.findByText("Ada Okafor");
    teamTasks.mockResolvedValue([
      person("e-ada", "Ada Okafor", { open: 2 }, []),
    ]);
    await userEvent.click(screen.getByRole("radio", { name: "Overdue" }));
    await waitFor(() =>
      expect(teamTasks).toHaveBeenLastCalledWith("overdue", expect.anything()),
    );
    expect(
      await screen.findByText("Nothing overdue in your team."),
    ).toBeInTheDocument();
  });

  it("says so when nobody reports to you", async () => {
    teamTasks.mockResolvedValue([]);
    render(<TeamTasksScreen />);
    expect(
      await screen.findByText("Nobody reports to you yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("When someone does, their tasks show here."),
    ).toBeInTheDocument();
  });

  it("gives a task and says who got it", async () => {
    render(<TeamTasksScreen />);
    const adaRow = (await screen.findByText("Ada Okafor")).closest(
      "[data-person-row]",
    ) as HTMLElement;
    await userEvent.click(
      within(adaRow).getByRole("button", { name: "Give a task" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Give a task to Ada Okafor",
    });
    await userEvent.type(
      within(dialog).getByLabelText("Task title"),
      "Review the slip",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Give task" }),
    );
    await waitFor(() =>
      expect(giveTask).toHaveBeenCalledWith({
        employeeId: "e-ada",
        title: "Review the slip",
      }),
    );
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Task given to Ada Okafor" }),
    );
  });

  it("moves a personal task to somebody else and says so", async () => {
    render(<TeamTasksScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Move to…" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Move to…" });
    const select = within(dialog).getByLabelText("Move to");
    expect(
      within(select).queryByRole("option", { name: "Ada Okafor" }),
    ).not.toBeInTheDocument();
    await userEvent.selectOptions(select, "e-bola");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Move task" }),
    );
    await waitFor(() =>
      expect(moveTask).toHaveBeenCalledWith(expect.any(String), "e-bola"),
    );
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Moved to Bola Ade" }),
    );
  });

  it("offers Move to… on personal tasks only", async () => {
    render(<TeamTasksScreen />);
    await screen.findByText("Payslip download");
    expect(screen.getAllByRole("button", { name: "Move to…" })).toHaveLength(1);
  });

  it("opens a personal task in the personal drawer", async () => {
    render(<TeamTasksScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Open MY-4/ }),
    );
    expect(
      await screen.findByRole("dialog", { name: /Personal/ }),
    ).toBeInTheDocument();
    expect(leaderRead).not.toHaveBeenCalled();
  });

  it("opens a board task the leader can read in full on its board", async () => {
    leaderRead.mockResolvedValue({ reduced: false });
    render(<TeamTasksScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Open PAYV-12/ }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/projects/proj-1?issue=PAYV-12"),
    );
  });

  it("opens a reduced board task read-only, with why", async () => {
    leaderRead.mockResolvedValue({
      reduced: true,
      projectName: "Payroll v2",
      statusName: "To do",
      statusCategory: "TODO",
      subtasks: [
        {
          id: "s1",
          key: "PAYV-13",
          title: "Write the query",
          statusCategory: "TODO",
        },
      ],
      issue: {
        id: "i1",
        key: "PAYV-12",
        title: "Payslip download",
        labels: ["finance"],
        startDate: null,
        dueDate: "2026-10-20",
      },
    });
    render(<TeamTasksScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Open PAYV-12/ }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Payslip download",
    });
    expect(
      within(dialog).getByText(
        "You can see this because Ada Okafor is in your team.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Write the query")).toBeInTheDocument();
    expect(within(dialog).getByText("finance")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("fix round 1", () => {
  it("does not keep the last filter's rows when the new filter fails to load", async () => {
    render(<TeamTasksScreen />);
    await screen.findByText("Ada Okafor");
    teamTasks.mockRejectedValue(new Error("down"));
    await userEvent.click(screen.getByRole("radio", { name: "Overdue" }));
    expect(
      await screen.findByText("Team tasks did not load"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Ada Okafor")).not.toBeInTheDocument();
  });

  it("shows loading, not the old people, while another filter loads", async () => {
    render(<TeamTasksScreen />);
    await screen.findByText("Ada Okafor");
    teamTasks.mockReturnValue(new Promise(() => {}));
    await userEvent.click(screen.getByRole("radio", { name: "Overdue" }));
    expect(screen.getByText("Loading team tasks")).toBeInTheDocument();
    expect(screen.queryByText("Ada Okafor")).not.toBeInTheDocument();
  });

  it("says nothing is due this week", async () => {
    render(<TeamTasksScreen />);
    await screen.findByText("Ada Okafor");
    teamTasks.mockResolvedValue([
      person("e-ada", "Ada Okafor", { open: 2 }, []),
    ]);
    await userEvent.click(screen.getByRole("radio", { name: "Due this week" }));
    expect(
      await screen.findByText("Nothing due this week in your team."),
    ).toBeInTheDocument();
  });

  it("does not carry a cancelled draft to the next person", async () => {
    render(<TeamTasksScreen />);
    await screen.findByText("Ada Okafor");
    const giveFor = (name: string) =>
      within(
        screen.getByText(name).closest("[data-person-row]") as HTMLElement,
      ).getByRole("button", { name: "Give a task" });
    await userEvent.click(giveFor("Ada Okafor"));
    let dialog = await screen.findByRole("dialog", { name: /Give a task/ });
    await userEvent.type(
      within(dialog).getByLabelText("Task title"),
      "Old draft",
    );
    await userEvent.type(
      within(dialog).getByLabelText("Description"),
      "Old notes",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    await userEvent.click(giveFor("Bola Ade"));
    dialog = await screen.findByRole("dialog", {
      name: "Give a task to Bola Ade",
    });
    expect(within(dialog).getByLabelText("Task title")).toHaveValue("");
    expect(within(dialog).getByLabelText("Description")).toHaveValue("");
  });

  it("submits the give dialog with Enter", async () => {
    render(<TeamTasksScreen />);
    await screen.findByText("Ada Okafor");
    await userEvent.click(
      screen.getAllByRole("button", { name: "Give a task" })[0]!,
    );
    const dialog = await screen.findByRole("dialog", { name: /Give a task/ });
    await userEvent.type(
      within(dialog).getByLabelText("Task title"),
      "Quick one{Enter}",
    );
    await waitFor(() => expect(giveTask).toHaveBeenCalledTimes(1));
  });

  it("does not keep a stale target in the move dialog", async () => {
    render(<TeamTasksScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Move to…" }),
    );
    let dialog = await screen.findByRole("dialog", { name: "Move to…" });
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Move to"),
      "e-bola",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Move to…" }));
    dialog = await screen.findByRole("dialog", { name: "Move to…" });
    expect(within(dialog).getByLabelText("Move to")).toHaveValue("");
    expect(
      within(dialog).getByRole("button", { name: "Move task" }),
    ).toBeDisabled();
  });

  it("says so when a board task cannot be read", async () => {
    leaderRead.mockRejectedValue(new Error("nope"));
    render(<TeamTasksScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Open PAYV-12/ }),
    );
    await waitFor(() =>
      expect(pushToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Could not open that task" }),
      ),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("says so when a board task has no project to open in", async () => {
    teamTasks.mockResolvedValue([
      person("e-ada", "Ada Okafor", { open: 1, overdue: 1 }, [
        task({ key: "X-1", title: "Orphan", projectId: null, overdue: true }),
      ]),
    ]);
    leaderRead.mockResolvedValue({ reduced: false });
    render(<TeamTasksScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Open X-1/ }),
    );
    await waitFor(() =>
      expect(pushToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Could not open that task" }),
      ),
    );
  });

  it("opens a reduced task with no description, comments, watchers or files", async () => {
    leaderRead.mockResolvedValue({
      reduced: true,
      projectName: "Payroll v2",
      statusName: "To do",
      statusCategory: "TODO",
      subtasks: [],
      issue: {
        id: "i1",
        key: "PAYV-12",
        title: "Payslip download",
        labels: [],
        startDate: null,
        dueDate: null,
      },
    });
    render(<TeamTasksScreen />);
    await userEvent.click(
      await screen.findByRole("button", { name: /Open PAYV-12/ }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Payslip download",
    });
    for (const word of [
      /description/i,
      /comment/i,
      /watch/i,
      /files?\b/i,
      /attach/i,
    ]) {
      expect(within(dialog).queryByText(word)).not.toBeInTheDocument();
    }
  });
});

describe("toLeaderRead", () => {
  it("keeps none of what a reduced reader may not see", () => {
    const read = toLeaderRead({
      reduced: true,
      id: "i1",
      key: "PAYV-12",
      title: "Payslip download",
      description: "SECRET description",
      comments: [{ body: "SECRET comment" }],
      attachments: [{ name: "SECRET.pdf" }],
      watchers: [{ id: "w" }],
      projectName: "Payroll v2",
      statusName: "To do",
      statusCategory: "TODO",
      subtasks: [],
    });
    expect(read.reduced).toBe(true);
    expect(JSON.stringify(read)).not.toMatch(/SECRET/);
  });

  it("reads a full payload as not reduced, carrying nothing", () => {
    expect(toLeaderRead({ id: "i1", description: "SECRET" })).toEqual({
      reduced: false,
    });
  });
});

describe("the Team tasks nav row", () => {
  const labels = (teamTasksFact: boolean) =>
    visibleNav(
      NAV,
      new Set(),
      { projects: true },
      {
        ...NOTHING_ANSWERED_YET,
        rows: { ...NOTHING_ANSWERED_YET.rows, "team-tasks": teamTasksFact },
      },
    ).flatMap((g) => g.items.map((i) => i.label));

  it("shows only for somebody who leads people", () => {
    expect(labels(true)).toContain("Team tasks");
    expect(labels(false)).not.toContain("Team tasks");
  });

  it("is hidden until the shell has asked", () => {
    expect(
      visibleNav(
        NAV,
        new Set(),
        { projects: true },
        NOTHING_ANSWERED_YET,
      ).flatMap((g) => g.items.map((i) => i.label)),
    ).not.toContain("Team tasks");
  });
});
