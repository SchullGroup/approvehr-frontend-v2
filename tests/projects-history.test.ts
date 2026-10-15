import { describe, expect, it } from "vitest";
import { describeActivity, type HistoryLookup } from "@/lib/projects/history";

const lookup: HistoryLookup = {
  statusName: (id) => ({ s1: "To Do", s2: "In Progress" })[id] ?? null,
  personName: (id) => (id === "p-01" ? "Adaeze Okonkwo" : "Someone"),
  sprintName: (id) => (id === "sp1" ? "CHK Sprint 3" : null),
  issueKey: (id) => (id === "e1" ? "CHK-1" : null),
};

describe("describing an issue's history", () => {
  it("says an issue was created, and a description updated, without values", () => {
    expect(
      describeActivity(
        { field: "created", from: undefined, to: undefined },
        lookup,
      ),
    ).toEqual({
      verb: "created the issue",
      from: null,
      to: null,
    });
    expect(
      describeActivity(
        { field: "description", from: undefined, to: undefined },
        lookup,
      ).verb,
    ).toBe("updated the description");
  });

  it("turns ids into the names people know", () => {
    expect(
      describeActivity({ field: "statusId", from: "s1", to: "s2" }, lookup),
    ).toEqual({
      verb: "changed status",
      from: "To Do",
      to: "In Progress",
    });
    expect(
      describeActivity({ field: "assigneeId", from: null, to: "p-01" }, lookup),
    ).toEqual({
      verb: "changed assignee",
      from: "none",
      to: "Adaeze Okonkwo",
    });
    expect(
      describeActivity({ field: "epicId", from: "e1", to: null }, lookup),
    ).toMatchObject({
      from: "CHK-1",
      to: "none",
    });
    expect(
      describeActivity({ field: "sprintId", from: "gone", to: "sp1" }, lookup),
    ).toMatchObject({
      from: "a sprint",
      to: "CHK Sprint 3",
    });
  });

  it("names a status that has since been removed rather than showing its id", () => {
    expect(
      describeActivity({ field: "statusId", from: "old", to: "s1" }, lookup)
        .from,
    ).toBe("a status that has been removed");
  });

  it("formats priority, type, labels, points and dates", () => {
    expect(
      describeActivity(
        { field: "priority", from: "HIGH", to: "LOWEST" },
        lookup,
      ),
    ).toMatchObject({
      from: "High",
      to: "Lowest",
    });
    expect(
      describeActivity({ field: "type", from: "TASK", to: "BUG" }, lookup),
    ).toMatchObject({
      from: "Task",
      to: "Bug",
    });
    expect(
      describeActivity(
        { field: "labels", from: [], to: ["api", "web"] },
        lookup,
      ),
    ).toMatchObject({
      from: "none",
      to: "api, web",
    });
    expect(
      describeActivity({ field: "points", from: null, to: 5 }, lookup),
    ).toMatchObject({
      verb: "changed story points",
      from: "none",
      to: "5",
    });
    expect(
      describeActivity(
        { field: "dueDate", from: "2026-10-15", to: null },
        lookup,
      ),
    ).toMatchObject({
      verb: "changed due date",
      from: "15 Oct",
      to: "none",
    });
  });

  it("does not show a title's text, only that it changed", () => {
    expect(
      describeActivity({ field: "title", from: "a", to: "b" }, lookup),
    ).toEqual({
      verb: "changed the title",
      from: null,
      to: null,
    });
  });
});
