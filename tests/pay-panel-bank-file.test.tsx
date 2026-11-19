import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@/lib/permission-keys";
import type { PayrollRunDetail } from "@/lib/api/payroll";
import type { ApiPaymentsSummary } from "@/lib/api/payments";
import { PayPanel } from "@/app/(app)/payroll/runs/new/pay-panel";

/**
 * The pay card on an approved run, for a company that pays by bank file.
 *
 * Downloading the file pays nobody, and nothing here can see the bank, so the
 * run stays Approved until somebody says the bank paid. These pin what the card
 * asks for and who it asks: a clear second step for an approver, a sentence
 * saying who can for anybody else, the wallet company's card unchanged, and the
 * answer to "why is there no payment" when the cause is a missing bank account.
 *
 * The store and the permission read are replaced with canned answers because
 * what is under test is what the card does with them.
 */

let held = new Set<PermissionKey>();
let walletPayout = false;
let summary: ApiPaymentsSummary | null = null;

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: (permission: PermissionKey) => held.has(permission),
}));

vi.mock("@/lib/payroll/use-settings", () => ({
  usePayrollSettings: () => ({
    settings: { payout: { wallet: walletPayout } },
    loading: false,
  }),
}));

const actions = {
  live: true,
  check: vi.fn(),
  approve: vi.fn(),
  release: vi.fn(),
  cancel: vi.fn(),
  downloadFile: vi.fn(),
  markPaid: vi.fn(),
  createBatch: vi.fn(),
  recordFunding: vi.fn(),
};

vi.mock("@/lib/store/payments", async (original) => ({
  ...(await original<typeof import("@/lib/store/payments")>()),
  usePaymentActions: () => actions,
  usePaymentsSummary: () => ({
    summary,
    loading: false,
    error: null,
    live: true,
    reload: () => {},
  }),
}));

const account = {
  id: "acct-1",
  bankName: "Access Bank",
  accountName: "Crafwell Ltd",
  accountNumberMasked: "******4471",
  last4: "4471",
  bankCode: "044",
  accountType: null,
  isPrimary: true,
  active: true,
  archived: false,
  addedOn: "2026-01-05",
};

const summaryWith = (
  primaryAccount: ApiPaymentsSummary["primaryAccount"],
): ApiPaymentsSummary => ({
  provider: { connected: false, name: null, note: null },
  primaryAccount,
  outstanding: { count: 0, totalKobo: 0, batches: [] },
  lastCompleted: null,
  thisMonth: {
    period: "October 2026",
    batches: 0,
    payments: 0,
    totalKobo: 0,
    settledKobo: 0,
  },
});

function run(batchStatus: string | null): PayrollRunDetail {
  return {
    id: "run-1",
    period: "2026-10",
    payDate: "2026-10-28",
    status: "APPROVED",
    label: null,
    employeeCount: 42,
    excludedCount: 0,
    netKobo: 1_842_000_000,
    payslips: [],
    exceptions: [],
    exclusions: [],
    taxOverrides: [],
    batch:
      batchStatus === null
        ? null
        : { id: "batch-1", reference: "PAY-7", status: batchStatus },
  } as unknown as PayrollRunDetail;
}

function renderPanel(
  batchStatus: string | null,
  extra: { problem?: string | null } = {},
) {
  return render(
    <PayPanel run={run(batchStatus)} onChanged={vi.fn()} {...extra} />,
  );
}

beforeEach(() => {
  held = new Set<PermissionKey>(["APPROVE_PAYROLL"]);
  walletPayout = false;
  summary = summaryWith(account);
  actions.live = true;
  actions.check.mockReset().mockResolvedValue({ ok: true, discrepancies: [] });
  actions.approve.mockReset().mockResolvedValue(undefined);
  actions.createBatch.mockReset();
  actions.markPaid.mockReset();
});

describe("a company that pays by bank file", () => {
  it("makes telling us the bank paid a step of its own, for an approver", () => {
    renderPanel("APPROVED");

    expect(
      screen.getByRole("heading", { name: "Tell us when the bank has paid" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Once your bank has paid, record it here so the run is closed and everyone shows as paid.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record that your bank paid this" }),
    ).toBeEnabled();
    expect(
      screen.getByText(
        "Two steps: send the file to your bank, then tell us when it has paid.",
      ),
    ).toBeInTheDocument();
  });

  it("reads like a person talking, with no em dashes", () => {
    renderPanel("APPROVED");

    expect(document.body.textContent).not.toContain("\u2014");
  });

  it("offers the file and no wallet button", () => {
    renderPanel("APPROVED");

    expect(
      screen.getByRole("button", { name: "Download the bank file" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pay ₦/ })).toBeNull();
    expect(screen.queryByText(/watched it go through/)).toBeNull();
  });

  it("says who can record it, with no button, when the reader cannot", () => {
    held = new Set<PermissionKey>(["RUN_PAYROLL"]);
    renderPanel("APPROVED");

    expect(
      screen.getByText("Your payroll approver can record this."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Record that your bank paid this" }),
    ).toBeNull();
    /* The step is still explained to the person who prepared the run. */
    expect(
      screen.getByRole("heading", { name: "Tell us when the bank has paid" }),
    ).toBeInTheDocument();
  });

  it("opens the form straight away on a batch the API will take", async () => {
    renderPanel("APPROVED");

    fireEvent.click(
      screen.getByRole("button", { name: "Record that your bank paid this" }),
    );

    expect(await screen.findByText("This moves no money")).toBeInTheDocument();
    expect(actions.check).not.toHaveBeenCalled();
    expect(actions.approve).not.toHaveBeenCalled();
  });

  it("approves a batch that was never downloaded from here before opening the form", async () => {
    /* The bank payment schedule card is another way to the bank, and taking the
       file from it never approves the batch. `mark-paid` takes an approved
       batch and nothing else, so the form would open on a refusal. */
    renderPanel("AWAITING_APPROVAL");

    fireEvent.click(
      screen.getByRole("button", { name: "Record that your bank paid this" }),
    );

    expect(await screen.findByText("This moves no money")).toBeInTheDocument();
    expect(actions.check).toHaveBeenCalledWith("batch-1");
    expect(actions.approve).toHaveBeenCalledWith("batch-1");
  });

  it("does not open the form when the batch does not add up", async () => {
    actions.check.mockResolvedValue({
      ok: false,
      discrepancies: [
        {
          code: "TOTAL_MISMATCH",
          severity: "BLOCKER",
          message: "The batch total is not the run total.",
        },
      ],
    });
    renderPanel("AWAITING_APPROVAL");

    fireEvent.click(
      screen.getByRole("button", { name: "Record that your bank paid this" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("The batch total is not the run total."),
      ).toBeInTheDocument();
    });
    expect(actions.approve).not.toHaveBeenCalled();
    expect(screen.queryByText("This moves no money")).toBeNull();
  });

  it("never tells anybody the wallet moved when they recorded it", async () => {
    renderPanel("APPROVED");
    fireEvent.click(
      screen.getByRole("button", { name: "Record that your bank paid this" }),
    );

    const dialog = await screen.findByText("This moves no money");
    expect(dialog).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/wallet balance/i);
    expect(document.body.textContent).not.toMatch(/wallet has come down/i);
  });

  it("says a recorded run was paid from the bank, not the wallet", () => {
    renderPanel("COMPLETED");

    expect(
      screen.getByText(/Paid from your bank account, not the wallet\./),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/wallet has come down/i);
    expect(
      screen.queryByRole("button", { name: "Record that your bank paid this" }),
    ).toBeNull();
  });
});

describe("a company that pays from the wallet", () => {
  beforeEach(() => {
    walletPayout = true;
  });

  it("keeps both ways out, and the quiet question under them", () => {
    renderPanel("APPROVED");

    expect(
      screen.getByRole("button", { name: /^Pay ₦18,420,000\.00 to 42 people/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download the bank file" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Two ways out, and both are one press."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sent the file to your bank and watched it go through?"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Record that your bank paid this" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Tell us when the bank has paid")).toBeNull();
  });

  it("does not show a button to somebody who cannot record the payment", () => {
    held = new Set<PermissionKey>(["RUN_PAYROLL"]);
    renderPanel("APPROVED");

    expect(
      screen.queryByRole("button", { name: "Record that your bank paid this" }),
    ).toBeNull();
    expect(screen.queryByText(/watched it go through/)).toBeNull();
    expect(
      screen.getByRole("button", { name: /^Pay ₦18,420,000\.00/ }),
    ).toBeInTheDocument();
  });

  it("says recording moved no money, not that the wallet came down", () => {
    renderPanel("COMPLETED");

    expect(
      screen.getByText(
        /Nothing was sent\. This only records what your bank did\./,
      ),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/wallet has come down/i);
  });
});

describe("an approved run with no payment behind it", () => {
  it("tells a bank-file company to add the account first, and where", () => {
    held = new Set<PermissionKey>(["APPROVE_PAYROLL", "MANAGE_SETTINGS"]);
    summary = summaryWith(null);
    renderPanel(null);

    expect(
      screen.getByText(
        /No bank account is set up for salaries to be paid from\./,
      ),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Add a bank account" });
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("/settings/bank-accounts?from=")).toBe(true);
    /* The way back is the pay step of this run. */
    expect(decodeURIComponent(href)).toContain(
      "/payroll/runs/new?period=2026-10&step=approve",
    );
  });

  it("names who can add it when the reader cannot", () => {
    held = new Set<PermissionKey>(["APPROVE_PAYROLL"]);
    summary = summaryWith(null);
    renderPanel(null);

    expect(
      screen.getByText(
        /No bank account is set up for salaries to be paid from\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Ask somebody who manages settings to add it."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Add a bank account" }),
    ).toBeNull();
  });

  it("does not blame a missing account when the company has one", () => {
    summary = summaryWith(account);
    renderPanel(null);

    expect(screen.queryByText(/No bank account is set up/)).toBeNull();
    expect(
      screen.getByText(/most often because no bank account was on file/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Prepare the payment" }),
    ).toBeInTheDocument();
  });

  it("does not claim a cause before the summary has answered", () => {
    summary = null;
    renderPanel(null);

    expect(screen.queryByText(/No bank account is set up/)).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Add a bank account" }),
    ).toBeNull();
  });

  it("leaves a wallet company's card as it was", () => {
    walletPayout = true;
    held = new Set<PermissionKey>(["APPROVE_PAYROLL", "MANAGE_SETTINGS"]);
    summary = summaryWith(null);
    renderPanel(null);

    expect(screen.queryByText(/No bank account is set up/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "Bank accounts" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Prepare the payment" }),
    ).toBeInTheDocument();
  });
});
