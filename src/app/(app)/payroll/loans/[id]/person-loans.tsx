"use client";

import {
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  LoadState,
  Money,
  TextLink,
  formatMoney,
} from "@/components/ui";
import { naira, type ApiLoan } from "@/lib/api/loans";
import { monthLabel } from "@/lib/loans/schedule";
import {
  statusLine,
  type PersonSummary as Summary,
} from "@/lib/loans/person-page";
import { LOAN_STATUS_WORD, type PersonLoans } from "@/lib/store/loans";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDate } from "@/lib/time";
import { Figure, LoanSection } from "./loan-section";

/**
 * The rest of a person's loans, drawn under the one that was opened.
 *
 * Kept apart from the screen on purpose. The screen waits on one loan and says
 * "that loan is not here" when it cannot be read; this waits on the others and
 * says "their other loans did not load". Those are different facts with
 * different remedies, and putting both in one file is how a screen comes to say
 * "nothing here" beneath "this did not load" (`scripts/verify-load-rule.ts`).
 *
 * ## An answer that is empty draws nothing
 *
 * A person with no other loan is the ordinary case, and for them this draws no
 * heading, no "no other loans" and no count. Saying nothing is the true
 * statement: it is never read as a claim about loans nobody asked for.
 */

const money = (amountKobo: number) =>
  formatMoney(naira(amountKobo), "NGN", { decimals: true });

/** The summary above every loan: what the person's loans come to together. */
export function PersonSummary({
  summary,
  own,
}: {
  summary: Summary;
  own: boolean;
}) {
  const { figures, counts } = summary;
  return (
    <Card>
      <CardHeader
        title={own ? "All your loans" : "All their loans"}
        description={`${String(summary.count)} loans: ${statusLine(
          counts,
          (status) => LOAN_STATUS_WORD[status],
        )}`}
        level={2}
      />
      <CardBody className="flex flex-col gap-3">
        {/* A figure that has nothing to count is left out, never printed as nil:
            a person with nothing being repaid has no "left to pay". */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          {figures.borrowedKobo !== null && (
            <Figure term="Borrowed">
              <Money amount={naira(figures.borrowedKobo)} decimals size="lg" />
            </Figure>
          )}
          {figures.leftKobo !== null && (
            <Figure term="Left to pay">
              <Money amount={naira(figures.leftKobo)} decimals size="lg" />
            </Figure>
          )}
          {figures.monthlyKobo !== null && (
            <Figure term="A month">
              <Money amount={naira(figures.monthlyKobo)} decimals size="lg" />
            </Figure>
          )}
          {figures.finishes !== null && (
            <Figure term="Finishes">
              <span className="text-body-md font-medium">
                {monthLabel(figures.finishes)}
              </span>
            </Figure>
          )}
        </dl>
        {summary.leavesOutRequests && (
          <p className="text-meta text-muted">
            Waiting and declined loans are not counted in these figures.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/** Every other loan the person has, each in full. */
export function OtherLoans({ person }: { person: PersonLoans }) {
  return (
    <LoadState
      loading={person.loading}
      error={person.error}
      subject="their other loans"
      onRetry={person.reload}
      hasData={person.others !== null}
      skeleton="detail"
    >
      {person.others?.map((loan) => (
        <LoanSection
          key={loan.id}
          loan={loan}
          solo={false}
          highlighted={false}
          separated
        />
      ))}
      {person.leftOff > 0 && (
        <p className="text-body-sm text-muted">
          {person.leftOff === 1
            ? "One more loan is not shown here."
            : `${String(person.leftOff)} more loans are not shown here.`}
        </p>
      )}
    </LoadState>
  );
}

/**
 * Loans that were folded into another one.
 *
 * A record and not a loan: what was still owed on each moved into the loan that
 * took it over, and nothing comes off it any more. So they are closed by
 * default, one line each, with a way to open the one that took them over.
 * Following a line opens that loan in the page, as any other loan is opened.
 */
export function FoldedLoans({ loans }: { loans: ApiLoan[] }) {
  const timeZone = useOrgTimezone();
  if (loans.length === 0) return null;
  return (
    <Disclosure
      title="Combined into another loan"
      meta={String(loans.length)}
      level={2}
    >
      <ul className="divide-y divide-line">
        {loans.map((loan) => (
          <li
            key={loan.id}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3"
          >
            <div className="min-w-0">
              <TextLink
                href={`/payroll/loans/${loan.id}`}
                className="block max-w-xs truncate text-body-sm"
              >
                {loan.reason ?? "Staff loan"}
              </TextLink>
              <p className="mt-0.5 text-meta text-muted">
                Applied {formatDate(loan.createdAt, timeZone)}
              </p>
            </div>
            <p className="text-meta text-muted">
              {money(loan.principalKobo)}
              {loan.consolidatedAt
                ? `, combined on ${formatDate(loan.consolidatedAt, timeZone)}`
                : ", combined"}
            </p>
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}
