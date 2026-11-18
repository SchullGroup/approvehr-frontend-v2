import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PersonalTask } from "@/lib/api/projects";
import { withMove } from "@/lib/projects/my-tasks-board";

/**
 * My tasks in its Board layout, where the Done column is a count of cards and a won't-do task is one
 * of them.
 *
 * What is proved: the Done column does not count a task closed as won't do as finished (it says how
 * many were finished and how many were closed, as the list layout does, and a plain number when
 * nothing was); each card says Won't do or Accepted where it is; the other two columns keep their
 * plain counts; and a card dragged out of Done stops saying either at once, because the server clears
 * both marks in the same write that reopens it and a reopened task must not read as closed for the
 * length of a round trip.
 */

vi.mock("@/components/ui", async (original) => ({
  ...(await original<typeof import("@/components/ui")>()),
  useToast: () => ({ push: vi.fn() }),
}));

const { MyTasksBoard } = await import("@/components/projects/my-tasks-board");

const WONT_DO = {
  at: "2026-11-11T09:00:00.000Z",
  byId: "p-01",
  byName: "Ada",
  reason: "Replaced",
};
const ACCEPTED = {
  at: "2026-11-11T14:30:00.000Z",
  byId: "p-05",
  byName: "Adaeze Okonkwo",
};

const task = (
  id: string,
  title: string,
  over: Partial<PersonalTask> = {},
): PersonalTask =>
  ({
    id,
    projectId: "p-mine",
    number: 1,
    key: `MY-${id}`,
    type: "TASK",
    title,
    description: "",
    statusId: "s-done",
    priority: "MEDIUM",
    assigneeId: "p-01",
    assigneeIds: ["p-01"],
    reporterId: "p-01",
    epicId: null,
    parentId: null,
    sprintId: null,
    points: null,
    labels: [],
    startDate: null,
    dueDate: null,
    dueTime: null,
    dueAt: null,
    rank: 1,
    doneAt: "2026-11-10T10:00:00.000Z",
    goalId: null,
    keyResultId: null,
    objective: { state: "UNLINKED" },
    commentCount: 0,
    createdAt: "2026-10-15T09:00:00.000Z",
    updatedAt: "2026-10-15T09:00:00.000Z",
    statusName: "Done",
    statusCategory: "DONE",
    setBy: null,
    sharedBy: null,
    project: {
      id: "p-mine",
      key: "MY",
      name: "Personal",
      departmentId: null,
      departmentName: null,
      personal: true,
    },
    assignees: [{ id: "p-01", name: "Ada Okafor" }],
    lostAccess: false,
    ...over,
  }) as unknown as PersonalTask;

const board = (tasks: PersonalTask[]) =>
  render(
    <MyTasksBoard
      tasks={tasks}
      source={{}}
      today="2026-11-12"
      timeZone="Africa/Lagos"
      filtering={false}
      onClearFilters={vi.fn()}
      onOpen={vi.fn()}
      onMoved={vi.fn()}
    />,
  );

const column = (name: string) => screen.getByRole("region", { name });
/** The count at the right of a column's header, as written. */
const headerOf = (name: string) =>
  within(column(name)).getByRole("heading", { level: 2 }).parentElement!;

describe("the Done column's count", () => {
  it("says how many were finished and how many were closed as won't do, never a bare number that includes a task nobody did", () => {
    board([
      task("1", "File the report"),
      task("2", "Drop the survey", { wontDo: WONT_DO }),
    ]);
    expect(headerOf("Done")).toHaveTextContent("1 finished, 1 won't do");
    expect(headerOf("Done").textContent).not.toMatch(/(^|[^\d])2$/);
  });

  it("is a plain number when nothing in it was closed as won't do", () => {
    board([task("1", "File the report"), task("2", "Send the invoice")]);
    expect(headerOf("Done")).toHaveTextContent(/Done \(last 14 days\)\s*2$/);
    expect(headerOf("Done")).not.toHaveTextContent(/won't do/);
  });

  it("leaves the other columns' counts as numbers", () => {
    board([
      task("1", "Send the contract", {
        statusCategory: "TODO",
        statusId: "s-todo",
        statusName: "To do",
        doneAt: null,
      }),
      task("2", "Book the room", {
        statusCategory: "IN_PROGRESS",
        statusId: "s-doing",
        statusName: "In progress",
        doneAt: null,
      }),
      task("3", "Drop the survey", { wontDo: WONT_DO }),
    ]);
    expect(headerOf("To do")).toHaveTextContent(/To do\s*1$/);
    expect(headerOf("In progress")).toHaveTextContent(/In progress\s*1$/);
  });
});

describe("a card on the board", () => {
  it("says Won't do on a task that was closed as won't do, and only on that one", () => {
    board([
      task("1", "File the report"),
      task("2", "Drop the survey", { wontDo: WONT_DO }),
    ]);
    const closed = screen.getByText("Drop the survey").closest("article")!;
    expect(within(closed).getByText("Won't do")).toBeInTheDocument();
    const other = screen.getByText("File the report").closest("article")!;
    expect(within(other).queryByText("Won't do")).toBeNull();
  });

  it("says Accepted on an accepted task", () => {
    board([task("1", "File the report", { accepted: ACCEPTED })]);
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });
});

describe("moving a card", () => {
  const status = (category: "TODO" | "IN_PROGRESS" | "DONE", name: string) => ({
    id: `s-${category}`,
    name,
    category,
  });

  it("out of Done clears both marks at once, as the server does", () => {
    const rows = [
      task("1", "Drop the survey", { wontDo: WONT_DO }),
      task("2", "File the report", { accepted: ACCEPTED }),
    ];
    const moved = withMove(rows, "1", status("IN_PROGRESS", "In progress"));
    expect(moved[0]!.wontDo).toBeNull();
    expect(moved[0]!.accepted).toBeNull();
    const also = withMove(rows, "2", status("TODO", "To do"));
    expect(also[1]!.accepted).toBeNull();
  });

  it("that stays in Done keeps both marks: it is still finished, or still closed", () => {
    const rows = [
      task("1", "Drop the survey", { wontDo: WONT_DO }),
      task("2", "File the report", { accepted: ACCEPTED }),
    ];
    const kept = withMove(rows, "1", status("DONE", "Shipped"));
    expect(kept[0]!.wontDo).toEqual(WONT_DO);
    const alsoKept = withMove(rows, "2", status("DONE", "Shipped"));
    expect(alsoKept[1]!.accepted).toEqual(ACCEPTED);
  });

  it("leaves every other card as it was", () => {
    const rows = [
      task("1", "Drop the survey", { wontDo: WONT_DO }),
      task("2", "File the report", { accepted: ACCEPTED }),
    ];
    const moved = withMove(rows, "1", status("TODO", "To do"));
    expect(moved[1]).toBe(rows[1]);
  });

  it("into Done carries nothing: a task that was not finished had no marks to carry", () => {
    const rows = [
      task("1", "Book the room", {
        statusCategory: "IN_PROGRESS",
        statusId: "s-doing",
        statusName: "In progress",
        doneAt: null,
      }),
    ];
    const moved = withMove(rows, "1", status("DONE", "Done"));
    expect(moved[0]!.statusCategory).toBe("DONE");
    expect(moved[0]!.wontDo ?? null).toBeNull();
    expect(moved[0]!.accepted ?? null).toBeNull();
  });
});
