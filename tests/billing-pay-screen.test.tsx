import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
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
    /* One call already: the eager refresh fired right after resume (ruling
       1b), which is what lets the latch arm without waiting a full `pollMs`
       — `WAITING.order` is non-null, so it already has. */
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Payment received/)).not.toBeInTheDocument();

    /* The payment lands: `order` goes null and `entitled` flips true, while
       `status` was ACTIVE the whole time. */
    billing = { ...billing, order: null, entitled: true };

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/Payment received/)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(3);
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
    const callsBeforeUnmount = refresh.mock.calls.length;

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(callsBeforeUnmount);
  });
});

describe("the stale pre-order session (fix round 1, item 1 — CRITICAL)", () => {
  /**
   * `billing` is the *last* `/auth/me`. For a `TRIALING`, `ACTIVE` or
   * `GRACE` company it already reads `order: null, entitled: true` before
   * this screen's order ever existed — the exact shape that, without a
   * latch, satisfies the raw "paid" condition the instant `transfer`
   * renders, with no money having moved. Both tests below start from
   * exactly that stale snapshot, via the two paths that reach `transfer`:
   * a fresh checkout and a resume.
   */
  afterEach(() => {
    vi.useRealTimers();
  });

  it("via a fresh checkout: stays on transfer until the session has actually seen the order, then the payment", async () => {
    billing = { ...WAITING, status: "TRIALING", entitled: true, order: null };
    /* Fake timers from the start: the polling `setInterval` this test needs
       to advance has to be registered under the *same* timer engine the
       test later drives with `vi.advanceTimersByTime` — switching to fake
       timers only after Continue leaves that interval on the real clock,
       invisible to the fake one. `fireEvent` rather than `userEvent` for the
       two clicks below, since `userEvent` schedules its own internal delays
       and hangs against a fake clock regardless of the `advanceTimers`
       option; `fireEvent` dispatches synchronously and needs neither. */
    vi.useFakeTimers();
    const api = fakeApi();
    const refresh = vi.fn(() => Promise.resolve());

    render(<PayScreen api={api} refresh={refresh} pollMs={10_000} />);
    await flush();

    fireEvent.click(screen.getByRole("radio", { name: /Growth/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await flush();

    /* Transfer shows (the account number is visible) — but NOT "Payment
       received", even though the still-stale session already reads
       `order: null, entitled: true`. */
    expect(screen.getByText("1234567890")).toBeInTheDocument();
    expect(screen.queryByText(/Payment received/)).not.toBeInTheDocument();
    /* The eager refresh from ruling 1b, fired right after checkout
       succeeds. */
    expect(refresh).toHaveBeenCalledTimes(1);

    /* The session catches up: it now knows about this order. Still not
       paid — the order hasn't cleared yet. */
    billing = {
      ...billing,
      order: {
        planId: "growth-id",
        planName: "Growth",
        months: 3,
        amountKobo: 15_000_000,
      },
    };
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Payment received/)).not.toBeInTheDocument();

    /* The payment actually lands. */
    billing = { ...billing, order: null, entitled: true };
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/Payment received/)).toBeInTheDocument();
  });

  it("via resume: stays on transfer until the session has actually seen the order, then the payment", async () => {
    billing = { ...WAITING, status: "ACTIVE", entitled: true, order: null };
    vi.useFakeTimers();
    const api = fakeApi({
      currentCheckout: vi.fn(() => Promise.resolve(CHECKOUT)),
    });
    const refresh = vi.fn(() => Promise.resolve());

    render(<PayScreen api={api} refresh={refresh} pollMs={10_000} />);
    await flush();

    expect(screen.getByText("1234567890")).toBeInTheDocument();
    expect(screen.queryByText(/Payment received/)).not.toBeInTheDocument();
    /* The eager refresh from ruling 1b, fired right after the resume. */
    expect(refresh).toHaveBeenCalledTimes(1);

    billing = {
      ...billing,
      order: {
        planId: "growth-id",
        planName: "Growth",
        months: 3,
        amountKobo: 15_000_000,
      },
    };
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Payment received/)).not.toBeInTheDocument();

    billing = { ...billing, order: null, entitled: true };
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/Payment received/)).toBeInTheDocument();
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

describe("when loading fails (fix round 1, item 2)", () => {
  it("shows Try again instead of a stuck Loading… when plans() itself fails, and retries on click", async () => {
    const user = userEvent.setup();
    const plans = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError(
          500,
          "server_error",
          "Could not reach the plans just now.",
        ),
      )
      .mockResolvedValueOnce([GROWTH]);
    const api = fakeApi({ plans });
    render(<PayScreen api={api} refresh={vi.fn()} />);

    expect(
      await screen.findByText("Could not reach the plans just now."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading plans…")).not.toBeInTheDocument();
    expect(screen.queryByText("Growth")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Growth")).toBeInTheDocument();
    expect(plans).toHaveBeenCalledTimes(2);
  });

  it("renders the plan cards and shows the open-order check's error inline when only that call fails", async () => {
    const api = fakeApi({
      currentCheckout: vi.fn(() =>
        Promise.reject(
          new ApiError(
            500,
            "server_error",
            "Could not check for an order just now.",
          ),
        ),
      ),
    });
    render(<PayScreen api={api} refresh={vi.fn()} />);

    expect(await screen.findByText("Growth")).toBeInTheDocument();
    expect(
      screen.getByText("Could not check for an order just now."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading plans…")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });
});

describe("copying the account number (fix round 1, item 3)", () => {
  it("has the accessible name 'Copy account number'", async () => {
    const api = fakeApi({
      currentCheckout: vi.fn(() => Promise.resolve(CHECKOUT)),
    });
    render(<PayScreen api={api} refresh={vi.fn()} />);

    expect(
      await screen.findByRole("button", { name: "Copy account number" }),
    ).toBeInTheDocument();
  });

  it("shows a success toast when the clipboard write succeeds", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const api = fakeApi({
      currentCheckout: vi.fn(() => Promise.resolve(CHECKOUT)),
    });
    render(
      <ToastProvider>
        <PayScreen api={api} refresh={vi.fn()} />
      </ToastProvider>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Copy account number" }),
    );

    expect(writeText).toHaveBeenCalledWith("1234567890");
    expect(
      await screen.findByText("Account number copied"),
    ).toBeInTheDocument();
  });

  it("shows the fallback message when the clipboard write fails", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(() => Promise.reject(new Error("denied"))) },
      configurable: true,
    });
    const api = fakeApi({
      currentCheckout: vi.fn(() => Promise.resolve(CHECKOUT)),
    });
    render(
      <ToastProvider>
        <PayScreen api={api} refresh={vi.fn()} />
      </ToastProvider>,
    );

    await user.click(
      await screen.findByRole("button", { name: "Copy account number" }),
    );

    expect(
      await screen.findByText("Could not reach the clipboard"),
    ).toBeInTheDocument();
  });
});
