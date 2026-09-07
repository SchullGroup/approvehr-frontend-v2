"use client";

import { useState } from "react";
import { Banknote, Info, TriangleAlert, Wallet } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  Money,
  Spinner,
  Stat,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  STATUS_LABELS,
  type ApiAdvance,
  type ApiAdvanceStatus,
} from "@/lib/api/advances";
import {
  useAdvanceMutations,
  useAdvancePolicy,
  useAdvances,
  useMyAdvance,
} from "@/lib/store/advances";
import { useCan } from "@/lib/permissions";

/**
 * Earned wage access: drawing pay you have already earned.
 *
 * ## Three sentences from the API that must reach the screen
 *
 * The earned figure is an **estimate** worked out from days at work — it knows
 * nothing about a bonus or leave taken later. The money comes out of the
 * **company's own wallet** before payday. And a **fee** may bring this under
 * lending rules. All three are the API's own words, rendered where the decision
 * is made rather than in a settings page nobody opens.
 *
 * ## Null is not zero
 *
 * Somebody with no salary on their record has `earnedKobo: null`. That renders
 * as the API's own refusal — "there is no salary on your record yet" — never as
 * ₦0.00, which would tell them they had earned nothing when the truth is that
 * nobody has recorded what they earn.
 *
 * ## Approved is not paid, and the screen says which
 *
 * `APPROVED` means somebody signed it off; the money has not moved. Marking it
 * paid is a separate press, and it exists precisely so nobody can mistake a
 * signature for a transfer.
 */

const TONE: Record<
  ApiAdvanceStatus,
  "warning" | "info" | "success" | "danger" | "neutral"
> = {
  REQUESTED: "warning",
  APPROVED: "info",
  PAID: "success",
  DECLINED: "danger",
  CANCELLED: "neutral",
  RECOVERED: "neutral",
};

export function AdvancesScreen() {
  const canDecide = useCan("APPROVE_LOANS");
  const canSetPolicy = useCan("MANAGE_PAY_STRUCTURE");

  const mine = useMyAdvance();
  const waiting = useAdvances("REQUESTED");
  const all = useAdvances();
  const policy = useAdvancePolicy();
  const [asking, setAsking] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);

  const reloadAll = () => {
    mine.reload();
    waiting.reload();
    all.reload();
  };

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/payroll", label: "Payroll" }]}
        title="Pay early"
        meta={
          <span className="text-meta text-faint">
            Draw pay you have already earned, before payday.
          </span>
        }
        action={
          canSetPolicy && policy.available ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPolicyOpen(true)}
            >
              How it works here
            </Button>
          ) : undefined
        }
      />
      <PageBody>
        {!mine.available ? (
          <Callout tone="info" title="This needs the API">
            {mine.refusal}
          </Callout>
        ) : (
          <div className="flex flex-col gap-6">
            <Mine read={mine} onAsk={() => setAsking(true)} />
            {canDecide && <Waiting read={waiting} onChanged={reloadAll} />}
            <History read={all} />
          </div>
        )}
      </PageBody>
      {asking && mine.data && (
        <AskDialog
          availableKobo={mine.data.eligibility.availableKobo ?? 0}
          minKobo={mine.data.eligibility.minAmountKobo}
          feeKobo={mine.data.eligibility.feeKobo}
          onClose={() => setAsking(false)}
          onDone={() => {
            setAsking(false);
            reloadAll();
          }}
        />
      )}
      {policyOpen && (
        <PolicyDialog
          onClose={() => setPolicyOpen(false)}
          onDone={() => {
            setPolicyOpen(false);
            policy.reload();
            reloadAll();
          }}
        />
      )}
    </>
  );
}

function Mine({
  read,
  onAsk,
}: {
  read: ReturnType<typeof useMyAdvance>;
  onAsk: () => void;
}) {
  if (read.error) {
    return (
      <LoadFailure
        subject="what you have earned"
        error={read.error}
        onRetry={read.reload}
      />
    );
  }
  if (read.loading || !read.data) return <Spinner label="Working it out" />;

  const { earned, eligibility } = read.data;

  return (
    <Card>
      <CardHeader
        level={2}
        title="What you have earned this month"
        description={`${String(earned.daysEarned)} of ${String(earned.workingDaysInMonth)} working days, to ${earned.asOf}.`}
        action={
          /* Absent, not present-and-refusing. `refusal` is the API's own
             sentence and it is rendered below either way. */
          eligibility.refusal === null ? (
            <Button size="sm" variant="accent" onClick={onAsk}>
              <Banknote aria-hidden="true" className="size-4" />
              Draw some of it
            </Button>
          ) : undefined
        }
      />
      <CardBody className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Earned so far"
            value={
              /* Null is not zero. No salary on file is a missing fact about the
                 company's data, not a person who has earned nothing. */
              earned.earnedKobo === null ? (
                <span className="text-faint">Not known</span>
              ) : (
                <Money amount={earned.earnedKobo / 100} decimals />
              )
            }
            hint={
              earned.unpaidDaysSoFar > 0
                ? `${String(earned.unpaidDaysSoFar)} unpaid ${earned.unpaidDaysSoFar === 1 ? "day" : "days"} taken off`
                : undefined
            }
          />
          <Stat
            label="You can draw up to"
            value={
              eligibility.capKobo === null ? (
                <span className="text-faint">—</span>
              ) : (
                <Money amount={eligibility.capKobo / 100} decimals />
              )
            }
            hint={`${String(eligibility.maxPercentBp / 100)}% of what you have earned`}
          />
          <Stat
            label="Available now"
            value={
              eligibility.availableKobo === null ? (
                <span className="text-faint">—</span>
              ) : (
                <Money amount={eligibility.availableKobo / 100} decimals />
              )
            }
            hint={
              eligibility.outstandingKobo > 0
                ? "after what you have already drawn"
                : undefined
            }
          />
        </div>

        {/* The API's own sentence, verbatim. Not a paraphrase — it knows which
            of half a dozen reasons applies. */}
        {eligibility.refusal !== null && (
          <Callout tone="info" title="You cannot draw right now">
            {eligibility.refusal}
          </Callout>
        )}

        <Callout
          tone="info"
          title="This is an estimate"
          icon={<Info aria-hidden="true" />}
        >
          {eligibility.estimateNotice}
        </Callout>
      </CardBody>
    </Card>
  );
}

function Waiting({
  read,
  onChanged,
}: {
  read: ReturnType<typeof useAdvances>;
  onChanged: () => void;
}) {
  const mutations = useAdvanceMutations();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState<ApiAdvance | null>(null);

  if (read.loading || !read.data) return null;
  if (read.data.length === 0) {
    return (
      <Callout tone="success" title="Nothing waiting on you">
        No advance is waiting for a decision.
      </Callout>
    );
  }

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.push({ tone: "success", title: done });
      onChanged();
    } catch (error) {
      toast.push({
        tone: "danger",
        title:
          error instanceof ApiError ? error.message : "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        level={2}
        title="Waiting on you"
        description="Approving one moves the company's money before payday. It comes back off their payslip."
      />
      <CardBody className="flex flex-col gap-3">
        {read.data.map((advance) => (
          <div
            key={advance.id}
            className="flex flex-wrap items-center gap-3 border-b border-line pb-3 last:border-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-medium text-body">
                {advance.employeeName}
              </p>
              <p className="text-meta text-faint">
                Had earned{" "}
                <Money amount={advance.earnedAtRequestKobo / 100} decimals />{" "}
                when they asked · cap was{" "}
                <Money amount={advance.capAtRequestKobo / 100} decimals />
              </p>
            </div>
            <Money amount={advance.amountKobo / 100} decimals size="lg" />
            <Button
              variant="approve"
              size="sm"
              loading={busy}
              onClick={() =>
                void run(() => mutations.approve(advance.id), "Approved")
              }
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => setDeclining(advance)}
            >
              Decline
            </Button>
          </div>
        ))}
      </CardBody>
      {declining && (
        <DeclineDialog
          advance={declining}
          onClose={() => setDeclining(null)}
          onDone={() => {
            setDeclining(null);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function History({ read }: { read: ReturnType<typeof useAdvances> }) {
  const mutations = useAdvanceMutations();
  const canDecide = useCan("APPROVE_LOANS");
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (read.loading || !read.data) return null;
  if (read.data.length === 0) {
    return (
      <EmptyState
        title="Nothing drawn yet"
        description="An advance taken here appears with what is still to come off a payslip."
      />
    );
  }

  return (
    <Card>
      <CardHeader level={2} title="Advances" description="Newest first." />
      <CardBody className="flex flex-col gap-3">
        {read.data.map((advance) => (
          <div
            key={advance.id}
            className="flex flex-wrap items-center gap-3 border-b border-line pb-3 last:border-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-medium text-body">
                {advance.employeeName}
                <span className="ml-2 text-meta text-faint">
                  {advance.period.slice(0, 7)}
                </span>
              </p>
              {advance.declineReason && (
                <p className="text-meta text-faint">{advance.declineReason}</p>
              )}
              {advance.outstandingKobo > 0 &&
                advance.status !== "REQUESTED" &&
                advance.status !== "DECLINED" &&
                advance.status !== "CANCELLED" && (
                  <p className="text-meta text-faint">
                    <Money amount={advance.outstandingKobo / 100} decimals />{" "}
                    still to come off a payslip
                  </p>
                )}
            </div>
            <Money amount={advance.amountKobo / 100} decimals />
            <Badge tone={TONE[advance.status]} size="sm" dot>
              {STATUS_LABELS[advance.status]}
            </Badge>
            {/* Approved is not paid. Marking it paid is its own press, so a
                signature cannot be mistaken for a transfer. */}
            {canDecide && advance.status === "APPROVED" && (
              <Button
                size="sm"
                variant="secondary"
                loading={busy}
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    try {
                      await mutations.markPaid(advance.id);
                      toast.push({
                        tone: "success",
                        title: "Recorded as paid",
                      });
                      read.reload();
                    } catch (error) {
                      toast.push({
                        tone: "danger",
                        title:
                          error instanceof ApiError
                            ? error.message
                            : "Could not record it.",
                      });
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                The money has gone
              </Button>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

function AskDialog({
  availableKobo,
  minKobo,
  feeKobo,
  onClose,
  onDone,
}: {
  availableKobo: number;
  minKobo: number;
  feeKobo: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const mutations = useAdvanceMutations();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const kobo = Math.round((Number(amount.replace(/,/g, "")) || 0) * 100);

  return (
    <Modal
      open
      onClose={onClose}
      title="Draw pay early"
      description="It comes off your next payslip."
      footer={
        <div className="flex items-center gap-2">
          <Button
            variant="accent"
            loading={busy}
            disabled={kobo <= 0}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setFailure(null);
                try {
                  await mutations.request(kobo);
                  toast.push({ tone: "success", title: "Asked for" });
                  onDone();
                } catch (error) {
                  setFailure(
                    error instanceof ApiError
                      ? error.message
                      : "Something went wrong. Try again.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Ask for it
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="How much"
          help={`Between ${(minKobo / 100).toLocaleString("en-NG")} and ${(availableKobo / 100).toLocaleString("en-NG")} naira.`}
        >
          <Input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={String(Math.floor(availableKobo / 100))}
          />
        </Field>

        {kobo > 0 && (
          <p className="text-body-sm text-body">
            Your next payslip will be{" "}
            <Money amount={(kobo + feeKobo) / 100} decimals /> lighter
            {feeKobo > 0 ? " — that includes the fee." : "."}
          </p>
        )}

        {/* Only when there is one. A fee of zero needs no sentence. */}
        {feeKobo > 0 && (
          <Callout
            tone="warning"
            title="There is a fee on this"
            icon={<TriangleAlert aria-hidden="true" />}
          >
            <Money amount={feeKobo / 100} decimals /> is added to what comes off
            your payslip.
          </Callout>
        )}

        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}

function DeclineDialog({
  advance,
  onClose,
  onDone,
}: {
  advance: ApiAdvance;
  onClose: () => void;
  onDone: () => void;
}) {
  const mutations = useAdvanceMutations();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Decline — ${advance.employeeName}`}
      description="They see your reason."
      footer={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            loading={busy}
            disabled={reason.trim() === ""}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setFailure(null);
                try {
                  await mutations.decline(advance.id, reason);
                  toast.push({ tone: "success", title: "Declined" });
                  onDone();
                } catch (error) {
                  setFailure(
                    error instanceof ApiError
                      ? error.message
                      : "Something went wrong.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Decline it
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Why" help="Required — it is the only thing they get.">
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}

/**
 * How drawing early works here.
 *
 * The two notices the API sends are rendered in full: where the money comes
 * from, and what charging a fee means. Neither is a tooltip — one is a working
 * capital commitment and the other may change what licence the company needs.
 */
function PolicyDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const read = useAdvancePolicy();
  const mutations = useAdvanceMutations();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    enabled: boolean;
    percent: string;
    min: string;
    fee: string;
  } | null>(null);

  const policy = read.data;
  const state =
    draft ??
    (policy
      ? {
          enabled: policy.enabled,
          percent: String(policy.maxPercentBp / 100),
          min: String(policy.minAmountKobo / 100),
          fee: String(policy.feeKobo / 100),
        }
      : null);

  return (
    <Modal
      open
      onClose={onClose}
      title="How drawing early works here"
      footer={
        <div className="flex items-center gap-2">
          <Button
            variant="accent"
            loading={busy}
            disabled={state === null}
            onClick={() => {
              if (!state) return;
              void (async () => {
                setBusy(true);
                setFailure(null);
                try {
                  await mutations.setPolicy({
                    enabled: state.enabled,
                    maxPercentBp: Math.round(Number(state.percent) * 100),
                    minAmountKobo: Math.round(Number(state.min) * 100),
                    feeKobo: Math.round(Number(state.fee) * 100),
                  });
                  toast.push({ tone: "success", title: "Saved" });
                  onDone();
                } catch (error) {
                  setFailure(
                    error instanceof ApiError
                      ? error.message
                      : "Something went wrong.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Save it
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      {!policy || !state ? (
        <Spinner label="Loading" />
      ) : (
        <div className="flex flex-col gap-4">
          <Checkbox
            label="Staff can draw pay they have already earned"
            checked={state.enabled}
            onChange={(event) =>
              setDraft({ ...state, enabled: event.target.checked })
            }
          />
          <Callout
            tone="info"
            title="Where the money comes from"
            icon={<Wallet aria-hidden="true" />}
          >
            {policy.fundingNotice}
          </Callout>

          <Field
            label="Most they can draw"
            help="As a share of what they have earned so far. It cannot be all of it — a payslip has tax and pension on it."
          >
            <Input
              inputMode="decimal"
              value={state.percent}
              onChange={(event) =>
                setDraft({ ...state, percent: event.target.value })
              }
            />
          </Field>
          <Field label="Least they can draw" help="In naira.">
            <Input
              inputMode="decimal"
              value={state.min}
              onChange={(event) =>
                setDraft({ ...state, min: event.target.value })
              }
            />
          </Field>

          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <Field label="Fee per advance" help="In naira. Zero by default.">
              <Input
                inputMode="decimal"
                value={state.fee}
                onChange={(event) =>
                  setDraft({ ...state, fee: event.target.value })
                }
              />
            </Field>
            {/* In full whenever a fee is set, and as information when it is
                not. Charging one is the decision, not a number. */}
            <Callout
              tone={Number(state.fee) > 0 ? "warning" : "info"}
              title="A fee is a decision, not a setting"
            >
              {policy.feeNotice}
            </Callout>
          </div>

          {failure && (
            <Callout tone="danger" title="That was refused">
              {failure}
            </Callout>
          )}
        </div>
      )}
    </Modal>
  );
}
