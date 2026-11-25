import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiLoan, ApiLoanDetail } from "@/lib/api/loans";

/**
 * What `usePersonLoans` asks for, and what it hands the page.
 *
 * Connected, `loansApi` is replaced so the test sees exactly what is asked and
 * decides when each answer arrives. Demo mode uses the real seeded book.
 */

const session = vi.hoisted(() => ({ isConnected: true }));

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    employeeId: "p-02",
    actingId: "p-02",
    isConnected: session.isConnected,
    organization: { timezone: "Africa/Lagos" },
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const list = vi.hoisted(() => vi.fn());
const mine = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/loans", async (original) => ({
  ...(await original<typeof import("@/lib/api/loans")>()),
  loansApi: {
    ...(await original<typeof import("@/lib/api/loans")>()).loansApi,
    list,
    mine,
    get,
  },
}));

const { usePersonLoans } = await import("@/lib/store/loans");

const row = (
  id: string,
  status: ApiLoan["status"] = "ACTIVE",
  over: Partial<ApiLoan> = {},
): ApiLoan =>
  ({
    id,
    employeeId: "e1",
    employeeName: "Chinedu Okwu",
    employeeNo: "EMP-1",
    jobTitle: "Welder",
    status,
    principalKobo: 100,
    createdAt: "2026-06-01T00:00:00.000Z",
    ...over,
  }) as ApiLoan;

const detail = (loan: ApiLoan): ApiLoanDetail =>
  ({ ...loan, schedule: [], progress: {} }) as unknown as ApiLoanDetail;

const answer = (loans: ApiLoan[], total = loans.length) => ({
  data: loans,
  meta: { total, page: 1, pageSize: 100 },
});

/** The list endpoint, answering by the status that was asked for. */
function book(
  live: ApiLoan[],
  folded: ApiLoan[] = [],
  liveTotal = live.length,
) {
  const answering = (params: { status?: string }) =>
    Promise.resolve(
      params.status === "CONSOLIDATED"
        ? answer(folded)
        : answer(live, liveTotal),
    );
  list.mockImplementation(answering);
  mine.mockImplementation(answering);
  get.mockImplementation((id: string) => {
    const found = [...live, ...folded].find((loan) => loan.id === id);
    return Promise.resolve(detail(found ?? row(id)));
  });
}

beforeEach(() => {
  session.isConnected = true;
  list.mockReset();
  mine.mockReset();
  get.mockReset();
});

describe("connected", () => {
  it("asks for this person's loans and for the folded ones by name", async () => {
    book([row("a"), row("b")]);
    const { result } = renderHook(() => usePersonLoans("e1", "a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const asked = list.mock.calls.map(
      (call) => call[0] as Record<string, unknown>,
    );
    expect(asked).toContainEqual(
      expect.objectContaining({ employeeId: "e1", pageSize: 100 }),
    );
    expect(asked.filter((p) => p.status === undefined)).toHaveLength(1);
    expect(asked).toContainEqual(
      expect.objectContaining({ employeeId: "e1", status: "CONSOLIDATED" }),
    );
  });

  it("reads the signed-in person's own loans through /loans/me, which an employee may read", async () => {
    book([
      row("a", "ACTIVE", { employeeId: "p-02" }),
      row("b", "PENDING", { employeeId: "p-02" }),
    ]);
    const { result } = renderHook(() => usePersonLoans("p-02", "a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    /* Listing the book is `VIEW_SALARIES`'s, so asking for it would be a 403. */
    expect(list).not.toHaveBeenCalled();
    expect(mine.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ employeeId: "p-02", pageSize: 100 }),
        expect.objectContaining({ employeeId: "p-02", status: "CONSOLIDATED" }),
      ]),
    );
    expect(result.current.others?.map((loan) => loan.id)).toEqual(["b"]);
  });

  it("reads somebody else's loans through the book, and never /loans/me", async () => {
    book([row("a"), row("b")]);
    const { result } = renderHook(() => usePersonLoans("e1", "a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mine).not.toHaveBeenCalled();
    expect(list).toHaveBeenCalled();
  });

  it("reads each other loan for its schedule and never the one already open", async () => {
    book([row("a"), row("b"), row("c")]);
    const { result } = renderHook(() => usePersonLoans("e1", "a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(get.mock.calls.map((call) => call[0]).sort()).toEqual(["b", "c"]);
    expect(result.current.others?.map((loan) => loan.id).sort()).toEqual([
      "b",
      "c",
    ]);
  });

  it("is loading, with nothing to show, until the answer lands", async () => {
    let release!: (value: ReturnType<typeof answer>) => void;
    list.mockReturnValue(
      new Promise((done) => {
        release = done;
      }),
    );
    const { result } = renderHook(() => usePersonLoans("e1", "a"));

    expect(result.current.loading).toBe(true);
    expect(result.current.others).toBeNull();

    book([row("a")]);
    await act(async () => {
      release(answer([row("a")]));
    });
  });

  it("hands over the folded loans as rows, without reading each one", async () => {
    book([row("a")], [row("old", "CONSOLIDATED")]);
    const { result } = renderHook(() => usePersonLoans("e1", "a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.folded.map((loan) => loan.id)).toEqual(["old"]);
    expect(get).not.toHaveBeenCalledWith("old", expect.anything());
  });

  it("does not list the opened loan among the folded ones when it is one", async () => {
    book(
      [row("a")],
      [row("old", "CONSOLIDATED"), row("older", "CONSOLIDATED")],
    );
    const { result } = renderHook(() => usePersonLoans("e1", "old"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.folded.map((loan) => loan.id)).toEqual(["older"]);
  });

  it("orders the others with a waiting loan first and says how many it left off", async () => {
    const many = [
      row("settled", "SETTLED"),
      row("pending", "PENDING"),
      ...Array.from({ length: 22 }, (_, n) =>
        row(`s${String(n)}`, "SETTLED", {
          createdAt: `2026-01-${String(n + 1).padStart(2, "0")}T00:00:00.000Z`,
        }),
      ),
    ];
    book(many);
    const { result } = renderHook(() => usePersonLoans("e1", "opened"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.others?.[0]?.id).toBe("pending");
    expect(result.current.others).toHaveLength(19);
    /* 24 loans, none of them the opened one, 19 shown. */
    expect(result.current.leftOff).toBe(5);
  });

  it("reports a failed read, with nothing shown as though nothing were there", async () => {
    const { ApiError } = await import("@/lib/api/client");
    list.mockRejectedValue(new ApiError(500, "server_error", "It broke."));
    const { result } = renderHook(() => usePersonLoans("e1", "a"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error?.message).toBe("It broke.");
    expect(result.current.others).toEqual([]);
  });

  it("asks nothing until it knows whose loans to ask for", () => {
    const { result } = renderHook(() => usePersonLoans(null, "a"));
    expect(list).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ others: null, loading: false });
  });

  it("shows nothing for somebody else's loans when the person changes", async () => {
    book([row("a"), row("b")]);
    const { result, rerender } = renderHook(
      ({ who, opened }: { who: string; opened: string }) =>
        usePersonLoans(who, opened),
      { initialProps: { who: "e1", opened: "a" } },
    );
    await waitFor(() => expect(result.current.others).not.toBeNull());

    list.mockReturnValue(new Promise(() => {}));
    rerender({ who: "e2", opened: "z" });

    expect(result.current.others).toBeNull();
    expect(result.current.loading).toBe(true);
  });
});

describe("demo", () => {
  it("answers at once from the book, without asking the API", async () => {
    session.isConnected = false;
    const { result } = renderHook(() => usePersonLoans("p-02", "none"));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(Array.isArray(result.current.others)).toBe(true);
    expect(list).not.toHaveBeenCalled();
  });
});
