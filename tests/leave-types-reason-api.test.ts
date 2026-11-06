import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Whether a leave type asks for a reason, below the screens.
 *
 * The one rule here is that a server that says nothing makes no claim. A type
 * from an API that predates the setting has `reasonRequired: null`, which is
 * not `false`: a screen reads `null` as "no switch to draw" and a booking form
 * as "do not hold the form", and reading it as `false` would put a switch over a
 * value nobody sent and write into nothing.
 */

const mocks = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  request: (...args: unknown[]) => mocks.request(...args),
}));

const { leaveApi } = await import("@/lib/api/leave");

const wireType = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  name: "Sick",
  entitledDays: 10,
  accrual: "ANNUAL_UPFRONT",
  carryOverMax: 0,
  carryOverExpiresMonths: 0,
  requiresEvidence: false,
  minNoticeDays: 0,
  isPaid: true,
  eligibleGender: null,
  attachmentPolicy: "OPTIONAL",
  attachmentRequiredOverDays: null,
  ...over,
});

beforeEach(() => mocks.request.mockReset());

describe("reading the setting", () => {
  it.each([
    [true, true],
    [false, false],
  ])("reads %s as %s", async (sent, expected) => {
    mocks.request.mockResolvedValue([wireType({ reasonRequired: sent })]);
    expect((await leaveApi.types())[0]!.reasonRequired).toBe(expected);
  });

  it("reads an absent setting as not known, never as false and never as true", async () => {
    mocks.request.mockResolvedValue([wireType()]);
    expect((await leaveApi.types())[0]!.reasonRequired).toBeNull();
  });

  it("does not take a value that is not a boolean for one", async () => {
    mocks.request.mockResolvedValue([
      wireType({ reasonRequired: "yes" }),
      wireType({ id: "t2", reasonRequired: 1 }),
      wireType({ id: "t3", reasonRequired: null }),
    ]);
    const rows = await leaveApi.types();
    expect(rows.map((row) => row.reasonRequired)).toEqual([null, null, null]);
  });
});

describe("writing it", () => {
  it("sends it when a type is added, with the file policy beside it and no number of days", async () => {
    mocks.request.mockResolvedValue(wireType({ reasonRequired: false }));
    await leaveApi.createType({
      name: "Study leave",
      entitledDays: 5,
      reasonRequired: false,
      attachmentPolicy: "OPTIONAL",
    });
    expect(mocks.request).toHaveBeenCalledWith("/leave/types", {
      method: "POST",
      body: {
        name: "Study leave",
        entitledDays: 5,
        reasonRequired: false,
        attachmentPolicy: "OPTIONAL",
      },
    });
  });

  it("sends false, which is a real answer, as well as true", async () => {
    mocks.request.mockResolvedValue(wireType());
    await leaveApi.updateType("t1", { reasonRequired: false });
    expect(mocks.request).toHaveBeenCalledWith("/leave/types/t1", {
      method: "PATCH",
      body: { reasonRequired: false },
    });
  });

  it("returns the row the server answered with, setting included", async () => {
    mocks.request.mockResolvedValue(wireType({ reasonRequired: true }));
    expect(
      (await leaveApi.updateType("t1", { reasonRequired: true }))
        .reasonRequired,
    ).toBe(true);
  });
});
