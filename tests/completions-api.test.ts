import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Completed work, as the API sends it and as the screens read it.
 *
 * What is proved: an unlinked task is the ordinary `UNLINKED` state and not a gap,
 * a task with no due date is neither on time nor late, a link to an objective the
 * reader may not open is still a link, an item listed under a KPI says at which
 * level it was linked, and a person cut across two pages is one group. Nothing on
 * any of these reads carries a grade.
 */

const requestPaged = vi.fn();
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  requestPaged: (...args: unknown[]) => requestPaged(...args),
  request: vi.fn(),
}));

const {
  completionsApi,
  toCompletedWork,
  toCompletion,
  toSummary,
  toTeamCompletedPage,
  toWorkThisCycle,
} = await import("@/lib/api/completions");
const { groupTeamRows } = await import("@/lib/store/completions");

const item = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  key: "PRF-1",
  title: "Run the October payroll",
  type: "TASK",
  labels: [],
  employeeId: "bola",
  projectId: "p1",
  projectName: "Payroll v2",
  personal: false,
  doneAt: "2026-10-12T15:30:00.000Z",
  finishedOn: "2026-10-12",
  dueDate: "2026-10-12",
  dueTime: "17:00",
  dueAt: "2026-10-12T16:00:00.000Z",
  onTime: true,
  timing: "ON_TIME",
  objective: {
    state: "LINKED",
    source: "TASK",
    goalId: "g1",
    title: "Grow revenue",
    level: "company",
    keyResultId: null,
    keyResultLabel: null,
    visible: true,
    message: "Linked to Grow revenue",
  },
  canOpen: true,
  ...over,
});

const totals = (over: Record<string, unknown> = {}) => ({
  finished: 3,
  withDueDate: 2,
  onTime: 1,
  late: 1,
  noDueDate: 1,
  linked: 2,
  unlinked: 1,
  linkedShare: 0.6667,
  ...over,
});

beforeEach(() => requestPaged.mockReset());

describe("one finished task", () => {
  it("reads the facts, and the server's sentence about the link", () => {
    const row = toCompletion(item());
    expect(row).toMatchObject({
      key: "PRF-1",
      projectName: "Payroll v2",
      personId: "bola",
      doneDay: "2026-10-12",
      onTime: true,
      canOpen: true,
    });
    expect(row.objective.message).toBe("Linked to Grow revenue");
  });

  it("a task with no due date is neither on time nor late", () => {
    const row = toCompletion(
      item({
        dueDate: null,
        dueTime: null,
        dueAt: null,
        onTime: null,
        timing: "NO_DUE_DATE",
      }),
    );
    expect(row.onTime).toBeNull();
  });

  it("an unlinked task is the ordinary state, with no name to show", () => {
    const row = toCompletion(
      item({
        objective: {
          state: "UNLINKED",
          source: null,
          goalId: null,
          title: null,
          level: null,
          keyResultId: null,
          keyResultLabel: null,
          visible: true,
          message: "Not linked to an objective",
        },
      }),
    );
    expect(row.objective.state).toBe("UNLINKED");
    expect(row.objective.title).toBeNull();
  });

  it("a link to an objective the reader may not open is still a link", () => {
    const row = toCompletion(
      item({
        objective: {
          state: "LINKED",
          source: "TASK",
          goalId: null,
          title: null,
          level: null,
          keyResultId: null,
          keyResultLabel: null,
          visible: false,
          message: "Linked to an objective",
        },
      }),
    );
    expect(row.objective).toMatchObject({
      state: "LINKED",
      visible: false,
      message: "Linked to an objective",
    });
  });

  it("an item under an objective above the KPI says at which level", () => {
    const row = toCompletion({
      ...item({
        objective: {
          state: "LINKED",
          source: "TASK",
          goalId: "d1",
          title: "Ship payroll v2",
          level: "department",
          keyResultId: null,
          keyResultLabel: null,
          visible: true,
          message: "Linked to Ship payroll v2",
        },
      }),
      linkedAt: "ANCESTOR",
    });
    expect(row.linkedAt).toBe("department");
    expect(
      toCompletion({ ...item(), linkedAt: "SELF" }).linkedAt,
    ).toBeUndefined();
  });

  it("a task the reader may not open says so, and nothing else changes", () => {
    expect(toCompletion(item({ canOpen: false })).canOpen).toBe(false);
  });

  it("never carries a grade", () => {
    const row = toCompletion({
      ...item(),
      grade: "COMPLETED",
      waitingForGrade: true,
    });
    expect("grade" in row).toBe(false);
    expect("waitingForGrade" in row).toBe(false);
  });
});

describe("totals", () => {
  it("reads finished, due-date, on time, late and linked", () => {
    expect(toSummary(totals())).toEqual({
      finished: 3,
      withDueDate: 2,
      onTime: 1,
      late: 1,
      linked: 2,
    });
  });
  it("works late out when the API did not send it", () => {
    expect(toSummary({ finished: 3, withDueDate: 2, onTime: 1 }).late).toBe(1);
  });
});

describe("the manager's Completed view", () => {
  const people = [
    {
      employee: {
        id: "bola",
        name: "Bola Projects",
        jobTitle: "Analyst",
        departmentName: "Engineering",
      },
      ...totals(),
      items: [item(), item({ id: "i2", key: "PRF-2" })],
    },
    {
      employee: {
        id: "chi",
        name: "Chi Ada",
        jobTitle: "Designer",
        departmentName: null,
      },
      ...totals({ finished: 1, linked: 0 }),
      items: [item({ id: "i3", key: "PRF-3", employeeId: "chi" })],
    },
  ];

  it("flattens people into task rows that keep each person's whole totals", () => {
    const page = toTeamCompletedPage(
      { people },
      { total: 5, hasMore: true, nextCursor: "abc" },
    );
    expect(page.rows.map((r) => r.key)).toEqual(["PRF-1", "PRF-2", "PRF-3"]);
    expect(page.rows[0]!.totals.finished).toBe(3);
    expect(page.rows[2]!.personName).toBe("Chi Ada");
    expect(page.total).toBe(5);
    expect(page.next).toBe("abc");
  });

  it("groups rows by person, and a person cut across two pages is one group", () => {
    const first = toTeamCompletedPage({ people: [people[0]!] }, { total: 4 });
    const second = toTeamCompletedPage(
      {
        people: [
          {
            ...people[0]!,
            items: [item({ id: "i9", key: "PRF-9" })],
          },
          people[1]!,
        ],
      },
      { total: 4 },
    );
    const groups = groupTeamRows([...first.rows, ...second.rows]);
    expect(groups.map((g) => g.employee.name)).toEqual([
      "Bola Projects",
      "Chi Ada",
    ]);
    expect(groups[0]!.items.map((i) => i.key)).toEqual([
      "PRF-1",
      "PRF-2",
      "PRF-9",
    ]);
    expect(groups[0]!.summary.finished).toBe(3);
  });

  it("asks for the period, the date, the marker and the page size", async () => {
    requestPaged.mockResolvedValue({
      data: { people: [] },
      meta: { total: 0 },
    });
    await completionsApi.teamCompleted({
      period: "month",
      date: "2026-10-01",
      cursor: "xyz",
      limit: 50,
    });
    expect(requestPaged).toHaveBeenCalledWith("/performance/team/completed", {
      query: { period: "month", date: "2026-10-01", cursor: "xyz", limit: 50 },
    });
  });
});

describe("work inside a review", () => {
  const data = (over: Record<string, unknown> = {}) => ({
    employee: {
      id: "bola",
      name: "Bola Projects",
      jobTitle: "Analyst",
      departmentName: null,
    },
    cycle: {
      id: "c1",
      name: "H2 2026",
      periodStart: "2026-07-01",
      periodEnd: "2026-12-31",
    },
    available: true,
    period: { kind: "cycle", label: "H2 2026" },
    summary: totals(),
    byProject: [
      {
        projectId: "p1",
        projectName: "Payroll v2",
        personal: false,
        ...totals(),
      },
    ],
    byObjective: [
      {
        goalId: "g1",
        title: "Grow revenue",
        level: "company",
        state: "LINKED",
        visible: true,
        keyResultId: null,
        keyResultLabel: null,
        ...totals({ finished: 2 }),
      },
      {
        goalId: null,
        title: null,
        level: null,
        state: "LINKED",
        visible: false,
        keyResultId: null,
        keyResultLabel: null,
        ...totals({ finished: 1 }),
      },
      {
        goalId: null,
        title: null,
        level: null,
        state: "UNLINKED",
        visible: true,
        keyResultId: null,
        keyResultLabel: null,
        ...totals({ finished: 1 }),
      },
    ],
    items: [
      item({ id: "a", doneAt: "2026-10-01T00:00:00.000Z" }),
      item({ id: "b", doneAt: "2026-11-01T00:00:00.000Z" }),
    ],
    ...over,
  });

  it("reads totals, projects, objectives and the items, newest first", () => {
    const work = toWorkThisCycle(data(), { total: 3, hasMore: false })!;
    expect(work.summary.finished).toBe(3);
    expect(work.byProject[0]!.projectName).toBe("Payroll v2");
    expect(work.items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(work.total).toBe(3);
    expect(work.capped).toBe(false);
  });

  it("marks the three kinds of objective row: linked, hidden, and not linked", () => {
    const rows = toWorkThisCycle(data(), { total: 3 })!.byObjective;
    expect(rows.map((r) => [r.unlinked, r.visible])).toEqual([
      [false, true],
      [false, false],
      [true, true],
    ]);
  });

  it("is nothing at all for a cycle with no dates, so the panel is hidden", () => {
    expect(
      toWorkThisCycle(data({ available: false, period: null, items: [] }), {}),
    ).toBeNull();
  });

  it("says it is capped when there are more pages", () => {
    expect(toWorkThisCycle(data(), { total: 90, hasMore: true })!.capped).toBe(
      true,
    );
  });

  it("asks the cycle's own path for the person", async () => {
    requestPaged.mockResolvedValue({ data: data(), meta: { total: 3 } });
    await completionsApi.workForCycle("c1", "bola", { limit: 50 });
    expect(requestPaged).toHaveBeenCalledWith(
      "/performance/cycles/c1/employees/bola/work",
      { query: { limit: 50 } },
    );
  });
});

describe("work under an objective", () => {
  const data = {
    goal: {
      id: "k1",
      title: "Bola delivers",
      level: "personal",
      ownerId: "bola",
    },
    people: [
      {
        employee: {
          id: "bola",
          name: "Bola Projects",
          jobTitle: "Analyst",
          departmentName: null,
        },
        ...totals(),
        items: [
          { ...item({ id: "a" }), linkedAt: "SELF" },
          {
            ...item({
              id: "b",
              objective: {
                state: "LINKED",
                source: "TASK",
                goalId: "d1",
                title: "Ship payroll v2",
                level: "department",
                keyResultId: null,
                keyResultLabel: null,
                visible: true,
                message: "Linked to Ship payroll v2",
              },
            }),
            linkedAt: "ANCESTOR",
          },
        ],
      },
    ],
  };

  it("groups by person and marks the item linked above the KPI with its level", () => {
    const work = toCompletedWork(data, { total: 2, hasMore: false });
    expect(work.groups).toHaveLength(1);
    const items = work.groups[0]!.items;
    expect(items.find((i) => i.id === "a")!.linkedAt).toBeUndefined();
    expect(items.find((i) => i.id === "b")!.linkedAt).toBe("department");
    expect(work.total).toBe(2);
  });

  it("asks the goal's own path", async () => {
    requestPaged.mockResolvedValue({ data, meta: { total: 2 } });
    await completionsApi.completedWork("k1", { limit: 100 });
    expect(requestPaged).toHaveBeenCalledWith("/performance/goals/k1/work", {
      query: { limit: 100 },
    });
  });
});
