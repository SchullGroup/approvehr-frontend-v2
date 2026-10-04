import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiBilling } from "@/lib/api/endpoints";

/**
 * `BillingGate` swaps a locked company's page for the paywall, in place.
 *
 * The matrix below is the one `constraints.md` and the task brief pin down:
 * no billing at all, the paywall switched off, an entitled company missing a
 * module (Review Focus 2 — the gate must not paywall somebody the modules
 * lock already covers), `/billing/*` always rendering, the three heading
 * variants, and the permission-gated action.
 */

let billing: ApiBilling | null | undefined;
let pathname: string;
let can: (permission: string) => boolean;

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ user: { billing } }),
  useOrgTimezone: () => "Africa/Lagos",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can }),
}));

const { BillingGate } = await import("@/components/portal/billing-gate");

/** Locked: enforced, not entitled, missing its modules — the common case. */
const LOCKED: ApiBilling = {
  status: "LOCKED",
  entitled: false,
  enforced: true,
  reason: "expired",
  plan: null,
  modules: [],
  trialEndsAt: null,
  currentPeriodEnd: "2026-09-01T00:00:00.000Z",
  graceEndsAt: null,
  lockedSince: "2026-09-20T00:00:00.000Z",
  cancelledAt: null,
  order: null,
  unappliedKobo: 0,
};

beforeEach(() => {
  billing = undefined;
  pathname = "/dashboard";
  can = () => true;
});

const mount = () =>
  render(
    <BillingGate>
      <div>children</div>
    </BillingGate>,
  );

describe("when nothing should lock", () => {
  it("renders children when billing is undefined", () => {
    billing = undefined;
    mount();
    expect(screen.getByText("children")).toBeInTheDocument();
  });

  it("renders children when the paywall is switched off (enforced false), even if not entitled", () => {
    billing = { ...LOCKED, enforced: false, entitled: false };
    mount();
    expect(screen.getByText("children")).toBeInTheDocument();
  });

  it("renders children when enforced and entitled, even with modules missing", () => {
    billing = { ...LOCKED, enforced: true, entitled: true, modules: [] };
    mount();
    expect(screen.getByText("children")).toBeInTheDocument();
  });
});

describe("when a company is locked out", () => {
  it("renders the paywall instead of children on /dashboard", () => {
    billing = { ...LOCKED };
    pathname = "/dashboard";
    mount();
    expect(screen.queryByText("children")).not.toBeInTheDocument();
    expect(screen.getByText(/Your subscription ended on/)).toBeInTheDocument();
  });

  it("renders a page-level heading, since BillingGate replaces the route's own PageHeader", () => {
    billing = { ...LOCKED };
    pathname = "/dashboard";
    mount();
    expect(
      screen.getByRole("heading", { level: 1, name: "Subscription" }),
    ).toBeInTheDocument();
  });

  it("still renders children on /billing/pay", () => {
    billing = { ...LOCKED };
    pathname = "/billing/pay";
    mount();
    expect(screen.getByText("children")).toBeInTheDocument();
  });

  it("still renders children anywhere under /billing", () => {
    billing = { ...LOCKED };
    pathname = "/billing/plans";
    mount();
    expect(screen.getByText("children")).toBeInTheDocument();
  });
});

describe("paywall copy", () => {
  it('shows the no-subscription heading for reason: "no_subscription"', () => {
    billing = { ...LOCKED, reason: "no_subscription", status: "LOCKED" };
    pathname = "/dashboard";
    mount();
    expect(
      screen.getByText("Choose a plan to start using ApproveHR."),
    ).toBeInTheDocument();
  });

  it("shows the expired heading, naming the date and that data is safe", () => {
    billing = { ...LOCKED, reason: "expired", status: "LOCKED" };
    pathname = "/dashboard";
    mount();
    expect(screen.getByText(/Your subscription ended on/)).toBeInTheDocument();
    expect(screen.getByText(/Your data is safe/)).toBeInTheDocument();
  });

  it('says "cancelled" for status: "CANCELLED"', () => {
    billing = { ...LOCKED, status: "CANCELLED", reason: "expired" };
    pathname = "/dashboard";
    mount();
    expect(screen.getByText(/cancelled/)).toBeInTheDocument();
  });
});

describe("the Subscribe / Pay action", () => {
  it("shows a Subscribe / Pay link to /billing/pay with MANAGE_SETTINGS", () => {
    can = (permission) => permission === "MANAGE_SETTINGS";
    billing = { ...LOCKED };
    pathname = "/dashboard";
    mount();
    expect(
      screen.getByRole("link", { name: "Subscribe / Pay" }),
    ).toHaveAttribute("href", "/billing/pay");
  });

  it("shows an ask-your-administrator line and no link without MANAGE_SETTINGS", () => {
    can = () => false;
    billing = { ...LOCKED };
    pathname = "/dashboard";
    mount();
    expect(
      screen.getByText("Ask your administrator to subscribe."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Subscribe / Pay" }),
    ).not.toBeInTheDocument();
  });
});
