"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { ApiError } from "@/lib/api/client";
import {
  kobo,
  loansApi,
  type ApiLoan,
  type ApiLoanDetail,
  type ApiLoanSummary,
  type ApiRepayment,
  type ApplyLoanBody,
  type ApproveLoanBody,
  type LoanListParams,
  type LoanRepaymentStatus,
  type LoanStatus,
  type PayRepaymentBody,
} from "@/lib/api/loans";
import {
  addMonths,
  buildSchedule,
  monthLabel,
  monthStart,
  priceLoan,
} from "@/lib/loans/schedule";
import { employeeById } from "@/lib/mock/people";
import { TODAY } from "@/lib/today";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";

/**
 * Staff loans, from whichever source is available.
 *
 * The two modes every store in here has: the API when it answers, local data
 * when it does not. What is worth explaining is **where the line falls in demo
 * mode**, because the other two API-backed stores draw it somewhere else.
 *
 * | | Connected | Demo |
 * |---|---|---|
 * | Read the book, the schedules, the arrears | yes | yes, from a seeded book |
 * | Price a loan before applying | yes | yes — the arithmetic is pure |
 * | Apply, approve, decline, record a payment, write one off | yes | **yes, to this browser** |
 *
 * `store/departments.ts` and `store/grades.ts` refuse their writes in demo mode,
 * and that is right for them: a department is a payroll reporting boundary and a
 * band is what the company has decided a job is worth, so a tree or a band edge
 * kept in browser storage would teach the demo's audience something false about
 * where those numbers live.
 *
 * A loan decision is not that. It is a request somebody made and somebody else
 * answered, the same shape as a leave request — and `store/leave.ts` has always
 * persisted decisions locally. More to the point, **this product is called
 * ApproveHR**, and an approval queue you cannot approve from is not a
 * demonstration of it. The schedule the demo generates is the schedule the
 * server would have generated, because `lib/loans/schedule.ts` is a port of the
 * same function. So the demo is not a mock-up of the flow, it is the flow
 * without a database behind it.
 *
 * The honesty is carried where it belongs: every screen shows the mode it is in,
 * and nothing here ever claims a deduction reached a payroll run.
 *
 * ## The schedule is the authority
 *
 * `outstandingKobo` and the whole `progress` block are **derived on read** from
 * the instalment rows, never stored. The API takes the same position — it
 * recomputes `Loan.outstanding` absolutely on every write rather than
 * incrementing it — and deriving it here means the demo cannot drift into a
 * state the server could not be in.
 */

/* --------------------------------------------------------------- the shapes */

/**
 * What the demo book holds.
 *
 * `progress` and `outstandingKobo` are deliberately **not** stored: they are
 * functions of the schedule, and a copy of a derived figure is a copy that can
 * disagree with what it was derived from.
 */
type StoredLoan = Omit<ApiLoanDetail, "progress" | "outstandingKobo">;

/** Derives the figures the API derives, so both paths hand screens one shape. */
function withProgress(loan: StoredLoan): ApiLoanDetail {
  const { schedule } = loan;
  const scheduledKobo = schedule.reduce((total, r) => total + r.amountKobo, 0);
  const paidKobo = schedule.reduce((total, r) => total + r.paidAmountKobo, 0);
  const waivedKobo = schedule
    .filter((r) => r.status === "WAIVED")
    .reduce((total, r) => total + Math.max(0, r.amountKobo - r.paidAmountKobo), 0);
  const remainingKobo = schedule.reduce((total, r) => total + r.remainingKobo, 0);
  const nextDue = schedule.find(
    (r) => r.status === "SCHEDULED" || r.status === "PARTIAL",
  );

  /* A pending loan has no schedule yet, so the whole amount is what is owed —
     which is what the API writes at application time for the same reason. A
     declined one is owed nothing. */
  const outstandingKobo =
    loan.status === "PENDING"
      ? loan.totalRepayableKobo
      : loan.status === "DECLINED"
        ? 0
        : remainingKobo;

  return {
    ...loan,
    outstandingKobo,
    progress: {
      instalmentsTotal: schedule.length,
      instalmentsSettled: schedule.filter(
        (r) => r.status === "PAID" || r.status === "WAIVED",
      ).length,
      scheduledKobo,
      paidKobo,
      waivedKobo,
      remainingKobo,
      nextDueDate: nextDue?.dueDate ?? null,
      nextDueKobo: nextDue?.remainingKobo ?? 0,
    },
  };
}

/* ----------------------------------------------------------- the demo book */

type SeedLoan = {
  id: string;
  employeeId: string;
  /** Naira. Converted once, at the bottom of this block. */
  principal: number;
  termMonths: number;
  /** Fraction. 0 is the interest-free staff advance, and the common case. */
  interestRate: number;
  status: LoanStatus;
  reason: string;
  createdAt: string;
  startPeriod?: string;
  /** Naira recovered against each instalment, in order. Missing means nothing. */
  paid?: number[];
  waived?: number[];
  decidedById?: string;
  decidedAt?: string;
  declinedReason?: string;
  completedAt?: string;
};

/**
 * A loan book for the seed company, anchored to `TODAY`.
 *
 * Written to cover every state a screen has to render, because a demo that only
 * shows the happy path is a demo that hides the interesting screens:
 *
 * - Chidi's is **mid-recovery with a short month** — July took ₦12,000 of
 *   ₦100,000, so August owes the arrears *and* its own instalment. That case is
 *   the reason the detail page spells out what happened in a sentence.
 * - Two are **waiting for a decision**, so the queue is not empty. Neither
 *   belongs to the default demo user, because self-approval is refused and a
 *   queue where every Approve button errors would look broken rather than
 *   principled.
 * - One is **settled** and one is **declined with a reason**, so those states
 *   have something real behind them.
 */
const SEED: SeedLoan[] = DEMO_ENABLED ? [
  {
    id: "loan-0001",
    employeeId: "p-03",
    principal: 600_000,
    termMonths: 6,
    interestRate: 0,
    status: "ACTIVE",
    reason: "Deposit on a flat closer to the office.",
    createdAt: "2026-03-21T10:12:00.000Z",
    startPeriod: "2026-04-01",
    /* April, May and June recovered in full. July took ₦12,000 of ₦100,000 —
       the month the salary would not carry it. */
    paid: [100_000, 100_000, 100_000, 12_000],
    decidedById: "p-02",
    decidedAt: "2026-03-24T08:40:00.000Z",
  },
  {
    id: "loan-0002",
    employeeId: "p-05",
    principal: 250_000,
    termMonths: 5,
    interestRate: 0,
    status: "PENDING",
    reason: "School fees for my daughter's second term.",
    createdAt: "2026-08-14T14:05:00.000Z",
  },
  {
    id: "loan-0003",
    employeeId: "p-04",
    principal: 900_000,
    termMonths: 12,
    interestRate: 0.05,
    status: "PENDING",
    reason: "My landlord wants two years' rent up front.",
    createdAt: "2026-08-17T09:32:00.000Z",
  },
  {
    id: "loan-0004",
    employeeId: "p-07",
    principal: 180_000,
    termMonths: 3,
    interestRate: 0,
    status: "SETTLED",
    reason: "Generator repair after the flood.",
    createdAt: "2026-01-18T11:20:00.000Z",
    startPeriod: "2026-02-01",
    paid: [60_000, 60_000, 60_000],
    decidedById: "p-02",
    decidedAt: "2026-01-19T15:02:00.000Z",
    completedAt: "2026-04-28T10:00:00.000Z",
  },
  {
    id: "loan-0005",
    employeeId: "p-09",
    principal: 2_000_000,
    termMonths: 4,
    interestRate: 0,
    status: "DECLINED",
    reason: "Buying a car.",
    createdAt: "2026-08-06T16:41:00.000Z",
    declinedReason:
      "Four months would take ₦500,000 a month, which is more than half your take-home. Reapply over twelve months and we can look at it again.",
    decidedById: "p-02",
    decidedAt: "2026-08-07T09:10:00.000Z",
  },
] : [];

/** Who a demo loan belongs to. The seed directory is the only name source here. */
function personOf(employeeId: string): {
  employeeName: string;
  employeeNo: string;
  jobTitle: string;
} {
  const person = employeeById(employeeId);
  return {
    employeeName: person ? `${person.firstName} ${person.lastName}` : "Unknown",
    employeeNo: person?.employeeNo ?? "—",
    jobTitle: person?.jobTitle ?? "—",
  };
}

function seedSchedule(seed: SeedLoan): ApiRepayment[] {
  if (!seed.startPeriod) return [];
  const schedule = buildSchedule({
    principalKobo: kobo(seed.principal),
    termMonths: seed.termMonths,
    interestRate: seed.interestRate,
    startPeriod: seed.startPeriod,
  });

  return schedule.lines.map((line, index) => {
    const waived = seed.waived?.includes(line.sequence) ?? false;
    const paidAmountKobo = Math.min(kobo(seed.paid?.[index] ?? 0), line.amountKobo);
    const status: LoanRepaymentStatus = waived
      ? "WAIVED"
      : paidAmountKobo >= line.amountKobo
        ? "PAID"
        : paidAmountKobo > 0
          ? "PARTIAL"
          : "SCHEDULED";
    return {
      id: `${seed.id}-r${line.sequence}`,
      sequence: line.sequence,
      dueDate: line.dueDate,
      amountKobo: line.amountKobo,
      paidAmountKobo,
      remainingKobo: waived ? 0 : Math.max(0, line.amountKobo - paidAmountKobo),
      status,
      paidAt: paidAmountKobo > 0 ? `${line.dueDate}T09:15:00.000Z` : null,
      /* Payroll took it, so it carries the payslip that did. A manual payment
         would not. */
      payslipId: paidAmountKobo > 0 ? `${seed.id}-slip-${line.sequence}` : null,
      note: null,
    };
  });
}

function seedLoan(seed: SeedLoan): StoredLoan {
  const principalKobo = kobo(seed.principal);
  const interestKobo = Math.round(
    (principalKobo * seed.interestRate * seed.termMonths) / 12,
  );
  const priced = priceLoan({
    principalKobo,
    termMonths: seed.termMonths,
    interestRate: seed.interestRate,
    startPeriod: seed.startPeriod ?? addMonths(TODAY, 1),
  });
  const decider = seed.decidedById ? employeeById(seed.decidedById) : undefined;

  return {
    id: seed.id,
    employeeId: seed.employeeId,
    ...personOf(seed.employeeId),
    principalKobo,
    interestRate: seed.interestRate,
    interestKobo,
    totalRepayableKobo: principalKobo + interestKobo,
    termMonths: seed.termMonths,
    monthlyRepaymentKobo: priced?.instalmentKobo ?? 0,
    status: seed.status,
    reason: seed.reason,
    startPeriod: seed.startPeriod ?? null,
    decidedById: seed.decidedById ?? null,
    decidedByName: decider ? `${decider.firstName} ${decider.lastName}` : null,
    decidedAt: seed.decidedAt ?? null,
    declinedReason: seed.declinedReason ?? null,
    completedAt: seed.completedAt ?? null,
    createdAt: seed.createdAt,
    schedule: seedSchedule(seed),
  };
}

const SEED_BOOK: StoredLoan[] = SEED.map(seedLoan);

/* ------------------------------------------------------------ the demo store */

type DemoState = { book: StoredLoan[] | null };

/**
 * `book: null` means "nothing local has happened", which is why it is not an
 * empty array: an empty array would be indistinguishable from a book somebody
 * had emptied, and would strand them with no loans and no way back.
 */
const demo = createPersistedState<DemoState>({
  key: "approvehr.loans.store",
  empty: { book: null },
  version: 1,
});

function useDemoBook(): StoredLoan[] {
  const state = useSyncExternalStore(
    demo.subscribe,
    demo.read,
    demo.getServerSnapshot,
  );
  return state.book ?? SEED_BOOK;
}

/** Reads outside a component, for the mutations. */
const currentBook = (): StoredLoan[] => demo.read().book ?? SEED_BOOK;

const commitBook = (book: StoredLoan[]) => demo.commit({ book });

/* ------------------------------------------------------------------ revision */

/**
 * A counter every reader watches and every write bumps.
 *
 * Connected, a mutation has to invalidate whatever else is on screen — approve a
 * loan and the list, the summary tiles and the detail panel are all stale at
 * once. Threading a `reload` from each hook through to each button is how one of
 * them gets forgotten and a tile keeps showing a figure that has changed. This
 * is one line at the call site instead: bump, and everything refetches.
 *
 * Demo mode does not need it — the persisted store notifies its own subscribers
 * — but the writes bump anyway so both paths behave identically.
 */
let revision = 0;
const revisionListeners = new Set<() => void>();

function bumpRevision() {
  revision += 1;
  revisionListeners.forEach((listener) => listener());
}

function subscribeRevision(listener: () => void): () => void {
  revisionListeners.add(listener);
  return () => {
    revisionListeners.delete(listener);
  };
}

/* Starts at 0 and only moves after a user action, so the server snapshot and the
   client's first render agree — no hydration mismatch to engineer around. */
const ZERO = () => 0;

function useRevision(): number {
  return useSyncExternalStore(subscribeRevision, () => revision, ZERO);
}

/* ---------------------------------------------------------------- the lists */

export type LoanScope = "all" | "pending" | "mine";

export type LoanListParamsWithScope = LoanListParams & {
  /**
   * Which endpoint answers.
   *
   * `all` needs `VIEW_SALARIES`, `pending` needs `APPROVE_LOANS`, `mine` needs
   * nothing. A screen that renders by role picks the scope rather than filtering
   * a list it was not allowed to ask for.
   */
  scope?: LoanScope;
};

export type LoanListState = {
  loans: ApiLoan[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  error: ApiError | null;
  /** True when these rows came from the API. */
  live: boolean;
  reload: () => void;
};

/** Pending first whatever the sort — the API does this too, because a queue is a queue. */
const STATUS_RANK: Record<LoanStatus, number> = {
  PENDING: 0,
  APPROVED: 1,
  ACTIVE: 2,
  SETTLED: 3,
  DECLINED: 4,
};

export function useLoans(params: LoanListParamsWithScope = {}): LoanListState {
  const { isConnected, actingId } = useSession();
  const book = useDemoBook();
  const rev = useRevision();

  const {
    scope = "all",
    page = 1,
    pageSize = 25,
    status,
    employeeId,
    sort,
    order,
  } = params;

  const query = useMemo<LoanListParams>(
    () => ({
      page,
      pageSize,
      ...(status ? { status } : {}),
      ...(employeeId ? { employeeId } : {}),
      ...(sort ? { sort } : {}),
      ...(order ? { order } : {}),
    }),
    [page, pageSize, status, employeeId, sort, order],
  );

  /**
   * What is being asked for, as one string.
   *
   * `rev` is part of it, so a write anywhere invalidates every list on screen —
   * approve a loan and the queue, the book and the tiles all refetch without any
   * button having to know they exist.
   */
  const key = useMemo(
    () => JSON.stringify({ scope, query, rev }),
    [scope, query, rev],
  );

  /* The answer, tagged with the request it answers. Loading is then *derived*
     from whether the tag matches what is being asked for now, so nothing has to
     set a `loading: true` flag synchronously inside an effect — which cascades a
     render, and which the demo path would do on every keystroke of a filter. */
  const [fetched, setFetched] = useState<{
    key: string;
    loans: ApiLoan[];
    total: number;
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    const call =
      scope === "pending"
        ? loansApi.pending
        : scope === "mine"
          ? loansApi.mine
          : loansApi.list;

    void (async () => {
      try {
        const result = await call(query, controller.signal);
        if (!cancelled) {
          setFetched({
            key,
            loans: result.data,
            total: result.meta.total,
            error: null,
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            loans: [],
            total: 0,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();

    /* Aborting on the way out is what makes the race safe: a filter changed
       mid-flight cancels the request rather than letting its answer land. */
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, scope, query, key]);

  if (!isConnected) {
    const mineId = scope === "mine" ? (employeeId ?? actingId) : employeeId;
    let rows = book.map(withProgress);
    if (scope === "pending") rows = rows.filter((l) => l.status === "PENDING");
    if (status) rows = rows.filter((l) => l.status === status);
    if (mineId) rows = rows.filter((l) => l.employeeId === mineId);

    /* The queue is oldest first, whatever is asked for — whoever waited longest
       goes first, and the API's `/pending` forces the same. Everything else
       honours `order`, which defaults to ascending because that is what the
       shared `listQuery` defaults to on the server: the two modes have to sort
       the same way or the demo teaches the wrong thing. */
    const ascending = scope === "pending" || (order ?? "asc") === "asc";
    rows.sort((a, b) => {
      const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (rank !== 0) return rank;
      return ascending
        ? a.createdAt.localeCompare(b.createdAt)
        : b.createdAt.localeCompare(a.createdAt);
    });

    const start = (page - 1) * pageSize;
    return {
      loans: rows.slice(start, start + pageSize),
      total: rows.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
      loading: false,
      error: null,
      live: false,
      reload: () => {},
    };
  }

  const matched = fetched !== null && fetched.key === key;
  return {
    loans: matched ? fetched.loans : [],
    total: matched ? fetched.total : 0,
    page,
    pageSize,
    totalPages: matched ? Math.max(1, Math.ceil(fetched.total / pageSize)) : 1,
    loading: !matched,
    error: matched ? fetched.error : null,
    live: true,
    /* Bumping the revision changes `key`, which re-runs the effect. One
       mechanism for "something changed" rather than two. */
    reload: bumpRevision,
  };
}

/* --------------------------------------------------------------- one loan */

export function useLoan(id: string | null): {
  loan: ApiLoanDetail | null;
  loading: boolean;
  error: ApiError | null;
  live: boolean;
} {
  const { isConnected } = useSession();
  const book = useDemoBook();
  const rev = useRevision();
  const active = Boolean(id) && isConnected;

  /* Kept as `{ id, loan }` rather than a bare loan, for the reason
     `store/departments.ts` records: the result carries the id it belongs to, so
     a slow answer for a loan you have navigated away from cannot be rendered,
     and there is nothing to clear when `id` changes. */
  const [fetched, setFetched] = useState<{
    id: string;
    loan: ApiLoanDetail | null;
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!active || !id) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const loan = await loansApi.get(id, controller.signal);
        if (!cancelled) setFetched({ id, loan, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            id,
            loan: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, active, rev]);

  if (!isConnected) {
    const found = id ? book.find((loan) => loan.id === id) : undefined;
    return {
      loan: found ? withProgress(found) : null,
      loading: false,
      error: null,
      live: false,
    };
  }

  const matched = active && fetched !== null && fetched.id === id;
  return {
    loan: matched ? fetched.loan : null,
    /* Derived rather than tracked: we are loading exactly while an active id has
       no matching answer yet, so there is no window where the previous loan is
       shown as though it were this one's. */
    loading: active && !matched,
    error: matched ? fetched.error : null,
    live: true,
  };
}

/* --------------------------------------------------------------- the summary */

export function useLoanSummary(enabled = true): {
  summary: ApiLoanSummary | null;
  loading: boolean;
  error: ApiError | null;
} {
  const { isConnected } = useSession();
  const book = useDemoBook();
  const rev = useRevision();
  const active = enabled && isConnected;

  /* Tagged and derived, exactly as `useLoans` above — a write bumps `rev`, the
     tag stops matching, and these tiles refetch. Approve a loan and the
     outstanding total is stale until they do. */
  const key = String(rev);
  const [fetched, setFetched] = useState<{
    key: string;
    summary: ApiLoanSummary | null;
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const summary = await loansApi.summary(controller.signal);
        if (!cancelled) setFetched({ key, summary, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            summary: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, key]);

  const demoSummary = useMemo<ApiLoanSummary>(() => {
    const thisMonth = monthStart(TODAY);
    const nextMonth = addMonths(TODAY, 1);
    const loans = book.map(withProgress);
    const active_ = loans.filter((loan) => loan.status === "ACTIVE");

    /* Everything still owing that is due this month **or earlier** — arrears
       from a short month are part of what payroll will try to take, and a figure
       counting only instalments dated this month would understate it. */
    const due = active_.flatMap((loan) =>
      loan.schedule.filter(
        (row) =>
          (row.status === "SCHEDULED" || row.status === "PARTIAL") &&
          row.dueDate < nextMonth,
      ),
    );

    return {
      period: thisMonth.slice(0, 7),
      outstandingKobo: active_.reduce((total, loan) => total + loan.outstandingKobo, 0),
      activeCount: active_.length,
      pendingCount: loans.filter((loan) => loan.status === "PENDING").length,
      thisMonth: {
        deductionKobo: due.reduce((total, row) => total + row.remainingKobo, 0),
        instalmentCount: due.length,
        arrearsKobo: due
          .filter((row) => row.dueDate < thisMonth)
          .reduce((total, row) => total + row.remainingKobo, 0),
      },
    };
  }, [book]);

  if (!isConnected) {
    return { summary: enabled ? demoSummary : null, loading: false, error: null };
  }

  const matched = fetched !== null && fetched.key === key;
  return {
    summary: matched ? fetched.summary : null,
    loading: active && !matched,
    error: matched ? fetched.error : null,
  };
}

/* --------------------------------------------------------------- the writes */

const conflict = (message: string) => new ApiError(409, "conflict", message);
const forbidden = (message: string) => new ApiError(403, "forbidden", message);
const unprocessable = (message: string) =>
  new ApiError(422, "unprocessable_entity", message);

const LIVE: LoanStatus[] = ["PENDING", "APPROVED", "ACTIVE"];

/** `₦1,234,567.89`. Local to the store, for error copy the API also writes. */
const naira = (amountKobo: number): string =>
  `₦${(Math.round(amountKobo) / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export type LoanActions = {
  apply: (body: ApplyLoanBody) => Promise<ApiLoanDetail>;
  /** `{}` approves exactly as applied for. Fields are a counter-offer. */
  approve: (id: string, body?: ApproveLoanBody) => Promise<ApiLoanDetail>;
  decline: (id: string, reason: string) => Promise<ApiLoanDetail>;
  pay: (id: string, sequence: number, body: PayRepaymentBody) => Promise<ApiLoanDetail>;
  waive: (id: string, sequence: number, note: string) => Promise<ApiLoanDetail>;
  /** True when these writes reach the API. */
  live: boolean;
};

export function useLoanActions(): LoanActions {
  const { isConnected, actingId, displayName } = useSession();

  /** Replaces one loan in the demo book and returns it with its progress. */
  const write = useCallback(
    (id: string, change: (loan: StoredLoan) => StoredLoan): ApiLoanDetail => {
      const book = currentBook();
      const found = book.find((loan) => loan.id === id);
      if (!found) throw new ApiError(404, "not_found", "That loan no longer exists.");
      const next = change(found);
      commitBook(book.map((loan) => (loan.id === id ? next : loan)));
      bumpRevision();
      return withProgress(next);
    },
    [],
  );

  const apply = useCallback(
    async (body: ApplyLoanBody): Promise<ApiLoanDetail> => {
      if (isConnected) {
        const loan = await loansApi.apply(body);
        bumpRevision();
        return loan;
      }

      const employeeId = body.employeeId ?? actingId;
      const person = employeeById(employeeId);
      if (!person) throw unprocessable("That employee does not exist.");

      /* One live loan at a time. Two schedules against one salary is how
         somebody lands on a net of zero with no idea which loan caused it. */
      const book = currentBook();
      const live = book
        .map(withProgress)
        .find((loan) => loan.employeeId === employeeId && LIVE.includes(loan.status));
      if (live) {
        throw conflict(
          live.status === "PENDING"
            ? `${person.firstName} already has a loan waiting for a decision. Decide that one first.`
            : `${person.firstName} still owes ${naira(live.outstandingKobo)} on an existing loan. Settle it before starting another.`,
        );
      }

      const startPeriod = body.startPeriod ?? addMonths(TODAY, 1);
      const priced = priceLoan({
        principalKobo: body.principalKobo,
        termMonths: body.termMonths,
        interestRate: body.interestRate ?? 0,
        startPeriod,
      });
      if (!priced) {
        throw unprocessable(
          "That amount and term do not make a schedule. Check the figures.",
        );
      }

      const created: StoredLoan = {
        id: `loan-${Date.now().toString(36)}`,
        employeeId,
        ...personOf(employeeId),
        principalKobo: priced.principalKobo,
        interestRate: body.interestRate ?? 0,
        interestKobo: priced.interestKobo,
        totalRepayableKobo: priced.totalKobo,
        termMonths: body.termMonths,
        monthlyRepaymentKobo: priced.instalmentKobo,
        status: "PENDING",
        reason: body.reason ?? null,
        startPeriod: body.startPeriod ?? null,
        decidedById: null,
        decidedByName: null,
        decidedAt: null,
        declinedReason: null,
        completedAt: null,
        createdAt: new Date().toISOString(),
        /* Generated at approval, not now. A pending loan with a schedule is a
           loan payroll would start deducting before anybody agreed to it. */
        schedule: [],
      };

      commitBook([created, ...book]);
      bumpRevision();
      return withProgress(created);
    },
    [isConnected, actingId],
  );

  const approve = useCallback(
    async (id: string, body: ApproveLoanBody = {}): Promise<ApiLoanDetail> => {
      if (isConnected) {
        const loan = await loansApi.approve(id, body);
        bumpRevision();
        return loan;
      }

      return write(id, (loan) => {
        if (loan.status !== "PENDING") {
          throw conflict(
            `That loan is already ${loan.status.toLowerCase()}. It cannot be approved again.`,
          );
        }
        /* The one rule here that exists for fraud rather than arithmetic. */
        if (loan.employeeId === actingId) {
          throw forbidden(
            "You cannot approve your own loan. Ask somebody else with loan approval to look at it.",
          );
        }

        const principalKobo = body.principalKobo ?? loan.principalKobo;
        const termMonths = body.termMonths ?? loan.termMonths;
        const interestRate = body.interestRate ?? loan.interestRate;
        /* Next month by default: a loan approved on the 28th cannot come out of
           a run that has already been prepared. */
        const startPeriod =
          body.startPeriod ?? loan.startPeriod ?? addMonths(TODAY, 1);

        const schedule = buildSchedule({
          principalKobo,
          termMonths,
          interestRate,
          startPeriod,
        });

        return {
          ...loan,
          principalKobo,
          termMonths,
          interestRate,
          interestKobo: schedule.interestKobo,
          totalRepayableKobo: schedule.totalKobo,
          monthlyRepaymentKobo: schedule.instalmentKobo,
          status: "ACTIVE",
          startPeriod: schedule.lines[0]?.dueDate ?? startPeriod,
          decidedById: actingId,
          decidedByName: displayName,
          decidedAt: new Date().toISOString(),
          declinedReason: null,
          schedule: schedule.lines.map((line) => ({
            id: `${loan.id}-r${line.sequence}`,
            sequence: line.sequence,
            dueDate: line.dueDate,
            amountKobo: line.amountKobo,
            paidAmountKobo: 0,
            remainingKobo: line.amountKobo,
            status: "SCHEDULED" as LoanRepaymentStatus,
            paidAt: null,
            payslipId: null,
            note: null,
          })),
        };
      });
    },
    [isConnected, actingId, displayName, write],
  );

  const decline = useCallback(
    async (id: string, reason: string): Promise<ApiLoanDetail> => {
      if (isConnected) {
        const loan = await loansApi.decline(id, reason);
        bumpRevision();
        return loan;
      }

      return write(id, (loan) => {
        if (loan.status !== "PENDING") {
          throw conflict(
            `That loan is already ${loan.status.toLowerCase()}. It cannot be declined now.`,
          );
        }
        /* Self-decline is allowed where self-approval is not: turning down your
           own application is withdrawing it, and that harms nobody. */
        return {
          ...loan,
          status: "DECLINED",
          declinedReason: reason,
          decidedById: actingId,
          decidedByName: displayName,
          decidedAt: new Date().toISOString(),
        };
      });
    },
    [isConnected, actingId, displayName, write],
  );

  const pay = useCallback(
    async (
      id: string,
      sequence: number,
      body: PayRepaymentBody,
    ): Promise<ApiLoanDetail> => {
      if (isConnected) {
        const loan = await loansApi.pay(id, sequence, body);
        bumpRevision();
        return loan;
      }

      return write(id, (loan) => {
        if (loan.status !== "ACTIVE") {
          throw conflict(
            `That loan is ${loan.status.toLowerCase()}, so there is nothing to pay against it.`,
          );
        }
        const row = loan.schedule.find((r) => r.sequence === sequence);
        if (!row) throw unprocessable("That instalment is not on this schedule.");
        if (row.status === "WAIVED") {
          throw conflict("That instalment has been written off.");
        }

        const paidAmountKobo = Math.min(
          row.amountKobo,
          row.paidAmountKobo + body.amountKobo,
        );
        const updated: ApiRepayment = {
          ...row,
          paidAmountKobo,
          remainingKobo: Math.max(0, row.amountKobo - paidAmountKobo),
          status: paidAmountKobo >= row.amountKobo ? "PAID" : "PARTIAL",
          paidAt: body.paidAt
            ? new Date(body.paidAt).toISOString()
            : new Date().toISOString(),
          /* Outside payroll, so no payslip took it. */
          payslipId: null,
          note: body.note ?? row.note,
        };

        const schedule = loan.schedule.map((r) =>
          r.sequence === sequence ? updated : r,
        );
        const settled = schedule.every(
          (r) => r.status === "PAID" || r.status === "WAIVED",
        );

        return {
          ...loan,
          schedule,
          ...(settled
            ? { status: "SETTLED" as LoanStatus, completedAt: new Date().toISOString() }
            : {}),
        };
      });
    },
    [isConnected, write],
  );

  const waive = useCallback(
    async (id: string, sequence: number, note: string): Promise<ApiLoanDetail> => {
      if (isConnected) {
        const loan = await loansApi.waive(id, sequence, note);
        bumpRevision();
        return loan;
      }

      return write(id, (loan) => {
        const row = loan.schedule.find((r) => r.sequence === sequence);
        if (!row) throw unprocessable("That instalment is not on this schedule.");
        if (row.status === "WAIVED") {
          throw conflict("That instalment is already written off.");
        }
        if (row.status === "PAID") {
          throw conflict("That instalment is paid. There is nothing left to write off.");
        }

        const schedule = loan.schedule.map((r) =>
          r.sequence === sequence
            ? { ...r, status: "WAIVED" as LoanRepaymentStatus, remainingKobo: 0, note }
            : r,
        );
        const settled = schedule.every(
          (r) => r.status === "PAID" || r.status === "WAIVED",
        );

        return {
          ...loan,
          schedule,
          ...(settled
            ? { status: "SETTLED" as LoanStatus, completedAt: new Date().toISOString() }
            : {}),
        };
      });
    },
    [isConnected, write],
  );

  return { apply, approve, decline, pay, waive, live: isConnected };
}

/* ------------------------------------------------------------------- labels */

/** The status badge's words. Plain English, never the enum. */
export const LOAN_STATUS_LABEL: Record<LoanStatus, string> = {
  PENDING: "Waiting for a decision",
  APPROVED: "Approved",
  ACTIVE: "Being repaid",
  SETTLED: "Fully repaid",
  DECLINED: "Declined",
};

export const REPAYMENT_STATUS_LABEL: Record<LoanRepaymentStatus, string> = {
  SCHEDULED: "Not yet due",
  PARTIAL: "Part paid",
  PAID: "Paid",
  WAIVED: "Written off",
};

/**
 * When the last instalment falls, in words. `null` when nothing finishes.
 *
 * Deliberately null for anything not yet approved, even when the application
 * named a start month. A date in that column reads as settled, and an applicant
 * who has been told "April 2027" by a screen has been told something nobody has
 * agreed to — the approver sets the start month, and may counter-offer a term.
 * The list says "Once approved" instead.
 */
export function finishesLabel(loan: ApiLoan): string | null {
  if (loan.status === "PENDING" || loan.status === "DECLINED") return null;
  if (!loan.startPeriod) return null;
  return monthLabel(addMonths(loan.startPeriod, loan.termMonths - 1));
}
