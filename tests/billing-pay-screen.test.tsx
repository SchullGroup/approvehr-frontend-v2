import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiBilling } from "@/lib/api/endpoints";
import { billingApi, type ApiCheckout, type ApiPlan } from "@/lib/api/billing";

type BillingApi = Pick<
  typeof billingApi,
  "plans" | "checkout" | "currentCheckout"
>;

/**
 * The Subscribe / Pay screen.
 *
 * `PayScreen` takes `{ api, refresh, pollMs }` so this suite injects fakes
 * instead of mocking `@/lib/api/billing` and `@/lib/store/session` wholesale
 * (the `export-button.test.tsx` idiom) — only `useSession` (for `useBilling`
 * and `useOrgTimezone`) and `usePermissions` are mocked, the same two
 * `billing-gate.test.tsx` mocks.
 *
 * The success signal is binding and deliberately *not* `status === "ACTIVE"`
 * alone: a company renewing early is already `ACTIVE` before it has paid, so
 * the polling suite below asserts the screen stays on `transfer` for exactly
 * that shape of billing object until `order` actually goes `null`.
 */

let billing: ApiBilling | null;
let can: (permission: string) => boolean;

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ user: { billing } }),
  useOrgTimezone: () => "Africa/Lagos",
}));

vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/billing/pay",
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const { PayScreen } = await import("@/app/(app)/billing/pay/pay-screen");

const GROWTH: ApiPlan = {
  id: "growth-id",
  slug: "growth",
  name: "Growth",
  description: null,
  priceKobo: 5_000_000,
  currency: "NGN",
  modules: ["CORE_HR", "PAYROLL"],
};

const CHECKOUT: ApiCheckout = {
  order: {
    id: "order-1",
    planId: "growth-id",
    planName: "Growth",
    months: 3,
    amountKobo: 15_000_000,
  },
  account: {
    bankName: "Wema Bank",
    accountNumber: "1234567890",
    accountName: "Acme Nigeria Ltd",
  },
};

/** A still-waiting company: it has the open order `CHECKOUT` describes, and
 * is not yet entitled. `WAITING.status` is deliberately `"ACTIVE"` in the
 * polling suite below — see the binding note at the top of this file. */
const WAITING: ApiBilling = {
  status: "LOCKED",
  entitled: false,
  enforced: true,
  reason: "no_subscription",
  plan: null,
  modules: [],
  trialEndsAt: null,
  currentPeriodEnd: null,
  graceEndsAt: null,
  lockedSince: null,
  cancelledAt: null,
  order: {
    planId: "growth-id",
    planName: "Growth",
    months: 3,
    amountKobo: 15_000_000,
  },
  unappliedKobo: 0,
};

/**
 * Typing each field's `vi.fn()` through the annotated return type below
 * (rather than via `ReturnType<typeof vi.fn>`, which only ever resolves
 * `vi.fn`'s *default* type parameter, not the call site's) is what lets
 * `api.checkout` etc. still carry `toHaveBeenCalledWith` while matching
 * `BillingApi`'s own call signatures.
 */
function fakeApi(overrides: Partial<BillingApi> = {}): BillingApi {
  return {
    plans: vi.fn(() => Promise.resolve([GROWTH])),
    checkout: vi.fn(() => Promise.resolve(CHECKOUT)),
    currentCheckout: vi.fn(() => Promise.resolve(null)),
    ...overrides,
  };
}

/** Flushes the microtasks an awaited `Promise.all` needs to settle, inside
 * `act` so the state updates that follow are not reported as out of band. */
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

beforeEach(() => {
  billing = { ...WAITING };
  can = () => true;
});

describe("without MANAGE_SETTINGS", () => {
  it("shows the administrator message and fetches no plans", async () => {
    can = () => false;
    const api = fakeApi();
    render(<PayScreen api={api} refresh={vi.fn()} />);

    expect(
      screen.getByText("Ask your administrator to subscribe."),
    ).toBeInTheDocument();
    await flush();
    expect(api.plans).not.toHaveBeenCalled();
    expect(api.currentCheckout).not.toHaveBeenCalled();
  });
});

describe("choosing a plan", () => {
  it("renders plan cards from api.plans()", async () => {
    const api = fakeApi();
    render(<PayScreen api={api} refresh={vi.fn()} />);
    await flush();
    expect(api.plans).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Growth")).toBeInTheDocument();
  });

  it("disables Continue until a plan is picked", async () => {
    const api = fakeApi();
    render(<PayScreen api={api} refresh={vi.fn()} />);
    await flush();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("shows the running total for a picked plan and length, then submits checkout on Continue", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<PayScreen api={api} refresh={vi.fn()} />);
    await flush();

    await user.click(screen.getByRole("radio", { name: /Growth/ }));
    await user.click(screen.getByRole("radio", { name: "3 months" }));

    expect(
      screen.getByText("₦50,000 × 3 months = ₦150,000"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(api.checkout).toHaveBeenCalledWith({
      planId: "growth-id",
      months: 3,
    });
    expect(await screen.findByText(/Transfer exactly/)).toBeInTheDocument();
    expect(screen.getByText("₦150,000")).toBeInTheDocument();
    expect(screen.getByText("Wema Bank")).toBeInTheDocument();
    expect(screen.getByText("1234567890")).toBeInTheDocument();
    expect(screen.getByText("Acme Nigeria Ltd")).toBeInTheDocument();
  });
});

describe("resuming an open checkout", () => {
  it("opens directly at the transfer step with that order's amount and account", async () => {
    const api = fakeApi({
      currentCheckout: vi.fn(() => Promise.resolve(CHECKOUT)),
    });
    render(<PayScreen api={api} refresh={vi.fn()} />);

    expect(await screen.findByText(/Transfer exactly/)).toBeInTheDocument();
    expect(screen.getByText("₦150,000")).toBeInTheDocument();
    expect(screen.getByText("Wema Bank")).toBeInTheDocument();
    expect(screen.getByText("1234567890")).toBeInTheDocument();
    expect(screen.getByText("Acme Nigeria Ltd")).toBeInTheDocument();
  });
});

describe("while waiting for payment", () => {
  it("shows the unapplied-money message instead of the contact-support line once money has arrived short", async () => {
    billing = { ...WAITING, unappliedKobo: 12_000_000 };
    const api = fakeApi({
      currentCheckout: vi.fn(() => Promise.resolve(CHECKOUT)),
    });
    render(<PayScreen api={api} refresh={vi.fn()} />);

    await screen.findByText(/Transfer exactly/);
    expect(
      screen.getByText(
        "We've received ₦120,000 so far, which doesn't cover this order. Our team will be in touch.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Contact support/)).not.toBeInTheDocument();
  });

  it("shows the contact-support line when nothing unapplied has arrived", async () => {
    const api = fakeApi({
      currentCheckout: vi.fn(() => Promise.resolve(CHECKOUT)),
    });
    render(<PayScreen api={api} refresh={vi.fn()} />);

    await screen.findByText(/Transfer exactly/);
    expect(screen.getByText(/Contact support/)).toBeInTheDocument();
  });

  it("has a Change plan control that returns to step 1", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      currentCheckout: vi.fn(() => Promise.resolve(CHECKOUT)),
    });
    render(<PayScreen api={api} refresh={vi.fn()} />);

    await screen.findByText(/Transfer exactly/);
    await user.click(screen.getByRole("button", { name: "Change plan" }));

    expect(
      screen.getByRole("button", { name: "Continue" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Transfer exactly/)).not.toBeInTheDocument();
  });
});

describe("polling while on the transfer step", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls refresh once per tick, switches to done only once order is null and entitled is true, and never on status alone", async () => {
    billing = {
      ...WAITING,
      /* Deliberately already ACTIVE, the exact shape `constraints.md` warns
         about: a company renewing early is ACTIVE before it has paid. */
      status: "ACTIVE",
    };
    const api = fakeApi({
      currentCheckout: vi.fn(() => Promise.resolve(CHECKOUT)),
    });
    const refresh = vi.fn(() => Promise.resolve());

    render(<PayScreen api={api} refresh={refresh} pollMs={10_000} />);
    await flush();
    expect(screen.getByText(/Transfer exactly/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Payment received/)).not.toBeInTheDocument();

    /* The payment lands: `order` goes null and `entitled` flips true, while
       `status` was ACTIVE the whole time. */
    billing = { ...billing, order: null, entitled: true };

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Payment received/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("stops polling once the component unmounts", async () => {
    const api = fakeApi({
      currentCheckout: vi.fn(() => Promise.resolve(CHECKOUT)),
    });
    const refresh = vi.fn(() => Promise.resolve());

    const { unmount } = render(
      <PayScreen api={api} refresh={refresh} pollMs={10_000} />,
    );
    await flush();
    expect(screen.getByText(/Transfer exactly/)).toBeInTheDocument();

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("when payments are not configured", () => {
  it("shows a clear message instead of a raw error for the specific 422", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      checkout: vi.fn(() =>
        Promise.reject(
          new ApiError(
            422,
            "payments_not_configured",
            "Payments are not set up on this server yet.",
          ),
        ),
      ),
    });
    render(<PayScreen api={api} refresh={vi.fn()} />);
    await flush();

    await user.click(screen.getByRole("radio", { name: /Growth/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText(
        "Online payment isn't available yet — contact support to subscribe.",
      ),
    ).toBeInTheDocument();
  });
});

describe("an ordinary checkout failure", () => {
  it("shows the server's message inline and stays on step 1", async () => {
    const user = userEvent.setup();
    const api = fakeApi({
      checkout: vi.fn(() =>
        Promise.reject(
          new ApiError(409, "plan_retired", "That plan is no longer offered."),
        ),
      ),
    });
    render(<PayScreen api={api} refresh={vi.fn()} />);
    await flush();

    await user.click(screen.getByRole("radio", { name: /Growth/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText("That plan is no longer offered."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Transfer exactly/)).not.toBeInTheDocument();
  });
});
