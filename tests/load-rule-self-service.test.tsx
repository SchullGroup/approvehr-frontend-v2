import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * Four self-service screens on the one loading and failure rule.
 *
 * What an audit found on these: the payslip list printed "Nothing here yet"
 * under its own failure card; the notifications inbox did the same; the
 * documents card printed "Nothing on file yet" under a failure; and the expense
 * card printed ₦0.00 owed, and "Nothing outstanding", while the claims were
 * still being read and after they could not be. Each handled `loading`, `error`
 * and "no rows" correctly alone. What is pinned is the combination: while a read
 * is in flight there is no count and no empty state, and after it fails there is
 * the failure card and neither.
 */

const serverError = new ApiError(500, "internal", "Something went wrong.");

const state = vi.hoisted(() => ({
  payslips: {
    payslips: [] as unknown[],
    total: undefined as number | undefined,
    loading: false,
    error: null as unknown,
    connected: true,
  },
  documents: {
    loading: false,
    error: null as unknown,
    linked: true,
    editable: true,
    documents: [] as unknown[],
    outstanding: [] as unknown[],
    settled: [] as unknown[],
    reload: () => {},
    attach: async () => {},
    add: async () => {},
  },
  notifications: {
    items: [] as unknown[],
    now: new Date("2026-10-22T09:00:00Z"),
    unread: 0,
    live: true,
    loading: false,
    error: null as unknown,
    hasMore: false,
    reload: () => {},
    showMore: () => {},
    markRead: async () => {},
    markAllRead: async () => {},
    remove: async () => {},
  },
  claims: {
    claims: [] as unknown[],
    loading: false,
    error: null as unknown,
    outstanding: { claimCount: 0, amount: 0 },
    awaitingDecision: { claimCount: 0, amount: 0 },
    myEmployeeId: "e1",
    reload: () => {},
    submit: async () => {},
    edit: async () => {},
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
  usePathname: () => "/",
}));
vi.mock("@/lib/store/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    employeeId: "e1",
    isConnected: true,
    isLoading: false,
    mode: "api",
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/payroll", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/payroll")>()),
  useMyPayslips: () => state.payslips,
}));
vi.mock("@/lib/store/documents", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/documents")>()),
  useMyDocuments: () => state.documents,
}));
vi.mock("@/lib/store/notifications", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/notifications")>()),
  useNotifications: () => state.notifications,
}));
vi.mock("@/lib/store/reimbursements", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/reimbursements")>()),
  useExpenseClaims: () => state.claims,
  useExpenseTypes: () => ({ types: [], loading: false, error: null }),
}));

beforeEach(() => {
  state.payslips.payslips = [];
  state.payslips.loading = false;
  state.payslips.error = null;
  state.documents.loading = false;
  state.documents.error = null;
  state.documents.linked = true;
  state.documents.documents = [];
  state.documents.outstanding = [];
  state.documents.settled = [];
  state.notifications.items = [];
  state.notifications.loading = false;
  state.notifications.error = null;
  state.claims.claims = [];
  state.claims.loading = false;
  state.claims.error = null;
});

/** Each screen: how to draw it, what it says when it has nothing, and what it must not say before it knows. */
const SCREENS = [
  {
    name: "my payslips",
    draw: async () => {
      const { MyPayslipIndex } =
        await import("@/app/(app)/payroll/payslips/my-payslip-index");
      return <MyPayslipIndex />;
    },
    set: (patch: { loading?: boolean; error?: unknown }) =>
      Object.assign(state.payslips, patch),
    empty: "Nothing here yet",
    failed: "Your payslips did not load",
  },
  {
    name: "my documents",
    draw: async () => {
      const { MyDocuments } =
        await import("@/app/(app)/people/documents/my-documents");
      return <MyDocuments />;
    },
    set: (patch: { loading?: boolean; error?: unknown }) =>
      Object.assign(state.documents, patch),
    empty: "Nothing on file yet",
    failed: "Your documents did not load",
  },
  {
    name: "the notifications inbox",
    draw: async () => {
      const { NotificationsInbox } =
        await import("@/app/(app)/notifications/inbox");
      return <NotificationsInbox />;
    },
    set: (patch: { loading?: boolean; error?: unknown }) =>
      Object.assign(state.notifications, patch),
    empty: "Nothing here yet",
    failed: "Your notifications did not load",
  },
  {
    name: "my expenses",
    draw: async () => {
      const { MyExpenses } =
        await import("@/app/(app)/payroll/expenses/my-expenses");
      return <MyExpenses />;
    },
    set: (patch: { loading?: boolean; error?: unknown }) =>
      Object.assign(state.claims, patch),
    empty: "No claims yet",
    failed: "Your expense claims did not load",
  },
] as const;

describe.each(SCREENS)("$name", (screenCase) => {
  it("says nothing about what it holds while it is still asking", async () => {
    screenCase.set({ loading: true });
    render(await screenCase.draw());
    expect(screen.queryByText(screenCase.empty)).not.toBeInTheDocument();
    expect(screen.queryByText(screenCase.failed)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("shows the failure card, and neither the empty state nor a figure, after a failure", async () => {
    screenCase.set({ error: serverError });
    render(await screenCase.draw());
    expect(screen.getByText(screenCase.failed)).toBeInTheDocument();
    expect(screen.queryByText(screenCase.empty)).not.toBeInTheDocument();
    expect(screen.queryByText(/₦0\.00/)).not.toBeInTheDocument();
  });

  it("says it is empty once it has asked and there is nothing", async () => {
    render(await screenCase.draw());
    expect(screen.getByText(screenCase.empty)).toBeInTheDocument();
    expect(screen.queryByText(screenCase.failed)).not.toBeInTheDocument();
  });
});

describe("the claims register", () => {
  const draw = async (props: { loading?: boolean; error?: unknown }) => {
    const { ClaimsRegister } =
      await import("@/app/(app)/payroll/expenses/claims-register");
    return render(
      <ClaimsRegister
        title="All claims"
        claims={[]}
        types={[]}
        loading={props.loading ?? false}
        error={props.error ?? null}
        showWho
        canSettle={false}
        myEmployeeId={null}
      />,
    );
  };

  it("does not say there are no claims while it is still reading them", async () => {
    await draw({ loading: true });
    expect(screen.queryByText("No claims here")).not.toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  });

  it("shows the failure card and not the empty state after a failure", async () => {
    await draw({ error: serverError });
    expect(screen.getByText("The claims did not load")).toBeInTheDocument();
    expect(screen.queryByText("No claims here")).not.toBeInTheDocument();
  });

  it("says there are none once it has answered with none", async () => {
    await draw({});
    expect(screen.getByText("No claims here")).toBeInTheDocument();
  });
});
