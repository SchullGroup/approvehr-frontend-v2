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
 * ## The success signal (binding)
 *
 * The screen switches to `done` when `billing.order === null && billing.entitled
 * === true` — never `status === "ACTIVE"` alone. A company renewing early is
 * already `ACTIVE` before it has paid, and `status` flips long before `order`
 * is cleared; only `order` going `null` says the money has actually been
 * matched to this charge. See `constraints.md` and the polling suite in
 * `tests/billing-pay-screen.test.tsx`.
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

  /* On mount: the administrator-only screens fetch nothing at all. Otherwise
     load the open order and the price list in parallel, and resume straight
     into `transfer` if there already is one. */
  useEffect(() => {
    if (!canPay) return;
    let cancelled = false;
    (async () => {
      try {
        const [current, planList] = await Promise.all([
          api.currentCheckout(),
          api.plans(),
        ]);
        if (cancelled) return;
        setPlans(planList);
        if (current) {
          setCheckout(current);
          setStep("transfer");
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof ApiError
              ? error.message
              : "Could not load plans just now.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, canPay]);

  const paid = !!billing && billing.order === null && billing.entitled === true;

  /* `done` is derived, never written: a store a render away from an effect
     that writes it back is exactly the cascading-render shape
     `react-hooks/set-state-in-effect` flags, and there is nothing for an
     effect to own here that render can't already answer from `step` and
     `paid` — `step` itself only ever moves between `choose` and `transfer`,
     both set directly from a click, not from a dependency watcher. */
  const effectiveStep: Step = step === "transfer" && paid ? "done" : step;

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
      setCheckout(result);
      setStep("transfer");
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
        onChangePlan={() => setStep("choose")}
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
  submitting: boolean;
  loadError: string | null;
  checkoutError: string | null;
}) {
  const selectedPlan = plans?.find((p) => p.id === selectedPlanId) ?? null;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {loadError && <Callout tone="danger">{loadError}</Callout>}

      {!plans ? (
        <p className="text-body-sm text-muted">Loading plans…</p>
      ) : (
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
      )}

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
      <Button variant="ghost" size="sm" onClick={() => void copy()}>
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
