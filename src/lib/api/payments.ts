"use client";

import {
  ApiError,
  apiBaseUrl,
  request,
  requestPaged,
  tokens,
  type Paged,
} from "@/lib/api/client";

/**
 * Payments — `/api/v1/payments`.
 *
 * Typed wrappers only, in the same hand-written style as `loans.ts`. No React,
 * no state: this file knows the shape of the wire and nothing else.
 *
 * ## The one thing to understand
 *
 * **This module does not move money, because there is no payment provider
 * wired.** `release()` calls `POST /batches/:id/submit`, which answers 422 with
 * a reason rather than reporting a payment nobody made. What works today, and
 * what customers actually use, is `bankFile()`: the CSV, downloaded and
 * uploaded to the company's own corporate banking portal.
 *
 * `summary()` says so in its payload — `provider.connected` — so a screen never
 * has to guess. Read it and render from it; do not hardcode the answer here,
 * because the day an adapter is registered this file should not need editing.
 *
 * ## Money
 *
 * Every amount in and out is integer **kobo**, and every field carrying one says
 * so in its name. `naira()` and `kobo()` at the bottom are the whole boundary —
 * nothing in `store/payments.ts` and nothing in a screen divides by 100.
 *
 * `nairaCell()` is separate and deliberately not `naira()` piped through a
 * formatter: it builds the amount column of the bank file by integer
 * arithmetic, matching `approvehr-api/src/modules/payments/file.ts` exactly. A
 * thousands separator in a CSV amount becomes three columns in a bank importer,
 * which is the single most common bulk-upload failure.
 *
 * ## Three permissions, three different acts
 *
 * | Call | Needs |
 * |---|---|
 * | accounts.* | `MANAGE_SETTINGS` — where salary money leaves from |
 * | batches list/create/get/check/file, ledger read | `RUN_PAYROLL` |
 * | approve, release, cancel | `APPROVE_PAYROLL` — the money door |
 *
 * Building a payment list releases nothing, which is why it is a different
 * permission from approving one. A screen should offer only what the reader
 * holds; the API enforces it either way.
 */

/* ------------------------------------------------------------------- shapes */

/** Mirrors `PaymentBatchStatus` in the Prisma schema. */
export type PaymentBatchStatus =
  | "DRAFT"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "SUBMITTED"
  | "COMPLETED"
  | "PARTIALLY_SETTLED"
  | "FAILED"
  | "CANCELLED";

/** Mirrors `PaymentInstructionStatus`. `REVERSED` means the money came back. */
export type PaymentInstructionStatus =
  | "PENDING"
  | "SUBMITTED"
  | "SETTLED"
  | "FAILED"
  | "REVERSED";

/** Mirrors `LedgerKind`. */
export type LedgerKind =
  | "SALARY"
  | "STATUTORY_REMITTANCE"
  | "REIMBURSEMENT"
  | "LOAN_DISBURSEMENT"
  | "LOAN_REPAYMENT"
  | "FUNDING"
  | "FEE"
  | "REVERSAL"
  | "ADJUSTMENT";

export type LedgerDirection = "DEBIT" | "CREDIT";

/**
 * One of the company's own bank accounts.
 *
 * **The full number is never in this payload.** Every JSON response masks to the
 * last four digits; the only place the whole thing appears is the bank file,
 * whose download the API audits. Four digits is enough to recognise an account
 * you already know, and a leaked payee list is what a diversion is made of.
 */
export type ApiBankAccount = {
  id: string;
  bankName: string;
  accountName: string;
  /** `******4471`. Never the full number. */
  accountNumberMasked: string;
  last4: string;
  bankCode: string | null;
  accountType: string | null;
  /** The account salaries come from. Exactly one per company, always. */
  isPrimary: boolean;
  active: boolean;
  archived: boolean;
  /** `YYYY-MM-DD`. */
  addedOn: string;
};

export type ApiAccountList = {
  rows: ApiBankAccount[];
  primaryId: string | null;
  counts: { active: number; archived: number };
};

/**
 * The answer to "does this account exist, and whose name is on it" — BE-10.
 *
 * `checked` is the one to branch on, not `verified`: `checked: false` means
 * nothing was actually asked (an unrecognised bank name, or no payment
 * provider connected for this company), while `checked: true, verified:
 * false` means a real bank looked and found nobody. Both are ordinary
 * outcomes, `reason` explains either one in words, and neither blocks saving
 * the account — the endpoint's own doc comment is explicit that being unable
 * to check is not a failure.
 */
export type ApiAccountVerification = {
  checked: boolean;
  verified: boolean;
  accountName: string | null;
  reason: string | null;
};

/** `POST /accounts` answers with the account and whether it demoted another. */
export type ApiAccountCreated = ApiBankAccount & { demotedPrevious: boolean };

/**
 * What the server says can be done next.
 *
 * Returned on every batch so a screen renders buttons from the server's view of
 * the state machine rather than re-implementing it. A second copy of these rules
 * on this side is a second copy that can disagree — so read these, never infer
 * from `status`.
 */
export type BatchAffordances = {
  check: boolean;
  approve: boolean;
  submit: boolean;
  cancel: boolean;
  downloadFile: boolean;
};

export type ApiPaymentBatch = {
  id: string;
  /** Unique per company and readable on a bank statement: `PAY-202608-1`. */
  reference: string;
  /** What appears on the payee's statement. */
  narration: string | null;
  status: PaymentBatchStatus;
  payrollRunId: string | null;
  /** `YYYY-MM-DD`, the first of the pay month. Null on an off-cycle batch. */
  period: string | null;
  payDate: string | null;

  sourceAccountId: string;
  sourceBankName: string;
  sourceAccountName: string;
  sourceAccountMasked: string;

  /** What the payroll run said, copied when the batch was built. */
  expectedTotalKobo: number;
  /** What this batch's rows add up to. */
  computedTotalKobo: number;
  itemCount: number;
  /** The headline the gate protects. False is a refusal, never a rendering. */
  balanced: boolean;

  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  providerRef: string | null;
  providerName: string | null;
  failureReason: string | null;
  createdAt: string;
  can: BatchAffordances;
};

/** One payee on a batch. */
export type ApiPaymentInstruction = {
  id: string;
  employeeId: string;
  payslipId: string | null;
  payeeName: string;
  bankName: string;
  accountNumberMasked: string;
  /** Whether this row can be paid at all. The gate uses the same test. */
  accountNumberOk: boolean;
  bankCode: string | null;
  amountKobo: number;
  narration: string | null;
  status: PaymentInstructionStatus;
  failureReason: string | null;
  settledAt: string | null;
};

/**
 * One thing wrong with a batch.
 *
 * A `BLOCKER` refuses approval. A `WARNING` is named and lets it through —
 * two people sharing an account number is occasionally legitimate, and a gate
 * that cannot be got past for a legitimate case is a gate people route around.
 *
 * Switch on `code`, never on `message`. `payeeName` is present whenever the
 * finding is about one person, which is what makes it fixable rather than
 * merely reported.
 */
export type PaymentDiscrepancy = {
  code: string;
  severity: "BLOCKER" | "WARNING";
  payeeName?: string;
  instructionId?: string;
  message: string;
  expectedKobo?: number;
  actualKobo?: number;
};

/**
 * `GET /batches/:id`.
 *
 * `check` is the gate evaluated on the read, so a screen can show what is wrong
 * without changing anything. `POST /batches/:id/check` is the version that moves
 * the batch's status.
 */
export type ApiBatchDetail = ApiPaymentBatch & {
  instructions: ApiPaymentInstruction[];
  check: {
    ok: boolean;
    discrepancies: PaymentDiscrepancy[];
    /** What the rows add up to, summed independently of `computedTotalKobo`. */
    instructionTotalKobo: number;
  };
};

/**
 * `POST /batches/:id/check` — the reconciliation gate, run and recorded.
 *
 * Three figures that must be equal, and the screen should show all three: what
 * the payroll run said, what the batch says, and what the rows come to. Showing
 * one and asserting it balances is how a run where net exceeds gross gets
 * rendered as fine.
 */
export type ApiGateResult = {
  id: string;
  reference: string;
  status: PaymentBatchStatus;
  checkedAt: string;
  ok: boolean;
  expectedTotalKobo: number;
  computedTotalKobo: number;
  instructionTotalKobo: number;
  itemCount: number;
  discrepancies: PaymentDiscrepancy[];
  can: BatchAffordances;
};

export type ApiBatchApproved = {
  id: string;
  reference: string;
  status: PaymentBatchStatus;
  approvedAt: string;
  approvedByName: string;
  expectedTotalKobo: number;
  computedTotalKobo: number;
  itemCount: number;
  /** The thing to do next, and it works today. */
  fileHref: string;
};

/**
 * What recording a bank payment did.
 *
 * `settled` is what this call moved; `alreadySettled` is what it left alone.
 * Kept apart so a screen can say "already recorded" rather than claiming it
 * paid the same people twice.
 */
export type ApiBatchRecordedPaid = {
  batchId: string;
  reference: string;
  settled: number;
  alreadySettled: number;
  status: PaymentBatchStatus;
  totalKobo: number;
};

export type ApiBatchCancelled = {
  id: string;
  reference: string;
  status: PaymentBatchStatus;
};

export type ApiBatchCreated = {
  id: string;
  reference: string;
  itemCount: number;
};

/**
 * `POST /batches/:id/submit` when a provider **is** registered.
 *
 * Nothing renders this today. It is typed because the day an adapter is wired,
 * a screen that never modelled success would have to be rewritten to show it —
 * and `accepted`/`rejected` are counts of instructions the provider took, not
 * of payments that settled. Settlement is a later, separate fact.
 */
export type ApiBatchSubmitted = {
  submitted: true;
  id: string;
  reference: string;
  status: PaymentBatchStatus;
  providerName: string;
  providerRef: string;
  accepted: number;
  rejected: number;
};

/* ---------------------------------------------------------------- history */

/**
 * One payment to one person, in one month.
 *
 * `GET /history` is `PaymentInstruction` queried on its own terms rather than a
 * page of batches opened one at a time — see the doc comment on `paymentHistory`
 * in `approvehr-api/src/modules/payments/service.ts` for why that N+1 is not
 * merely slow but unfilterable.
 *
 * `employeeId` is **nullable** on the wire: an instruction can be raised for a
 * payee who is not on the payroll. `ApiPaymentInstruction` above types it
 * `string`, which is optimistic and predates this endpoint; this row states the
 * schema's own answer so nothing links at `/people/null`.
 *
 * `period` is `YYYY-MM` — the month somebody was paid **for**, taken from the
 * payroll run behind the batch, not the day the transfer went out. It is null on
 * a batch raised by hand, which has no run and therefore no pay month, and that
 * is a real state rather than a gap to fill in.
 */
export type ApiPaymentHistoryRow = Omit<ApiPaymentInstruction, "employeeId"> & {
  employeeId: string | null;
  batchId: string;
  batchReference: string;
  /**
   * The batch's status, beside the instruction's own.
   *
   * Both, always, and never one without the other — `paymentOutcome()` below is
   * the only thing that should read them, and it exists because neither field
   * alone can answer "did this person get their money".
   */
  batchStatus: PaymentBatchStatus;
  /** `YYYY-MM`, or null on a batch with no payroll run behind it. */
  period: string | null;
  /** `YYYY-MM-DD`, or null for the same reason. */
  payDate: string | null;
  /** When the batch was built. Always present, so a row always has a date. */
  raisedAt: string;
};

export type ApiPaymentHistoryPage = {
  rows: ApiPaymentHistoryRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type PaymentHistoryParams = {
  page?: number;
  pageSize?: number;
  /** One person. A UUID connected; any id in demo mode. */
  employeeId?: string;
  /** `YYYY-MM`. The API refuses anything else with a 400. */
  period?: string;
};

/**
 * What happened to one person's money, read from **both** statuses.
 *
 * ## The one thing this function exists to prevent
 *
 * There is no payment provider (`provider.ts` on the API). So the ordinary,
 * everyday state of a paid salary in this product is: the instruction still says
 * `PENDING`, and the batch it sits in says `APPROVED` — approved, and downloaded
 * as a bank file, and paid by hand at the bank. **The money moved and this API
 * cannot know it.**
 *
 * Rendering that row as "Paid" is a claim the server cannot support. Rendering
 * it as "Pending" or "Not sent" tells somebody their salary is outstanding when
 * it is in their account. Both are wrong, which is why this returns a third
 * answer — "Downloaded — paid at your bank" — and why `moved` is a tri-state
 * rather than a boolean:
 *
 * | `moved` | Means |
 * |---|---|
 * | `"yes"` | this product moved it and something confirmed it settled |
 * | `"elsewhere"` | the file was produced; the bank statement is the record |
 * | `"no"` | nothing has gone out |
 *
 * A screen may only render a green tick for `"yes"`. `payments/provider.ts` on
 * the API calls a green "Paid" over money nobody moved the one thing a payroll
 * product must never do, and the audit of the incumbent on 20 August 2026 found
 * a version of exactly that.
 *
 * ## Instruction status wins wherever it says something
 *
 * `SETTLED`, `FAILED`, `SUBMITTED` and `REVERSED` are facts about this one
 * payment and they outrank whatever the batch says — a batch reading SUBMITTED
 * while one person's transfer failed on a wrong account number is the case the
 * per-row status exists for. Only `PENDING` has to ask the batch, because
 * "nothing has happened to this instruction" is exactly the state the bank-file
 * route leaves every row in.
 */
/**
 * The wallet's headline figure, worded for whichever side of zero it is on.
 *
 * `availableKobo` is the balance less what is already promised, and the API
 * returns it **negative** when a company has approved more than it holds —
 * deliberately, because "you cannot pay this" is not something anybody can act
 * on while "you are ₦1,480,000 short" is a figure somebody takes to whoever
 * funds the account.
 *
 * What the screens did with it was render it raw under the label "Available to
 * pay with", so a company nine million short read **"Available to pay with
 * −₦9,400,272.00"**. There is no such thing as a negative amount of money
 * available: the fact is a shortfall, and a minus sign in front of a positive
 * label is the reader's job to decode rather than the product's job to state.
 *
 * So the label moves with the sign and the amount is always rendered
 * positive. Written here rather than in either screen because the run's pay
 * panel and the wallet screen both show it, and two copies of a rule about
 * money is how they come to disagree.
 */
export function availableFigure(availableKobo: number): {
  label: string;
  kobo: number;
  hint: string;
  short: boolean;
} {
  if (availableKobo < 0) {
    return {
      label: "Short by",
      kobo: -availableKobo,
      hint: "more is promised than the wallet holds",
      short: true,
    };
  }
  return {
    label: "Available to pay with",
    kobo: availableKobo,
    hint: "after everything already promised",
    short: false,
  };
}

export function paymentOutcome(row: {
  status: PaymentInstructionStatus;
  batchStatus: PaymentBatchStatus;
  failureReason?: string | null;
}): {
  label: string;
  tone: "neutral" | "accent" | "warning" | "success" | "danger" | "info";
  /** One line under the label. Says what a reader should do or believe. */
  hint: string;
  moved: "yes" | "no" | "elsewhere";
} {
  switch (row.status) {
    case "SETTLED":
      return {
        label: "Paid",
        tone: "success",
        hint: "This payment settled.",
        moved: "yes",
      };
    case "SUBMITTED":
      return {
        label: "Sent, outcome unknown",
        tone: "warning",
        hint: "Sent to the bank and not yet confirmed. Do not send it again.",
        moved: "no",
      };
    case "FAILED":
      return {
        label: "Failed",
        tone: "danger",
        hint: row.failureReason ?? "The transfer was attempted and did not work.",
        moved: "no",
      };
    case "REVERSED":
      return {
        label: "Came back",
        tone: "danger",
        hint: "It settled and was then reversed, so this person is unpaid.",
        moved: "no",
      };
    case "PENDING":
      break;
  }

  /* PENDING. The instruction itself says nothing happened, so the batch is the
     only thing that can distinguish "waiting to be approved" from "the file went
     to the bank a fortnight ago". */
  switch (row.batchStatus) {
    case "APPROVED":
    case "SUBMITTED":
    case "COMPLETED":
    case "PARTIALLY_SETTLED":
      return {
        label: "Downloaded — paid at your bank",
        tone: "info",
        hint:
          "The batch was approved and the payment file produced. ApproveHR did " +
          "not move this money, so your bank statement is the record of it.",
        moved: "elsewhere",
      };
    case "FAILED":
      return {
        label: "Batch failed",
        tone: "danger",
        hint: "The batch failed before this payment was sent.",
        moved: "no",
      };
    case "CANCELLED":
      return {
        label: "Cancelled",
        tone: "neutral",
        hint: "The batch was stopped before anything went out.",
        moved: "no",
      };
    case "DRAFT":
    case "AWAITING_APPROVAL":
      return {
        label: "Not approved yet",
        tone: "warning",
        hint: "Nothing leaves the account until somebody approves the batch.",
        moved: "no",
      };
  }
}

/** One line of the company's account activity. */
export type ApiLedgerEntry = {
  id: string;
  /** `YYYY-MM-DD`. The date on the statement. */
  occurredAt: string;
  kind: LedgerKind;
  direction: LedgerDirection;
  amountKobo: number;
  /**
   * The balance after this entry, **from a statement**, or null.
   *
   * Null is common and must render as a dash. Never compute a running total to
   * fill it: an unverified balance looks reconciled without being reconciled,
   * which is worse than an admitted gap.
   */
  balanceAfterKobo: number | null;
  reference: string | null;
  note: string | null;
  bankAccountId: string | null;
  /** `GTBank ******4471`, already joined and masked by the API. */
  bankAccount: string | null;
  paymentBatchId: string | null;
  batchReference: string | null;
};

export type ApiLedgerPage = {
  rows: ApiLedgerEntry[];
  total: number;
  /** In and out under the current filter — part of the answer, not decoration. */
  totals: { inKobo: number; outKobo: number };
  page: number;
  pageSize: number;
};

export type ApiFundingRecorded = {
  id: string;
  occurredAt: string;
  amountKobo: number;
  bankName: string;
};

/**
 * `GET /summary`.
 *
 * `provider.connected` is asked of the running process on every call rather than
 * cached, because a stale copy of "can this company pay anybody" is the one
 * thing this payload must not carry. Render from it.
 */
/**
 * What the wallet holds, and where money goes into it.
 *
 * ## Derived from the ledger, never stored
 *
 * There is no balance column on the API and there must not be one. A stored
 * total is a second copy of a fact, and the day it disagrees with the entries
 * there is no way to tell which is wrong.
 *
 * ## Four figures, because a balance alone is not the question
 *
 * What matters before releasing a payroll is not what has left the account —
 * it is what is left **after** everything already approved and not yet settled.
 * Approving two payrolls in a morning is ordinary; if both asked only "is the
 * balance enough", both would say yes and the second would fail at the
 * provider, after the runs were approved and the figures frozen.
 *
 * `availableKobo` can be negative and is reported rather than clamped.
 */
export type ApiWallet = {
  fundedKobo: number;
  paidOutKobo: number;
  /** Funded less paid out. What a bank statement would show. */
  balanceKobo: number;
  /** Approved or submitted and not yet settled. Promised, not gone. */
  committedKobo: number;
  /** Balance less commitments. What a new payroll may draw on. */
  availableKobo: number;
  /**
   * The collection accounts this company was given, active ones only.
   *
   * **Empty is ordinary, not an error.** A company on the bank-file path has
   * never needed one, and the screen says "no account yet" and who to ask. What
   * it must never do is invent a number — money sent to a made-up account
   * arrives somewhere real and is attributed to nobody.
   */
  fundingAccounts: {
    provider: string;
    accountNumber: string;
    accountName: string;
    bankName: string;
  }[];
};

export type ApiPaymentsSummary = {
  provider: { connected: boolean; name: string | null; note: string | null };
  primaryAccount: ApiBankAccount | null;
  outstanding: {
    count: number;
    totalKobo: number;
    batches: ApiPaymentBatch[];
  };
  lastCompleted: ApiPaymentBatch | null;
  thisMonth: {
    /** `August 2026`. */
    period: string;
    batches: number;
    payments: number;
    totalKobo: number;
    /** What the ledger says actually left the account. Usually behind. */
    settledKobo: number;
  };
};

/** A payroll run that could have a payment batch built from it. */
export type ApiPayableRun = {
  id: string;
  /** `YYYY-MM-DD`, the first of the month. */
  period: string;
  payDate: string;
  employeeCount: number;
  /**
   * People in the period deliberately left off the run.
   *
   * Carried so the batch screen can say "9 of 10 — 1 excluded" rather than a
   * bare 9 under a label reading **People**. A batch genuinely cannot contain
   * somebody with no payslip, so this changes nothing about what gets paid — it
   * changes only whether the figure beside it is a true sentence, and nine where
   * ten people work is not one. `headcountLabel` in `lib/api/payroll.ts` writes
   * it.
   */
  excludedCount: number;
  totalNetKobo: number;
};

/* -------------------------------------------------------------------- input */

export type CreateAccountBody = {
  bankName: string;
  accountName: string;
  /** Exactly ten digits. Spaces and hyphens are stripped server-side. */
  accountNumber: string;
  bankCode?: string;
  accountType?: string;
  /** Makes this the account salaries come from, demoting whichever holds it. */
  isPrimary?: boolean;
};

/**
 * Editing an account.
 *
 * `null` on `bankCode` or `accountType` clears a value recorded wrongly; absent
 * leaves it alone. `isPrimary: false` is **refused** — there is always exactly
 * one primary, so the way to stop this account being it is to make another one
 * primary.
 */
export type UpdateAccountBody = {
  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  bankCode?: string | null;
  accountType?: string | null;
  isPrimary?: boolean;
  active?: boolean;
};

export type BatchListParams = {
  page?: number;
  pageSize?: number;
  /** Allow-list: createdAt | reference | status. */
  sort?: "createdAt" | "reference" | "status";
  /** Newest first by default — the batch somebody is asking about is this month's. */
  order?: "asc" | "desc";
  status?: PaymentBatchStatus;
  payrollRunId?: string;
  /** Matches the reference. */
  q?: string;
};

export type CreateBatchBody = {
  payrollRunId: string;
  /** Omit to use the primary account. */
  sourceBankAccountId?: string;
  /** Omit and one is generated from the period. */
  reference?: string;
  narration?: string;
};

export type LedgerListParams = {
  page?: number;
  pageSize?: number;
  /** Allow-list: occurredAt | amount. */
  sort?: "occurredAt" | "amount";
  order?: "asc" | "desc";
  bankAccountId?: string;
  kind?: LedgerKind;
  /** `YYYY-MM-DD`, inclusive both ends. */
  from?: string;
  to?: string;
};

export type FundingBody = {
  bankAccountId: string;
  amountKobo: number;
  occurredAt?: string;
  reference?: string;
  note?: string;
  /** From the statement. Left null when omitted — never worked out for you. */
  balanceAfterKobo?: number;
};

/** The bank file, in memory, ready to save. */
export type BankFileDownload = {
  filename: string;
  /** CRLF-delimited, no BOM. Both are deliberate — see `file.ts` on the API. */
  csv: string;
};

/* -------------------------------------------------------------------- calls */

const batchQuery = (params: BatchListParams) => ({
  page: params.page,
  pageSize: params.pageSize,
  sort: params.sort,
  order: params.order,
  status: params.status,
  payrollRunId: params.payrollRunId,
  q: params.q,
});

const ledgerQuery = (params: LedgerListParams) => ({
  page: params.page,
  pageSize: params.pageSize,
  sort: params.sort,
  order: params.order,
  bankAccountId: params.bankAccountId,
  kind: params.kind,
  from: params.from,
  to: params.to,
});

export const paymentsApi = {
  /* ------------------------------------------------------------- accounts */

  accounts: (includeArchived = false, signal?: AbortSignal) =>
    request<ApiAccountList>("/payments/accounts", {
      query: { includeArchived: includeArchived ? "true" : "false" },
      ...(signal ? { signal } : {}),
    }),

  /** The first account is always the primary one, whatever is sent. */
  createAccount: (body: CreateAccountBody) =>
    request<ApiAccountCreated>("/payments/accounts", { method: "POST", body }),

  updateAccount: (id: string, body: UpdateAccountBody) =>
    request<ApiBankAccount>(`/payments/accounts/${id}`, { method: "PATCH", body }),

  /** Archived, not deleted — past batches still point at it. */
  archiveAccount: (id: string) =>
    request<{ id: string; archived: boolean; note: string }>(
      `/payments/accounts/${id}`,
      { method: "DELETE" },
    ),

  /* ---------------------------------------------------------- verification */

  /**
   * Confirms the name behind an account before it is saved.
   *
   * `bankName`, never a code — every picker in this product already collects
   * one, and the API resolves it to whatever a provider needs
   * (`banks.ts#bankByName` on that side). This never throws for "could not
   * check"; see `ApiAccountVerification` for how to read a 200.
   */
  verifyAccount: (
    body: { bankName: string; accountNumber: string },
    signal?: AbortSignal,
  ) =>
    request<ApiAccountVerification>("/payments/account-verification", {
      method: "POST",
      body,
      ...(signal ? { signal } : {}),
    }),

  /* -------------------------------------------------------------- batches */

  batches: (params: BatchListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiPaymentBatch>("/payments/batches", {
      query: batchQuery(params),
      ...(signal ? { signal } : {}),
    }),

  batch: (id: string, signal?: AbortSignal) =>
    request<ApiBatchDetail>(`/payments/batches/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  /** Builds one batch from one approved run. A second is refused. */
  createBatch: (body: CreateBatchBody) =>
    request<ApiBatchCreated>("/payments/batches", { method: "POST", body }),

  /** Safe and repeatable: checking releases nothing. */
  check: (id: string) =>
    request<ApiGateResult>(`/payments/batches/${id}/check`, { method: "POST" }),

  /** The money door. Re-runs the gate and refuses if anything moved. */
  approve: (id: string) =>
    request<ApiBatchApproved>(`/payments/batches/${id}/approve`, { method: "POST" }),

  /**
   * Hands the batch to the provider. **There is no provider.**
   *
   * Throws `ApiError` with status 422 and `NO_PROVIDER_REASON` as the message.
   * The batch stays APPROVED — nothing was attempted, so nothing failed, and the
   * bank file remains the way through. A screen must not render this as an
   * error the user did something wrong; it is the state of the product.
   */
  release: (id: string) =>
    request<ApiBatchSubmitted>(`/payments/batches/${id}/submit`, { method: "POST" }),

  /**
   * Record that a bank paid this batch.
   *
   * **Moves no money and talks to no bank.** Somebody downloaded the file,
   * uploaded it, watched it go, and is telling the product what happened —
   * which is the only way the wallet's balance comes down on the path that
   * actually ships, since nothing settles without a provider webhook.
   *
   * `paidOn` is the date the bank paid, not the date somebody typed this:
   * recording on Monday what happened on Friday is the ordinary case, and the
   * ledger line is one somebody later reconciles against a statement.
   */
  markPaid: (id: string, body: { paidOn?: string; reference?: string } = {}) =>
    request<ApiBatchRecordedPaid>(`/payments/batches/${id}/mark-paid`, {
      method: "POST",
      body,
    }),

  cancel: (id: string, reason?: string) =>
    request<ApiBatchCancelled>(`/payments/batches/${id}/cancel`, {
      method: "POST",
      body: reason ? { reason } : {},
    }),

  /**
   * The bank upload file. This is the one that works today.
   *
   * Its own `fetch` rather than `request()`, because this endpoint answers with
   * a CSV body and a `Content-Disposition` header instead of the JSON envelope
   * every other endpoint uses — `request()` would try to parse it as JSON and
   * throw on a perfectly good file.
   *
   * The filename comes from the header when the browser exposes it and falls
   * back to the reference, so a saved file is still identifiable.
   */
  async bankFile(id: string, reference?: string): Promise<BankFileDownload> {
    const access = tokens.access();
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/payments/batches/${id}/file`, {
        headers: access ? { Authorization: `Bearer ${access}` } : {},
      });
    } catch {
      throw new ApiError(
        0,
        "network_error",
        "Could not reach the server, so no file was produced.",
      );
    }

    if (response.status === 401) {
      throw new ApiError(
        401,
        "session_expired",
        "Your session has ended. Sign in again, then download the file.",
      );
    }

    if (!response.ok) {
      /* The refusals here are the useful part — "this batch has not been
         approved yet", "this batch no longer adds up" — so they are read out of
         the error envelope rather than replaced with a generic failure. */
      let message = "No file was produced.";
      let code = "http_error";
      try {
        const body = (await response.json()) as {
          error?: { code?: string; message?: string };
        };
        message = body.error?.message ?? message;
        code = body.error?.code ?? code;
      } catch {
        /* Not JSON. Keep the default. */
      }
      throw new ApiError(response.status, code, message);
    }

    return {
      filename: filenameFrom(
        response.headers.get("content-disposition"),
        reference,
      ),
      csv: await response.text(),
    };
  },

  /* -------------------------------------------------------------- history */

  /**
   * Who was paid, when, how much, and whether it landed.
   *
   * `RUN_PAYROLL`. A 403 here is the right answer for a staff member and the
   * screen says so rather than rendering an empty table, which would read as
   * "nobody has ever been paid".
   *
   * Not `requestPaged` — the endpoint answers with a plain `ok()` envelope
   * carrying `rows`/`total`/`page`/`pageSize` rather than the pagination meta
   * `page()` produces, exactly as `ledger` below does.
   */
  history: (params: PaymentHistoryParams = {}, signal?: AbortSignal) =>
    request<ApiPaymentHistoryPage>("/payments/history", {
      query: {
        page: params.page,
        pageSize: params.pageSize,
        employeeId: params.employeeId,
        period: params.period,
      },
      ...(signal ? { signal } : {}),
    }),

  /* --------------------------------------------------------------- ledger */

  ledger: (params: LedgerListParams = {}, signal?: AbortSignal) =>
    request<ApiLedgerPage>("/payments/ledger", {
      query: ledgerQuery(params),
      ...(signal ? { signal } : {}),
    }),

  /** Money arriving, typed in off a statement. Never edited afterwards. */
  recordFunding: (body: FundingBody) =>
    request<ApiFundingRecorded>("/payments/ledger/funding", {
      method: "POST",
      body,
    }),

  /** The wallet: what is in it, what is spoken for, and where money goes in. */
  wallet: (signal?: AbortSignal) =>
    request<ApiWallet>("/payments/wallet", { ...(signal ? { signal } : {}) }),

  summary: (signal?: AbortSignal) =>
    request<ApiPaymentsSummary>("/payments/summary", {
      ...(signal ? { signal } : {}),
    }),

  /**
   * Approved payroll runs, so a batch can be built from one.
   *
   * **This reads the payroll module's endpoint, not this one.** It lives here
   * because a payment batch cannot exist without a run to build it from, and
   * `lib/api/payroll.ts` does not exist yet; when it does, move this and delete
   * the conversion below. It is deliberately narrow — four fields and a total —
   * so there is little to move.
   *
   * `GET /payroll/runs` predates the kobo convention and answers with Prisma
   * `Decimal` values serialised as naira strings, so the conversion to kobo
   * happens here, at the boundary, like every other figure in this file.
   */
  async payableRuns(signal?: AbortSignal): Promise<ApiPayableRun[]> {
    const result = await request<{ runs: PayrollRunRow[]; total: number }>(
      "/payroll/runs",
      { query: { take: 50 }, ...(signal ? { signal } : {}) },
    );
    return result.runs
      .filter((run) => run.status === "APPROVED")
      .map((run) => ({
        id: run.id,
        period: String(run.period).slice(0, 10),
        payDate: String(run.payDate).slice(0, 10),
        employeeCount: run.employeeCount,
        /* Absent on a run prepared before the column existed, and absent is not
           zero — but zero is the only honest reading here, because a run with no
           exclusions and a run that could not record one both had nobody left
           off. `headcountLabel` then renders a bare count, which is correct. */
        excludedCount: run.excludedCount ?? 0,
        totalNetKobo: koboFromDecimalString(run.totalNet),
      }));
  },
};

/** Only the fields `payableRuns` reads. The run itself has many more. */
type PayrollRunRow = {
  id: string;
  period: string;
  payDate: string;
  status: string;
  employeeCount: number;
  /** Optional: a run prepared before the column existed does not carry it. */
  excludedCount?: number;
  /** A `Decimal(16,2)` in naira, serialised as a string. */
  totalNet: string | number;
};

export type PagedBatches = Paged<ApiPaymentBatch>;

/* ---------------------------------------------------------------- the money */

/**
 * Kobo to naira, for the screen. The only division by 100 on this side.
 *
 * `Math.round` first because a kobo figure is an integer by contract, and a
 * fractional one means something upstream is already wrong — rounding here keeps
 * the display honest instead of rendering ₦1,234.5678.
 */
export const naira = (kobo: number): number => Math.round(kobo) / 100;

/** Naira to kobo, for a form. The only multiplication by 100 on this side. */
export const kobo = (amount: number): number => Math.round(amount * 100);

/**
 * A naira `Decimal` string to integer kobo, without going through a float.
 *
 * `Math.round(Number("833500.33") * 100)` is right at these magnitudes and wrong
 * in principle; splitting on the decimal point and padding is right at every
 * magnitude, and this figure is one side of an identity the gate checks exactly.
 */
export function koboFromDecimalString(value: string | number): number {
  const text = typeof value === "number" ? value.toFixed(2) : value.trim();
  const negative = text.startsWith("-");
  const [whole = "0", fraction = ""] = text.replace(/^[+-]/, "").split(".");
  const kobos = `${fraction}00`.slice(0, 2);
  const total = Number(whole) * 100 + Number(kobos);
  return negative ? -total : total;
}

/**
 * Kobo to a bank-safe naira string, by integer arithmetic.
 *
 * `1250000.00`, never `1,250,000.00`. A thousands separator in a CSV amount
 * becomes three columns in any importer that splits before it quotes, which is
 * the most common bulk-upload failure there is. Mirrors `nairaCell` in
 * `approvehr-api/src/modules/payments/file.ts` — if one changes, both change.
 */
export function nairaCell(amountKobo: number): string {
  const negative = amountKobo < 0;
  const whole = Math.abs(Math.trunc(amountKobo));
  const units = Math.trunc(whole / 100);
  const remainder = whole % 100;
  return `${negative ? "-" : ""}${units}.${String(remainder).padStart(2, "0")}`;
}

/**
 * The bank file's column order, which is a contract.
 *
 * Every customer has a saved import mapping in their bank's portal keyed to
 * these positions. Add at the end; never reorder. Mirrors `BANK_FILE_COLUMNS`
 * on the API.
 */
export const BANK_FILE_COLUMNS = [
  "S/N",
  "Account Number",
  "Account Name",
  "Bank Name",
  "Bank Code",
  "Amount",
  "Narration",
  "Reference",
] as const;

/** `attachment; filename="payments-PAY-202608-1.csv"` → the filename. */
function filenameFrom(header: string | null, reference?: string): string {
  const match = header?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (match?.[1]) return match[1];
  const stem = (reference ?? "payments").replace(/[^A-Za-z0-9._-]/g, "-");
  return `payments-${stem}.csv`;
}
