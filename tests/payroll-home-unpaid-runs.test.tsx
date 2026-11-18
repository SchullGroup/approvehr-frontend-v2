import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PermissionKey } from "@/lib/permission-keys";
import type { PayrollRun, PayrollRunStatus } from "@/lib/api/payroll";
import { PayrollScreen } from "@/app/(app)/payroll/payroll-screen";

/**
 * Which approved payrolls the payroll home says nobody has paid.
 *
 * It used to read the newest run and nothing else, so a month prepared after an
 * unpaid one hid it, and a run left Approved was one more thing nobody was told
 * about. A run reaches Paid only when somebody records the bank paying it, so an
 * Approved run is exactly one nothing records as paid, and every one of them
 * gets a line with a way to its pay step.
 */

let runs: PayrollRun[] = [];
let walletPayout = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  useCan: (permission: PermissionKey) => permission === "VIEW_SALARIES",
}));

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useOrgTimezone: () => "Africa/Lagos",
}));

vi.mock("@/lib/payroll/use-settings", () => ({
  usePayrollSettings: () => ({
    settings: { payout: { wallet: walletPayout } },
    loading: false,
  }),
}));

vi.mock("@/lib/store/payroll", async (original) => ({
  ...(await original<typeof import("@/lib/store/payroll")>()),
  usePayrollRuns: () => ({
    runs,
    total: runs.length,
    loading: false,
    error: null,
    connected: true,
    reload: () => {},
  }),
  usePayrollRun: () => ({
    run: null,
    loading: false,
    error: null,
    reload: () => {},
  }),
}));

vi.mock("@/components/portal/shell", () => ({
  PageHeader: () => null,
  PageBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/payroll/run-panels", () => ({
  RunStatusBadge: ({ status }: { status: string }) => <span>{status}</span>,
  SourceBadge: () => null,
  TotalsPanel: () => null,
}));

/* The month-by-month chart measures itself, which jsdom cannot. It is not what
   is under test. */
vi.mock("@/components/ui/chart", async (original) => ({
  ...(await original<typeof import("@/components/ui/chart")>()),
  AreaChart: () => null,
}));

function run(
  period: string,
  status: PayrollRunStatus,
  over: Partial<PayrollRun> = {},
): PayrollRun {
  return {
    id: `run-${period}`,
    period,
    payDate: `${period}-28`,
    status,
    label: null,
    employeeCount: 10,
    excludedCount: 0,
    grossKobo: 2_000_000_00,
    netKobo: 1_500_000_00,
    ...over,
  } as unknown as PayrollRun;
}

beforeEach(() => {
  runs = [];
  walletPayout = true;
});

describe("the strip for the newest run", () => {
  it("says what is still to go out, without naming a month the header already names", () => {
    runs = [run("2026-10", "APPROVED")];
    render(<PayrollScreen />);

    expect(
      screen.getByText("₦1,500,000.00 still to go out"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pay them" })).toHaveAttribute(
      "href",
      "/payroll/runs/new?period=2026-10&step=approve",
    );
  });

  it("is not there when the newest run is paid", () => {
    runs = [run("2026-10", "PAID")];
    render(<PayrollScreen />);

    expect(screen.queryByText(/still to go out/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Pay them" })).toBeNull();
  });

  it("is not there for a run that has not been approved", () => {
    runs = [run("2026-10", "DRAFT"), run("2026-09", "PAID")];
    render(<PayrollScreen />);

    expect(screen.queryByText(/still to go out/)).toBeNull();
  });
});

describe("older runs nobody has recorded as paid", () => {
  it("gets a line each, named by month, with a way to its pay step", () => {
    runs = [
      run("2026-10", "APPROVED"),
      run("2026-09", "APPROVED", { netKobo: 1_400_000_00 }),
      run("2026-08", "PAID"),
      run("2026-07", "APPROVED", { netKobo: 1_300_000_00, label: "Bonus" }),
    ];
    render(<PayrollScreen />);

    expect(
      screen.getByText("₦1,500,000.00 still to go out"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("September 2026: ₦1,400,000.00 still to go out"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("July 2026 (Bonus): ₦1,300,000.00 still to go out"),
    ).toBeInTheDocument();
    /* August was paid and has no line. */
    expect(screen.queryByText(/August 2026:/)).toBeNull();

    const links = screen.getAllByRole("link", { name: "Pay them" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/payroll/runs/new?period=2026-10&step=approve",
      "/payroll/runs/new?period=2026-09&step=approve",
      "/payroll/runs/new?period=2026-07&step=approve",
    ]);
  });

  it("is still shown when a newer month has been prepared and not approved", () => {
    /* The header is about the draft, so the unpaid month has to say which month
       it is. This is the case the strip used to hide entirely. */
    runs = [run("2026-11", "DRAFT"), run("2026-10", "APPROVED")];
    render(<PayrollScreen />);

    expect(
      screen.getByText("October 2026: ₦1,500,000.00 still to go out"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pay them" })).toHaveAttribute(
      "href",
      "/payroll/runs/new?period=2026-10&step=approve",
    );
  });

  it("counts the rest rather than listing a year of old runs", () => {
    runs = [
      run("2026-10", "APPROVED"),
      run("2026-09", "APPROVED"),
      run("2026-08", "APPROVED"),
      run("2026-07", "APPROVED"),
      run("2026-06", "APPROVED"),
      run("2026-05", "APPROVED"),
    ];
    render(<PayrollScreen />);

    /* The newest and three older ones. */
    expect(screen.getAllByRole("link", { name: "Pay them" })).toHaveLength(4);
    expect(
      screen.getByText(
        "2 more approved runs have no record that they were paid. They are listed under Every run.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/June 2026:/)).toBeNull();
  });
});

describe("a company that pays from its own bank", () => {
  beforeEach(() => {
    walletPayout = false;
  });

  it("says what is known, and asks for the one thing that is missing", () => {
    runs = [run("2026-10", "APPROVED"), run("2026-09", "APPROVED")];
    render(<PayrollScreen />);

    expect(
      screen.getByText("₦1,500,000.00 approved, not recorded as paid"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "September 2026: ₦1,500,000.00 approved, not recorded as paid",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/still to go out/)).toBeNull();

    const links = screen.getAllByRole("link", { name: "Open the payment" });
    expect(links).toHaveLength(2);
    expect(links[1]).toHaveAttribute(
      "href",
      "/payroll/runs/new?period=2026-09&step=approve",
    );
  });

  it("does not describe a wallet it does not use", () => {
    runs = [run("2026-10", "APPROVED")];
    render(<PayrollScreen />);

    /* The explanation sits behind a mark whose accessible name is the message. */
    expect(
      screen.getByRole("button", {
        name: /Download the bank file for your bank/,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /wallet/i })).toBeNull();
  });
});
