import type { ApiLoan, LoanStatus } from "@/lib/api/loans";
import { addMonths } from "@/lib/loans/schedule";

/**
 * The loan book, one entry per person.
 *
 * The API answers with one row per **loan**, which is right for the wire and
 * wrong for the question a person asks of the book ("what does Ime Dennis owe?").
 * Somebody with two loans (a finished one and the one being repaid, or a
 * consolidation) used to be two rows in different places, and the screen had no
 * search to find either. This is the pure half of the fix: it turns the loans in
 * hand into people, with the figures a row prints. `loans-screen.tsx` renders it.
 *
 * ## What each figure counts
 *
 * | Figure | Counts | Because |
 * |---|---|---|
 * | Borrowed | loans that are not waiting or declined | money that was lent; a request is not a loan yet |
 * | Left to pay | ACTIVE loans' `outstandingKobo` | what the schedule still holds |
 * | A month | ACTIVE loans' `monthlyRepaymentKobo` | what payroll will take, not what a finished loan once did |
 * | Finishes | the latest end month of a loan that started | when the last one stops |
 *
 * "ACTIVE" here means being recovered: `APPROVED` is treated the same. The API
 * never leaves a loan there (approval goes straight to ACTIVE) but the enum has
 * it, and a status a screen cannot render is a blank cell.
 *
 * ## An absent figure is never a zero
 *
 * ADR-0003. A person with nothing being repaid has no "left to pay", not a
 * ₦0.00 one, and a person whose loans have not started has no finish month. So
 * `leftKobo`, `monthlyKobo`, `borrowedKobo` and `finishes` are `null` rather
 * than `0` or `""` when there is nothing for them to count, and the screen
 * prints "—".
 *
 * ## The sums are over the loans handed in
 *
 * Nothing here knows about tabs. The screen asks the server for the loans of one
 * tab, so "Borrowed" on the Fully repaid tab is the sum of the repaid loans.
 *
 * Everything is integer kobo and stays that way. There is no division by 100 in
 * this file; the screen's `naira()` is the one boundary.
 */

/** The figures a row prints, for one loan or for one person's loans together. */
export type LoanFigures = {
  /** Null when nothing counted: no loan of theirs has been lent. */
  borrowedKobo: number | null;
  /** Null when no loan is being repaid. */
  leftKobo: number | null;
  /** Null when no loan is being repaid. */
  monthlyKobo: number | null;
  /** `YYYY-MM-01` of the month the last deduction comes out of, or null. */
  finishes: string | null;
};

export type LoanPerson = {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  jobTitle: string;
  /** Newest first. Equal timestamps keep the order they arrived in. */
  loans: ApiLoan[];
  count: number;
  /** All of this person's loans added together. See the table above. */
  figures: LoanFigures;
  /** How many of their loans are in each status. */
  counts: Record<LoanStatus, number>;
  /** The status the row's badge shows: the one most worth knowing about. */
  headline: LoanStatus;
  /** Loans not in the headline status. The "+1" beside the badge. */
  others: number;
};

const NO_COUNTS = (): Record<LoanStatus, number> => ({
  PENDING: 0,
  APPROVED: 0,
  ACTIVE: 0,
  SETTLED: 0,
  DECLINED: 0,
  CONSOLIDATED: 0,
  CANCELLED: 0,
});

/** A loan whose repayments are being taken. */
const isRecovering = (status: LoanStatus): boolean =>
  status === "ACTIVE" || status === "APPROVED";

/** A loan that has been lent: neither still waiting nor turned down. */
const isLent = (status: LoanStatus): boolean =>
  status !== "PENDING" && status !== "DECLINED" && status !== "CANCELLED";

/**
 * Which status a person's row shows.
 *
 * Waiting first, because it is the one that asks something of the reader; then
 * the one being repaid, because that is what is on the payslip; then the
 * history, newest meaning most relevant.
 */
const HEADLINE_ORDER: LoanStatus[] = [
  "PENDING",
  "ACTIVE",
  "APPROVED",
  "SETTLED",
  "CANCELLED",
  "DECLINED",
];

/**
 * The month a loan's last deduction comes out of, as `YYYY-MM-01`.
 *
 * Null for a loan that has not started: waiting, declined, or with no start
 * period yet. Same rule as `finishesLabel` in the store, in a form that can be
 * compared and maxed.
 */
export function loanFinish(loan: ApiLoan): string | null {
  if (!isLent(loan.status) || !loan.startPeriod) return null;
  return addMonths(loan.startPeriod, loan.termMonths - 1);
}

/**
 * One loan's own figures, as its row prints them.
 *
 * Not the same rule as the person's totals above, on purpose. A person with a
 * single loan has no sum to show: their row *is* the loan, and a request that is
 * waiting still shows what was asked for and what it would cost a month, which
 * is what the person deciding it needs. Only the totals leave a request out,
 * because a total that included it would read as money already lent.
 *
 * What neither does is print a deduction for a loan that is finished or
 * declined: nothing comes out of anybody's pay for it.
 */
export function loanFigures(loan: ApiLoan): LoanFigures {
  return {
    borrowedKobo: loan.principalKobo,
    leftKobo:
      loan.status === "PENDING" ||
      loan.status === "DECLINED" ||
      loan.status === "CANCELLED"
        ? null
        : loan.outstandingKobo,
    monthlyKobo:
      loan.status === "SETTLED" ||
      loan.status === "DECLINED" ||
      loan.status === "CANCELLED"
        ? null
        : loan.monthlyRepaymentKobo,
    finishes: loanFinish(loan),
  };
}

/** Adds the loans up, leaving a figure `null` when none of them has one. */
function totalsOf(loans: ApiLoan[]): LoanFigures {
  let borrowed: number | null = null;
  let left: number | null = null;
  let monthly: number | null = null;
  let finishes: string | null = null;

  for (const loan of loans) {
    if (isLent(loan.status)) borrowed = (borrowed ?? 0) + loan.principalKobo;
    if (isRecovering(loan.status)) {
      left = (left ?? 0) + loan.outstandingKobo;
      monthly = (monthly ?? 0) + loan.monthlyRepaymentKobo;
    }
    const finish = loanFinish(loan);
    if (finish && (finishes === null || finish > finishes)) finishes = finish;
  }

  return {
    borrowedKobo: borrowed,
    leftKobo: left,
    monthlyKobo: monthly,
    finishes,
  };
}

/**
 * Groups loans by person, in the order each person first appears.
 *
 * Grouped on `employeeId`, never on the name: two people can share one, and
 * the API's id is the only thing that says they are the same person. The name,
 * number and job title are taken from the person's newest loan, which is the
 * one most likely to be current if a title changed between the two.
 */
export function groupLoansByPerson(loans: readonly ApiLoan[]): LoanPerson[] {
  const byPerson = new Map<string, ApiLoan[]>();
  for (const loan of loans) {
    const held = byPerson.get(loan.employeeId);
    if (held) held.push(loan);
    else byPerson.set(loan.employeeId, [loan]);
  }

  return [...byPerson.entries()].map(([employeeId, theirs]) => {
    /* Newest first. `Array.prototype.sort` is stable, so loans created in the
       same instant keep the order the API sent them in. */
    const ordered = [...theirs].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    const newest = ordered[0]!;

    const counts = NO_COUNTS();
    for (const loan of ordered) counts[loan.status] += 1;
    const headline =
      HEADLINE_ORDER.find((status) => counts[status] > 0) ?? newest.status;

    return {
      employeeId,
      employeeName: newest.employeeName,
      employeeNo: newest.employeeNo,
      jobTitle: newest.jobTitle,
      loans: ordered,
      count: ordered.length,
      figures: totalsOf(ordered),
      counts,
      headline,
      others: ordered.length - counts[headline],
    };
  });
}

/**
 * The order people are listed in.
 *
 * Anybody with a loan waiting for a decision first, because that is the list
 * somebody opens this screen to clear. Then the biggest balance still owed,
 * because that is the money the company is most exposed on. Then name, so two
 * people with nothing owed have a fixed place and not whatever the API sent.
 * People with nothing owed (`leftKobo` null) sort below anybody who owes, even
 * a few kobo.
 *
 * One order, not a choice of them. Sorting a column in the browser is the thing
 * `SortableTH` warns against when the rows in hand are a page of a longer list,
 * and the screen cannot always tell it has the whole book.
 */
export function sortPeople(people: readonly LoanPerson[]): LoanPerson[] {
  return [...people].sort((a, b) => {
    const waiting = Number(b.counts.PENDING > 0) - Number(a.counts.PENDING > 0);
    if (waiting !== 0) return waiting;

    const owedA = a.figures.leftKobo;
    const owedB = b.figures.leftKobo;
    if (owedA !== owedB) {
      if (owedA === null) return 1;
      if (owedB === null) return -1;
      return owedB - owedA;
    }

    return a.employeeName.localeCompare(b.employeeName, "en", {
      sensitivity: "base",
    });
  });
}

/* ------------------------------------------------------------------- search */

/** What the search box is matched against. */
type Findable = { employeeName: string; employeeNo: string };

/**
 * The words of what somebody typed, lower-cased.
 *
 * Empty for an empty or all-space box, which matches everybody — a search
 * that has not been started hides nothing.
 */
export function searchWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Does this person match what is in the search box?
 *
 * Every word must appear somewhere in the name or the staff number, in any
 * order and in any case, so "dennis ime" finds Ime Dennis and "1042" finds the
 * person whose number contains it. The directory's search takes words the same
 * way.
 *
 * It matches the **person**, and the caller keeps all of that person's loans: a
 * search by name that dropped the loan which was not in the status you were
 * looking at would show half a person.
 */
export function matchesLoanSearch(person: Findable, query: string): boolean {
  const words = searchWords(query);
  if (words.length === 0) return true;
  const haystack = `${person.employeeName} ${person.employeeNo}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
}
