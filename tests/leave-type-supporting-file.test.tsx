import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import { ToastProvider } from "@/components/ui";
import type { LeaveTypeRow } from "@/lib/api/leave";
import type { LeaveFileLimits } from "@/lib/api/leave-files";

/**
 * The leave type's two settings on the Leave policies screen: whether a
 * supporting file is required, and whether a reason is.
 *
 * Every field on that table saves as it changes, so what is checked is what is
 * *sent*: the policy alone when it changes (and `OPTIONAL`, never `NONE`, when it
 * is switched off), the number alone when it changes, `null` for "any length",
 * and the reason switch alone. The API refuses a number under any policy but
 * Required and clears one itself when the policy moves off it, so sending both
 * would turn a harmless edit into a 422. The old informational evidence flag is
 * not shown beside it, because two switches for one question is how a screen
 * contradicts itself. And a setting the server did not send gets **no switch**:
 * a switch over nothing would write into nothing.
 */

const mocks = vi.hoisted(() => ({
  types: vi.fn(),
  updateType: vi.fn(),
  limits: null as unknown,
  connected: true,
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
    limits: mocks.limits,
    storage: null,
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
  useSession: () => ({
    isConnected: mocks.connected,
    user: null,
    employeeId: null,
  }),
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

const limits = (over: Partial<LeaveFileLimits> = {}): LeaveFileLimits => ({
  maxFiles: 5,
  maxBytes: 5 * 1024 * 1024,
  storage: true,
  types: [
    { contentType: "application/pdf", label: "PDF", extensions: [".pdf"] },
    { contentType: "image/png", label: "PNG", extensions: [".png"] },
    { contentType: "image/jpeg", label: "JPEG", extensions: [".jpg", ".jpeg"] },
  ],
  ...over,
});

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
  reasonRequired: true,
  ...over,
});

const FILE_SWITCH = "Sick supporting file required";
const REASON_SWITCH = "Sick reason required";
const AFTER_DAYS = /a supporting file after how many days/;

async function open(rows: LeaveTypeRow[]) {
  mocks.types.mockResolvedValue(rows);
  render(
    <ToastProvider>
      <LeavePolicyForm />
    </ToastProvider>,
  );
  await screen.findAllByLabelText(FILE_SWITCH);
}

/** Opens the phone card for a type: it mounts its fields only once open. */
const openCard = () =>
  fireEvent.click(
    screen.getByRole("button", {
      name: /^Sick.*days a year/,
      expanded: false,
    }),
  );

/** The table's copy of a control: the phone cards render a second one. */
const table = (label: string | RegExp) =>
  screen.getAllByLabelText(label)[0] as HTMLInputElement;

beforeEach(() => {
  mocks.types.mockReset();
  mocks.updateType.mockReset().mockResolvedValue({});
  mocks.limits = limits();
  mocks.connected = true;
});

afterEach(() => vi.unstubAllEnvs());

describe("the supporting-file switch", () => {
  it("is on for a type that requires one", async () => {
    await open([type({ attachmentPolicy: "REQUIRED" })]);
    expect(table(FILE_SWITCH).checked).toBe(true);
  });

  it.each(["OPTIONAL", "NONE"] as const)(
    "reads %s as off: the product never told them apart",
    async (attachmentPolicy) => {
      await open([type({ attachmentPolicy })]);
      expect(table(FILE_SWITCH).checked).toBe(false);
    },
  );

  it("does not show the old evidence flag beside it", async () => {
    await open([type()]);
    expect(screen.queryByText("Evidence")).toBeNull();
    expect(screen.queryByText("Not required")).toBeNull();
  });

  it("sends REQUIRED alone when it is switched on", async () => {
    await open([type()]);
    fireEvent.click(table(FILE_SWITCH));
    await waitFor(() => expect(mocks.updateType).toHaveBeenCalledTimes(1));
    expect(mocks.updateType).toHaveBeenCalledWith("t-sick", {
      attachmentPolicy: "REQUIRED",
    });
  });

  it("sends OPTIONAL, never NONE, when it is switched off", async () => {
    await open([
      type({ attachmentPolicy: "REQUIRED", attachmentRequiredOverDays: 2 }),
    ]);
    fireEvent.click(table(FILE_SWITCH));
    await waitFor(() => expect(mocks.updateType).toHaveBeenCalledTimes(1));
    /* A number under Optional is a 422, and the API clears it itself. */
    expect(mocks.updateType).toHaveBeenCalledWith("t-sick", {
      attachmentPolicy: "OPTIONAL",
    });
  });

  it("asks 'after how many days' only while on, and sends the number alone", async () => {
    await open([type({ attachmentPolicy: "OPTIONAL" })]);
    expect(screen.queryAllByLabelText(AFTER_DAYS)).toHaveLength(0);

    fireEvent.click(table(FILE_SWITCH));
    const days = (
      await screen.findAllByLabelText(AFTER_DAYS)
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
    const days = screen.getAllByLabelText(AFTER_DAYS)[0] as HTMLInputElement;
    expect(days.value).toBe("2");

    fireEvent.change(days, { target: { value: "" } });
    await waitFor(() => expect(mocks.updateType).toHaveBeenCalledTimes(1));
    expect(mocks.updateType).toHaveBeenCalledWith("t-sick", {
      attachmentRequiredOverDays: null,
    });
  });

  it("drops the number from the row when it is switched off", async () => {
    await open([
      type({ attachmentPolicy: "REQUIRED", attachmentRequiredOverDays: 2 }),
    ]);
    fireEvent.click(table(FILE_SWITCH));
    await waitFor(() =>
      expect(screen.queryAllByLabelText(AFTER_DAYS)).toHaveLength(0),
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
    await open([type()]);
    fireEvent.click(table(FILE_SWITCH));

    expect(
      await screen.findByText(/a server with no file storage/),
    ).toBeInTheDocument();
    await waitFor(() => expect(table(FILE_SWITCH).checked).toBe(false));
  });

  it("is in the phone card too, with its own words", async () => {
    await open([type({ attachmentPolicy: "REQUIRED" })]);
    openCard();
    /* Two copies of the same control: one in the table, one in the card. */
    const copies = screen.getAllByLabelText(FILE_SWITCH);
    expect(copies).toHaveLength(2);
    expect(
      screen.getAllByText("Supporting file required").length,
    ).toBeGreaterThan(0);
    fireEvent.click(copies[1]!);
    await waitFor(() => expect(mocks.updateType).toHaveBeenCalledTimes(1));
    expect(mocks.updateType).toHaveBeenCalledWith("t-sick", {
      attachmentPolicy: "OPTIONAL",
    });
  });
});

describe("where a file cannot be attached at all", () => {
  it("does not let it be switched on, and says why beside the switch, in words", async () => {
    mocks.limits = limits({ storage: false });
    await open([type()]);
    expect(table(FILE_SWITCH).disabled).toBe(true);
    /* Plain text on the row, not behind an icon. */
    expect(
      screen.getAllByText(
        "This server cannot store files yet, so a file cannot be required.",
      ).length,
    ).toBeGreaterThan(0);
  });

  it("keeps showing a type that is already required as on, and lets it be switched off", async () => {
    mocks.limits = limits({ storage: false });
    await open([
      type({ attachmentPolicy: "REQUIRED", attachmentRequiredOverDays: 2 }),
    ]);
    expect(table(FILE_SWITCH).checked).toBe(true);
    expect(table(FILE_SWITCH).disabled).toBe(false);
    expect(screen.queryByText(/cannot store files yet/)).toBeNull();
  });

  it("does not disable anything while it is not known whether files can be kept", async () => {
    mocks.limits = null;
    await open([type()]);
    expect(table(FILE_SWITCH).disabled).toBe(false);
    expect(screen.queryByText(/cannot store files yet/)).toBeNull();
  });

  it("allows it where the server takes links and this build is set up to send them", async () => {
    vi.stubEnv(
      "NEXT_PUBLIC_LINKED_UPLOAD_URL",
      "https://uploader.example.test/prod",
    );
    mocks.limits = limits({ storage: false, links: true });
    await open([type()]);
    expect(table(FILE_SWITCH).disabled).toBe(false);
    expect(screen.queryByText(/cannot store files yet/)).toBeNull();
  });

  it("does not allow it where the server takes links and this build has nowhere to send them", async () => {
    vi.stubEnv("NEXT_PUBLIC_LINKED_UPLOAD_URL", "");
    mocks.limits = limits({ storage: false, links: true });
    await open([type()]);
    expect(table(FILE_SWITCH).disabled).toBe(true);
  });
});

describe("the reason switch", () => {
  it("shows what the server says, on and off", async () => {
    await open([
      type({ reasonRequired: true }),
      type({ id: "t-annual", name: "Annual", reasonRequired: false }),
    ]);
    expect(table(REASON_SWITCH).checked).toBe(true);
    expect(table("Annual reason required").checked).toBe(false);
  });

  it("sends the reason alone when it changes", async () => {
    await open([type({ reasonRequired: true })]);
    fireEvent.click(table(REASON_SWITCH));
    await waitFor(() => expect(mocks.updateType).toHaveBeenCalledTimes(1));
    expect(mocks.updateType).toHaveBeenCalledWith("t-sick", {
      reasonRequired: false,
    });
  });

  it("sends true when it is switched on", async () => {
    await open([type({ reasonRequired: false })]);
    fireEvent.click(table(REASON_SWITCH));
    await waitFor(() => expect(mocks.updateType).toHaveBeenCalledTimes(1));
    expect(mocks.updateType).toHaveBeenCalledWith("t-sick", {
      reasonRequired: true,
    });
  });

  it("puts the row back and says the API's sentence when it is refused", async () => {
    mocks.updateType.mockRejectedValue(
      new ApiError(403, "forbidden", "You cannot change leave settings."),
    );
    await open([type({ reasonRequired: true })]);
    fireEvent.click(table(REASON_SWITCH));
    expect(
      await screen.findByText("You cannot change leave settings."),
    ).toBeInTheDocument();
    await waitFor(() => expect(table(REASON_SWITCH).checked).toBe(true));
  });

  it("is in the phone card with its own words", async () => {
    await open([type({ reasonRequired: true })]);
    openCard();
    const copies = screen.getAllByLabelText(REASON_SWITCH);
    expect(copies).toHaveLength(2);
    expect(screen.getAllByText("Reason required").length).toBeGreaterThan(0);
    fireEvent.click(copies[1]!);
    await waitFor(() => expect(mocks.updateType).toHaveBeenCalledTimes(1));
    expect(mocks.updateType).toHaveBeenCalledWith("t-sick", {
      reasonRequired: false,
    });
  });

  it("has no switch where the server did not send the setting, rather than one showing a default nobody chose", async () => {
    await open([type({ reasonRequired: null })]);
    openCard();
    expect(screen.queryAllByLabelText(REASON_SWITCH)).toHaveLength(0);
    /* The table says so in a way a screen reader can read. */
    expect(
      screen.getByText(/this server does not say whether a reason is required/),
    ).toBeInTheDocument();
    /* The file switch beside it is untouched. */
    expect(screen.getAllByLabelText(FILE_SWITCH).length).toBeGreaterThan(0);
  });
});

describe("in the demo", () => {
  it("draws neither setting: there is no API to keep them, and a switch over nothing would write into nothing", async () => {
    mocks.connected = false;
    render(
      <ToastProvider>
        <LeavePolicyForm />
      </ToastProvider>,
    );
    await screen.findAllByText("Leave types");
    expect(screen.queryAllByLabelText(/supporting file required/)).toHaveLength(
      0,
    );
    expect(screen.queryAllByLabelText(/reason required/)).toHaveLength(0);
    expect(screen.queryByText("Reason")).toBeNull();
    expect(screen.queryByText("Supporting file")).toBeNull();
  });
});
