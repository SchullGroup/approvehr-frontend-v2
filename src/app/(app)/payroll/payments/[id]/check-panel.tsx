"use client";

import { AlertTriangle, Check, RefreshCw, TriangleAlert } from "lucide-react";
import {
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Money,
} from "@/components/ui";
import {
  naira,
  type ApiBatchDetail,
  type PaymentDiscrepancy,
} from "@/lib/api/payments";
import { people } from "../format";

/**
 * The check — the gate that makes an impossible payment file impossible.
 *
 * ## It shows what it verified, not that it passed
 *
 * "Everything adds up" on its own is a claim, and the audit of the incumbent on
 * 20 August 2026 found figures displayed as settled that were out by ₦44,330
 * with nothing on screen to say otherwise. So the passing state lists the three
 * figures that had to be equal and the two counts that had to match, each with
 * the number beside it. Somebody who does not trust it can read it.
 *
 * The three figures are genuinely three: what the payroll run said, what the
 * batch says, and what the rows add up to. They are stored in different places
 * and summed at different times, which is the only reason comparing them is
 * worth anything.
 *
 * ## Every problem names a person and offers the fix
 *
 * "3 accounts are invalid" is a message somebody has to go and investigate.
 * "Grace Effiong has no account number on file" with a link to her record is one
 * they can act on. The API writes the messages that way and this renders them
 * with the link attached.
 *
 * A **blocker** stops the approval. A **warning** is named and lets it through:
 * two people sharing an account number is occasionally a real family
 * arrangement, and a gate that cannot be got past for a legitimate case is a
 * gate people learn to route around.
 *
 * ## Bank details are named once, not twice
 *
 * A missing bank name or a malformed account number now stops the payroll run
 * itself from being approved (`payroll/service.ts`), before this batch ever
 * exists — see the comment on that blocker for why. So the itemised, per-person
 * red rows below are reserved for problems that are genuinely about *this
 * batch*: a total that does not add up, two people sharing an account, a
 * source account that has been switched off. A bank-detail problem is folded
 * into one quiet line pointing back at the run instead, because by the time
 * anybody is looking at this page it should not be possible to have one — and
 * the rare batch that still does (built before this rule existed, most likely)
 * should read as "go fix it at the source", not as eight more things wrong with
 * this screen.
 */
export function CheckPanel({
  batch,
  onRecheck,
  rechecking,
}: {
  batch: ApiBatchDetail;
  onRecheck: () => void;
  rechecking: boolean;
}) {
  const allBlockers = batch.check.discrepancies.filter((d) => d.severity === "BLOCKER");
  const warnings = batch.check.discrepancies.filter((d) => d.severity === "WARNING");

  /* The two codes the payroll run's own check now catches first. Split out so
     they render as one line pointing back at the run rather than a row each —
     see the header comment on why this list should almost always be empty. */
  const BANK_DETAIL_CODES = new Set(["missing_bank_name", "invalid_account_number"]);
  const bankProblems = allBlockers.filter((d) => BANK_DETAIL_CODES.has(d.code));
  const blockers = allBlockers.filter((d) => !BANK_DETAIL_CODES.has(d.code));

  /** Whose record to open for a finding about one person. */
  const employeeFor = (finding: PaymentDiscrepancy): string | null => {
    if (!finding.instructionId) return null;
    const row = batch.instructions.find((i) => i.id === finding.instructionId);
    return row ? row.employeeId : null;
  };

  const namedPeople = new Set(
    allBlockers.map((finding) => finding.payeeName).filter(Boolean),
  );

  return (
    <Card>
      <CardHeader
        level={2}
        title={
          batch.check.ok
            ? "Everything adds up"
            : namedPeople.size > 0
              ? `${people(namedPeople.size)} cannot be paid yet`
              : "This batch does not add up yet"
        }
        description={
          batch.check.ok
            ? "Checked just now, against the payroll run and the rows in this batch."
            : undefined
        }
        action={
          batch.can.check ? (
            <Button
              variant="secondary"
              size="sm"
              loading={rechecking}
              onClick={onRecheck}
            >
              <RefreshCw aria-hidden="true" className="size-3.5" />
              Check again
            </Button>
          ) : undefined
        }
      />

      <CardBody className="flex flex-col gap-5">
        {/* One quiet line, not a row per person — see the header comment.
            This should be rare: the payroll run itself refuses to approve
            anybody with a bank-detail problem, so a batch reaching this page
            with one is almost always older than that rule. */}
        {bankProblems.length > 0 && (
          <Callout tone="warning" title="Bank details need fixing on the payroll">
            <p>
              {people(bankProblems.length)} on this batch{" "}
              {bankProblems.length === 1 ? "has" : "have"} a bank detail that is
              missing or does not add up. Fix it on their record, then rebuild
              this batch — the details on it were copied in when it was built
              and will not update on their own.
            </p>
            {batch.payrollRunId && (
              <ButtonLink
                href={
                  batch.period
                    ? `/payroll/runs/new?period=${batch.period.slice(0, 7)}`
                    : "/payroll"
                }
                variant="secondary"
                size="sm"
                className="mt-3"
              >
                Open the payroll run
              </ButtonLink>
            )}
          </Callout>
        )}

        {blockers.length > 0 && (
          <ul className="flex flex-col gap-2.5">
            {blockers.map((finding, index) => {
              const employeeId = employeeFor(finding);
              return (
                <li
                  key={`${finding.code}-${finding.instructionId ?? index}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger-line bg-danger-soft px-3.5 py-3"
                >
                  <span className="flex min-w-0 items-start gap-2.5">
                    <TriangleAlert
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-danger-text"
                    />
                    <span className="text-body-sm leading-relaxed text-danger-text">
                      <span className="sr-only">Blocked: </span>
                      {finding.message}
                    </span>
                  </span>
                  {employeeId && (
                    <ButtonLink
                      href={`/people/${employeeId}`}
                      variant="secondary"
                      size="sm"
                    >
                      Fix record
                    </ButtonLink>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* An instruction, not an explanation: the details were copied onto the
            batch when it was built, so editing a record does not reach back into
            it. What somebody needs is the order of the two steps. */}
        {blockers.length > 0 && (
          <p className="text-body-sm text-body">
            Fix the records, then build this batch again.
          </p>
        )}

        {warnings.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <h3 className="text-body-sm font-semibold text-ink">
              Worth checking before you release
            </h3>
            <ul className="flex flex-col gap-2.5">
              {warnings.map((finding, index) => {
                const employeeId = employeeFor(finding);
                return (
                  <li
                    key={`${finding.code}-${finding.instructionId ?? index}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning-line bg-warning-soft px-3.5 py-3"
                  >
                    <span className="flex min-w-0 items-start gap-2.5">
                      <AlertTriangle
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-warning-text"
                      />
                      <span className="text-body-sm leading-relaxed text-warning-text">
                        <span className="sr-only">Warning: </span>
                        {finding.message}
                      </span>
                    </span>
                    {employeeId && (
                      <ButtonLink
                        href={`/people/${employeeId}`}
                        variant="secondary"
                        size="sm"
                      >
                        Open record
                      </ButtonLink>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* What was verified, with the figures. Shown whether or not it passed:
            when it fails, these are what the reader needs in order to see which
            of the three sources disagrees with the other two. */}
        <dl className="divide-y divide-line rounded-md border border-line">
          <Figure
            term="The payroll run comes to"
            value={<Money amount={naira(batch.expectedTotalKobo)} decimals size="xl" />}
          />
          <Figure
            term="This batch says"
            value={<Money amount={naira(batch.computedTotalKobo)} decimals size="xl" />}
          />
          <Figure
            term={`The ${batch.instructions.length} payments add up to`}
            value={<Money amount={naira(batch.check.instructionTotalKobo)} decimals size="xl" />}
          />
          <Verified
            term="All three figures agree"
            ok={
              batch.expectedTotalKobo === batch.computedTotalKobo &&
              batch.computedTotalKobo === batch.check.instructionTotalKobo
            }
            value={
              <span className="text-body-sm font-medium text-ink">
                {batch.expectedTotalKobo === batch.computedTotalKobo &&
                batch.computedTotalKobo === batch.check.instructionTotalKobo
                  ? "Yes"
                  : "No"}
              </span>
            }
          />
          <Verified
            term="Rows match the number of people"
            ok={batch.itemCount === batch.instructions.length}
            value={
              <span className="tabular text-body-sm font-medium text-ink">
                {batch.instructions.length} of {batch.itemCount}
              </span>
            }
          />
          <Verified
            term="Everybody has a ten-digit account number"
            ok={batch.instructions.every((row) => row.accountNumberOk)}
            value={
              <span className="tabular text-body-sm font-medium text-ink">
                {batch.instructions.filter((row) => row.accountNumberOk).length} of{" "}
                {batch.instructions.length}
              </span>
            }
          />
        </dl>

        {!batch.can.check && (
          <p className="text-body-sm text-muted">
            This batch has been approved, so the check is a read from here on.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * One verified figure.
 *
 * The tick or the cross carries a text alternative rather than a colour alone,
 * and the term is the sentence the figure completes — so a screen reader reads
 * "matches: the payroll run comes to ₦4,233,291.88".
 */
function Verified({
  term,
  value,
  ok,
}: {
  term: string;
  value: React.ReactNode;
  ok: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
      <dt className="flex items-center gap-2.5 text-body-sm text-body">
        {ok ? (
          <Check
            aria-hidden="true"
            strokeWidth={3}
            className="size-3.5 shrink-0 text-success-text"
          />
        ) : (
          <TriangleAlert
            aria-hidden="true"
            className="size-3.5 shrink-0 text-danger-text"
          />
        )}
        <span className="sr-only">{ok ? "Matches: " : "Does not match: "}</span>
        {term}
      </dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}

/** One figure, stated. No verdict attached — the verdict rows do that. */
function Figure({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
      <dt className="pl-6 text-body-sm text-body">{term}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
