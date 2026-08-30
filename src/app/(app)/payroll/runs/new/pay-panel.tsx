"use client";

import { useState } from "react";
import { ArrowDownToLine, Banknote, Landmark } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Spinner,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { excludedNote, formatKobo } from "@/lib/api/payroll";
import type { PayrollRunDetail } from "@/lib/api/payroll";
import type { PaymentDiscrepancy } from "@/lib/api/payments";
import { usePaymentActions } from "@/lib/store/payments";
import { DEMO_NO_BATCH_REASON } from "@/lib/store/payroll";
import { downloadCsv } from "@/lib/csv";

/**
 * Where the product actually stands on moving money, said before the click.
 *
 * `NO_PROVIDER_REASON` in `store/payments.ts` is the refusal *after* somebody
 * presses Pay, and it is the API's own sentence. This is the same fact stated
 * in advance, which is a different job: a refusal explains what just happened,
 * and this stops somebody expecting the wrong thing. Both are one copy each,
 * for the same reason — a consequence written twice drifts, and one of the two
 * ends up sounding like a temporary fault rather than how the product works.
 */
export const WALLET_PAYOUT_STATE =
  "Paying from the wallet needs a payment provider connected to this account. " +
  "Until one is, the bank file is the way out: download it, upload it to your " +
  "bank, and they move the money.";

/**
 * Paying the people on a payroll that has just been approved.
 *
 * ## Why this is here and not on a payments screen
 *
 * It used to be somewhere else, and that is what made payments feel like a
 * second product. A run reached APPROVED and then somebody had to find
 * `/payroll/payments`, know that a "batch" was a thing, build one, check it,
 * approve it and only then download a file. Six steps, five of which are
 * bookkeeping, between deciding to pay people and paying them.
 *
 * The money is the point of the payroll. So approval builds the batch (see
 * `payroll/service.ts#approve`) and this panel offers the only two things
 * anybody actually wants next:
 *
 * - **Pay them from the wallet**, or
 * - **Download the bank file** and send it to the bank yourself.
 *
 * Both are one press. The batch gate runs inside whichever one is pressed,
 * because it is a machine check — does the batch total match the run, do two
 * people share an account number — and not a decision anybody makes. What it
 * finds is shown; what it does not find needs no ceremony.
 *
 * ## Approving is not paying, and this panel is why that stays true
 *
 * Approval is already the one-way door: loans settled, claims settled, figures
 * frozen. Putting "and the money leaves" on the same click would make the door
 * one nobody could stand at and think. Money moves when somebody presses the
 * button that names the amount and the headcount, which is the button below.
 */
export function PayPanel({
  run,
  problem,
  onChanged,
}: {
  run: PayrollRunDetail;
  /**
   * Why approving produced no payment, in the API's own words.
   *
   * Taken as a prop rather than guessed at from `run.batch === null`, because
   * those are different facts: null says there is none, and this says what
   * stopped it. It is also why there is one card here and not a card plus a
   * callout — the first version rendered both, and they disagreed: the callout
   * said the API was needed and the card said no bank account was on file.
   * Two explanations for one absence, and offline only one of them was true.
   */
  problem?: string | null;
  /** Re-read the run, so the batch's new state is the one on screen. */
  onChanged: () => void;
}) {
  const actions = usePaymentActions();
  const { push } = useToast();

  const [busy, setBusy] = useState<"pay" | "file" | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [problems, setProblems] = useState<readonly PaymentDiscrepancy[]>([]);

  const batch = run.batch;

  /**
   * Get the batch to a state a payment can leave from, and say what stopped it.
   *
   * Returns false rather than throwing, because both callers want to stop
   * quietly and leave the reason on screen. Every refusal here is the API's own
   * sentence — a batch that does not add up is the one thing on this screen
   * nobody should read a local paraphrase of.
   */
  async function ready(id: string): Promise<boolean> {
    setRefused(null);
    setProblems([]);

    const gate = await actions.check(id);
    if (!gate.ok) {
      const blockers = gate.discrepancies.filter((d) => d.severity === "BLOCKER");
      setProblems(blockers.length > 0 ? blockers : gate.discrepancies);
      setRefused(
        "This payment does not add up against the payroll it came from, so " +
          "nothing was sent and no file was produced.",
      );
      return false;
    }

    /* Approved here rather than on its own screen. The batch carries no
       decision the run did not already carry — same figures, same people, same
       permission (`APPROVE_PAYROLL` gates both) — so asking somebody to approve
       it a second time is a click that can only ever be yes. An already
       approved batch is left alone; walking one backwards would discard a
       decision somebody signed. */
    if (batch?.status === "DRAFT" || batch?.status === "AWAITING_APPROVAL") {
      await actions.approve(id);
    }
    return true;
  }

  async function pay() {
    if (!batch) return;
    setBusy("pay");
    try {
      if (!(await ready(batch.id))) return;
      await actions.release(batch.id);
      /* Unreachable while no provider is wired — `release` throws. If one is
         ever registered this is where success lands. */
      push({ tone: "success", title: `${formatKobo(run.netKobo)} sent` });
    } catch (error) {
      setRefused(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Nothing was sent.",
      );
    } finally {
      setBusy(null);
      onChanged();
    }
  }

  async function file() {
    if (!batch) return;
    setBusy("file");
    try {
      if (!(await ready(batch.id))) return;
      const download = await actions.downloadFile(batch.id);
      downloadCsv(download.filename, download.csv);
      push({
        tone: "success",
        title: "Bank file downloaded",
        detail:
          "Upload it to your bank. Nothing has left the account until they process it.",
      });
    } catch (error) {
      setRefused(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. No file was produced.",
      );
    } finally {
      setBusy(null);
      /* Either way. Both paths run the gate, which can move the batch from
         DRAFT to AWAITING_APPROVAL and then to APPROVED — so the status this
         panel is rendering from is stale by the time either finishes, whether
         or not the file was produced. */
      onChanged();
    }
  }

  /* A run approved before this existed, or one whose batch could not be built —
     a company with no bank account on file is the ordinary cause. Offering to
     build one is the whole fix, and it is the same call approval makes. */
  if (!batch) {
    return (
      <Card>
        <CardHeader
          title="Approved. Nobody has been paid yet."
          description="This payroll is settled and its figures are frozen. Its payment has not been prepared."
        />
        <CardBody className="flex flex-col gap-4">
          {/* The reason, and never a cause this cannot know.
              -----------------------------------------------------------
              `problem` is the API's own sentence and arrives with the
              approval — but it lives in the wizard's state, so a later load of
              the same run has none. The offline branch is derived rather than
              remembered for exactly that: on a reload the generic fallback
              would have claimed "no bank account was on file", which is false
              here and is the sort of confident wrong cause that sends somebody
              to fix a setting that was never the problem. */}
          <p className="text-body-sm text-body">
            {problem ??
              (actions.live
                ? "A payment is normally prepared the moment a payroll is " +
                  "approved. This one has none — most often because no bank " +
                  "account was on file to pay it from at the time."
                : DEMO_NO_BATCH_REASON)}
          </p>
          {refused && (
            <Callout tone="danger" title="That did not work">
              {refused}
            </Callout>
          )}
          {/* Offered only where it could work.
              -----------------------------------------------------------
              `createBatch` refuses outright with no API — it draws on a real
              bank account, and one assembled in browser storage is a payment
              instruction that can never reach a bank. A button whose only
              possible outcome is a refusal is a control that teaches somebody
              the product is broken, so offline there is no button and the
              sentence above is the whole answer. */}
          {actions.live && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="accent"
                size="sm"
                loading={busy === "pay"}
                onClick={() => {
                  setBusy("pay");
                  setRefused(null);
                  void actions
                    .createBatch(run.id)
                    .then(() => {
                      onChanged();
                    })
                    .catch((error: unknown) => {
                      setRefused(
                        error instanceof ApiError
                          ? error.message
                          : "The payment could not be prepared.",
                      );
                    })
                    .finally(() => {
                      setBusy(null);
                    });
                }}
              >
                Prepare the payment
              </Button>
              <ButtonLink variant="ghost" size="sm" href="/settings/bank-accounts">
                Bank accounts
              </ButtonLink>
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  const settled = batch.status === "SETTLED" || batch.status === "SUBMITTED";
  const cancelled = batch.status === "CANCELLED";

  return (
    <Card>
      <CardHeader
        title="Pay them"
        description={
          settled
            ? "This payment has been sent."
            : "Two ways out, and both are one press."
        }
        action={<Badge tone="neutral">{batch.reference}</Badge>}
      />
      <CardBody className="flex flex-col gap-4">
        {cancelled ? (
          <Callout tone="warning" title="This payment was cancelled">
            The payroll is still approved and its figures are unchanged. Prepare
            a new payment if these people still need paying.
          </Callout>
        ) : settled ? (
          <p className="text-body-sm text-body">
            {formatKobo(run.netKobo)} to {paidCount(run)}, sent as{" "}
            <span className="font-medium text-ink">{batch.reference}</span>.
            Payment history has what each person was sent and what came back.
          </p>
        ) : (
          <>
            {refused && (
              <Callout tone="danger" title="Nothing was sent">
                <p>{refused}</p>
                {problems.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {problems.map((problem, at) => (
                      <li key={`${problem.code}-${String(at)}`}>
                        {problem.message}
                      </li>
                    ))}
                  </ul>
                )}
              </Callout>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="accent"
                loading={busy === "pay"}
                disabled={busy !== null}
                onClick={() => void pay()}
              >
                {busy !== "pay" && <Banknote aria-hidden="true" className="size-4" />}
                Pay {formatKobo(run.netKobo)} to {paidCount(run)}
              </Button>
              <Button
                variant="secondary"
                loading={busy === "file"}
                disabled={busy !== null}
                onClick={() => void file()}
              >
                {busy !== "file" && (
                  <ArrowDownToLine aria-hidden="true" className="size-4" />
                )}
                Download the bank file
              </Button>
            </div>

            {/* The honest state of the product, said before the button is
                pressed rather than only in the refusal after it. Paying from the
                wallet needs a provider nobody has wired here; the file is the
                path that works, and it is not a workaround — it is how most
                Nigerian companies pay staff today. */}
            {/* Said beside the amount, never folded into it.
                ---------------------------------------------------------
                `headcountLabel` returns "9 of 10 — 1 excluded", which is
                right in a `Stat` where the label carries the noun and wrong
                inside a sentence: "Pay ₦8,497,077.00 to 9 of 10 — 1 excluded"
                reads as though the money were being split with somebody who
                is not being paid. The button names who is paid; this names
                who is not. */}
            {excludedNote(run) && (
              <p className="text-meta text-muted">{excludedNote(run)}</p>
            )}
            <p className="text-meta text-muted">{WALLET_PAYOUT_STATE}</p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * What the wallet holds, against what this payroll costs.
 *
 * ## It never blocks the approval
 *
 * Approving a payroll is a decision about the *figures* — are these the right
 * people and the right amounts. Funding is a decision about the *money*, and
 * they are made by different people on different days. A company that approves
 * on the 25th and funds on the 28th is doing something completely ordinary, and
 * a product that refused the approval would be telling them their payroll is
 * wrong when their bank balance is merely early.
 *
 * So this states the position and gets out of the way. The one thing it must do
 * is state it *before* the click rather than after, because "there was not
 * enough money" discovered at the provider is discovered after the run is
 * approved, the loans are settled and the figures are frozen.
 *
 * ## Absent, never zeroed
 *
 * `funds` is optional on the run, and absent for two reasons: the caller may not
 * see salaries, or there is no ledger at all (demo mode). Both render nothing.
 * A ₦0.00 wallet is a claim about a company's money and it would be false in
 * both cases.
 */
export function WalletStrip({ run }: { run: PayrollRunDetail }) {
  const funds = run.funds;
  if (!funds) return null;

  const short = !funds.enough;

  return (
    <Card>
      <CardHeader
        title="What is in the wallet"
        description="Payroll is paid from here. This is what it holds now."
      />
      <CardBody className="flex flex-col gap-4">
        <dl className="grid gap-4 sm:grid-cols-3">
          <Figure label="Available now" kobo={funds.wallet.availableKobo} />
          <Figure label="This payroll" kobo={funds.neededKobo} />
          <Figure
            label={short ? "Short by" : "Left after"}
            kobo={Math.abs(funds.afterKobo)}
            tone={short ? "danger" : "success"}
          />
        </dl>

        {funds.wallet.committedKobo > 0 && (
          <p className="text-meta text-muted">
            {formatKobo(funds.wallet.balanceKobo)} is in the account, of which{" "}
            {formatKobo(funds.wallet.committedKobo)} is already promised to a
            payment that has not gone out. &ldquo;Available&rdquo; is what is
            left after that — two payrolls approved in one morning must not both
            be told the same money is theirs.
          </p>
        )}

        {short && (
          <Callout tone="warning" title="Not enough to pay this from the wallet">
            <p>
              You are {formatKobo(Math.abs(funds.afterKobo))} short. That does
              not stop you approving this payroll — approving is about whether
              the figures are right, and they are a separate question from
              whether the money has landed yet.
            </p>
            <p className="mt-2">
              What it does stop is paying from the wallet. Fund it, or send the
              bank file to your bank instead — both routes are offered once this
              is approved.
            </p>
          </Callout>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * How many people this payment actually pays.
 *
 * Not `headcountLabel`, which answers a different question — see the comment
 * where the exclusion is rendered. A payment carries an instruction per
 * payslip, so somebody excluded from the run is not in it at all, and the
 * number beside the amount has to be the number of people the amount is
 * divided between.
 */
function paidCount(run: { employeeCount: number }): string {
  return `${String(run.employeeCount)} ${run.employeeCount === 1 ? "person" : "people"}`;
}

function Figure({
  label,
  kobo,
  tone,
}: {
  label: string;
  kobo: number;
  tone?: "danger" | "success";
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-meta text-muted">{label}</dt>
      <dd
        className={
          tone === "danger"
            ? "text-body font-medium text-danger-text"
            : tone === "success"
              ? "text-body font-medium text-success-text"
              : "text-body font-medium text-ink"
        }
      >
        {formatKobo(kobo)}
      </dd>
    </div>
  );
}

/**
 * Where money goes into the wallet.
 *
 * Rendered where a shortfall is, because a shortfall is not an instruction
 * until there is an account number under it. Empty is an ordinary state — a
 * company on the bank-file path has never needed a collection account — and it
 * says so rather than showing nothing, since somebody looking at a shortfall
 * with no account on screen needs to know who to ask.
 */
export function FundingAccounts({
  accounts,
}: {
  accounts: {
    provider: string;
    accountNumber: string;
    accountName: string;
    bankName: string;
  }[];
}) {
  if (accounts.length === 0) {
    return (
      <Callout tone="info" title="No funding account yet">
        This company has no collection account, so money cannot be paid into the
        wallet. Ask your ApproveHR contact to open one — it takes minutes, and
        transfers into it credit the wallet automatically.
      </Callout>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-body">
        Transfer into{" "}
        {accounts.length === 1 ? "this account" : "any of these accounts"} and
        the wallet is credited automatically.
      </p>
      <ul className="flex flex-col gap-2">
        {accounts.map((account) => (
          <li
            key={`${account.provider}-${account.accountNumber}`}
            className="flex items-start gap-3 rounded-lg border border-line bg-canvas p-3"
          >
            <Landmark aria-hidden="true" className="mt-0.5 size-4 text-muted" />
            <div className="flex flex-col gap-0.5">
              <span className="tabular text-body font-medium text-ink">
                {account.accountNumber}
              </span>
              <span className="text-body-sm text-body">{account.bankName}</span>
              <span className="text-meta text-muted">{account.accountName}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The wallet's four figures, for a screen that is about the wallet itself. */
export function WalletFigures({
  wallet,
  loading,
}: {
  wallet: {
    balanceKobo: number;
    committedKobo: number;
    availableKobo: number;
    fundedKobo: number;
  } | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-body-sm text-muted">
        <Spinner size="sm" />
        Reading the ledger
      </div>
    );
  }
  if (!wallet) return null;

  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      <Figure label="Available to pay with" kobo={wallet.availableKobo} />
      <Figure label="In the account" kobo={wallet.balanceKobo} />
      <Figure label="Already promised" kobo={wallet.committedKobo} />
    </dl>
  );
}
