import { describe, expect, it } from "vitest";
import {
  DUE_CHOICES,
  filterCount,
  queryFromParams,
  withParam,
  withoutFilters,
} from "@/lib/projects/work-query";

/**
 * The filters of a list of work live in the address, so a tile can open the list
 * it counts and a link can be shared. Anything the address says that is not a
 * word the API knows is dropped, not guessed at.
 */

const params = (qs: string) => new URLSearchParams(qs);

describe("reading the address", () => {
  it("turns each filter into the query the API answers", () => {
    expect(
      queryFromParams(
        params(
          "program=p1&project=j1&assignee=e1&stage=done&bucket=overdue&q=%20pay%20",
        ),
      ),
    ).toEqual({
      programId: "p1",
      projectId: "j1",
      assigneeId: "e1",
      category: ["DONE"],
      bucket: "overdue",
      q: "pay",
    });
  });

  it("drops a stage or a bucket it does not know", () => {
    expect(queryFromParams(params("stage=nope&bucket=sometime"))).toEqual({});
  });

  it("keeps a fixed scope whatever the address says about the program", () => {
    expect(
      queryFromParams(params("program=other"), { programId: "mine" }),
    ).toEqual({ programId: "mine" });
    expect(
      queryFromParams(params("program=other"), { unassigned: true }),
    ).toEqual({
      unassigned: true,
    });
  });

  it("understands somebody with nobody on it", () => {
    expect(queryFromParams(params("assignee=none"))).toEqual({
      assigneeId: "none",
    });
  });
});

describe("changing the address", () => {
  it("sets and clears one filter and leaves the rest, the tab included", () => {
    const next = withParam(
      params("view=tasks&stage=DONE"),
      "bucket",
      "overdue",
    );
    expect(next.toString()).toBe("view=tasks&stage=DONE&bucket=overdue");
    expect(withParam(next, "stage", null).toString()).toBe(
      "view=tasks&bucket=overdue",
    );
  });

  it("clears every filter and keeps the tab", () => {
    expect(
      withoutFilters(
        params("view=tasks&stage=DONE&q=x&assignee=e1"),
      ).toString(),
    ).toBe("view=tasks");
  });

  it("counts the filters that are on", () => {
    expect(filterCount(params("view=tasks"))).toBe(0);
    expect(filterCount(params("view=tasks&stage=DONE&q=x"))).toBe(2);
  });
});

describe("the Due choices", () => {
  it("use the API's own bucket words, so a tile and its list agree", () => {
    expect(DUE_CHOICES.map((c) => c.value)).toEqual([
      "",
      "overdue",
      "dueThisWeek",
      "open",
      "doneThisWeek",
    ]);
  });
});

describe("a stage by name", () => {
  it("reads `stageName` as one of the projects' own stages, beside the category word", () => {
    expect(queryFromParams(params("stageName=In%20review"))).toEqual({
      stage: ["In review"],
    });
    expect(queryFromParams(params("stage=done&stageName=%20QA%20"))).toEqual({
      category: ["DONE"],
      stage: ["QA"],
    });
    expect(queryFromParams(params("stageName=%20"))).toEqual({});
  });

  it("counts it as a filter, and clears it with the rest", () => {
    expect(filterCount(params("stageName=QA"))).toBe(1);
    expect(withoutFilters(params("view=tasks&stageName=QA")).toString()).toBe(
      "view=tasks",
    );
  });
});

describe("the Archive's reason", () => {
  it("reads a known reason, and drops one it does not know", () => {
    expect(queryFromParams(new URLSearchParams("why=done"))).toEqual({
      reason: "done",
    });
    expect(queryFromParams(new URLSearchParams("why=lost"))).toEqual({});
  });

  it("counts as a filter, and is cleared with the rest", () => {
    const params = new URLSearchParams("view=tasks&why=project");
    expect(filterCount(params)).toBe(1);
    expect(withoutFilters(params).toString()).toBe("view=tasks");
  });
});
