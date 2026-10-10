import {
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { ApiLoanDetail } from "@/lib/api/loans";
import { addMonths, monthStart } from "@/lib/loans/schedule";
import { TODAY } from "@/lib/today";

/**
 * Which months the loan forms offer, and which one they start on.
 *
 * The API refuses a first deduction in any month before the real current one.
 * These forms used to count months from `TODAY`, the demo dataset's frozen
 * 19 August, so a real employee in October was offered August, September and
 * October, defaulted to September, and got a 400 on "Send for approval" unless
 * they opened the start-month disclosure and picked the last option.
 *
 * The session is replaced, not the store: `useLoanToday` is the real hook, so
 * what is tested is the choice it makes between the company's day and the
 * demo's.
 */

const session = vi.hoisted(() => ({
  isConnected: true,
  timeZone: "Africa/Lagos",
}));

vi.mock("@/lib/store/session", async (original) => ({
  ...(await original<typeof import("@/lib/store/session")>()),
  useSession: () => ({
    employeeId: "e1",
    isConnected: session.isConnected,
    organization: { timezone: session.timeZone },
  }),
  useOrgTimezone: () => session.timeZone,
}));

const apply = vi.fn();
const approve = vi.fn();
const loanOnScreen = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/store/loans", async (original) => ({
  ...(await original<typeof import("@/lib/store/loans")>()),
  useLoanActions: () => ({ apply, approve }),
  useLoan: () => ({
    loan: loanOnScreen.current,
    loading: false,
    error: null,
  }),
}));

vi.mock("@/lib/store/pay-components", async (original) => ({
  ...(await original<typeof import("@/lib/store/pay-components")>()),
  usePayPreview: () => ({ data: null, available: false, loading: false }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/payroll/loans/loan-9",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/lib/permissions", async (original) => ({
  ...(await original<typeof import("@/lib/permissions")>()),
  usePermissions: () => ({ can: () => true }),
}));

const { useLoanToday } = await import("@/lib/store/loans");
const { ApplyLoanModal } = await import("@/app/(app)/payroll/loans/apply-loan");
const { CounterOfferModal } =
  await import("@/app/(app)/payroll/loans/decisions");
const { LoanDetailScreen } =
  await import("@/app/(app)/payroll/loans/[id]/loan-detail-screen");

const pending = (over: Partial<ApiLoanDetail> = {}): ApiLoanDetail =>
  ({
    id: "loan-9",
    employeeId: "e2",
    employeeName: "Chidi Nwosu",
    employeeNo: "AHR-1",
    jobTitle: "Engineer",
    principalKobo: 30_000_000,
    interestRate: 0,
    interestKobo: 0,
    totalRepayableKobo: 30_000_000,
    termMonths: 6,
    monthlyRepaymentKobo: 5_000_000,
    outstandingKobo: 30_000_000,
    status: "PENDING",
    reason: null,
    startPeriod: null,
    decidedById: null,
    decidedByName: null,
    decidedAt: null,
    declinedReason: null,
    completedAt: null,
    createdAt: "2026-10-09T10:00:00.000Z",
    schedule: [],
    progress: {
      instalmentsTotal: 0,
      instalmentsSettled: 0,
      scheduledKobo: 0,
      paidKobo: 0,
      waivedKobo: 0,
      remainingKobo: 0,
      nextDueDate: null,
      nextDueKobo: 0,
    },
    ...over,
  }) as ApiLoanDetail;

/** 09:00 on a Friday in October 2026, in Lagos and in UTC alike. */
const OCTOBER = "2026-10-09T08:00:00Z";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  apply.mockReset();
  approve.mockReset();
  session.isConnected = true;
  session.timeZone = "Africa/Lagos";
  /* Only the clock: React's own scheduling has to keep running. */
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(OCTOBER));
});

afterEach(() => {
  vi.useRealTimers();
});

/** The start-month select inside the "Change the start month" disclosure. */
function openStartMonths() {
  fireEvent.click(
    screen.getByRole("button", {
      name: "Change the start month or add interest",
    }),
  );
  return screen.getByRole("combobox") as HTMLSelectElement;
}

const labelsOf = (select: HTMLSelectElement) =>
  Array.from(select.options).map((option) => option.textContent);

function renderApply() {
  render(<ApplyLoanModal onClose={() => {}} forEmployeeId="e1" />);
  fireEvent.change(screen.getByPlaceholderText("500,000"), {
    target: { value: "300000" },
  });
}

describe("useLoanToday", () => {
  it("is the company's day when connected", () => {
    const { result } = renderHook(() => useLoanToday());
    expect(result.current).toBe("2026-10-09");
  });

  it("is the demo dataset's day in demo mode, whatever the clock says", () => {
    session.isConnected = false;
    const { result } = renderHook(() => useLoanToday());
    expect(result.current).toBe(TODAY);
  });

  it("follows the company's zone across a month boundary", () => {
    /* 23:30 UTC on 30 September is 00:30 on 1 October in Lagos (UTC+1), and
       still 12:30 on 30 September in Samoa (UTC-11). */
    vi.setSystemTime(new Date("2026-09-30T23:30:00Z"));
    expect(renderHook(() => useLoanToday()).result.current).toBe("2026-10-01");

    session.timeZone = "Pacific/Pago_Pago";
    expect(renderHook(() => useLoanToday()).result.current).toBe("2026-09-30");
  });

  it("never offers a first month the API would refuse", () => {
    /* The API's rule, as `startPeriod` in `approvehr-api` writes it: the
       first of the month must not be before the first of the current UTC
       month. Checked at month ends, a year end and a leap day, where an
       off-by-one in the month arithmetic shows. */
    for (const instant of [
      "2026-01-01T00:00:00Z",
      "2026-01-31T23:59:00Z",
      "2026-02-28T23:30:00Z",
      "2028-02-29T12:00:00Z",
      "2026-10-31T23:30:00Z",
      "2026-12-31T23:30:00Z",
    ]) {
      vi.setSystemTime(new Date(instant));
      const { result } = renderHook(() => useLoanToday());
      const thisUtcMonth = monthStart(new Date(instant));
      for (const months of [0, 1, 2]) {
        expect(addMonths(result.current, months) >= thisUtcMonth).toBe(true);
      }
    }
  });
});

describe("applying for a loan", () => {
  it("connected, offers this month and the next two, and defaults to next month", async () => {
    apply.mockResolvedValue(pending());
    renderApply();
    const select = openStartMonths();

    expect(labelsOf(select)).toEqual([
      "October 2026 (this month’s payroll)",
      "November 2026",
      "December 2026",
    ]);
    expect(select.value).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    await waitFor(() => expect(apply).toHaveBeenCalledOnce());
    expect(apply.mock.calls[0]?.[0]).toMatchObject({
      startPeriod: "2026-11-01",
    });
  });

  it("connected, can still start this month's payroll", async () => {
    apply.mockResolvedValue(pending());
    renderApply();
    fireEvent.change(openStartMonths(), { target: { value: "0" } });

    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    await waitFor(() => expect(apply).toHaveBeenCalledOnce());
    expect(apply.mock.calls[0]?.[0]).toMatchObject({
      startPeriod: "2026-10-01",
    });
  });

  it("connected, reads the month off the company's zone", () => {
    vi.setSystemTime(new Date("2026-09-30T23:30:00Z"));
    renderApply();
    expect(labelsOf(openStartMonths())[0]).toBe(
      "October 2026 (this month’s payroll)",
    );
  });

  it("in demo mode, stays on the demo dataset's calendar", async () => {
    session.isConnected = false;
    apply.mockResolvedValue(pending());
    renderApply();
    const select = openStartMonths();

    expect(labelsOf(select)).toEqual([
      "August 2026 (this month’s payroll)",
      "September 2026",
      "October 2026",
    ]);
    expect(select.value).toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    await waitFor(() => expect(apply).toHaveBeenCalledOnce());
    expect(apply.mock.calls[0]?.[0]).toMatchObject({
      startPeriod: "2026-09-01",
    });
  });
});

describe("approving different terms", () => {
  const renderCounter = () =>
    render(
      <CounterOfferModal
        loan={pending()}
        onClose={() => {}}
        onDone={() => {}}
      />,
    );

  it("connected, counts the first deduction from the real month", async () => {
    approve.mockResolvedValue(pending({ status: "ACTIVE" }));
    renderCounter();
    const select = screen.getByRole("combobox") as HTMLSelectElement;

    expect(labelsOf(select)).toEqual([
      "October 2026",
      "November 2026",
      "December 2026",
    ]);
    expect(select.value).toBe("1");

    fireEvent.click(
      screen.getByRole("button", { name: "Approve these terms" }),
    );
    await waitFor(() => expect(approve).toHaveBeenCalledOnce());
    expect(approve.mock.calls[0]?.[1]).toMatchObject({
      startPeriod: "2026-11-01",
    });
  });

  it("in demo mode, stays on the demo dataset's calendar", () => {
    session.isConnected = false;
    renderCounter();
    expect(labelsOf(screen.getByRole("combobox") as HTMLSelectElement)).toEqual(
      ["August 2026", "September 2026", "October 2026"],
    );
  });
});

describe("a pending loan's proposed schedule", () => {
  it("connected, starts next month when no start was asked for — as the API will", () => {
    loanOnScreen.current = pending({ startPeriod: null });
    render(<LoanDetailScreen id="loan-9" />);

    expect(screen.getByText("November 2026 if approved now")).toBeVisible();
  });

  it("keeps the month the applicant asked for", () => {
    loanOnScreen.current = pending({ startPeriod: "2026-12-01" });
    render(<LoanDetailScreen id="loan-9" />);

    expect(screen.getByText("December 2026")).toBeVisible();
  });

  it("in demo mode, starts the month after the demo's day", () => {
    session.isConnected = false;
    loanOnScreen.current = pending({ startPeriod: null });
    render(<LoanDetailScreen id="loan-9" />);

    expect(screen.getByText("September 2026 if approved now")).toBeVisible();
  });
});
