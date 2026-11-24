/**
 * U22 (SELF-6): a manager deciding a request was told "Who else is off is not
 * shown to you" and saw no balance. The API now sends a manager the balance and
 * who else in their own team is off, and says so with `clashesAmong: "team"`.
 * Without that field the reduced read is still withheld, as before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  request: (...args: unknown[]) => mocks.request(...args),
}));

const { leaveApi } = await import("@/lib/api/leave");

const wireRequest = {
  id: "r1",
  employeeId: "e1",
  employeeName: "Chidi Nwosu",
  employeeJobTitle: null,
  leaveTypeId: "t1",
  leaveType: "Annual",
  startDate: "2026-11-15",
  endDate: "2026-11-24",
  days: 6,
  reason: "Family wedding",
  status: "PENDING",
  approverId: null,
  requestedAt: "2026-11-01T09:00:00Z",
  decidedAt: null,
  decidedById: null,
  decidedByName: null,
  decidedByJobTitle: null,
  decisionNote: null,
};

const balance = {
  leaveTypeId: "t1",
  leaveType: "Annual",
  year: 2026,
  entitled: 20,
  openingTaken: 0,
  carriedIn: 0,
  taken: 6,
  pending: 6,
  remaining: 8,
};

beforeEach(() => mocks.request.mockReset());

describe("a manager's read of a request", () => {
  it("shows who else in their team is off, and the balance", async () => {
    mocks.request.mockResolvedValue({
      ...wireRequest,
      reduced: true,
      clashesAmong: "team",
      clashes: [
        {
          id: "r2",
          employeeId: "e2",
          employeeName: "Emeka Anyanwu",
          startDate: "2026-11-18",
          endDate: "2026-11-19",
          status: "APPROVED",
        },
      ],
      balance,
    });
    const detail = await leaveApi.get("r1");
    expect(detail.clashesAmong).toBe("team");
    expect(detail.clashes?.map((c) => c.employeeName)).toEqual([
      "Emeka Anyanwu",
    ]);
    expect(detail.balance?.remaining).toBe(8);
  });

  it("reads an empty team list as nobody else in the team", async () => {
    mocks.request.mockResolvedValue({
      ...wireRequest,
      reduced: true,
      clashesAmong: "team",
      clashes: [],
      balance: null,
    });
    const detail = await leaveApi.get("r1");
    expect(detail.clashes).toEqual([]);
  });

  it("keeps an older server's reduced read withheld", async () => {
    mocks.request.mockResolvedValue({
      ...wireRequest,
      reduced: true,
      clashes: [],
      balance,
    });
    const detail = await leaveApi.get("r1");
    expect(detail.clashes).toBeNull();
    expect(detail.balance).toBeNull();
    expect(detail.clashesAmong).toBeNull();
  });
});
