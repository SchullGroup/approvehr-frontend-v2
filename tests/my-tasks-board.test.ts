import { describe, expect, it } from "vitest";
import type { PersonalTask } from "@/lib/api/projects";
import {
  cannotMoveReason,
  firstStatusIn,
  groupByCategory,
  layoutOf,
  projectIsReadOnly,
  stageNote,
  withMove,
} from "@/lib/projects/my-tasks-board";
import type { ProjectStatus, StatusCategory } from "@/lib/projects/types";

/**
 * The board layout of My tasks: which column a task sits in, which stage a move
 * lands on, and when a move is refused before asking.
 */

const status = (
  id: string,
  name: string,
  category: StatusCategory,
  position: number,
): ProjectStatus => ({ id, name, category, position, wipLimit: null });

const task = (
  id: string,
  statusCategory: StatusCategory,
  statusName = "",
  extra: Partial<PersonalTask> = {},
): PersonalTask =>
  ({
    id,
    key: id.toUpperCase(),
    title: id,
    statusId: `s-${id}`,
    statusName,
    statusCategory,
    lostAccess: false,
    project: {
      id: "p1",
      key: "MY",
      name: "Personal",
      departmentId: null,
      departmentName: null,
      personal: true,
    },
    ...extra,
  }) as PersonalTask;

describe("layoutOf", () => {
  it("reads a saved board and falls back to the list for anything else", () => {
    expect(layoutOf("board")).toBe("board");
    expect(layoutOf("list")).toBe("list");
    expect(layoutOf(null)).toBe("list");
    expect(layoutOf("kanban")).toBe("list");
  });
});

describe("groupByCategory", () => {
  it("puts each task in its category's column, keeping their order", () => {
    const cols = groupByCategory([
      task("a", "TODO"),
      task("b", "DONE"),
      task("c", "IN_PROGRESS"),
      task("d", "TODO"),
    ]);
    expect(cols.TODO.map((t) => t.id)).toEqual(["a", "d"]);
    expect(cols.IN_PROGRESS.map((t) => t.id)).toEqual(["c"]);
    expect(cols.DONE.map((t) => t.id)).toEqual(["b"]);
  });

  it("gives every column even when it is empty", () => {
    expect(groupByCategory([])).toEqual({
      TODO: [],
      IN_PROGRESS: [],
      DONE: [],
    });
  });
});

describe("firstStatusIn", () => {
  const statuses = [
    status("done", "Shipped", "DONE", 4),
    status("review", "In review", "IN_PROGRESS", 3),
    status("doing", "Doing", "IN_PROGRESS", 2),
    status("todo", "Backlog", "TODO", 1),
  ];

  it("picks the project's first stage in the category by position, not list order", () => {
    expect(firstStatusIn(statuses, "IN_PROGRESS")?.id).toBe("doing");
    expect(firstStatusIn(statuses, "TODO")?.id).toBe("todo");
    expect(firstStatusIn(statuses, "DONE")?.id).toBe("done");
  });

  it("is null when the project has no stage in that category", () => {
    expect(firstStatusIn([status("t", "To do", "TODO", 0)], "DONE")).toBeNull();
  });
});

describe("stageNote", () => {
  it("names a stage that says more than its column", () => {
    expect(stageNote(task("a", "IN_PROGRESS", "In review"))).toBe("In review");
  });

  it("stays quiet when the stage is the column's own name, in any case", () => {
    expect(stageNote(task("a", "IN_PROGRESS", "In progress"))).toBeNull();
    expect(stageNote(task("a", "TODO", "TO DO"))).toBeNull();
    expect(stageNote(task("a", "DONE", ""))).toBeNull();
  });
});

describe("moving", () => {
  it("refuses a task from a project the person has left before asking", () => {
    expect(cannotMoveReason(task("a", "DONE", "", { lostAccess: true }))).toBe(
      "You're no longer on this project.",
    );
    expect(cannotMoveReason(task("a", "TODO"))).toBeNull();
  });

  it("treats only a definite no from the project as read-only", () => {
    expect(projectIsReadOnly({ access: "READ", canWrite: null })).toBe(true);
    expect(projectIsReadOnly({ access: null, canWrite: false })).toBe(true);
    expect(projectIsReadOnly({ access: "WRITE", canWrite: true })).toBe(false);
    expect(projectIsReadOnly({})).toBe(false);
  });

  it("moves one task to the stage and leaves the rest alone", () => {
    const rows = [task("a", "TODO", "To do"), task("b", "TODO", "To do")];
    const moved = withMove(
      rows,
      "a",
      status("r", "In review", "IN_PROGRESS", 3),
    );
    expect(moved[0]).toMatchObject({
      statusId: "r",
      statusName: "In review",
      statusCategory: "IN_PROGRESS",
    });
    expect(moved[1]).toBe(rows[1]);
    expect(rows[0]?.statusCategory).toBe("TODO");
  });
});
