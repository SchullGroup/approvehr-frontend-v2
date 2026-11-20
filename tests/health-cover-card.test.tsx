import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { HealthCoverCard } from "@/app/(app)/profile/health-cover-card";
import { ApiError } from "@/lib/api/client";
import type { ApiMyHealthCover } from "@/lib/api/benefits";

/**
 * "Your HMO" on a member of staff's own profile.
 *
 * What this pins is the rule the whole feature rests on: **absent is absent**.
 * A provider, a member ID or a start date nobody entered says "Not on file" —
 * never a blank and never a zero — and none of it is styled as a gap, because
 * both fields are optional for the company.
 *
 * Only the data hook is replaced; the card, its blocks and its copy button are
 * the real ones.
 */

type Read = {
  data: ApiMyHealthCover | null;
  loading: boolean;
  error: ApiError | null;
  available: boolean;
  refusal: string;
  reload: () => void;
};

const mocks = vi.hoisted(() => ({
  read: null as unknown as Read,
}));

vi.mock("@/lib/store/benefits", async (original) => ({
  ...(await original<typeof import("@/lib/store/benefits")>()),
  useMyHealthCover: () => mocks.read,
}));

const answer = (over: Partial<Read>): Read => ({
  data: null,
  loading: false,
  error: null,
  available: true,
  refusal: "",
  reload: vi.fn(),
  ...over,
});

const mount = () =>
  render(
    <ToastProvider>
      <HealthCoverCard />
    </ToastProvider>,
  );

const payroll = {
  source: "PAYROLL" as const,
  name: "HMO premium",
  provider: "Hygeia HMO",
  since: null,
  employeeMonthlyKobo: 540_000,
  employerMonthlyKobo: null,
  dependants: null,
};

beforeEach(() => {
  mocks.read = answer({});
});

describe("when there is nothing to show", () => {
  it("renders nothing at all offline, rather than an empty card", () => {
    mocks.read = answer({ available: false });
    const { container } = mount();
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on an API that predates it", () => {
    mocks.read = answer({ error: new ApiError(404, "not_found", "Not found") });
    const { container } = mount();
    expect(container).toBeEmptyDOMElement();
  });

  it("holds the place while it loads", () => {
    mocks.read = answer({ loading: true });
    mount();
    expect(screen.getByRole("status")).toHaveTextContent(/loading your hmo/i);
  });

  it("says plainly that the company has not set one up", () => {
    mocks.read = answer({ data: { memberNumber: null, covers: [] } });
    mount();
    expect(
      screen.getByText(/your company hasn.t set up an hmo for you/i),
    ).toBeInTheDocument();
  });
});

describe("an HMO that comes off the payslip", () => {
  it("shows the provider, the member ID and what comes off, with no start date it cannot back up", () => {
    mocks.read = answer({
      data: { memberNumber: "HYG/123456/0", covers: [payroll] },
    });
    mount();

    expect(screen.getByText("HYG/123456/0")).toBeInTheDocument();
    expect(screen.getByText("Hygeia HMO")).toBeInTheDocument();
    expect(screen.getByText(/5,400\.00/)).toBeInTheDocument();
    /* A company-wide premium has no start of its own: the line is left off. */
    expect(screen.queryByText("Covered since")).not.toBeInTheDocument();
    /* And no company share for a deduction: that line is left off too, rather
       than printed as "Not on file" as if somebody had forgotten. */
    expect(
      screen.queryByText("Paid by your company each month"),
    ).not.toBeInTheDocument();
  });

  it("says Not on file for a provider and a member ID nobody has entered", () => {
    mocks.read = answer({
      data: { memberNumber: null, covers: [{ ...payroll, provider: null }] },
    });
    mount();

    expect(screen.getAllByText(/not on file/i).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(
      screen.getByText(/ask your people team to add the number/i),
    ).toBeInTheDocument();
    /* No copy button when there is nothing to copy. */
    expect(
      screen.queryByRole("button", { name: /copy your member id/i }),
    ).not.toBeInTheDocument();
  });

  it("does not turn a missing figure into zero", () => {
    mocks.read = answer({
      data: {
        memberNumber: "R-1",
        covers: [{ ...payroll, employeeMonthlyKobo: null }],
      },
    });
    mount();
    expect(screen.queryByText(/₦0\.00/)).not.toBeInTheDocument();
  });
});

describe("a health plan in Benefits", () => {
  it("shows the company's share and the people covered, apart from what comes off pay", () => {
    mocks.read = answer({
      data: {
        memberNumber: "AXA-00123",
        covers: [
          {
            source: "BENEFIT_PLAN",
            name: "Family plan",
            provider: "AXA Mansard",
            since: "2026-08-10",
            employeeMonthlyKobo: 500_000,
            employerMonthlyKobo: 3_000_000,
            dependants: 2,
          },
        ],
      },
    });
    mount();

    expect(screen.getByText("AXA Mansard")).toBeInTheDocument();
    expect(screen.getByText("Covered since")).toBeInTheDocument();
    expect(
      screen.getByText("Comes off your pay each month"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Paid by your company each month"),
    ).toBeInTheDocument();
    expect(screen.getByText(/30,000\.00/)).toBeInTheDocument();
    expect(screen.getByText("People covered besides you")).toBeInTheDocument();
  });

  it("names each cover only when there is more than one to tell apart", () => {
    mocks.read = answer({
      data: {
        memberNumber: "X-1",
        covers: [
          payroll,
          { ...payroll, source: "BENEFIT_PLAN", name: "Family plan" },
        ],
      },
    });
    mount();
    expect(screen.getByText("HMO premium")).toBeInTheDocument();
    expect(screen.getByText("Family plan")).toBeInTheDocument();
  });
});

describe("copying the member ID", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("copies exactly what is on the card", async () => {
    mocks.read = answer({
      data: { memberNumber: "HYG/123456/0", covers: [payroll] },
    });
    mount();

    fireEvent.click(
      screen.getByRole("button", { name: /copy your member id/i }),
    );
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "HYG/123456/0",
      ),
    );
  });
});
