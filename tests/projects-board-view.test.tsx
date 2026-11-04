import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import type { Issue, ProjectData } from "@/lib/projects/types";
import { contextFor, fakeActions, sampleData } from "./projects-fixture";

/**
 * The board, as a person meets it: columns with counts, a drag, a menu, and what
 * each of them asks the store to do.
 *
 * `next/navigation` is stubbed because the swimlane choice lives in the URL; the
 * drag is the product's own pointer-event drag, driven the way `pipeline-drag`
 * drives the hiring board — `elementFromPoint` is the one thing jsdom cannot do,
 * so it is stubbed to return the cell the test means to be over.
 */

let search = new URLSearchParams();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useSearchParams: () => search,
  usePathname: () => "/projects/pj-chk",
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn() }),
}));

const { BoardView } = await import("@/app/(app)/projects/[id]/board-view");

function renderBoard(
  data: ProjectData = sampleData(),
  overrides: Partial<ProjectContextValue> = {},
) {
  const ctx = contextFor(data, overrides);
  const actions = ctx.actions as unknown as ReturnType<typeof fakeActions>;
  render(
    <ProjectProvider value={ctx}>
      <BoardView />
    </ProjectProvider>,
  );
  return { ctx, actions };
}

const cell = (status: string, lane?: string): HTMLElement => {
  const label = lane ? `${status}, ${lane}` : status;
  return screen.getByRole("list", { name: label });
};

const status = (d: ProjectData, name: string) =>
  d.project.statuses.find((s) => s.name === name)!;

beforeEach(() => {
  search = new URLSearchParams();
  replace.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the sprint board", () => {
  it("names the sprint and says how far through it is", () => {
    renderBoard();
    expect(
      screen.getByRole("heading", { name: "CHK Sprint 3" }),
    ).toBeInTheDocument();
    expect(screen.getByText("7 days left")).toBeInTheDocument();
    expect(screen.getByText(/points done/)).toHaveTextContent("9 of 27");
  });

  it("shows a column per status with its count against the WIP limit", () => {
    renderBoard();
    expect(
      screen.getByRole("heading", { name: "In Progress" }).parentElement,
    ).toHaveTextContent("3/5");
    expect(
      screen.getByRole("heading", { name: "In Review" }).parentElement,
    ).toHaveTextContent("1/3");
    /* No limit, no denominator. */
    expect(
      screen.getByRole("heading", { name: "To Do" }).parentElement,
    ).not.toHaveTextContent("/");
  });

  it("says a column is over its limit in words, not only in colour", () => {
    const data = sampleData();
    const tight = {
      ...data,
      project: {
        ...data.project,
        statuses: data.project.statuses.map((s) =>
          s.name === "In Progress" ? { ...s, wipLimit: 1 } : s,
        ),
      },
    };
    renderBoard(tight);
    const head = screen.getByRole("heading", {
      name: "In Progress",
    }).parentElement!;
    expect(head).toHaveTextContent("over the limit of 1");
    expect(within(head).getByText("3/1").parentElement).toHaveClass(
      "text-warning-text",
    );
  });

  it("explains a Scrum project with no active sprint, and points at the backlog", () => {
    const data = sampleData();
    renderBoard({
      ...data,
      sprints: data.sprints.map((s) =>
        s.state === "ACTIVE" ? { ...s, state: "CLOSED" as const } : s,
      ),
    });
    expect(screen.getByText("No active sprint")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Go to the backlog" }),
    ).toHaveAttribute("href", "/projects/pj-chk?view=backlog");
  });

  it("offers swimlanes and writes the choice to the address", async () => {
    renderBoard();
    await userEvent.selectOptions(
      screen.getByLabelText("Swimlanes"),
      "assignee",
    );
    expect(replace).toHaveBeenCalledWith("/projects/pj-chk?lanes=assignee", {
      scroll: false,
    });
  });

  it("draws one lane per assignee when asked, each with its own cells", () => {
    search = new URLSearchParams("lanes=assignee");
    renderBoard();
    expect(
      screen.getByRole("heading", { name: /Adaeze Okonkwo/ }),
    ).toBeInTheDocument();
    expect(cell("To Do", "Adaeze Okonkwo")).toBeInTheDocument();
  });
});

describe("moving a card without dragging it", () => {
  it("asks for the new status, at the end of that column", async () => {
    const data = sampleData();
    const { actions } = renderBoard(data);
    const select = screen.getByLabelText("Move CHK-14 to…");
    await userEvent.selectOptions(select, "In Review");
    expect(actions.patchIssue).toHaveBeenCalledTimes(1);
    const [issue, patch] = actions.patchIssue.mock.calls[0] as [Issue, never];
    expect(issue.key).toBe("CHK-14");
    expect(patch).toMatchObject({ statusId: status(data, "In Review").id });
    expect((patch as { rank: number }).rank).toBeGreaterThan(
      Math.max(
        ...data.issues
          .filter((i) => i.statusId === status(data, "In Review").id)
          .map((i) => i.rank),
      ) - 1,
    );
  });

  it("does not offer the column a card is already in", () => {
    renderBoard();
    const select = screen.getByLabelText("Move CHK-14 to…");
    expect(
      within(select).getByRole("option", { name: "To Do" }),
    ).toBeDisabled();
    expect(
      within(select).getByRole("option", { name: "Done" }),
    ).not.toBeDisabled();
  });

  it("opens the drawer from the card's title", async () => {
    const { ctx } = renderBoard();
    await userEvent.click(
      screen.getByRole("button", { name: /Instrument payment error rates/ }),
    );
    expect(ctx.openIssue).toHaveBeenCalledWith(
      expect.objectContaining({ key: "CHK-14" }),
    );
  });

  it("leaves a viewer with nothing to move and nothing to drag", () => {
    renderBoard(sampleData(), { canWork: false });
    expect(screen.queryByLabelText(/^Move CHK-14/)).not.toBeInTheDocument();
    expect(screen.queryByText("Drop an issue here")).not.toBeInTheDocument();
  });
});

describe("dragging a card", () => {
  function drag(key: string, target: HTMLElement) {
    const grip = screen.getByLabelText(new RegExp(`^Move ${key}\\.`));
    (
      grip as HTMLElement & { setPointerCapture: () => void }
    ).setPointerCapture = () => undefined;
    act(() => {
      grip.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
    });
    const doc = document as unknown as Record<string, unknown>;
    doc["elementFromPoint"] = () => target;
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          clientX: 400,
          clientY: 300,
        }),
      );
    });
    act(() => {
      window.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          clientX: 400,
          clientY: 300,
        }),
      );
    });
    Reflect.deleteProperty(doc, "elementFromPoint");
  }

  it("moves the card to the column it is dropped on", () => {
    const data = sampleData();
    const { actions } = renderBoard(data);
    drag("CHK-14", cell("In Review"));
    expect(actions.patchIssue).toHaveBeenCalledTimes(1);
    const [issue, patch] = actions.patchIssue.mock.calls[0] as [Issue, never];
    expect(issue.key).toBe("CHK-14");
    expect(patch).toMatchObject({ statusId: status(data, "In Review").id });
  });

  it("writes nothing for a drop where the card already is", () => {
    const { actions } = renderBoard();
    /* CHK-26 is the last card in To Do; dropping it on its own column, at the
       end, changes neither its status nor its place. */
    drag("CHK-26", cell("To Do"));
    expect(actions.patchIssue).not.toHaveBeenCalled();
  });

  it("changes the assignee when a card is dropped into another person's lane", () => {
    search = new URLSearchParams("lanes=assignee");
    const data = sampleData();
    const { actions } = renderBoard(data);
    drag("CHK-14", cell("To Do", "Chidi Nwosu"));
    const patch = actions.patchIssue.mock.calls[0]![1] as {
      assigneeIds: string[];
    };
    expect(patch.assigneeIds[0]).toBe("p-03");
  });

  it("does nothing when the pointer is released over nothing", () => {
    const { actions } = renderBoard();
    drag("CHK-14", document.body);
    expect(actions.patchIssue).not.toHaveBeenCalled();
  });
});

describe("a Kanban board", () => {
  it("drops finished work older than fourteen days and keeps the rest", () => {
    const data = sampleData();
    const kanban: ProjectData = {
      project: { ...data.project, type: "KANBAN" },
      sprints: [],
      issues: data.issues.map((i) => ({ ...i, sprintId: null })),
    };
    renderBoard(kanban);
    expect(
      screen.getByRole("heading", { name: "Kanban board" }),
    ).toBeInTheDocument();
    /* CHK-5 finished 25 days ago, CHK-13 two days ago. */
    expect(
      screen.queryByText(
        "Charge endpoint accepts provider-agnostic payment intents",
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Show line-item tax breakdown in the order summary"),
    ).toBeInTheDocument();
  });
});
