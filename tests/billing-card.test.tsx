import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiBilling } from "@/lib/api/endpoints";

/**
 * `BillingCard` — the Settings screen's own billing status card
 * (`task-6-brief.md`), rendered above the static `ONGOING` grid since that
 * grid is plain `{href, title, description, icon}` data with nowhere to put
 * live status (`constraints.md`, departure 2).
 *
 * Mock shape copied from `tests/billing-gate.test.tsx`: `useSession` and
 * `useOrgTimezone` from the session store, `usePermissions` separately.
 */

let billing: ApiBilling | null | undefined;
let can: (permission: string) => boolean;

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ user: { billing } }),
  useOrgTimezone: () => "Africa/Lagos",
}));

vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can }),
}));

const { BillingCard } = await import("@/app/(app)/settings/billing-card");

const base: ApiBilling = {
  status: "ACTIVE",
  entitled: true,
  enforced: true,
  reason: null,
  plan: { name: "Growth", priceKobo: 5_000_000 },
  modules: ["CORE_HR", "PAYROLL"],
  trialEndsAt: null,
  currentPeriodEnd: "2026-11-01T00:00:00.000Z",
  graceEndsAt: null,
  lockedSince: null,
  cancelledAt: null,
  order: null,
  unappliedKobo: 0,
};

beforeEach(() => {
  billing = undefined;
  can = () => true;
});

describe("when it should render nothing", () => {
  it("renders nothing without MANAGE_SETTINGS", () => {
    can = () => false;
    billing = base;
    const { container } = render(<BillingCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing with billing undefined", () => {
    billing = undefined;
    const { container } = render(<BillingCard />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TRIALING", () => {
  it('shows "Free trial · ends {date}" and a Subscribe / Pay action', () => {
    billing = {
      ...base,
      status: "TRIALING",
      entitled: true,
      trialEndsAt: "2026-10-15T00:00:00.000Z",
      currentPeriodEnd: null,
    };
    render(<BillingCard />);
    expect(
      screen.getByText("Free trial · ends 15 October 2026"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Subscribe / Pay" }),
    ).toHaveAttribute("href", "/billing/pay");
  });
});

describe("ACTIVE", () => {
  it('shows "{plan} · paid until {date}" and a Renew action', () => {
    billing = { ...base, status: "ACTIVE" };
    render(<BillingCard />);
    expect(
      screen.getByText("Growth · paid until 1 November 2026"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Renew" })).toHaveAttribute(
      "href",
      "/billing/pay",
    );
  });
});

describe("GRACE, LOCKED and CANCELLED", () => {
  it("shows the status in words and a Renew action for GRACE", () => {
    billing = {
      ...base,
      status: "GRACE",
      graceEndsAt: "2026-10-10T00:00:00.000Z",
    };
    render(<BillingCard />);
    expect(screen.getByText("Grace period")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Renew" })).toHaveAttribute(
      "href",
      "/billing/pay",
    );
  });

  it("shows the status in words and a Renew action for LOCKED", () => {
    billing = {
      ...base,
      status: "LOCKED",
      entitled: false,
      lockedSince: "2026-09-20T00:00:00.000Z",
    };
    render(<BillingCard />);
    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Renew" })).toHaveAttribute(
      "href",
      "/billing/pay",
    );
  });

  it("shows the status in words and a Renew action for CANCELLED", () => {
    billing = {
      ...base,
      status: "CANCELLED",
      entitled: false,
      cancelledAt: "2026-09-20T00:00:00.000Z",
    };
    render(<BillingCard />);
    expect(screen.getByText("Cancelled")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Renew" })).toHaveAttribute(
      "href",
      "/billing/pay",
    );
  });
});

describe("while the paywall switch is off", () => {
  it("shows the quiet enforced-off line alongside the status", () => {
    billing = { ...base, status: "ACTIVE", enforced: false };
    render(<BillingCard />);
    expect(
      screen.getByText("Billing isn't switched on yet — nothing is locked."),
    ).toBeInTheDocument();
  });

  it("does not show the quiet line while enforced is true", () => {
    billing = { ...base, status: "ACTIVE", enforced: true };
    render(<BillingCard />);
    expect(
      screen.queryByText("Billing isn't switched on yet — nothing is locked."),
    ).not.toBeInTheDocument();
  });
});
