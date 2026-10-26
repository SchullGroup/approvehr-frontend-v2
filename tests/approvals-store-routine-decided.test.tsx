import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ApprovalRow } from "@/lib/api/approvals";
import { ApiError } from "@/lib/api/client";
import type { QueueFilters } from "@/lib/store/approvals-api";

/**
 * What the approvals store hands the inbox: the rows "approve routine" counts,
 * what it sends when pressed, and the Decided view's list.
 *
 * The sweep used to be told nothing: the server decided whatever it thought
 * routine, which was more than the button had counted. Now the press carries the
 * counted ids, and nothing else.
 */

const list: Mock<(...args: unknown[]) => Promise<unknown>> = vi.fn();
const summary: Mock<(...args: unknown[]) => Promise<unknown>> = vi.fn();
const approveSelected: Mock<(...args: unknown[]) => Promise<unknown>> = vi.fn();

vi.mock("@/lib/api/approvals", async (original) => ({
  ...(await original<typeof import("@/lib/api/approvals")>()),
  approvalsApi: {
    list: (...args: unknown[]) => list(...args),
    summary: (...args: unknown[]) => summary(...args),
    approveSelected: (...args: unknown[]) => approveSelected(...args),
  },
}));
vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const { useApprovalQueue, useDecidedApprovals } =
  await import("@/lib/store/approvals-api");

const wire = (id: string, extra: Partial<ApprovalRow> = {}): ApprovalRow => ({
  id,
  kind: "record_change",
  kindLabel: "Record change",
  subjectType: "employees",
  subjectId: id,
  title: `Row ${id}`,
  summary: null,
  amount: null,
  deadlineAt: null,
  status: "pending",
  requestedAt: "2026-10-20",
  waitingDays: 1,
  decidedAt: null,
  decisionNote: null,
  ...extra,
});

const NONE: QueueFilters = { module: "all", from: "", to: "", archived: false };

beforeEach(() => {
  list.mockReset();
  summary.mockReset();
  approveSelected.mockReset();
  summary.mockResolvedValue({
    pending: 3,
    withDeadline: 1,
    ageing: 1,
    atStake: 0,
    byKind: {},
  });
});

describe("approve routine, from the store", () => {
  const load = async () => {
    list.mockResolvedValue({
      rows: [
        wire("ap1"),
        wire("ap2", { deadlineAt: "2099-01-01T00:00:00.000Z" }),
        wire("ap3", { waitingDays: 6 }),
      ],
      total: 3,
    });
    const hook = renderHook(() => useApprovalQueue(NONE));
    await waitFor(() => expect(hook.result.current.items).toHaveLength(3));
    return hook;
  };

  it("counts only what has no deadline and has waited under five days", async () => {
    const { result } = await load();

    expect(result.current.routine.map((item) => item.id)).toEqual(["ap1"]);
    expect(result.current.routineCount).toBe(1);
  });

  it("sends the ids it was given, and only those", async () => {
    approveSelected.mockResolvedValue({
      decided: 1,
      decidedIds: ["ap1"],
      skipped: [],
    });
    const { result } = await load();

    let outcome: Awaited<ReturnType<typeof result.current.approveRoutine>>;
    await act(async () => {
      outcome = await result.current.approveRoutine(result.current.routine);
    });

    expect(approveSelected).toHaveBeenCalledTimes(1);
    expect(approveSelected).toHaveBeenCalledWith(["ap1"]);
    expect(outcome!).toEqual({ decided: 1, skipped: [] });
  });

  it("hands back the server's reasons for the ones it left", async () => {
    approveSelected.mockResolvedValue({
      decided: 0,
      decidedIds: [],
      skipped: [{ id: "ap1", reason: "You put that one in My archive." }],
    });
    const { result } = await load();

    let outcome: Awaited<ReturnType<typeof result.current.approveRoutine>>;
    await act(async () => {
      outcome = await result.current.approveRoutine(result.current.routine);
    });

    expect(outcome!.skipped).toEqual([
      { id: "ap1", reason: "You put that one in My archive." },
    ]);
  });

  it("asks the server nothing when there is nothing to send", async () => {
    const { result } = await load();

    await act(async () => {
      await result.current.approveRoutine([]);
    });

    expect(approveSelected).not.toHaveBeenCalled();
  });
});

describe("the Decided list", () => {
  it("asks for one outcome at a time, with the module and dates", async () => {
    list.mockResolvedValue({
      rows: [wire("d1", { status: "approved" })],
      total: 1,
    });

    const { result } = renderHook(() =>
      useDecidedApprovals(
        "approved",
        { ...NONE, module: "leave", from: "2026-10-01", to: "2026-10-31" },
        true,
      ),
    );

    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    expect(list).toHaveBeenCalledWith({
      status: "approved",
      module: "leave",
      from: "2026-10-01",
      to: "2026-10-31",
      pageSize: 100,
    });
  });

  it("asks for nothing while the view is not showing", () => {
    renderHook(() => useDecidedApprovals("approved", NONE, false));

    expect(list).not.toHaveBeenCalled();
  });

  it("never leaves the approved rows under the declined choice while it loads", async () => {
    let finish!: (value: unknown) => void;
    list.mockResolvedValueOnce({
      rows: [wire("d1", { status: "approved" })],
      total: 1,
    });
    const { result, rerender } = renderHook(
      ({ outcome }: { outcome: "approved" | "declined" }) =>
        useDecidedApprovals(outcome, NONE, true),
      { initialProps: { outcome: "approved" as "approved" | "declined" } },
    );
    await waitFor(() => expect(result.current.rows).toHaveLength(1));

    list.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    rerender({ outcome: "declined" });

    expect(result.current.rows).toEqual([]);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      finish({ rows: [wire("d2", { status: "declined" })], total: 1 });
    });
    await waitFor(() =>
      expect(result.current.rows.map((row) => row.id)).toEqual(["d2"]),
    );
    expect(result.current.loading).toBe(false);
  });

  it("reports a failure with the server's own error and no rows", async () => {
    list.mockRejectedValue(new ApiError(500, "boom", "Something broke."));

    const { result } = renderHook(() =>
      useDecidedApprovals("approved", NONE, true),
    );

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe("Something broke.");
    expect(result.current.rows).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
