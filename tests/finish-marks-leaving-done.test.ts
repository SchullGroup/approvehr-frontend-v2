import { describe, expect, it } from "vitest";
import { patchIssue } from "@/lib/projects/mutations";
import { buildSample } from "@/lib/projects/sample";
import type { Issue, ProjectData } from "@/lib/projects/types";

/**
 * A mark on a finish ends with the finish.
 *
 * The API clears both won't do and acceptance in the same write that clears `doneAt`, on every path out
 * of a Done column. The board applies a move at once and rolls it back if refused, so it must say the
 * same thing in the meantime: a task that has just been reopened must not read, for the length of a round
 * trip, as closed as won't do or as accepted. A move between two Done columns is still finished and keeps
 * both.
 */

const TODAY = "2026-10-15";
const NOW = "2026-10-15T12:00:00.000Z";
const LATER = "2026-10-15T15:30:00.000Z";

const WONT_DO = {
  at: "2026-10-14T09:00:00.000Z",
  byId: "p-01",
  byName: "Ada Eze",
  reason: "The customer changed their mind",
};
const ACCEPTED = {
  at: "2026-10-14T10:00:00.000Z",
  byId: "p-01",
  byName: "Ada Eze",
};

function fixture(): ProjectData {
  const s = buildSample({
    today: TODAY,
    now: NOW,
    people: ["p-01", "p-03", "p-09", "p-04"],
  });
  return { project: s.project, issues: s.issues, sprints: s.sprints };
}
const statusId = (d: ProjectData, name: string) =>
  d.project.statuses.find((s) => s.name === name)!.id;

/** A finished task carrying the marks, in the first Done column. */
function finished(
  d: ProjectData,
  marks: Partial<Issue>,
): { data: ProjectData; id: string } {
  const done = d.project.statuses.find((s) => s.category === "DONE")!;
  const base = d.issues.find((i) => i.type === "TASK")!;
  const issue: Issue = { ...base, statusId: done.id, doneAt: NOW, ...marks };
  return {
    data: { ...d, issues: d.issues.map((i) => (i.id === base.id ? issue : i)) },
    id: base.id,
  };
}

describe("leaving a Done column", () => {
  it("clears a won't-do mark with the finish", () => {
    const d = fixture();
    const { data, id } = finished(d, { wontDo: WONT_DO });
    const moved = patchIssue(
      data,
      id,
      { statusId: statusId(d, "In Progress") },
      LATER,
    );
    expect(moved.issue!.doneAt).toBeNull();
    expect(moved.issue!.wontDo).toBeNull();
  });

  it("clears an acceptance with the finish", () => {
    const d = fixture();
    const { data, id } = finished(d, { accepted: ACCEPTED });
    const moved = patchIssue(
      data,
      id,
      { statusId: statusId(d, "To Do") },
      LATER,
    );
    expect(moved.issue!.accepted).toBeNull();
    expect(moved.issue!.doneAt).toBeNull();
  });

  it("leaves a task that was never marked as it was", () => {
    const d = fixture();
    const { data, id } = finished(d, {});
    const moved = patchIssue(
      data,
      id,
      { statusId: statusId(d, "In Progress") },
      LATER,
    );
    expect(moved.issue!.wontDo).toBeNull();
    expect(moved.issue!.accepted).toBeNull();
  });
});

describe("staying finished", () => {
  it("keeps both marks on a change that does not leave Done", () => {
    const d = fixture();
    const { data, id } = finished(d, { wontDo: WONT_DO });
    const changed = patchIssue(data, id, { priority: "HIGH" }, LATER);
    expect(changed.issue!.wontDo).toEqual(WONT_DO);
    expect(changed.issue!.doneAt).toBe(NOW);
  });
});
