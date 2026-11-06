import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiGoal } from "@/lib/api/performance";
import type {
  Completion,
  TeamCompletedPerson,
} from "@/lib/projects/completions";
import type { TeamCompletedList } from "@/lib/store/completions";
import { UNLINKED } from "@/lib/projects/types";
import { closedLink, linkedTo } from "./support/objective-fixtures";

/**
 * The manager's Completed view on Team tasks.
 *
 * What is proved: it lists the finished tasks of the people the viewer leads, by
 * person, with the project, the day and on time or late as plain facts; it has no
 * grade button, word or control anywhere; it steps by period; it draws nothing
 * until its read has answered; it loads a page at a time; and a task can be
 * linked to an objective from a person's list, with the result in one line and a
 * plain reason for any task that did not change.
 */

const hook = vi.hoisted(() => ({
  list: null as unknown,
  args: [] as unknown[][],
  reload: vi.fn(),
  loadMore: vi.fn(),
  run: vi.fn(),
}));

vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: true }),
}));
vi.mock("@/lib/store/completions", () => ({
  useTeamCompleted: (...args: unknown[]) => {
    hook.args.push(args);
    return hook.list;
  },
  useBulkLink: () => hook.run,
}));

const goals: ApiGoal[] = [
  {
    id: "g1",
    title: "Grow revenue",
    ownerId: null,
    level: "company",
    keyResults: [],
    status: "ON_TRACK",
  },
  {
    id: "g2",
    title: "Bola delivers payroll",
    ownerId: "bola",
    ownerName: "Bola Projects",
    level: "personal",
    status: "ON_TRACK",
    keyResults: [{ id: "kr1", label: "Cut run time" }],
  },
] as unknown as ApiGoal[];

const kpiCalls = vi.hoisted(() => [] as unknown[][]);
vi.mock("@/lib/store/performance", () => ({
  useKpis: (...args: unknown[]) => {
    kpiCalls.push(args);
    return {
      goals,
      cascade: [],
      loading: false,
      error: null,
      source: "api",
      reload: vi.fn(),
    };
  },
}));

const { CompletedTeam } =
  await import("@/app/(app)/projects/team/completed-view");

const item = (over: Partial<Completion> = {}): Completion => ({
  id: "i1",
  key: "PRF-1",
  title: "Run the October payroll",
  projectId: "p1",
  projectName: "Payroll v2",
  personal: false,
  personId: "bola",
  personName: "Bola Projects",
  doneAt: "2026-11-03T10:00:00.000Z",
  doneDay: "2026-11-03",
  dueDate: "2026-11-03",
  onTime: true,
  objective: UNLINKED,
  canOpen: true,
  ...over,
});

const person = (
  over: Partial<TeamCompletedPerson> = {},
): TeamCompletedPerson => ({
  employee: {
    id: "bola",
    name: "Bola Projects",
    jobTitle: "Analyst",
    departmentName: "Engineering",
  },
  summary: { finished: 3, withDueDate: 2, onTime: 1, late: 1, linked: 1 },
  items: [
    item(),
    item({
      id: "i2",
      key: "PRF-2",
      title: "Close the books",
      onTime: false,
      objective: linkedTo("Grow revenue"),
    }),
    item({
      id: "i3",
      key: "PRF-3",
      title: "Tidy the board",
      dueDate: null,
      onTime: null,
    }),
  ],
  itemsTotal: 3,
  ...over,
});

const listOf = (over: Partial<TeamCompletedList> = {}): TeamCompletedList => ({
  people: [person()],
  total: 3,
  shown: 3,
  loading: false,
  error: null,
  hasMore: false,
  loadingMore: false,
  moreError: null,
  loadMore: hook.loadMore,
  reload: hook.reload,
  ...over,
});

beforeEach(() => {
  hook.list = listOf();
  hook.args = [];
  hook.reload.mockClear();
  hook.loadMore.mockClear();
  hook.run.mockReset();
});

describe("what it lists", () => {
  it("names each person, what they finished, and the facts of each task", () => {
    render(<CompletedTeam />);
    expect(screen.getByText("Bola Projects")).toBeInTheDocument();
    expect(screen.getByText("Analyst")).toBeInTheDocument();
    expect(
      screen.getByText(
        "3 finished · 1 on time, 1 late · 1 linked to an objective",
      ),
    ).toBeInTheDocument();
    const row = screen.getByText("Run the October payroll").closest("li")!;
    expect(within(row).getByText("Payroll v2")).toBeInTheDocument();
    expect(within(row).getByText("Finished 3 Nov 2026")).toBeInTheDocument();
    expect(within(row).getByText("On time")).toBeInTheDocument();
    expect(
      within(screen.getByText("Close the books").closest("li")!).getByText(
        "Late",
      ),
    ).toBeInTheDocument();
  });

  it("says a linked task's objective in the server's words, and nothing for the rest", () => {
    render(<CompletedTeam />);
    expect(screen.getByText("Linked to Grow revenue")).toBeInTheDocument();
    const unlinked = screen.getByText("Run the October payroll").closest("li")!;
    expect(within(unlinked).queryByText(/Linked/)).toBeNull();
  });

  it("says a closed objective is closed, in plain text", () => {
    hook.list = listOf({
      people: [person({ items: [item({ objective: closedLink("Old") })] })],
    });
    render(<CompletedTeam />);
    expect(screen.getByText("Linked objective is closed")).toBeInTheDocument();
  });

  it("says nothing about on time for a task that had no due date", () => {
    render(<CompletedTeam />);
    const row = screen.getByText("Tidy the board").closest("li")!;
    expect(within(row).queryByText(/on time|late/i)).toBeNull();
  });

  it("has no grade anywhere: no button, no word, no control that marks a task", () => {
    render(<CompletedTeam />);
    expect(document.body.textContent).not.toMatch(
      /grade|graded|mark as|waiting|not completed|partly|reject|score|rating/i,
    );
    const buttons = screen
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");
    for (const text of buttons) {
      expect(text).not.toMatch(/grade|done|complete|reject|mark/i);
    }
    expect(document.querySelector("[class*=danger]")).toBeNull();
  });

  it("opens a task in its project, and names one the reader may not open without a link", () => {
    hook.list = listOf({
      people: [
        person({
          items: [
            item(),
            item({
              id: "i9",
              key: "OPS-9",
              title: "Hidden board",
              canOpen: false,
            }),
          ],
        }),
      ],
    });
    render(<CompletedTeam />);
    expect(screen.getByRole("link", { name: "PRF-1" })).toHaveAttribute(
      "href",
      "/projects/p1?issue=PRF-1",
    );
    expect(screen.queryByRole("link", { name: "OPS-9" })).toBeNull();
    expect(screen.getByText("OPS-9")).toBeInTheDocument();
  });

  it("is open for a few people and closed for many, and opens on press", async () => {
    hook.list = listOf({
      people: Array.from({ length: 4 }, (_, n) =>
        person({
          employee: {
            id: `p${n}`,
            name: `Person ${n}`,
            jobTitle: "",
            departmentName: null,
          },
          items: [
            item({
              id: `x${n}`,
              key: `K-${n}`,
              title: `Task ${n}`,
              personId: `p${n}`,
            }),
          ],
        }),
      ),
    });
    render(<CompletedTeam />);
    expect(screen.queryByText("Task 0")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Person 0/ }));
    expect(screen.getByText("Task 0")).toBeInTheDocument();
  });
});

describe("the period", () => {
  it("opens on this week and steps back and forward by whole periods", async () => {
    render(<CompletedTeam />);
    expect(hook.args.at(-1)![0]).toBe("week");
    const thisWeek = String(hook.args.at(-1)![1]);
    await userEvent.click(
      screen.getByRole("button", { name: "Previous period" }),
    );
    expect(hook.args.at(-1)![0]).toBe("week");
    const before = String(hook.args.at(-1)![1]);
    expect(before < thisWeek).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Next period" }));
    expect(String(hook.args.at(-1)![1]) > before).toBe(true);
  });

  it("asks for the month or the quarter when chosen, and starts again at today", async () => {
    render(<CompletedTeam />);
    await userEvent.click(screen.getByRole("radio", { name: "Month" }));
    expect(hook.args.at(-1)![0]).toBe("month");
    await userEvent.click(screen.getByRole("radio", { name: "Quarter" }));
    expect(hook.args.at(-1)![0]).toBe("quarter");
  });
});

describe("before the read has answered", () => {
  it("draws no names and no counts while loading", () => {
    hook.list = listOf({ people: [], loading: true, total: null, shown: 0 });
    render(<CompletedTeam />);
    expect(screen.queryByText("Bola Projects")).toBeNull();
    expect(screen.queryByText(/Nobody you lead/)).toBeNull();
    expect(screen.queryByText(/finished/)).toBeNull();
  });

  it("says the failure and nothing else when the read failed", () => {
    hook.list = listOf({
      people: [],
      error: new ApiError(500, "boom", "Server broke."),
    });
    render(<CompletedTeam />);
    expect(
      screen.getByRole("button", { name: /try again|retry/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nobody you lead/)).toBeNull();
  });

  it("says plainly that nobody finished anything, once it knows", () => {
    hook.list = listOf({ people: [], total: 0, shown: 0 });
    render(<CompletedTeam />);
    expect(
      screen.getByText("Nobody you lead finished a task in this week."),
    ).toBeInTheDocument();
  });
});

describe("paging", () => {
  it("says how many of the tasks are shown and loads the next page on request", async () => {
    hook.list = listOf({ hasMore: true, total: 120, shown: 50 });
    render(<CompletedTeam />);
    expect(screen.getByText("Showing 50 of 120 tasks")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(hook.loadMore).toHaveBeenCalledTimes(1);
  });

  it("offers another try when the next page failed, and keeps what is shown", () => {
    hook.list = listOf({
      hasMore: true,
      total: 120,
      shown: 50,
      moreError: new ApiError(500, "boom", "No."),
    });
    render(<CompletedTeam />);
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Bola Projects")).toBeInTheDocument();
  });
});

describe("asking for objectives", () => {
  it("asks for none while no dialog is open, however many people are listed, and asks when one opens", async () => {
    hook.list = listOf({
      people: [
        person(),
        person({
          employee: {
            id: "chi",
            name: "Chi Ada",
            jobTitle: "",
            departmentName: null,
          },
          items: [
            item({
              id: "c1",
              key: "C-1",
              title: "Chi's task",
              personId: "chi",
            }),
          ],
        }),
      ],
    });
    kpiCalls.length = 0;
    render(<CompletedTeam />);
    expect(kpiCalls.length).toBeGreaterThan(0);
    expect(kpiCalls.every((c) => c[1] === false)).toBe(true);
    await userEvent.click(
      screen.getByRole("checkbox", { name: /Select PRF-1/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Link to an objective" }),
    );
    expect(kpiCalls.some((c) => c[1] === true)).toBe(true);
  });
});

describe("linking from a person's list", () => {
  const choose = async (key: string) =>
    userEvent.click(
      screen.getByRole("checkbox", { name: new RegExp(`Select ${key}`) }),
    );

  it("offers a choice on each task and nothing until one is chosen", async () => {
    render(<CompletedTeam />);
    expect(
      screen.queryByRole("button", { name: "Link to an objective" }),
    ).toBeNull();
    await choose("PRF-1");
    expect(screen.getByText("1 chosen")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Link to an objective" }),
    ).toBeInTheDocument();
  });

  it("links the chosen tasks to the objective and says how it went, in one line", async () => {
    hook.run.mockResolvedValue({ changed: 2, failed: [] });
    render(<CompletedTeam />);
    await choose("PRF-1");
    await choose("PRF-3");
    await userEvent.click(
      screen.getByRole("button", { name: "Link to an objective" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Link 2 tasks to an objective",
      }),
    ).toBeInTheDocument();
    await userEvent.selectOptions(
      within(dialog).getByRole("combobox", { name: /Objective/ }),
      "Grow revenue (Company)",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Link 2 tasks" }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("dialog")).getByText(
          "Linked 2 tasks to Grow revenue.",
        ),
      ).toBeInTheDocument(),
    );
    expect(hook.run).toHaveBeenCalledTimes(1);
    expect(hook.run).toHaveBeenCalledWith(
      [
        expect.objectContaining({ id: "i1", key: "PRF-1" }),
        expect.objectContaining({ id: "i3", key: "PRF-3" }),
      ],
      { goalId: "g1", keyResultId: null },
    );
    /* The list asks again so its links are current. */
    expect(hook.reload).toHaveBeenCalled();
  });

  it("narrows to one measure when the objective has them", async () => {
    hook.run.mockResolvedValue({ changed: 1, failed: [] });
    render(<CompletedTeam />);
    await choose("PRF-1");
    await userEvent.click(
      screen.getByRole("button", { name: "Link to an objective" }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.selectOptions(
      within(dialog).getByRole("combobox", { name: /Objective/ }),
      "Bola delivers payroll (Bola Projects)",
    );
    await userEvent.selectOptions(
      within(dialog).getByRole("combobox", { name: /Measure/ }),
      "Cut run time",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Link 1 task" }),
    );
    await waitFor(() => expect(hook.run).toHaveBeenCalled());
    expect(hook.run.mock.calls[0]![1]).toEqual({
      goalId: "g2",
      keyResultId: "kr1",
    });
  });

  it("clears the link when no objective is chosen", async () => {
    hook.run.mockResolvedValue({ changed: 1, failed: [] });
    render(<CompletedTeam />);
    await choose("PRF-2");
    await userEvent.click(
      screen.getByRole("button", { name: "Link to an objective" }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Clear the link on 1 task" }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("dialog")).getByText(
          "Cleared the link on 1 task.",
        ),
      ).toBeInTheDocument(),
    );
    expect(hook.run.mock.calls[0]![1]).toBeNull();
  });

  it("lists a task that did not change with its plain reason, and never as an alarm", async () => {
    hook.run.mockResolvedValue({
      changed: 1,
      failed: [
        {
          id: "i3",
          key: "PRF-3",
          reason: "Only the people this task is assigned to can link it.",
        },
      ],
    });
    render(<CompletedTeam />);
    await choose("PRF-1");
    await choose("PRF-3");
    await userEvent.click(
      screen.getByRole("button", { name: "Link to an objective" }),
    );
    const dialog = screen.getByRole("dialog");
    await userEvent.selectOptions(
      within(dialog).getByRole("combobox", { name: /Objective/ }),
      "Grow revenue (Company)",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Link 2 tasks" }),
    );
    const after = await screen.findByText(
      /Linked 1 task to Grow revenue\. 1 task could not be changed\./,
    );
    expect(after).toBeInTheDocument();
    expect(
      screen.getByText(
        /Only the people this task is assigned to can link it\./,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("dialog").querySelector("[class*=danger]"),
    ).toBeNull();
  });

  it("stops at a hundred chosen", async () => {
    hook.list = listOf({
      people: [
        person({
          items: Array.from({ length: 101 }, (_, n) =>
            item({ id: `m${n}`, key: `M-${n}`, title: `Many ${n}` }),
          ),
          itemsTotal: 101,
        }),
      ],
    });
    render(<CompletedTeam />);
    const boxes = screen.getAllByRole("checkbox");
    for (const box of boxes.slice(0, 100)) await userEvent.click(box);
    expect(screen.getByText("100 chosen")).toBeInTheDocument();
    expect(screen.getByText("Up to 100 at a time.")).toBeInTheDocument();
    expect(boxes[100]).toBeDisabled();
  }, 30_000);
});
