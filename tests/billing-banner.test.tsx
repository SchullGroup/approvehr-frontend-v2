import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiBilling } from "@/lib/api/endpoints";

/**
 * `BillingBanner` — the trial / grace countdown strip mounted above
 * `VerificationBanner` in `shell.tsx`.
 *
 * `bannerFor`'s own day-counting matrix (the 3-day trial window, the whole of
 * grace, the `null` cases) is already covered by `billing-helpers.test.ts`;
 * this suite is about rendering on top of that — the two exact messages, the
 * permission-gated Subscribe / Pay link, and that `enforced: false` does not
 * hide it (`constraints.md`: "only the banner can show" while the paywall
 * switch is off).
 *
 * The clock is faked rather than threaded through `bannerFor`'s own `now`
 * parameter, because the component itself calls `bannerFor(useBilling())`
 * with no way to inject one — same idiom as `dashboard-header.test.tsx`.
 */

let billing: ApiBilling | null | undefined;
let can: (permission: string) => boolean;

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ user: { billing } }),
}));

vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can }),
}));

const { BillingBanner } = await import("@/components/portal/billing-banner");

const NOW = new Date("2026-10-01T12:00:00Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

const base: ApiBilling = {
  status: "ACTIVE",
  entitled: true,
  enforced: true,
  reason: null,
  plan: { name: "Growth", priceKobo: 5_000_000 },
  modules: ["CORE_HR", "PAYROLL"],
  trialEndsAt: null,
  currentPeriodEnd: iso(20 * DAY),
  graceEndsAt: null,
  lockedSince: null,
  cancelledAt: null,
  order: null,
  unappliedKobo: 0,
};

const trialEndingIn = (days: number): ApiBilling => ({
  ...base,
  status: "TRIALING",
  trialEndsAt: iso(days * DAY),
});

const graceEndingIn = (days: number): ApiBilling => ({
  ...base,
  status: "GRACE",
  graceEndsAt: iso(days * DAY),
});

beforeEach(() => {
  billing = undefined;
  can = () => true;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("trial", () => {
  it("shows the day count with 2 days left", () => {
    billing = trialEndingIn(2);
    render(<BillingBanner />);
    expect(screen.getByText("Your trial ends in 2 days.")).toBeInTheDocument();
  });

  it('shows "today" on the last day', () => {
    billing = trialEndingIn(0.3);
    render(<BillingBanner />);
    expect(screen.getByText("Your trial ends today.")).toBeInTheDocument();
  });

  it("shows nothing outside the 3-day warning window", () => {
    billing = trialEndingIn(10);
    const { container } = render(<BillingBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("grace", () => {
  it("shows the day count and the access-paused warning", () => {
    billing = graceEndingIn(6);
    render(<BillingBanner />);
    expect(
      screen.getByText(
        "Your subscription has ended. You have 6 days before access is paused.",
      ),
    ).toBeInTheDocument();
  });

  it("singularises one day left", () => {
    billing = graceEndingIn(1);
    render(<BillingBanner />);
    expect(
      screen.getByText(
        "Your subscription has ended. You have 1 day before access is paused.",
      ),
    ).toBeInTheDocument();
  });

  it('reads "until today" on the last day', () => {
    billing = graceEndingIn(0.4);
    render(<BillingBanner />);
    expect(
      screen.getByText(
        "Your subscription has ended. You have until today before access is paused.",
      ),
    ).toBeInTheDocument();
  });
});

describe("when nothing should show", () => {
  it("renders nothing while active", () => {
    billing = base;
    const { container } = render(<BillingBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing with no billing at all", () => {
    billing = undefined;
    const { container } = render(<BillingBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("while the paywall switch is off", () => {
  it("still shows the banner — only locking is gated on enforced, not the banner", () => {
    billing = { ...trialEndingIn(2), enforced: false };
    render(<BillingBanner />);
    expect(screen.getByText("Your trial ends in 2 days.")).toBeInTheDocument();
  });
});

describe("the Subscribe / Pay link", () => {
  it("shows, linking to /billing/pay, with MANAGE_SETTINGS", () => {
    can = (permission) => permission === "MANAGE_SETTINGS";
    billing = trialEndingIn(2);
    render(<BillingBanner />);
    expect(
      screen.getByRole("link", { name: "Subscribe / Pay" }),
    ).toHaveAttribute("href", "/billing/pay");
  });

  it("is absent without MANAGE_SETTINGS", () => {
    can = () => false;
    billing = trialEndingIn(2);
    render(<BillingBanner />);
    expect(
      screen.queryByRole("link", { name: "Subscribe / Pay" }),
    ).not.toBeInTheDocument();
  });
});
