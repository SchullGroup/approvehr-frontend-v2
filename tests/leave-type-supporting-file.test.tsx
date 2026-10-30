import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { ToastProvider } from "@/components/ui";
import type { LeaveTypeRow } from "@/lib/api/leave";

/**
 * The leave type's supporting-file setting, on the Leave policies screen.
 *
 * Every field on that table saves as it changes, so what is checked is what is
 * *sent*: the policy alone when it changes, the number alone when it changes,
 * `null` for "any length". The API refuses a number under any policy but
 * Required and clears one itself when the policy moves off it, so sending both
 * would turn a harmless edit into a 422. And the old informational evidence
 * flag is not shown beside it, because two switches for one question is how a
 * screen contradicts itself.
 */

const mocks = vi.hoisted(() => ({
  types: vi.fn(),
  updateType: vi.fn(),
  storage: true as boolean | null,
}));

vi.mock("@/lib/api/leave", async (original) => ({
  ...(await original<typeof import("@/lib/api/leave")>()),
  leaveApi: {
    types: (...args: unknown[]) => mocks.types(...args),
    updateType: (...args: unknown[]) => mocks.updateType(...args),
  },
}));

vi.mock("@/lib/store/leave-files", () => ({
  useLeaveFileLimits: () => ({
    limits: null,
    storage: mocks.storage,
  }),
}));

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  usePermissions: () => ({
    can: () => true,
    loading: false,
    permissions: [],
  }),
}));

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({ isConnected: true, user: null, employeeId: null }),
  useOrgTimezone: () => "Africa/Lagos",
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings/leave",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/components/portal/shell", () => ({
  PageHeader: () => null,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/app/(app)/settings/leave/holidays-panel", () => ({
  HolidaysPanel: () => null,
}));

const { LeavePolicyForm } = await import("@/app/(app)/settings/leave/form");

const type = (over: Partial<LeaveTypeRow> = {}): LeaveTypeRow => ({
  id: "t-sick",
  name: "Sick",
  entitledDays: 10,
  accrual: "ANNUAL_UPFRONT",
  carryOverMax: 0,
  carryOverExpiresMonths: 0,
  requiresEvidence: true,
  minNoticeDays: 0,
  isPaid: true,
  eligibleGender: null,
  attachmentPolicy: "NONE",
  attachmentRequiredOverDays: null,
  ...over,
});

async function open(rows: LeaveTypeRow[]) {
  mocks.types.mockResolvedValue(rows);
  render(
    <ToastProvider>
      <LeavePolicyForm />
    </ToastProvider>,
  );
  await screen.findAllByLabelText("Sick supporting file");
  /* The table and the phone cards both render; the table is the first. */
  return screen.getAllByLabelText(
    "Sick supporting file",
  )[0] as HTMLSelectElement;
}

beforeEach(() => {
  mocks.types.mockReset();
  mocks.updateType.mockReset().mockResolvedValue({});
  mocks.storage = true;
});

describe("the supporting-file setting", () => {
  it("is a choice of not asked for, optional and required, set from the type", async () => {
    const select = await open([type({ attachmentPolicy: "OPTIONAL" })]);
    expect(select.value).toBe("OPTIONAL");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Not asked for", "Optional", "Required"]);
  });

  it("does not show the old evidence flag beside it", async () => {
    await open([type()]);
    expect(screen.queryByText("Evidence")).toBeNull();
    expect(screen.queryByText("Not required")).toBeNull();
  });

  it("sends the policy alone when it changes", async () => {
    const select = await open([type()]);
    fireEvent.change(select, { target: { value: "REQUIRED" } });
    await waitFor(() => expect(mocks.updateType).toHaveBeenCalledTimes(1));
    expect(mocks.updateType).toHaveBeenCalledWith("t-sick", {
      attachmentPolicy: "REQUIRED",
    });
  });

  it("asks 'after how many days' only under Required, and sends the number alone", async () => {
    const select = await open([type({ attachmentPolicy: "OPTIONAL" })]);
    expect(
      screen.queryAllByLabelText(/a supporting file after how many days/),
    ).toHaveLength(0);

    fireEvent.change(select, { target: { value: "REQUIRED" } });
    const days = (
      await screen.findAllByLabelText(/a supporting file after how many days/)
    )[0] as HTMLInputElement;
    mocks.updateType.mockClear();

    fireEvent.change(days, { target: { value: "2" } });
    await waitFor(() => expect(mocks.updateType).toHaveBeenCalledTimes(1));
    expect(mocks.updateType).toHaveBeenCalledWith("t-sick", {
      attachmentRequiredOverDays: 2,
    });
  });

  it("sends null for a request of any length, which is the only way to say so", async () => {
    await open([
      type({ attachmentPolicy: "REQUIRED", attachmentRequiredOverDays: 2 }),
    ]);
    const days = screen.getAllByLabelText(
      /a supporting file after how many days/,
    )[0] as HTMLInputElement;
    expect(days.value).toBe("2");

    fireEvent.change(days, { target: { value: "" } });
    await waitFor(() => expect(mocks.updateType).toHaveBeenCalledTimes(1));
    expect(mocks.updateType).toHaveBeenCalledWith("t-sick", {
      attachmentRequiredOverDays: null,
    });
  });

  it("moves off Required without mentioning the number, and drops it from the row", async () => {
    const select = await open([
      type({ attachmentPolicy: "REQUIRED", attachmentRequiredOverDays: 2 }),
    ]);
    fireEvent.change(select, { target: { value: "OPTIONAL" } });
    await waitFor(() => expect(mocks.updateType).toHaveBeenCalledTimes(1));
    /* A number under Optional is a 422, and the API clears it itself. */
    expect(mocks.updateType).toHaveBeenCalledWith("t-sick", {
      attachmentPolicy: "OPTIONAL",
    });
    await waitFor(() =>
      expect(
        screen.queryAllByLabelText(/a supporting file after how many days/),
      ).toHaveLength(0),
    );
  });

  it("shows the API's sentence and puts the row back when it is refused", async () => {
    mocks.updateType.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "A supporting file cannot be required on a server with no file storage.",
      ),
    );
    const select = await open([type()]);
    fireEvent.change(select, { target: { value: "REQUIRED" } });

    expect(
      await screen.findByText(/a server with no file storage/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        (
          screen.getAllByLabelText(
            "Sick supporting file",
          )[0] as HTMLSelectElement
        ).value,
      ).toBe("NONE"),
    );
  });
});

describe("on a server that cannot keep a file", () => {
  it("does not offer Required, and says why beside the heading", async () => {
    mocks.storage = false;
    const select = await open([type()]);
    const required = within(select).getByRole("option", { name: "Required" });
    expect((required as HTMLOptionElement).disabled).toBe(true);
    expect(
      screen.getAllByRole("button", {
        name: /cannot store files yet, so a supporting file cannot be required/,
      }).length,
    ).toBeGreaterThan(0);
  });

  it("keeps showing Required on a type that already is, rather than hiding a rule that is set", async () => {
    mocks.storage = false;
    const select = await open([
      type({ attachmentPolicy: "REQUIRED", attachmentRequiredOverDays: 2 }),
    ]);
    expect(select.value).toBe("REQUIRED");
    expect(
      (
        within(select).getByRole("option", {
          name: "Required",
        }) as HTMLOptionElement
      ).disabled,
    ).toBe(false);
  });

  it("does not disable anything while it is not known whether files can be kept", async () => {
    mocks.storage = null;
    const select = await open([type()]);
    expect(
      (
        within(select).getByRole("option", {
          name: "Required",
        }) as HTMLOptionElement
      ).disabled,
    ).toBe(false);
    expect(
      screen.queryByRole("button", { name: /cannot store files yet/ }),
    ).toBeNull();
  });
});
