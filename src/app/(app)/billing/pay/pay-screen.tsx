"use client";

import { useEffect, useState } from "react";
import { Check, CheckCircle2, Copy, CreditCard } from "lucide-react";
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  DescriptionList,
  EmptyState,
  RadioCard,
  SegmentedControl,
  formatMoney,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { usePermissions } from "@/lib/permissions";
import { refreshSession, useOrgTimezone } from "@/lib/store/session";
import { formatDate } from "@/lib/time";
import { CHECKOUT_MONTHS, nairaOf, useBilling } from "@/lib/billing";
import { billingApi, type ApiCheckout, type ApiPlan } from "@/lib/api/billing";
import { ApiError } from "@/lib/api/client";
import type { ApiBilling } from "@/lib/api/endpoints";

/**
 * Subscribe / Pay — choose a plan and length, see the exact amount and the
 * company's own account, then watch it clear on its own.
 *
 * ## The success signal (binding), and the latch it actually needs
 *
 * The screen switches to `done` when `billing.order === null && billing.entitled
 * === true` — never `status === "ACTIVE"` alone. A company renewing early is
 * already `ACTIVE` before it has paid, and `status` flips long before `order`
 * is cleared; only `order` going `null` says the money has actually been
 * matched to this charge. See `constraints.md` and the polling suite in
 * `tests/billing-pay-screen.test.tsx`.
 *
 * That raw condition is not enough on its own, though: `billing` comes from
 * the *last* `/auth/me`, which for a `TRIALING`, `ACTIVE` or `GRACE` company
 * already reads `order: null, entitled: true` — before this screen's order
 * ever existed. The instant `continueToTransfer` (or a resume) moves to
 * `transfer`, that stale snapshot satisfies the raw condition with no money
 * having moved. `orderObserved` guards against exactly this: it only ever
 * arms once a render has actually seen `billing.order !== null` while on
 * `transfer` — proof the session knows about *this* order — and `paid`
 * additionally requires it. Detected and set **during render**, the same
 * render-phase-update pattern `src/hooks/use-dismiss.ts` uses (see its own
 * header comment on why: this is a render-time question, and answering it
 * from an effect would be the `react-hooks/set-state-in-effect` anti-pattern
 * that rule exists to catch, for an extra commit-and-paint round trip with
 * no benefit). It resets wherever a new order context begins (a fresh
 * checkout, a resume) or ends (Change plan) — ordinary `setState` calls at
 * those call sites, not render-phase ones, since nothing there needs to
 * happen "as part of rendering." `continueToTransfer` and the resume branch
 * below also call `refresh()` once, eagerly, so the latch has a chance to
 * arm immediately rather than waiting a full `pollMs` — but never *only*
 * that, because `refreshSession` swallows its own errors and a dropped
 * eager call must not leave the latch permanently unarmed; the ordinary
 * poll still arms it on its own next tick.
 *
 * ## Why `billing` comes from the real `useBilling()`, not a prop
 *
 * `api`, `refresh` and `pollMs` are injectable for testability (the
 * `export-button.test.tsx` idiom), but the done-signal has to react to
 * whatever the *session* believes right now, which is exactly what
 * `useBilling()` reads — the same hook every other billing surface
 * (`BillingGate`, `BillingBanner`) already trusts. Re-deriving it from a prop
 * would be a second source of truth for the one fact this screen exists to
 * get right.
 *
 * ## Why a forced re-render accompanies every poll tick
 *
 * In production `refresh` (`refreshSession`) writes the session store, which
 * notifies every `useSyncExternalStore` subscriber — `useBilling()` included
 * — on its own. But `refresh` is swapped for a plain mock in tests, which
 * does not touch any store, so nothing would otherwise prompt this component
 * to read `useBilling()` again after a tick. `setPollTick` is a value nobody
 * reads; its only job is to force that re-render in both environments alike,
 * so the polling effect's own behaviour does not depend on which `refresh`
 * happens to be wired in.
 */

type Step = "choose" | "transfer" | "done";

type BillingApi = Pick<
  typeof billingApi,
  "plans" | "checkout" | "currentCheckout"
>;

const NOT_SET_UP_MESSAGE = "Payments are not set up on this server yet.";

const MODULE_LABEL: Record<string, string> = {
  CORE_HR: "Core HR",
  PAYROLL: "Payroll",
  TIME_AND_LEAVE: "Time & Leave",
  RECRUITMENT: "Recruitment",
  PERFORMANCE: "Performance",
  HELPDESK: "Employee Support",
};

export function PayScreen({
  api = billingApi,
  refresh = refreshSession,
  pollMs = 10_000,
}: {
  api?: BillingApi;
  refresh?: () => Promise<void>;
  pollMs?: number;
} = {}) {
  const { can } = usePermissions();
  const billing = useBilling();
  const timeZone = useOrgTimezone();
  const canPay = can("MANAGE_SETTINGS");

  const [step, setStep] = useState<Step>("choose");
  const [plans, setPlans] = useState<ApiPlan[] | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [months, setMonths] = useState<(typeof CHECKOUT_MONTHS)[number]>(1);
  const [checkout, setCheckout] = useState<ApiCheckout | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [notSetUp, setNotSetUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [, setPollTick] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [orderObserved, setOrderObserved] = useState(false);

  /* On mount, and again on "Try again": the administrator-only screens fetch
     nothing at all. Otherwise load the open order and the price list
     independently — `Promise.allSettled`, not `Promise.all`, because a
     failed `currentCheckout()` must not discard a successful `plans()` (or
     the reverse) — and resume straight into `transfer` if there already is
     an order. `setLoadError(null)` lives inside the async callback below,
     not the effect's own synchronous top level, for the same
     `react-hooks/set-state-in-effect` reason explained on `orderObserved`. */
  useEffect(() => {
    if (!canPay) return;
    let cancelled = false;
    (async () => {
      setLoadError(null);
      const [currentResult, plansResult] = await Promise.allSettled([
        api.currentCheckout(),
        api.plans(),
      ]);
      if (cancelled) return;

      if (plansResult.status === "fulfilled") {
        setPlans(plansResult.value);
        if (currentResult.status === "rejected") {
          setLoadError(
            currentResult.reason instanceof ApiError
              ? currentResult.reason.message
              : "Could not check for an existing order just now.",
          );
        }
      } else {
        setLoadError(
          plansResult.reason instanceof ApiError
            ? plansResult.reason.message
            : "Could not load plans just now.",
        );
      }

      if (currentResult.status === "fulfilled" && currentResult.value) {
        setOrderObserved(false);
        setCheckout(currentResult.value);
        setStep("transfer");
        try {
          /* Eager, so the latch below can arm on this order immediately
             rather than waiting a full `pollMs` — see the header comment.
             Swallowed: `refreshSession` already swallows its own errors,
             and a test double standing in for it might not. */
          await refresh();
        } catch {
          // See above.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, canPay, refresh, reloadToken]);

  /* Arms once a render has actually seen this session know about an open
     order while on `transfer` — proof `billing` is no longer the stale
     pre-order snapshot. Set **during render** (React's documented
     "adjust state while rendering" pattern — see `src/hooks/use-dismiss.ts`
     for the precedent this follows), not from an effect: this is a
     render-time question answerable from this render's own `step` and
     `billing`, and the `!orderObserved` guard is what keeps it from looping
     — once true, the condition is false on every later render until
     something explicitly resets it. Monotonic while armed: a later render
     where `order` has gone `null` again (the payment landing) does not
     re-disarm it. */
  if (
    step === "transfer" &&
    billing &&
    billing.order !== null &&
    !orderObserved
  ) {
    setOrderObserved(true);
  }

  const paid =
    step === "transfer" &&
    orderObserved &&
    !!billing &&
    billing.order === null &&
    billing.entitled === true;

  /* `done` is derived, never written: a store a render away from an effect
     that writes it back is exactly the cascading-render shape
     `react-hooks/set-state-in-effect` flags, and there is nothing for an
     effect to own here that render can't already answer from `paid` —
     `step` itself only ever moves between `choose` and `transfer`, both set
     directly from a click, not from a dependency watcher. */
  const effectiveStep: Step = paid ? "done" : step;

  /* Polls while — and only while — a payment is actually being waited on, so
     it tears down itself the same render `paid` flips, with no separate
     "stop" step to forget. Cleared on every dependency change (leaving
     `transfer`, a new `refresh` or `pollMs`) and on unmount; `cancelled`
     guards the one in-flight `refresh()` a clear cannot cancel from landing
     after either. */
  useEffect(() => {
    if (effectiveStep !== "transfer") return;
    let cancelled = false;
    const id = setInterval(() => {
      void refresh().then(() => {
        if (!cancelled) setPollTick((t) => t + 1);
      });
    }, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [effectiveStep, refresh, pollMs]);

  const continueToTransfer = async () => {
    const selectedPlan = plans?.find((p) => p.id === selectedPlanId);
    if (!selectedPlan) return;
    setSubmitting(true);
    setCheckoutError(null);
    try {
      const result = await api.checkout({
        planId: selectedPlan.id,
        months,
      });
      setOrderObserved(false);
      setCheckout(result);
      setStep("transfer");
      try {
        /* Eager, for the same reason the resume branch above calls it —
           so the latch can arm on *this* order immediately. Swallowed for
           the same reason: a dropped call must not block the ordinary poll
           from arming it on its own next tick. */
        await refresh();
      } catch {
        // See above.
      }
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 422 &&
        error.message === NOT_SET_UP_MESSAGE
      ) {
        setNotSetUp(true);
      } else if (error instanceof ApiError) {
        setCheckoutError(error.message);
      } else {
        setCheckoutError("Could not start checkout just now.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  let body: React.ReactNode;
  if (!canPay) {
    body = (
      <Card>
        <EmptyState
          icon={<CreditCard aria-hidden="true" />}
          title="Ask your administrator to subscribe."
        />
      </Card>
    );
  } else if (notSetUp) {
    body = (
      <Card>
        <EmptyState
          icon={<CreditCard aria-hidden="true" />}
          title="Online payment isn't available yet — contact support to subscribe."
        />
      </Card>
    );
  } else if (effectiveStep === "done" && billing) {
    body = <DoneStep billing={billing} timeZone={timeZone} />;
  } else if (effectiveStep === "transfer" && checkout) {
    body = (
      <TransferStep
        checkout={checkout}
        unappliedKobo={billing?.unappliedKobo ?? 0}
        onChangePlan={() => {
          setOrderObserved(false);
          setStep("choose");
        }}
      />
    );
  } else {
    body = (
      <ChooseStep
        plans={plans}
        selectedPlanId={selectedPlanId}
        onSelectPlan={setSelectedPlanId}
        months={months}
        onSelectMonths={setMonths}
        onContinue={() => void continueToTransfer()}
        onRetry={() => setReloadToken((t) => t + 1)}
        submitting={submitting}
        loadError={loadError}
        checkoutError={checkoutError}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Subscribe"
        description="Choose a plan and pay into your company's account."
      />
      <PageBody>{body}</PageBody>
    </>
  );
}

function ChooseStep({
  plans,
  selectedPlanId,
  onSelectPlan,
  months,
  onSelectMonths,
  onContinue,
  onRetry,
  submitting,
  loadError,
  checkoutError,
}: {
  plans: ApiPlan[] | null;
  selectedPlanId: string | null;
  onSelectPlan: (id: string) => void;
  months: (typeof CHECKOUT_MONTHS)[number];
  onSelectMonths: (months: (typeof CHECKOUT_MONTHS)[number]) => void;
  onContinue: () => void;
  onRetry: () => void;
  submitting: boolean;
  loadError: string | null;
  checkoutError: string | null;
}) {
  /* Nothing to configure without a price list, so a failed or still-loading
     `plans` gets its own, smaller screen rather than a Length picker and a
     Continue button with nothing to act on. A successful `plans` with a
     `loadError` (the open-order check failed, independently — see
     `Promise.allSettled` in `PayScreen`) still shows the ordinary form, with
     the error inline rather than blocking it. */
  if (!plans) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        {loadError ? (
          <>
            <Callout tone="danger">{loadError}</Callout>
            <div>
              <Button variant="secondary" size="sm" onClick={onRetry}>
                Try again
              </Button>
            </div>
          </>
        ) : (
          <p className="text-body-sm text-muted">Loading plans…</p>
        )}
      </div>
    );
  }

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) ?? null;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {loadError && <Callout tone="danger">{loadError}</Callout>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {plans.map((plan) => (
          <RadioCard
            key={plan.id}
            name="plan"
            value={plan.id}
            checked={plan.id === selectedPlanId}
            onChange={() => onSelectPlan(plan.id)}
            label={plan.name}
            description={`${formatMoney(nairaOf(plan.priceKobo))} / month · ${plan.modules
              .map((m) => MODULE_LABEL[m] ?? m)
              .join(", ")}`}
          />
        ))}
      </div>

      <div>
        <p className="mb-2 text-body-sm font-medium text-ink">Length</p>
        <SegmentedControl
          label="Length"
          value={String(months)}
          onChange={(value) =>
            onSelectMonths(Number(value) as (typeof CHECKOUT_MONTHS)[number])
          }
          options={CHECKOUT_MONTHS.map((m) => ({
            value: String(m),
            label: `${m} month${m === 1 ? "" : "s"}`,
          }))}
        />
      </div>

      {selectedPlan && (
        <p className="text-body-sm text-ink">
          {`${formatMoney(nairaOf(selectedPlan.priceKobo))} × ${months} month${
            months === 1 ? "" : "s"
          } = ${formatMoney(nairaOf(selectedPlan.priceKobo * months))}`}
        </p>
      )}

      {checkoutError && <Callout tone="danger">{checkoutError}</Callout>}

      <div>
        <Button
          variant="accent"
          disabled={!selectedPlan}
          loading={submitting}
          onClick={onContinue}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

function TransferStep({
  checkout,
  unappliedKobo,
  onChangePlan,
}: {
  checkout: ApiCheckout;
  unappliedKobo: number;
  onChangePlan: () => void;
}) {
  const amount = formatMoney(nairaOf(checkout.order.amountKobo));

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Card className="p-5">
        <p className="text-body-sm text-ink">
          Transfer exactly <strong className="font-semibold">{amount}</strong>{" "}
          to:
        </p>
        <DescriptionList
          layout="rows"
          className="mt-4"
          items={[
            { term: "Bank", value: checkout.account.bankName },
            {
              term: "Account number",
              value: (
                <CopyAccountNumber
                  accountNumber={checkout.account.accountNumber}
                />
              ),
            },
            { term: "Account name", value: checkout.account.accountName },
          ]}
        />
      </Card>

      <p className="text-body-sm text-muted">
        This account belongs to your company. We&apos;ll switch you on as soon
        as the money arrives — usually within a minute.
      </p>

      {unappliedKobo > 0 ? (
        <p className="text-body-sm text-ink">
          {`We've received ${formatMoney(
            nairaOf(unappliedKobo),
          )} so far, which doesn't cover this order. Our team will be in touch.`}
        </p>
      ) : (
        <p className="text-body-sm text-muted">
          Paid a different amount? Contact support.
        </p>
      )}

      <div>
        <Button variant="ghost" size="sm" onClick={onChangePlan}>
          Change plan
        </Button>
      </div>
    </div>
  );
}

/** Copy the account number, following the clipboard-plus-toast pattern at
 * `src/components/portal/invite-link.tsx:108-116`. */
function CopyAccountNumber({ accountNumber }: { accountNumber: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopied(true);
      toast.push({ title: "Account number copied", tone: "success" });
    } catch {
      /* Clipboard access can be refused — see invite-link.tsx's own note.
         The number is on screen and selectable either way. */
      toast.push({
        title: "Could not reach the clipboard",
        detail: "Select the number and copy it.",
        tone: "danger",
      });
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono">{accountNumber}</span>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Copy account number"
        onClick={() => void copy()}
      >
        {copied ? (
          <Check aria-hidden="true" className="size-3.5" />
        ) : (
          <Copy aria-hidden="true" className="size-3.5" />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
    </span>
  );
}

function DoneStep({
  billing,
  timeZone,
}: {
  billing: ApiBilling;
  timeZone: string;
}) {
  const planName = billing.plan?.name ?? "your plan";
  return (
    <Card className="max-w-2xl p-5">
      <EmptyState
        icon={<CheckCircle2 aria-hidden="true" />}
        title={`Payment received — you're on ${planName} until ${formatDate(
          billing.currentPeriodEnd,
          timeZone,
        )}.`}
        action={
          <ButtonLink href="/dashboard" variant="accent">
            Go to dashboard
          </ButtonLink>
        }
      />
    </Card>
  );
}
