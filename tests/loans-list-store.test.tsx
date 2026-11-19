import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiLoan } from "@/lib/api/loans";
import { groupLoansByPerson } from "@/lib/loans/group";

/**
 * What `useLoans` hands the staff loans list: the search it forwards, the rows it
 * holds while a search is answered, and the demo book the list groups.
 *
 * Connected, `loansApi.list` is replaced so the test sees exactly what is asked
 * and decides when each answer arrives. Demo mode uses the real seeded book.
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

vi.mock("@/lib/api/loans", async (original) => ({
  ...(await original<typeof import("@/lib/api/loans")>()),
  loansApi: {
    ...(await original<typeof import("@/lib/api/loans")>()).loansApi,
    list,
  },
}));

const { useLoans } = await import("@/lib/store/loans");

const row = (id: string, name: string): ApiLoan =>
  ({
    id,
    employeeId: `e-${name}`,
    employeeName: name,
    employeeNo: "CRF-1",
    jobTitle: "Engineer",
    status: "ACTIVE",
    principalKobo: 100,
    createdAt: "2026-06-01T00:00:00.000Z",
  }) as ApiLoan;

/** A request whose answer the test decides when to give. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const answer = (loans: ApiLoan[], total = loans.length) => ({
  data: loans,
  meta: { total, page: 1, pageSize: 200 },
});

beforeEach(() => {
  session.isConnected = true;
  list.mockReset();
});

describe("connected", () => {
  it("sends the search to the API as q, and nothing when there is none", async () => {
    list.mockResolvedValue(answer([row("l1", "Ime")]));

    const { result, rerender } = renderHook(
      ({ q }: { q?: string }) =>
        useLoans({ scope: "all", pageSize: 200, ...(q ? { q } : {}) }),
      { initialProps: {} as { q?: string } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(list.mock.calls[0]![0]).not.toHaveProperty("q");

    rerender({ q: "ime" });
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    expect(list.mock.calls[1]![0]).toMatchObject({ q: "ime", pageSize: 200 });
  });

  it("shows nothing while a new search is asked for, unless told to keep the rows", async () => {
    list.mockResolvedValueOnce(answer([row("l1", "Ime")]));
    const next = deferred<ReturnType<typeof answer>>();
    list.mockReturnValueOnce(next.promise);

    const { result, rerender } = renderHook(
      ({ q }: { q?: string }) =>
        useLoans({ scope: "all", ...(q ? { q } : {}) }),
      { initialProps: {} as { q?: string } },
    );
    await waitFor(() => expect(result.current.loans).toHaveLength(1));

    rerender({ q: "x" });

    expect(result.current.loading).toBe(true);
    expect(result.current.loans).toEqual([]);
  });

  it("keeps the rows on screen while a new search is asked for", async () => {
    list.mockResolvedValueOnce(answer([row("l1", "Ime")], 450));
    const next = deferred<ReturnType<typeof answer>>();
    list.mockReturnValueOnce(next.promise);

    const { result, rerender } = renderHook(
      ({ q }: { q?: string }) =>
        useLoans({ scope: "all", keepPrevious: true, ...(q ? { q } : {}) }),
      { initialProps: {} as { q?: string } },
    );
    await waitFor(() => expect(result.current.loans).toHaveLength(1));

    rerender({ q: "ime" });

    /* Still asking, still showing what it had, and counting what it had. */
    expect(result.current.loading).toBe(true);
    expect(result.current.loans.map((l) => l.id)).toEqual(["l1"]);
    expect(result.current.total).toBe(450);

    await act(async () => {
      next.resolve(answer([row("l2", "Ime Dennis")], 1));
      await next.promise;
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loans.map((l) => l.id)).toEqual(["l2"]);
    expect(result.current.total).toBe(1);
  });

  it("does not keep rows that answer a narrower question than the one now asked", async () => {
    list.mockResolvedValueOnce(answer([row("l1", "Ime")], 450));
    list.mockResolvedValueOnce(answer([row("l2", "Ime Dennis")], 1));
    list.mockReturnValueOnce(deferred<ReturnType<typeof answer>>().promise);

    const { result, rerender } = renderHook(
      ({ q }: { q?: string }) =>
        useLoans({ scope: "all", keepPrevious: true, ...(q ? { q } : {}) }),
      { initialProps: {} as { q?: string } },
    );
    await waitFor(() => expect(result.current.loans).toHaveLength(1));
    rerender({ q: "ime dennis" });
    await waitFor(() => expect(result.current.total).toBe(1));

    /* Cleared: the answer in hand is one person, and the book is 450 loans. */
    rerender({});

    expect(result.current.loading).toBe(true);
    expect(result.current.loans).toEqual([]);
  });

  it("keeps the rows as more of the search is typed", async () => {
    list.mockResolvedValueOnce(answer([row("l1", "Ime")], 450));
    list.mockResolvedValueOnce(answer([row("l2", "Ime Dennis")], 2));
    list.mockReturnValueOnce(deferred<ReturnType<typeof answer>>().promise);

    const { result, rerender } = renderHook(
      ({ q }: { q?: string }) =>
        useLoans({ scope: "all", keepPrevious: true, ...(q ? { q } : {}) }),
      { initialProps: {} as { q?: string } },
    );
    await waitFor(() => expect(result.current.loans).toHaveLength(1));
    rerender({ q: "ime" });
    await waitFor(() => expect(result.current.total).toBe(2));

    rerender({ q: "ime d" });

    expect(result.current.loading).toBe(true);
    expect(result.current.loans.map((l) => l.id)).toEqual(["l2"]);
  });

  it("does not keep the rows when something other than the search changed", async () => {
    list.mockResolvedValueOnce(answer([row("l1", "Ime")]));
    list.mockReturnValueOnce(deferred<ReturnType<typeof answer>>().promise);

    const { result, rerender } = renderHook(
      ({ status }: { status?: "SETTLED" }) =>
        useLoans({
          scope: "all",
          keepPrevious: true,
          ...(status ? { status } : {}),
        }),
      { initialProps: {} as { status?: "SETTLED" } },
    );
    await waitFor(() => expect(result.current.loans).toHaveLength(1));

    /* Another tab is another question: its rows are not these. */
    rerender({ status: "SETTLED" });

    expect(result.current.loading).toBe(true);
    expect(result.current.loans).toEqual([]);
  });
});

describe("the demo book", () => {
  beforeEach(() => {
    session.isConnected = false;
  });

  it("has somebody with two loans, so the list has a person to group", () => {
    const { result } = renderHook(() => useLoans({ scope: "all" }));

    const musa = groupLoansByPerson(result.current.loans).find(
      (person) => person.employeeId === "p-07",
    );
    expect(musa?.count).toBe(2);
    expect(musa?.loans.map((loan) => loan.id)).toEqual([
      "loan-0006",
      "loan-0004",
    ]);
    expect(musa?.counts).toMatchObject({ ACTIVE: 1, SETTLED: 1 });
  });

  it("leaves the original loans as they were", () => {
    const { result } = renderHook(() => useLoans({ scope: "all" }));

    const first = result.current.loans.find((loan) => loan.id === "loan-0001");
    expect(first).toMatchObject({
      employeeId: "p-03",
      principalKobo: 60_000_000,
      outstandingKobo: 28_800_000,
    });
    expect(result.current.total).toBe(6);
  });

  it("filters on q the way the server will, name or staff number", () => {
    const named = renderHook(() => useLoans({ scope: "all", q: "musa ibra" }));
    expect(named.result.current.loans.map((l) => l.id).sort()).toEqual([
      "loan-0004",
      "loan-0006",
    ]);

    const nobody = renderHook(() => useLoans({ scope: "all", q: "zzzz" }));
    expect(nobody.result.current.loans).toEqual([]);
    expect(nobody.result.current.total).toBe(0);
  });
});
