import { describe, expect, it } from "vitest";

/**
 * A simple board is a board and a list (UAT 23 Nov, U104 / PERF-25). Plan,
 * Timeline and Progress are about cycles, effort and burn-down, and a project
 * gets them by being switched to a board with cycles.
 */
const { viewsFor } = await import("@/app/(app)/projects/[id]/views");

const ids = (type: string, canManage: boolean) =>
  viewsFor(type, canManage).map((view) => view.id);

describe("a project's tabs", () => {
  it("are Board and List, and Settings for a manager, on a simple board", () => {
    expect(ids("KANBAN", true)).toEqual(["board", "issues", "settings"]);
    expect(ids("KANBAN", false)).toEqual(["board", "issues"]);
  });

  it("include Plan, Timeline and Progress on a board with cycles", () => {
    expect(ids("SCRUM", false)).toEqual(
      expect.arrayContaining([
        "board",
        "backlog",
        "roadmap",
        "reports",
        "issues",
      ]),
    );
    expect(ids("SCRUM", false)).not.toContain("settings");
  });
});
