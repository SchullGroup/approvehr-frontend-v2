import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@/lib/permission-keys";
import type { ApiAdvance } from "@/lib/api/advances";

/**
 * The pay-early screen, where somebody asks and somebody else approves.
 *
 * The store is replaced with canned answers because this feature has no demo
 * mode and nothing here needs a server: what is tested is what the screen does
 * with the answers. Asking ends in a statement inside the dialog, and the screen
 * behind is not told until the dialog is closed (telling it reloads what the
 * dialog is mounted on). Approving ends in a card above the queue, and the one
 * thing it must say is that approved is not paid.
 */

let held = new Set<PermissionKey>();

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: (permission: PermissionKey) => held.has(permission),
}));

vi.mock("@/components/portal/shell", () => ({
  PageHeader: () => null,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const request = vi.fn();
const approve = vi.fn();
const reloadMine = vi.fn();
const reloadWaiting = vi.fn();
const reloadAll = vi.fn();

const read = <T,>(data: T, reload = vi.fn()) => ({
  data,
  loading: false,
  error: null,
  available: true,
  refusal: "",
  reload,
});

const advance = (over: Partial<ApiAdvance> = {}): ApiAdvance => ({
  id: "adv-1",
  employeeId: "e1",
  employeeName: "Chidi Nwosu",
  period: "2026-10-01",
  amountKobo: 2_000_000,
  feeKobo: 0,
  outstandingKobo: 2_000_000,
  earnedAtRequestKobo: 4_700_000,
  capAtRequestKobo: 2_350_000,
  status: "REQUESTED",
  requestedAt: "2026-10-09T09:00:00.000Z",
  decidedAt: null,
  declineReason: null,
  paidAt: null,
  recoveredAt: null,
  recoveredKobo: 0,
  ...over,
});

vi.mock("@/lib/store/advances", () => ({
  useMyAdvance: () =>
    read(
      {
        earned: {
          employeeId: "e1",
          period: "2026-10-01",
          asOf: "2026-10-09",
          grossMonthlyKobo: 165_000_000,
          workingDaysInMonth: 21,
          workingDaysElapsed: 6,
          unpaidDaysSoFar: 0,
          daysEarned: 6,
          earnedKobo: 47_142_857,
        },
        eligibility: {
          employeeId: "e1",
          period: "2026-10-01",
          enabled: true,
          earnedKobo: 47_142_857,
          capKobo: 23_571_428,
          outstandingKobo: 0,
          availableKobo: 23_571_428,
          taken: 0,
          maxPerPeriod: 1,
          maxPercentBp: 5000,
          minAmountKobo: 500_000,
          feeKobo: 0,
          refusal: null,
          estimateNotice: "An estimate.",
        },
      },
      reloadMine,
    ),
  useAdvances: (status?: string) =>
    status === "REQUESTED"
      ? read([advance()], reloadWaiting)
      : read([advance()], reloadAll),
  useAdvancePolicy: () =>
    read({
      enabled: true,
      maxPercentBp: 5000,
      minAmountKobo: 500_000,
      maxAmountKobo: null,
      maxPerPeriod: 1,
      feeKobo: 0,
      feeNotice: "A fee is a decision.",
      fundingNotice: "Company wallet.",
    }),
  useAdvanceMutations: () => ({
    available: true,
    refusal: "",
    request,
    approve,
    decline: vi.fn(),
    cancel: vi.fn(),
    markPaid: vi.fn(),
    setPolicy: vi.fn(),
  }),
}));

const { AdvancesScreen } =
  await import("@/app/(app)/payroll/advances/advances-screen");

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  held = new Set<PermissionKey>();
  request.mockReset();
  approve.mockReset();
  reloadMine.mockReset();
  reloadWaiting.mockReset();
  reloadAll.mockReset();
});

describe("asking to draw pay early", () => {
  async function ask() {
    request.mockResolvedValue(
      advance({ amountKobo: 2_000_000, feeKobo: 50_000 }),
    );
    render(<AdvancesScreen />);
    fireEvent.click(screen.getByRole("button", { name: /Draw some of it/ }));
    fireEvent.change(screen.getByPlaceholderText("235714"), {
      target: { value: "20000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask for it" }));
    await screen.findByRole("heading", {
      name: "Your pay-early request is sent for a decision",
    });
  }

  it("turns the dialog into what was asked, with the fee counted", async () => {
    await ask();

    expect(request).toHaveBeenCalledWith(2_000_000);
    expect(
      screen.getByText("₦20,000.00 asked for, plus a ₦500.00 fee."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Once it is paid, ₦20,500.00 comes off your next payslip, fee included.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Asked for")).toBeNull();
  });

  it("does not tell the screen behind until it is closed", async () => {
    await ask();
    expect(reloadMine).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => expect(reloadMine).toHaveBeenCalled());
  });

  it("starts a clean form when it is opened again", async () => {
    await ask();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: /sent for a decision/ }),
      ).toBeNull(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Draw some of it/ }));

    expect(await screen.findByPlaceholderText("235714")).toHaveValue("");
  });

  it("keeps the form, and says why, when it is refused", async () => {
    request.mockRejectedValue(new Error("nope"));
    render(<AdvancesScreen />);
    fireEvent.click(screen.getByRole("button", { name: /Draw some of it/ }));
    fireEvent.change(screen.getByPlaceholderText("235714"), {
      target: { value: "20000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ask for it" }));

    expect(
      await screen.findByText("Something went wrong. Try again."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /sent for a decision/ }),
    ).toBeNull();
  });
});

describe("approving a pay-early request", () => {
  beforeEach(() => {
    held = new Set<PermissionKey>(["APPROVE_LOANS"]);
  });

  it("says the money has not been sent, in a card, and does not also toast", async () => {
    approve.mockResolvedValue(advance({ status: "APPROVED" }));
    render(<AdvancesScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(
      await screen.findByRole("heading", {
        name: "Chidi Nwosu's pay-early request is approved",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The money has not been sent yet\./),
    ).toBeInTheDocument();
    expect(screen.queryByText("Approved")).toBeNull();
    /* The queue is reloaded behind the card. */
    expect(reloadWaiting).toHaveBeenCalled();
  });

  it("can be closed", async () => {
    approve.mockResolvedValue(advance({ status: "APPROVED" }));
    render(<AdvancesScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await screen.findByRole("heading", { name: /is approved/ });

    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("heading", { name: /is approved/ })).toBeNull();
  });

  it("says nothing of an approval that was refused", async () => {
    approve.mockRejectedValue(new Error("The wallet is short."));
    render(<AdvancesScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(approve).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: /is approved/ })).toBeNull();
  });
});
