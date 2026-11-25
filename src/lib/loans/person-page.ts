import type { ApiLoan, LoanStatus } from "@/lib/api/loans";
import { groupLoansByPerson, type LoanFigures } from "@/lib/loans/group";

/**
 * What a person's loan page is made of.
 *
 * The page used to be one loan. It is now all of a person's loans one under the
 * other, so that nobody opens them one at a time (`loan-detail-screen.tsx`).
 * Everything that is a decision about the loans in hand, and not about how they
 * are drawn, is here so it can be read and tested without a screen.
 *
 * ## The loan that was opened comes first
 *
 * Somebody who clicked the waiting loan came to decide it, and somebody who
 * followed a link from a payslip or a notification came for that loan. So it is
 * the first thing on the page whatever its status. The rest follow in a fixed
 * order, so two people looking at the same person see the same page.
 *
 * ## Nothing here adds a loan up twice
 *
 * A loan that was folded into another (`CONSOLIDATED`) is a record, not money
 * still owed: what was owed on it moved into the loan that took it over. The
 * summary is over every other loan and never the folded ones. The sums
 * themselves are `groupLoansByPerson`'s, the same ones the list prints, so the
 * figures here and the person's row there cannot disagree.
 */

/**
 * How many loans one page will draw in full.
 *
 * Each one is a request for its schedule, so the page needs an end. Twenty is far
 * beyond what anybody has (the loans are folded into one when a new one is
 * approved), and a person who has more is told how many were left off, never
 * shown a total that quietly leaves some out.
 */
export const MAX_LOANS_ON_PAGE = 20;

/**
 * The order the loans after the first one are listed in: waiting for a decision,
 * then being repaid, then the history. Newest first inside each. Same idea as
 * the person's row in the list, where the status most worth knowing about leads.
 */
const ORDER: Record<LoanStatus, number> = {
  PENDING: 0,
  APPROVED: 1,
  ACTIVE: 1,
  SETTLED: 2,
  DECLINED: 3,
  CONSOLIDATED: 4,
};

export function orderLoans<T extends ApiLoan>(loans: readonly T[]): T[] {
  return [...loans].sort((a, b) => {
    const rank = ORDER[a.status] - ORDER[b.status];
    if (rank !== 0) return rank;
    /* Newest first. `sort` is stable, so loans created in the same instant keep
       the order the API sent them in. */
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });
}

/** The loans that go below the opened one, and how many there was no room for. */
export type OtherLoans<T extends ApiLoan> = {
  shown: T[];
  /** Zero when every loan is on the page. */
  leftOff: number;
};

/**
 * Picks the loans that go under the opened one: everything except it, in the
 * fixed order above, as many as the page has room for.
 *
 * `total` is how many loans the person has in all, as the API counted them, so a
 * list that was itself cut short still says how many were left off.
 */
export function chooseOthers<T extends ApiLoan>(
  openedId: string,
  loans: readonly T[],
  total: number,
): OtherLoans<T> {
  const openedIsInIt = loans.some((loan) => loan.id === openedId);
  const rest = orderLoans(loans.filter((loan) => loan.id !== openedId));
  const shown = rest.slice(0, MAX_LOANS_ON_PAGE - 1);
  const others = Math.max(rest.length, total - (openedIsInIt ? 1 : 0));
  return { shown, leftOff: Math.max(0, others - shown.length) };
}

/** What the summary at the top of a person's page says. */
export type PersonSummary = {
  /** The loans the figures are over: not the ones folded into another. */
  count: number;
  figures: LoanFigures;
  /** How many are in each status, for the line under the heading. */
  counts: Record<LoanStatus, number>;
  /** True when a loan is waiting or declined, which the figures leave out. */
  leavesOutRequests: boolean;
};

/**
 * The summary over every loan the person has that is not folded into another.
 *
 * `null` when there is nothing to total, which is the person with no loan and
 * not a person whose loans add up to nothing. The page draws no summary for
 * them. `groupLoansByPerson` is the one place the figures are worked out, so the
 * list and this page add up the same way.
 */
export function summaryOf(loans: readonly ApiLoan[]): PersonSummary | null {
  const counted = loans.filter((loan) => loan.status !== "CONSOLIDATED");
  const person = groupLoansByPerson(counted)[0];
  if (!person) return null;
  return {
    count: person.count,
    figures: person.figures,
    counts: person.counts,
    leavesOutRequests: person.counts.PENDING + person.counts.DECLINED > 0,
  };
}

/** The order the statuses are named in: what asks something of the reader first. */
const NAMED: LoanStatus[] = [
  "PENDING",
  "ACTIVE",
  "APPROVED",
  "SETTLED",
  "DECLINED",
];

/**
 * "1 waiting, 2 being repaid", from the counts and the words the screen uses for
 * each status. An approved loan is named as one being repaid and added to it,
 * because that is what it is for everyone reading (the API never leaves a loan
 * there, and the list treats the two the same).
 */
export function statusLine(
  counts: Record<LoanStatus, number>,
  word: (status: LoanStatus) => string,
): string {
  const merged: Partial<Record<LoanStatus, number>> = { ...counts };
  merged.ACTIVE = (counts.ACTIVE ?? 0) + (counts.APPROVED ?? 0);
  merged.APPROVED = 0;
  return NAMED.filter((status) => (merged[status] ?? 0) > 0)
    .map((status) => `${String(merged[status])} ${word(status).toLowerCase()}`)
    .join(", ");
}
