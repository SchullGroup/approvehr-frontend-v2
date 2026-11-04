import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_BOOK } from "@/lib/projects/demo-book";
import type { WorkPage, WorkRow } from "@/lib/projects/programs";

/**
 * Pages of work, as the store asks for them.
 *
 * A "Load more" that asks the API for the same page twice shows every task in it
 * twice, and it did: the second request was started inside a state update, which
 * development runs twice. These run the hook under StrictMode, the way the app
 * runs in development, and hold it to one request per page and one row per task.
 */

const row = (n: number): WorkRow => ({
  id: `t${n}`,
  key: `CNT-${n}`,
  number: n,
  type: "TASK",
  title: `Task ${n}`,
  projectId: "pj",
  projectKey: "CNT",
  projectName: "Content",
  projectColor: "#000000",
  programId: null,
  programName: null,
  statusId: "s",
  statusName: "To do",
  statusCategory: "TODO",
  priority: "MEDIUM",
  assigneeId: null,
  assignees: [],
  parentId: null,
  epicId: null,
  labels: [],
  dueDate: null,
  dueTime: null,
  overdue: false,
  doneAt: null,
  createdAt: "",
  updatedAt: "",
});

const pages: WorkPage[] = [
  { rows: [row(1), row(2)], total: 5, hasMore: true, nextCursor: "c2" },
  { rows: [row(3), row(4)], total: 5, hasMore: true, nextCursor: "c3" },
  { rows: [row(5)], total: 5, hasMore: false, nextCursor: null },
];
const work = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/programs", () => ({ programsApi: { work } }));
vi.mock("@/lib/store/projects", () => ({
  useMode: () => ({
    connected: true,
    sessionLoading: false,
    owner: "api:org:me",
    actingId: "me",
    timeZone: "Africa/Lagos",
  }),
  useDemoBook: () => EMPTY_BOOK,
  demoRun: vi.fn(),
  refreshProject: vi.fn(),
  ok: (value: unknown) => ({ ok: true, value }),
  fail: (error: unknown) => ({ ok: false, message: "", error }),
}));
vi.mock("@/lib/store/project-session", () => ({
  usePeople: () => ({
    people: [],
    byId: new Map(),
    nameOf: () => "",
    loading: false,
  }),
  useProjectActor: () => ({
    employeeId: "me",
    editRecords: false,
    leadsPeople: false,
    headsDepartment: false,
  }),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ actingId: "me", isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => false }));
vi.mock("@/lib/revalidate", () => ({ useRevalidation: () => 0 }));
vi.mock("@/components/ui", () => ({ useToast: () => ({ push: vi.fn() }) }));

const { useWorkList } = await import("@/lib/store/programs");

beforeEach(() => {
  work.mockReset();
  work.mockImplementation(async (_q: unknown, cursor: string | null) =>
    cursor === null ? pages[0] : cursor === "c2" ? pages[1] : pages[2],
  );
});

const mount = () =>
  renderHook(() => useWorkList({ programId: "pg" }), { wrapper: StrictMode });

describe("useWorkList, connected", () => {
  it("brings the first page, with the server's total", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.rows.map((r) => r.id)).toEqual(["t1", "t2"]);
    expect(result.current.total).toBe(5);
    expect(result.current.hasMore).toBe(true);
  });

  it("asks for the next page once, however many times it is pressed", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(4));
    const asked = work.mock.calls.filter((c) => c[1] === "c2");
    expect(asked).toHaveLength(1);
    expect(result.current.rows.map((r) => r.id)).toEqual([
      "t1",
      "t2",
      "t3",
      "t4",
    ]);
  });

  it("walks every page with no row repeated, and stops at the end", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    for (let i = 0; i < 4 && result.current.hasMore; i++) {
      act(() => result.current.loadMore());
      await waitFor(() => expect(result.current.loadingMore).toBe(false));
    }
    expect(result.current.rows.map((r) => r.id)).toEqual([
      "t1",
      "t2",
      "t3",
      "t4",
      "t5",
    ]);
    expect(result.current.hasMore).toBe(false);
    act(() => result.current.loadMore());
    expect(work.mock.calls.filter((c) => c[1] === "c3")).toHaveLength(1);
  });

  it("keeps the rows it has, and says so, when a later page fails", async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    work.mockRejectedValueOnce(new Error("offline"));
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loadingMore).toBe(false));
    expect(result.current.rows).toHaveLength(2);
    expect(result.current.error).toBeInstanceOf(Error);
    /* Trying again asks for the same page, and works. */
    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.rows).toHaveLength(4));
  });
});
