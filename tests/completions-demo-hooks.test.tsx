import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The completed-work screens in the demo, for the people the demo is about.
 *
 * The demo has no server, so each answer is worked out from the demo book by the
 * same rules the API applies, and a role preview changes it exactly as it would
 * connected. What is proved here is who gets an answer and who gets none: the
 * person, their manager and HR see a person's work; an outsider, a Program
 * reader and a holder of the company-wide grant (who in the demo are people with
 * no line to them and no records permission) get what the API would give, which
 * is nothing.
 */

const who = vi.hoisted(() => ({ id: "p-03" as string | null, hr: false }));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    isConnected: false,
    isLoading: false,
    actingId: who.id,
    employeeId: who.id,
    isSignedIn: true,
    organization: null,
    user: null,
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: (permission: string) => permission === "EDIT_RECORDS" && who.hr,
}));

const { useCompletedWork, useTeamCompleted, useWorkRecord, useWorkThisCycle } =
  await import("@/lib/store/completions");

beforeEach(() => {
  window.localStorage.clear();
  who.id = "p-03";
  who.hr = false;
});

const FIRST_HALF = {
  cycleId: "demo-cycle-h2",
  periodStart: "2026-01-01",
  periodEnd: "2026-06-30",
  enabled: true,
};

const record = async (subject: string | undefined, date = "2026-03-10") => {
  const view = renderHook(() => useWorkRecord(subject, "month", date));
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view.result.current;
};

describe("a person's work record", () => {
  it("is the person's own, with every finished task counted, linked or not", async () => {
    const read = await record(undefined);
    expect(read.data!.employee.id).toBe("p-03");
    expect(read.data!.summary.finished).toBeGreaterThan(0);
    expect(read.data!.summary.completionRate).toBeNull();
    for (const day of read.data!.days) {
      for (const issue of day.issues) {
        expect(issue.waitingForGrade).toBe(false);
      }
    }
  });

  it("is open to their manager", async () => {
    who.id = "p-01";
    const read = await record("p-03");
    expect(read.data!.employee.name).toBe("Chidi Nwosu");
    expect(read.error).toBeNull();
  });

  it("is open to HR", async () => {
    who.id = "p-77";
    who.hr = true;
    expect((await record("p-03")).data).not.toBeNull();
  });

  it.each([
    ["an outsider", "p-09"],
    ["a Program Read person", "p-07"],
    ["a holder of the company-wide grant", "p-02"],
  ])(
    "is not open to %s: the answer is the one a missing person gets",
    async (_who, id) => {
      who.id = id;
      const read = await record("p-03");
      expect(read.data).toBeNull();
      expect(read.error!.status).toBe(404);
    },
  );
});

describe("the manager's Completed view", () => {
  const team = async () => {
    const view = renderHook(() => useTeamCompleted("quarter", "2026-03-10"));
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    return view.result.current;
  };

  it("lists only the people the viewer leads", async () => {
    who.id = "p-01";
    const list = await team();
    expect(list.people.map((p) => p.employee.name)).toContain("Chidi Nwosu");
    for (const person of list.people) {
      expect(["p-03", "p-04", "p-09"]).toContain(person.employee.id);
    }
  });

  it("is empty for somebody who leads nobody, and for HR who is not a manager", async () => {
    who.id = "p-03";
    expect((await team()).people).toEqual([]);
    who.id = "p-77";
    who.hr = true;
    expect((await team()).people).toEqual([]);
  });
});

describe("work inside a review", () => {
  const work = async (subjectId: string, over = {}) => {
    const view = renderHook(() =>
      useWorkThisCycle({ subjectId, ...FIRST_HALF, ...over }),
    );
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    return view.result.current;
  };

  it("is the person's own, in their own review", async () => {
    const read = await work("p-03");
    expect(read.data!.summary.finished).toBeGreaterThan(2);
    expect(read.data!.summary.linked).toBeGreaterThan(0);
  });

  it("is there for their manager and for HR", async () => {
    who.id = "p-01";
    expect((await work("p-03")).data).not.toBeNull();
    who.id = "p-77";
    who.hr = true;
    expect((await work("p-03")).data).not.toBeNull();
  });

  it.each([
    ["an outsider", "p-09"],
    ["a Program Read person", "p-07"],
    ["a holder of the company-wide grant", "p-02"],
  ])("is not there for %s: nothing review-side", async (_who, id) => {
    who.id = id;
    const read = await work("p-03");
    expect(read.data).toBeNull();
    expect(read.error!.status).toBe(404);
  });

  it("is nothing for a cycle with no dates", async () => {
    const read = await work("p-03", { periodStart: null, periodEnd: null });
    expect(read.data).toBeNull();
    expect(read.error).toBeNull();
  });
});

describe("completed work under an objective", () => {
  const kpi = {
    id: "demo-goal-chidi-errors",
    ownerId: "p-03",
    parentId: "demo-goal-dept-eng",
    level: "personal" as const,
    reviewCycleId: "demo-cycle-h2",
  };

  const under = async () => {
    const view = renderHook(() =>
      useCompletedWork({ goal: kpi, enabled: true }),
    );
    await waitFor(() => expect(view.result.current.loading).toBe(false));
    return view.result.current.data!;
  };

  it("lists the owner's own tasks, and the ones linked above the KPI, marked", async () => {
    who.id = "p-01";
    const work = await under();
    const items = work.groups.flatMap((g) => g.items);
    expect(items.every((i) => i.personId === "p-03")).toBe(true);
    expect(items.some((i) => i.linkedAt === "department")).toBe(true);
    expect(items.some((i) => i.linkedAt === undefined)).toBe(true);
  });

  it("lists nobody's work for somebody who may not see the owner's", async () => {
    who.id = "p-09";
    expect((await under()).groups).toEqual([]);
  });

  it("asks nothing until it is wanted", () => {
    const view = renderHook(() =>
      useCompletedWork({ goal: kpi, enabled: false }),
    );
    expect(view.result.current).toMatchObject({ data: null, loading: false });
  });
});
