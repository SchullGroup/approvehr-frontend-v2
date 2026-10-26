import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * The payment history, the wallet statement and the remittance schedules on the
 * one loading and failure rule.
 *
 * What an audit found: after a failed read the history said **Payments 0** and
 * "No payments yet"; the wallet statement followed its failure card with "Not
 * available here … nothing to show offline", blaming the connection for a server
 * fault; both said something about what the company has paid or holds that the
 * page did not know. While loading, nothing may be said either.
 */

const serverError = new ApiError(500, "internal", "Something went wrong.");

const state = vi.hoisted(() => ({
  history: {
    rows: [] as unknown[],
    total: 0,
    page: 1,
    pageSize: 25,
    totalPages: 1,
    pageNetKobo: 0,
    loading: false,
    error: null as unknown,
    reload: () => {},
  },
  schedules: {
    available: true,
    loading: false,
    error: null as unknown,
    schedules: [] as unknown[],
    runId: null as string | null,
    reload: () => {},
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {} }),
  usePathname: () => "/payroll/payments/history",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/permissions")>()),
  usePermissions: () => ({
    can: () => true,
    loading: false,
    permissions: new Set<string>(),
  }),
  useCan: () => true,
}));
vi.mock("@/lib/store/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/session")>()),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/payments", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/payments")>()),
  usePaymentHistory: () => state.history,
  usePaidPeople: () => ({ people: [], truncated: false, loading: false }),
  usePaymentBatches: () => ({ batches: [] }),
}));
vi.mock("@/lib/store/statutory", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/statutory")>()),
  useStatutorySchedules: () => state.schedules,
}));

beforeEach(() => {
  state.history.rows = [];
  state.history.total = 0;
  state.history.loading = false;
  state.history.error = null;
  state.schedules.loading = false;
  state.schedules.error = null;
  state.schedules.schedules = [];
});

describe("the payment history", () => {
  const draw = async () => {
    const { PaymentHistoryScreen } =
      await import("@/app/(app)/payroll/payments/history/history-screen");
    return render(<PaymentHistoryScreen />);
  };

  it("does not say nobody has been paid while it is still asking", async () => {
    state.history.loading = true;
    await draw();
    expect(screen.queryByText("No payments yet")).not.toBeInTheDocument();
    expect(screen.getByText("Loading the payment history")).toBeInTheDocument();
  });

  it("shows the failure card, and neither a zero nor the empty state, after a failure", async () => {
    state.history.error = serverError;
    await draw();
    expect(screen.getByText("The payment history did not load")).toBeVisible();
    expect(screen.queryByText("No payments yet")).not.toBeInTheDocument();
    /* The Payments figure is a dash, not 0. */
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("says there are none once it has asked and there are none", async () => {
    await draw();
    expect(screen.getByText("No payments yet")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});

describe("the wallet statement", () => {
  const draw = async (patch: {
    loading?: boolean;
    error?: unknown;
    statement?: unknown;
  }) => {
    const { WalletStatement } =
      await import("@/app/(app)/payroll/payments/wallet-statement");
    return render(
      <WalletStatement
        statement={
          {
            statement: patch.statement ?? null,
            loading: patch.loading ?? false,
            error: patch.error ?? null,
            live: true,
            reload: () => {},
          } as never
        }
        page={1}
        pageSize={25}
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
      />,
    );
  };

  it("says nothing about the wallet while it is still asking", async () => {
    await draw({ loading: true });
    expect(screen.queryByText("Not available here")).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing has moved yet")).not.toBeInTheDocument();
    expect(
      screen.getByText("Loading the wallet statement"),
    ).toBeInTheDocument();
  });

  it("does not blame the connection for a failure", async () => {
    await draw({ error: serverError });
    expect(screen.getByText("The wallet statement did not load")).toBeVisible();
    expect(screen.queryByText("Not available here")).not.toBeInTheDocument();
  });

  it("says it is unavailable only when it simply is not there", async () => {
    await draw({});
    expect(screen.getByText("Not available here")).toBeInTheDocument();
  });

  it("says nothing has moved only once it has answered with no movements", async () => {
    await draw({
      statement: { transactions: [], total: 0, balanceKobo: 0 },
    });
    expect(screen.getByText("Nothing has moved yet")).toBeInTheDocument();
  });
});

describe("the remittance schedules", () => {
  const draw = async () => {
    const { SchedulesTable } =
      await import("@/app/(app)/payroll/statutory/schedules-table");
    return render(<SchedulesTable />);
  };

  it("says nothing to file while it is still asking", async () => {
    state.schedules.loading = true;
    await draw();
    expect(screen.queryByText("Nothing to file yet")).not.toBeInTheDocument();
    expect(
      screen.getByText("Loading the remittance schedules"),
    ).toBeInTheDocument();
  });

  it("shows the failure card, not 'nothing to file', after a failure", async () => {
    state.schedules.error = serverError;
    await draw();
    expect(
      screen.getByText("The remittance schedules did not load"),
    ).toBeVisible();
    expect(screen.queryByText("Nothing to file yet")).not.toBeInTheDocument();
  });

  it("says there is nothing to file once it has answered with nothing", async () => {
    await draw();
    expect(screen.getByText("Nothing to file yet")).toBeInTheDocument();
  });
});
