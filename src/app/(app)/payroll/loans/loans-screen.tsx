"use client";

import { sourceNote } from "@/lib/demo";
import { Fragment, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  ChevronDown,
  ChevronRight,
  CreditCard,
  Plus,
  Wallet,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  FilterBar,
  Money,
  Pagination,
  rowClick,
  SortableTH,
  Spinner,
  TableWrap,
  Tabs,
  TBody,
  TD,
  TDPrimary,
  TextLink,
  TH,
  THead,
  TR,
  useToast,
  LoadState,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { FeatureOffLine } from "@/components/portal/feature-off-line";
import { ApiError } from "@/lib/api/client";
import {
  naira,
  type ApiLoan,
  type ApiLoanSummary,
  type LoanListParams,
  type LoanStatus,
} from "@/lib/api/loans";
import {
  groupLoansByPerson,
  loanFigures,
  matchesLoanSearch,
  sortPeople,
  type LoanFigures,
  type LoanPerson,
} from "@/lib/loans/group";
import { monthLabel } from "@/lib/loans/schedule";
import {
  LOAN_STATUS_LABEL,
  finishesLabel,
  useLoanActions,
  useLoans,
  useLoanSummary,
} from "@/lib/store/loans";
import { usePermissions } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import { shortDate } from "@/lib/today";
import { useDebounced } from "@/lib/use-debounced";
import { ApplyLoanModal } from "./apply-loan";
import { ApprovedLoanCard } from "./approved-loan-card";
import { DeclineLoanModal } from "./decisions";

/**
 * Staff loans.
 *
 * ## One route, rendered by role
 *
 * There is no separate approval queue page, and there is no separate "my loans"
 * page. `PARITY.md`'s first rule is one route per concept, and this is one
 * concept: money the company has lent its staff and is recovering from payroll.
 *
 * - Somebody with `VIEW_SALARIES` sees the whole book, filtered by status.
 * - Somebody with `APPROVE_LOANS` gets **Approve and Decline on the row** — the
 *   queue is this table with the status filter set to waiting, because a product
 *   called ApproveHR should not make you navigate to approve something.
 * - Everybody else sees their own loans and can apply. Same URL, so the link a
 *   colleague sends works for them too.
 *
 * ## One row per person
 *
 * The API answers with a row per loan. The book is read by person ("what does
 * Ime Dennis still owe?") and a person with a finished loan and a live one used
 * to be two rows in two places, with no search to find either. So the whole
 * book is loaded in one request, grouped by `employeeId` (`lib/loans/group.ts`)
 * and searched in the browser; the grouping is pure and has its own tests.
 *
 * - A person with **one** loan is that loan's row: the name links to it and
 *   Approve, Decline or Withdraw sit on the row, as they always did.
 * - A person with **several** shows their totals and "2 loans"; the chevron
 *   opens one row per loan, each with its own figures, link and action.
 *
 * The columns are the questions asked about a staff loan, in order: who, how
 * much was lent, how much is left, what comes out a month (the figure on a
 * payslip), when it finishes. Nothing is abbreviated: a figure somebody has to
 * reconcile against a bank statement is written out in full, with kobo —
 * `₦2.9m` is unreconcilable. A person with nothing being repaid has no "left to
 * pay", and the cell says "—", not ₦0.00.
 *
 * ## The order is fixed, and the headers do not sort
 *
 * People with a loan waiting for a decision first, then the biggest balance
 * still owed, then name. A header that sorts the rows in hand is only honest
 * when they are the whole book, and this screen cannot always tell (below), so
 * the columns are plain rather than some of them doing nothing.
 *
 * ## Search, and a book bigger than one request
 *
 * Typing filters what is loaded, at once, on the name and the staff number.
 * That is the whole of search for any company the product has today, and it does
 * not need the server.
 *
 * The API caps a page at 200. If the book is bigger than that the screen says
 * so — "Showing the first 200 of 312 loans" — and **also** sends what was typed
 * to the API as `q`, after a pause, so the server can find the rest once it
 * searches on it. Until it does it ignores `q` and the screen is searching the
 * 200 in hand, which the notice says.
 *
 * ## One line, not three cards
 *
 * What is still owed and what comes out of this month's payroll are the two
 * numbers somebody opens the screen for, and they are one sentence under the
 * title. The third card, loans waiting, said what the Waiting tab's count
 * already does.
 */

type Filter = LoanStatus | "ALL";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "PENDING", label: "Waiting" },
  { id: "ACTIVE", label: "Being repaid" },
  { id: "SETTLED", label: "Fully repaid" },
  { id: "DECLINED", label: "Declined" },
];

/**
 * The words in a status cell and the tabs, so a row and the tab it is under say
 * the same thing. `LOAN_STATUS_LABEL` is the long form, for a sentence.
 */
const STATUS_WORD: Record<LoanStatus, string> = {
  PENDING: "Waiting",
  APPROVED: "Approved",
  ACTIVE: "Being repaid",
  SETTLED: "Fully repaid",
  DECLINED: "Declined",
};

/** The API's own allow-list, taken from its params rather than re-typed. */
type LoanSort = NonNullable<LoanListParams["sort"]>;

/** The API's page cap. One request of this size is the whole book for a
 *  company with a few hundred loans, which is every one there is today. */
const BOOK_PAGE_SIZE = 200;

/** Renders the Approve / Decline / Withdraw buttons for one loan, or nothing. */
type RenderAction = (loan: ApiLoan, className?: string) => React.ReactNode;

export function LoansScreen() {
  const { can, loading: permissionsLoading } = usePermissions();
  const { employeeId, isConnected } = useSession();
  const toast = useToast();

  const seeEverybody = can("VIEW_SALARIES");
  const canDecide = can("APPROVE_LOANS");
  const canApplyForOthers = can("EDIT_RECORDS");

  const [filter, setFilter] = useState<Filter>("ALL");
  /* Page one, unless the book is bigger than one request. */
  const [page, setPage] = useState(1);
  /* The own-loans list's page size. The whole book is always one 200. */
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  /* Whose loans are open, by employee. Local: a refresh closes them. */
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const [applying, setApplying] = useState(false);
  const [declining, setDeclining] = useState<ApiLoan | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  /* The loan just approved, kept above the list until the next decision
     replaces it or it is closed. `n` makes each approval a new moment. */
  const [approvedLoan, setApprovedLoan] = useState<{
    loan: ApiLoan;
    n: number;
  } | null>(null);

  /**
   * Which endpoint answers.
   *
   * The Waiting tab is the approval queue, so somebody who can decide gets
   * `/loans/pending` — oldest first, because the person who has waited longest
   * should be at the top of a queue. Everybody else gets the plain list with a
   * status filter, newest first, and never asks for an endpoint their
   * permissions would refuse.
   */
  const scope =
    filter === "PENDING" && canDecide
      ? "pending"
      : seeEverybody
        ? "all"
        : "mine";

  /**
   * The column the **server** orders by, on the own-loans list.
   *
   * Server-side, which is the only kind that is not a lie on a paged table. The
   * book's own table has no sortable headers (see the header note), so this is
   * only ever the person's own few loans.
   */
  const [sort, setSort] = useState<LoanSort>("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const toggleSort = (column: string, startDescending = false) => {
    const next = column as LoanSort;
    if (sort !== next) {
      setSort(next);
      setOrder(startDescending ? "desc" : "asc");
    } else {
      setOrder(order === "asc" ? "desc" : "asc");
    }
    /* Back to page one. Somebody on page 3 who re-sorts is asking a different
       question, and page 3 of the new answer is not where they were. */
    setPage(1);
  };

  /**
   * Whether the book outgrew one request, learned from an answer to the
   * question asked **without** a search.
   *
   * It has to be remembered rather than read off the current answer: a search
   * the server has narrowed to three loans has a total of three, which would
   * say the book is small, stop the search being sent, and bring the whole book
   * back — and so on, round and round.
   */
  const [bookIsLarger, setBookIsLarger] = useState(false);
  const typed = search.trim();
  const settled = useDebounced(typed, 250);
  const sendSearch = seeEverybody && bookIsLarger && settled !== "";

  const list = useLoans({
    scope,
    page,
    pageSize: seeEverybody ? BOOK_PAGE_SIZE : pageSize,
    /* Newest first within each status, which is how the API orders everything:
       status first, so a book too big for one request cuts off its settled and
       declined tail, not the loans still being repaid. */
    sort: seeEverybody ? "createdAt" : sort,
    order: seeEverybody ? "desc" : order,
    ...(scope === "pending" || filter === "ALL" ? {} : { status: filter }),
    ...(sendSearch ? { q: settled } : {}),
    /* Typing must not collapse the list to a skeleton. */
    keepPrevious: seeEverybody,
  });
  const { summary } = useLoanSummary(seeEverybody);
  const { approve } = useLoanActions();

  /* Set during render, guarded so it settles: React re-renders at once with the
     new value and the condition is false the second time. */
  if (seeEverybody && !sendSearch && !list.loading && !list.error) {
    const larger = list.total > list.loans.length;
    if (larger !== bookIsLarger) setBookIsLarger(larger);
  }

  const people = useMemo(
    () =>
      seeEverybody
        ? sortPeople(
            groupLoansByPerson(list.loans).filter((person) =>
              matchesLoanSearch(person, search),
            ),
          )
        : [],
    [seeEverybody, list.loans, search],
  );
  const loanCount = people.reduce((total, person) => total + person.count, 0);

  const tabs = useMemo(
    () =>
      FILTERS.map((item) => ({
        id: item.id,
        label: item.label,
        ...(item.id === "PENDING" && summary && summary.pendingCount > 0
          ? { count: summary.pendingCount }
          : {}),
      })),
    [summary],
  );

  /** One click, from wherever you already are. No dialog in the way. */
  async function decide(loan: ApiLoan) {
    setDeciding(loan.id);
    try {
      const approved = await approve(loan.id);
      /* No toast: the card above the list says what was approved. */
      setApprovedLoan((current) => ({
        loan: approved,
        n: (current?.n ?? 0) + 1,
      }));
    } catch (error) {
      toast.push({
        title: "Could not approve it",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setDeciding(null);
    }
  }

  const toggle = (id: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /** Back to everything: the way out of an empty tab. */
  const showAll = () => {
    setApprovedLoan(null);
    setFilter("ALL");
    setPage(1);
    setSearch("");
  };

  const rowAction: RenderAction = (loan, className) => (
    <LoanRowAction
      loan={loan}
      own={loan.employeeId === employeeId}
      canDecide={canDecide}
      deciding={deciding === loan.id}
      onDecide={() => void decide(loan)}
      onDecline={() => setDeclining(loan)}
      {...(className ? { className } : {})}
    />
  );

  if (permissionsLoading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
        <span className="sr-only">Loading</span>
      </PageBody>
    );
  }

  /* The count is for the rows on screen, so it waits for there to be some: a
     first load has no answer yet, and "0 people" would be a claim. */
  const countKnown = !list.error && (!list.loading || list.loans.length > 0);
  const searching = typed !== "";

  return (
    <>
      <PageHeader
        title="Staff loans"
        meta={
          sourceNote(isConnected) && (
            <Badge tone="warning" size="sm" dot>
              {sourceNote(isConnected)}
            </Badge>
          )
        }
        action={
          <Button variant="accent" size="sm" onClick={() => setApplying(true)}>
            <Plus aria-hidden="true" className="size-4" />
            {canApplyForOthers ? "Add a loan" : "Apply for a loan"}
          </Button>
        }
        tabs={
          seeEverybody ? (
            <Tabs
              items={tabs}
              value={filter}
              onChange={(id) => {
                /* An approval belongs to the list it was made from. */
                setApprovedLoan(null);
                setFilter(id as Filter);
                setPage(1);
              }}
            />
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        <FeatureOffLine feature="loans" />
        {seeEverybody && summary && <OwedLine summary={summary} />}

        {approvedLoan && (
          <ApprovedLoanCard
            key={approvedLoan.n}
            loan={approvedLoan.loan}
            onDismiss={() => setApprovedLoan(null)}
          />
        )}

        {/* Outside the load state, so the box keeps its focus and its text
            while the list under it is being replaced. */}
        {seeEverybody && (
          <FilterBar
            search={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            searchPlaceholder="Search by name or staff number"
            searchLabel="Search staff loans by name or staff number"
            actions={
              countKnown && (
                <p className="text-meta text-muted">
                  <span className="font-medium text-ink">
                    {people.length.toLocaleString("en-NG")}
                  </span>{" "}
                  {people.length === 1 ? "person" : "people"} ·{" "}
                  <span className="font-medium text-ink">
                    {loanCount.toLocaleString("en-NG")}
                  </span>{" "}
                  {loanCount === 1 ? "loan" : "loans"}
                  {searching && " match"}
                </p>
              )
            }
          />
        )}

        {/* The one loading and failure rule. After a failed read this printed
            "Nobody has a staff loan" under the failure card. `hasData` is the
            rows in hand, which the hook keeps across a search. */}
        <LoadState
          loading={list.loading}
          error={list.error}
          subject="the loans"
          onRetry={list.reload}
          skeleton="table"
          hasData={list.loans.length > 0}
        >
          {list.loans.length === 0 ? (
            <EmptyState
              icon={<CreditCard aria-hidden="true" />}
              title={
                filter !== "ALL"
                  ? `No loans ${LOAN_STATUS_LABEL[filter as LoanStatus].toLowerCase()}`
                  : seeEverybody
                    ? "Nobody has a staff loan"
                    : "You have no loan"
              }
              description={
                filter !== "ALL"
                  ? "Try another tab."
                  : seeEverybody
                    ? "When you lend somebody money, put it here and payroll recovers it a month at a time."
                    : "If you need one, ask for it here. You will see what it costs you a month before you send it."
              }
              action={
                filter === "ALL" ? (
                  <Button variant="accent" onClick={() => setApplying(true)}>
                    {canApplyForOthers ? "Add a loan" : "Apply for a loan"}
                  </Button>
                ) : (
                  <Button onClick={showAll}>Show all loans</Button>
                )
              }
            />
          ) : seeEverybody ? (
            <>
              {list.total > list.loans.length && page === 1 && (
                <p className="text-meta text-muted">
                  {searching
                    ? `Searching the first ${list.loans.length.toLocaleString("en-NG")} of ${list.total.toLocaleString("en-NG")} loans.`
                    : `Showing the first ${list.loans.length.toLocaleString("en-NG")} of ${list.total.toLocaleString("en-NG")} loans. Search to narrow it.`}
                </p>
              )}

              {people.length === 0 ? (
                <EmptyState
                  compact
                  icon={<CreditCard aria-hidden="true" />}
                  title="Nobody matches that"
                  description="Try part of a name, or a staff number."
                  action={
                    <Button onClick={() => setSearch("")}>Clear search</Button>
                  }
                />
              ) : (
                <>
                  <div className="hidden sm:block">
                    <PeopleTable
                      people={people}
                      open={open}
                      onToggle={toggle}
                      rowAction={rowAction}
                    />
                  </div>
                  <PeopleList
                    people={people}
                    open={open}
                    onToggle={toggle}
                    rowAction={rowAction}
                  />
                </>
              )}

              {/* Only for a book bigger than one request: the way to the rest
                  before the server searches. Otherwise the line above the
                  table has already said how many there are. */}
              {list.total > BOOK_PAGE_SIZE && (
                <Pagination
                  className="rounded-lg border border-line border-t bg-surface"
                  page={page}
                  pageSize={BOOK_PAGE_SIZE}
                  total={list.total}
                  onPageChange={setPage}
                  noun={["loan", "loans"]}
                  loading={list.loading}
                />
              )}
            </>
          ) : (
            <>
              <OwnLoans
                loans={list.loans}
                sort={sort}
                order={order}
                onSort={toggleSort}
                rowAction={rowAction}
              />

              {/* The shared control, replacing a hand-rolled Showing-x–y-of-z and
                two default-variant buttons. */}
              <Pagination
                className="rounded-lg border border-line border-t bg-surface"
                page={list.page}
                pageSize={list.pageSize}
                total={list.total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
                noun={["loan", "loans"]}
                loading={list.loading}
              />
            </>
          )}
        </LoadState>

        {/* One line, said once. The other half of this — what happens when a
            month cannot carry the full instalment — belongs on the instalment
            it happened to, and is spelled out there rather than as a general
            warning on a table where it may not apply to anybody. */}
        {seeEverybody && list.loans.length > 0 && (
          <p className="flex items-start gap-2 text-body-sm text-muted">
            <Wallet aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Repayments come out of net pay, after tax. A loan is not
              tax-deductible, so it does not change anybody&rsquo;s PAYE.
            </span>
          </p>
        )}
      </PageBody>

      {/* Mounted on open rather than hidden behind a flag, so each one starts
          with empty fields and no leftover error. The `key` covers reopening the
          same dialog for a different loan. */}
      {applying && (
        <ApplyLoanModal
          onClose={() => setApplying(false)}
          canApplyForOthers={canApplyForOthers}
        />
      )}

      {declining && (
        <DeclineLoanModal
          key={declining.id}
          loan={declining}
          own={declining.employeeId === employeeId}
          onClose={() => setDeclining(null)}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------- the summary */

/**
 * What is owed and what payroll takes this month, as one sentence.
 *
 * `Money` rather than a formatted string, so the hide-figures preference covers
 * these two numbers the way it covers every other on the screen.
 */
function OwedLine({ summary }: { summary: ApiLoanSummary }) {
  if (summary.activeCount === 0) {
    return (
      <p className="text-body-sm text-muted">
        No loan is being repaid right now.
      </p>
    );
  }
  const { thisMonth } = summary;
  return (
    <p className="text-body-sm text-muted">
      <Money amount={naira(summary.outstandingKobo)} decimals /> still owed
      across {summary.activeCount}{" "}
      {summary.activeCount === 1 ? "loan" : "loans"} ·{" "}
      {thisMonth.instalmentCount === 0 ? (
        "nothing comes out of this month’s payroll"
      ) : (
        <>
          <Money amount={naira(thisMonth.deductionKobo)} decimals /> comes out
          of this month&rsquo;s payroll
          {thisMonth.arrearsKobo > 0 && (
            <>
              , including{" "}
              <Money amount={naira(thisMonth.arrearsKobo)} decimals /> carried
              from a short month
            </>
          )}
        </>
      )}
    </p>
  );
}

/* ------------------------------------------------------------ the book view */

const dash = <span className="text-muted">—</span>;

/** A kobo figure written out in full, or the dash for one that is absent. */
const money = (kobo: number | null) =>
  kobo === null ? dash : <Money amount={naira(kobo)} decimals />;

/** What the Finishes cell says when there is no month to give. */
const whenNoFinish = (loan: ApiLoan | null): string =>
  loan?.status === "PENDING" ? "Once approved" : "—";

/** "1 fully repaid, 1 declined": the loans the status badge's "+n" stands for. */
function otherStatuses(person: LoanPerson): string {
  return (Object.keys(STATUS_WORD) as LoanStatus[])
    .filter((status) => status !== person.headline && person.counts[status] > 0)
    .map(
      (status) =>
        `${person.counts[status]} ${STATUS_WORD[status].toLowerCase()}`,
    )
    .join(", ");
}

function PersonStatus({ person }: { person: LoanPerson }) {
  return (
    <Badge size="sm">
      {STATUS_WORD[person.headline]}
      {person.others > 0 && (
        <span className="text-faint" title={`Also ${otherStatuses(person)}`}>
          +{person.others}
          <span className="sr-only"> more: {otherStatuses(person)}</span>
        </span>
      )}
    </Badge>
  );
}

/** Borrowed, Left to pay, A month, Finishes: four cells, for a loan or a person. */
function FigureCells({
  figures,
  noFinish,
}: {
  figures: LoanFigures;
  noFinish: string;
}) {
  return (
    <>
      <TD align="right">{money(figures.borrowedKobo)}</TD>
      <TD align="right">{money(figures.leftKobo)}</TD>
      <TD align="right">{money(figures.monthlyKobo)}</TD>
      <TD>
        {figures.finishes ? (
          monthLabel(figures.finishes)
        ) : (
          <span className="text-muted">{noFinish}</span>
        )}
      </TD>
    </>
  );
}

function ExpandButton({
  person,
  open,
  onToggle,
  className,
}: {
  person: LoanPerson;
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} ${person.employeeName}’s ${person.count} loans`}
      {...(className ? { className } : {})}
    >
      {person.count} loans
      {open ? (
        <ChevronDown aria-hidden="true" className="size-4" />
      ) : (
        <ChevronRight aria-hidden="true" className="size-4" />
      )}
    </Button>
  );
}

type BookProps = {
  people: LoanPerson[];
  open: ReadonlySet<string>;
  onToggle: (employeeId: string) => void;
  rowAction: RenderAction;
};

function PeopleTable({ people, open, onToggle, rowAction }: BookProps) {
  return (
    <TableWrap caption="Staff loans, one row for each person, with what is left to repay">
      <THead>
        <TH>Who</TH>
        <TH align="right">Borrowed</TH>
        <TH align="right">Left to pay</TH>
        <TH align="right">A month</TH>
        <TH>Finishes</TH>
        <TH>Status</TH>
        <TH>
          <span className="sr-only">Actions</span>
        </TH>
      </THead>
      <TBody>
        {people.map((person) => (
          <PersonRows
            key={person.employeeId}
            person={person}
            open={open.has(person.employeeId)}
            onToggle={() => onToggle(person.employeeId)}
            rowAction={rowAction}
          />
        ))}
      </TBody>
    </TableWrap>
  );
}

function PersonRows({
  person,
  open,
  onToggle,
  rowAction,
}: {
  person: LoanPerson;
  open: boolean;
  onToggle: () => void;
  rowAction: RenderAction;
}) {
  const only = person.count === 1 ? person.loans[0]! : null;
  const subtitle = `${person.employeeNo} · ${person.jobTitle}`;

  return (
    <Fragment>
      {/* The whole row opens a person's loans, for the mouse; the button is the
          keyboard's way in and the one a screen reader finds. A row of one has
          nothing to open and is not clickable, as before. */}
      <TR
        interactive={only === null}
        {...(only === null ? { onClick: rowClick(onToggle) } : {})}
      >
        <TDPrimary
          title={
            only ? (
              <TextLink href={`/payroll/loans/${only.id}`}>
                {person.employeeName}
              </TextLink>
            ) : (
              person.employeeName
            )
          }
          subtitle={subtitle}
        />
        <FigureCells
          figures={only ? loanFigures(only) : person.figures}
          noFinish={whenNoFinish(only)}
        />
        <TD>
          {only ? (
            <Badge size="sm">{STATUS_WORD[only.status]}</Badge>
          ) : (
            <PersonStatus person={person} />
          )}
        </TD>
        <TD align="right">
          {only ? (
            rowAction(only, "justify-end")
          ) : (
            <ExpandButton person={person} open={open} onToggle={onToggle} />
          )}
        </TD>
      </TR>

      {open &&
        only === null &&
        person.loans.map((loan) => (
          <TR key={loan.id} className="bg-canvas">
            <TDPrimary
              className="pl-8"
              title={
                <TextLink
                  href={`/payroll/loans/${loan.id}`}
                  className="block max-w-xs truncate"
                >
                  {loan.reason ?? "Staff loan"}
                </TextLink>
              }
              subtitle={`Applied ${shortDate(loan.createdAt.slice(0, 10))}`}
            />
            <FigureCells
              figures={loanFigures(loan)}
              noFinish={whenNoFinish(loan)}
            />
            <TD>
              <Badge size="sm">{STATUS_WORD[loan.status]}</Badge>
            </TD>
            <TD align="right">{rowAction(loan, "justify-end")}</TD>
          </TR>
        ))}
    </Fragment>
  );
}

/** The same book on a phone: a card for a person, a card inside it for a loan. */
function PeopleList({ people, open, onToggle, rowAction }: BookProps) {
  return (
    <ul className="divide-y divide-line sm:hidden">
      {people.map((person) => {
        const only = person.count === 1 ? person.loans[0]! : null;
        const isOpen = open.has(person.employeeId);
        return (
          <li key={person.employeeId} className="flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {only ? (
                  <TextLink
                    href={`/payroll/loans/${only.id}`}
                    className="text-body-sm"
                  >
                    {person.employeeName}
                  </TextLink>
                ) : (
                  <span className="text-body-sm font-medium text-ink">
                    {person.employeeName}
                  </span>
                )}
                <p className="mt-0.5 text-meta text-muted">
                  {person.employeeNo} · {person.jobTitle}
                </p>
              </div>
              {only ? (
                <Badge size="sm">{STATUS_WORD[only.status]}</Badge>
              ) : (
                <PersonStatus person={person} />
              )}
            </div>

            <CardFigures
              figures={only ? loanFigures(only) : person.figures}
              noFinish={whenNoFinish(only)}
            />

            {only ? (
              rowAction(only)
            ) : (
              <ExpandButton
                person={person}
                open={isOpen}
                onToggle={() => onToggle(person.employeeId)}
                className="self-start"
              />
            )}

            {isOpen && only === null && (
              <ul className="divide-y divide-line rounded-lg border border-line bg-canvas">
                {person.loans.map((loan) => (
                  <li key={loan.id} className="flex flex-col gap-2 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <TextLink
                          href={`/payroll/loans/${loan.id}`}
                          className="text-body-sm"
                        >
                          {loan.reason ?? "Staff loan"}
                        </TextLink>
                        <p className="mt-0.5 text-meta text-muted">
                          Applied {shortDate(loan.createdAt.slice(0, 10))}
                        </p>
                      </div>
                      <Badge size="sm">{STATUS_WORD[loan.status]}</Badge>
                    </div>
                    <CardFigures
                      figures={loanFigures(loan)}
                      noFinish={whenNoFinish(loan)}
                    />
                    {rowAction(loan)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The label-and-figure lines of a card. */
function CardFigures({
  figures,
  noFinish,
}: {
  figures: LoanFigures;
  noFinish: string;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-body-sm text-muted">Borrowed</span>
        <span className="tabular text-body-sm text-body">
          {money(figures.borrowedKobo)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-body-sm text-muted">Left to pay</span>
        <span className="tabular text-body-sm font-medium text-ink">
          {money(figures.leftKobo)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-body-sm text-muted">A month</span>
        <span className="tabular text-body-sm text-body">
          {money(figures.monthlyKobo)}
        </span>
      </div>
      <p className="text-meta text-muted">
        Finishes{" "}
        {figures.finishes
          ? monthLabel(figures.finishes)
          : noFinish.toLowerCase()}
      </p>
    </>
  );
}

/* ------------------------------------------------------- somebody's own view */

/**
 * The loans of somebody who cannot see the book: theirs, one row each. Not
 * grouped and not searched — a person has a handful — and still sorted by the
 * server, which is the only sort that is not a lie on a paged list.
 */
function OwnLoans({
  loans,
  sort,
  order,
  onSort,
  rowAction,
}: {
  loans: ApiLoan[];
  sort: LoanSort;
  order: "asc" | "desc";
  onSort: (column: string, startDescending?: boolean) => void;
  rowAction: RenderAction;
}) {
  return (
    <>
      <div className="hidden sm:block">
        <TableWrap caption="Your staff loans, with what is left to repay on each">
          <THead>
            <TH>What for</TH>
            {/* Only the columns the API's own allow-list accepts:
                `createdAt | principal | outstanding | status | startPeriod`.
                A header offering a column it refuses is one that appears to
                do nothing. "A month" and "Finishes" are derived from the
                schedule and are not among them. */}
            <SortableTH
              column="principal"
              active={sort}
              order={order}
              onSort={(column) => onSort(column, true)}
              align="right"
              startDescending
            >
              Borrowed
            </SortableTH>
            <SortableTH
              column="outstanding"
              active={sort}
              order={order}
              onSort={(column) => onSort(column, true)}
              align="right"
              startDescending
            >
              Left to pay
            </SortableTH>
            <TH align="right">A month</TH>
            <TH>Finishes</TH>
            <SortableTH
              column="status"
              active={sort}
              order={order}
              onSort={(column) => onSort(column)}
            >
              Status
            </SortableTH>
            <TH>
              <span className="sr-only">Decide</span>
            </TH>
          </THead>
          <TBody>
            {loans.map((loan) => {
              const finishes = finishesLabel(loan);
              return (
                <TR key={loan.id}>
                  <TDPrimary
                    title={
                      <TextLink href={`/payroll/loans/${loan.id}`}>
                        {loan.reason ?? "Staff loan"}
                      </TextLink>
                    }
                    subtitle={`Applied ${shortDate(loan.createdAt.slice(0, 10))}`}
                  />
                  <TD align="right">
                    <Money amount={naira(loan.principalKobo)} decimals />
                  </TD>
                  <TD align="right">
                    {/* Nothing is owed until somebody approves it, and
                        nothing is owed on a decline. Showing the total
                        repayable here would read as a debt that exists,
                        and on an interest-bearing application it would
                        show more than the row says was borrowed. */}
                    {loan.status === "PENDING" || loan.status === "DECLINED" ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <Money amount={naira(loan.outstandingKobo)} decimals />
                    )}
                  </TD>
                  <TD align="right">
                    <Money amount={naira(loan.monthlyRepaymentKobo)} decimals />
                  </TD>
                  <TD>
                    {finishes ?? (
                      <span className="text-muted">
                        {loan.status === "PENDING" ? "Once approved" : "—"}
                      </span>
                    )}
                  </TD>
                  <TD>
                    <Badge size="sm">{LOAN_STATUS_LABEL[loan.status]}</Badge>
                  </TD>
                  <TD align="right">{rowAction(loan, "justify-end")}</TD>
                </TR>
              );
            })}
          </TBody>
        </TableWrap>
      </div>

      <ul className="divide-y divide-line sm:hidden">
        {loans.map((loan) => {
          const finishes = finishesLabel(loan);
          return (
            <li key={loan.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <TextLink
                    href={`/payroll/loans/${loan.id}`}
                    className="text-body-sm"
                  >
                    {loan.reason ?? "Staff loan"}
                  </TextLink>
                  <p className="mt-0.5 text-meta text-muted">
                    Applied {shortDate(loan.createdAt.slice(0, 10))}
                  </p>
                </div>
                <Badge size="sm">{LOAN_STATUS_LABEL[loan.status]}</Badge>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-body-sm text-muted">Borrowed</span>
                <span className="tabular text-body-sm text-body">
                  <Money amount={naira(loan.principalKobo)} decimals />
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-body-sm text-muted">Left to pay</span>
                <span className="tabular text-body-sm font-medium text-ink">
                  {loan.status === "PENDING" || loan.status === "DECLINED" ? (
                    "—"
                  ) : (
                    <Money amount={naira(loan.outstandingKobo)} decimals />
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-body-sm text-muted">A month</span>
                <span className="tabular text-body-sm text-body">
                  <Money amount={naira(loan.monthlyRepaymentKobo)} decimals />
                </span>
              </div>
              <p className="text-meta text-muted">
                Finishes{" "}
                {finishes ??
                  (loan.status === "PENDING" ? "once approved" : "—")}
              </p>

              {rowAction(loan)}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Shared by the desktop `<TD>` and the mobile `<li>` so the two cannot offer
 *  different actions for the same loan. */
function LoanRowAction({
  loan,
  own,
  canDecide,
  deciding,
  onDecide,
  onDecline,
  className,
}: {
  loan: ApiLoan;
  own: boolean;
  canDecide: boolean;
  deciding: boolean;
  onDecide: () => void;
  onDecline: () => void;
  className?: string;
}) {
  if (loan.status !== "PENDING") return null;
  /* Self-approval is refused by the API whatever your permissions are, so the
     row does not offer it. Withdrawing your own is allowed, and is what you
     would want from this row. */
  if (own) {
    return (
      <Button size="sm" variant="ghost" onClick={onDecline}>
        Withdraw
      </Button>
    );
  }
  if (canDecide) {
    return (
      <div className={cn("flex gap-1.5", className)}>
        <Button
          size="sm"
          variant="approve"
          loading={deciding}
          onClick={onDecide}
        >
          Approve
        </Button>
        <Button size="sm" variant="ghost" onClick={onDecline}>
          Decline
        </Button>
      </div>
    );
  }
  return null;
}
