"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { formatMoney } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  BANK_FILE_COLUMNS,
  nairaCell,
  naira,
  paymentsApi,
  type ApiBankAccount,
  type ApiBatchDetail,
  type ApiLedgerEntry,
  type ApiLedgerPage,
  type ApiPayableRun,
  type ApiPaymentBatch,
  type ApiPaymentInstruction,
  type ApiPaymentsSummary,
  type BankFileDownload,
  type BatchAffordances,
  type BatchListParams,
  type CreateAccountBody,
  type FundingBody,
  type LedgerListParams,
  type PaymentBatchStatus,
  type PaymentDiscrepancy,
  type UpdateAccountBody,
} from "@/lib/api/payments";
import { EMPLOYEES } from "@/lib/mock/people";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";

/**
 * Payments, from whichever source is available.
 *
 * ## Nothing here moves money, in either mode
 *
 * There is no payment provider — see `lib/api/payments.ts` and
 * `approvehr-api/src/modules/payments/provider.ts`. `release()` **refuses** in
 * both modes with the same sentence, and the bank file is the way through. A
 * demo that showed a green "Paid" would be teaching its audience the one thing
 * this product must never do.
 *
 * ## Where the line falls in demo mode
 *
 * | | Connected | Demo |
 * |---|---|---|
 * | Read batches, payees, the ledger | yes | yes, from a seeded book |
 * | Run the check | yes | yes — the gate is ported below |
 * | Approve, cancel | yes | yes, to this browser |
 * | Download the payment file | yes | yes, built from the same rows |
 * | Release to a bank | **refused** | **refused** |
 * | Build a batch from a payroll run | yes | no run to build from, so not offered |
 *
 * Approving locally is the same call `store/loans.ts` makes and for the same
 * reason: this product is called ApproveHR, and an approval you cannot perform
 * is not a demonstration of it. Every screen shows which mode it is in.
 *
 * ## The demo holds no real account numbers
 *
 * Company accounts are stored **masked**, exactly as the API returns them, so
 * adding one in demo mode does not put a real account number in browser storage.
 * Payee numbers are ten-digit strings derived from the seed directory purely so
 * the bank file has something well-formed in it; they are demo data and are never
 * rendered unmasked.
 */

/* ---------------------------------------------------------------- the shapes */

/**
 * A payee in the demo book.
 *
 * Carries the full account number, which `ApiPaymentInstruction` deliberately
 * does not: the file needs it and no screen may show it. Everything read by a
 * component goes through `strip()` below.
 */
type DemoInstruction = ApiPaymentInstruction & { accountNumberFull: string };

/** A batch in the demo book. `can`, `balanced` and `check` are derived on read. */
type DemoBatch = Omit<ApiPaymentBatch, "can" | "balanced"> & {
  instructions: DemoInstruction[];
};

type DemoBook = {
  accounts: ApiBankAccount[];
  batches: DemoBatch[];
  ledger: ApiLedgerEntry[];
};

/* ------------------------------------------------------------------ the seed */

/**
 * Ten digits from a seed record, so the demo's file is well-formed.
 *
 * `AHR-0142` + the masked `····4471` becomes `01` + `0142` + `4471`. Stable, so
 * a reload does not renumber everybody, and obviously not anybody's real
 * account.
 */
function demoAccountNumber(employeeNo: string, masked: string | null): string {
  const stem = employeeNo.replace(/\D/g, "").slice(-4).padStart(4, "0");
  const tail = (masked ?? "").replace(/\D/g, "").slice(-4).padStart(4, "0");
  return `01${stem}${tail}`;
}

/**
 * What each payee is owed, in kobo.
 *
 * Hand-written rather than computed: in a real batch this is the payslip's net,
 * copied onto the instruction at build time, and the demo has no payroll run
 * behind it. The kobo remainders are deliberate — a payments screen that has
 * only ever been looked at with round figures on it is a screen whose alignment
 * and rounding have not been tested.
 */
const DEMO_NET_KOBO: Record<string, number> = {
  "p-01": 128_441_763,
  "p-02": 144_120_855,
  "p-03": 115_293_041,
  "p-04": 100_388_412,
  "p-05": 71_640_238,
  "p-06": 65_411_890,
  "p-07": 52_264_077,
  "p-08": 63_120_544,
  "p-09": 93_455_106,
  "p-10": 56_691_329,
};

const DEMO_ACCOUNTS: ApiBankAccount[] = [
  {
    id: "acct-gtb",
    bankName: "GTBank",
    accountName: "Schull Technologies Ltd",
    accountNumberMasked: "******0110",
    last4: "0110",
    bankCode: "058",
    accountType: "Current",
    isPrimary: true,
    active: true,
    archived: false,
    addedOn: "2025-11-04",
  },
  {
    id: "acct-zen",
    bankName: "Zenith Bank",
    accountName: "Schull Technologies Ltd",
    accountNumberMasked: "******0295",
    last4: "0295",
    bankCode: "057",
    accountType: "Current",
    isPrimary: false,
    active: true,
    archived: false,
    addedOn: "2026-02-18",
  },
];

/**
 * One payee row for the demo book.
 *
 * `broken` is how the seed carries the problems the gate is meant to catch. They
 * are in the seed on purpose: a check step that has only ever been seen passing
 * is a check step nobody has read.
 */
function demoInstruction(
  employeeId: string,
  narration: string,
  broken?: "no-account" | "short-account" | "shares-account-with-p-04",
): DemoInstruction {
  const person = EMPLOYEES.find((e) => e.id === employeeId);
  const name = person ? `${person.firstName} ${person.lastName}` : "Unknown payee";
  const full =
    broken === "no-account"
      ? ""
      : broken === "short-account"
        ? demoAccountNumber(person?.employeeNo ?? "", person?.bankAccount ?? "").slice(0, 8)
        : broken === "shares-account-with-p-04"
          ? demoAccountNumber("AHR-0205", "UBA ····6612")
          : demoAccountNumber(person?.employeeNo ?? "", person?.bankAccount ?? "");

  return {
    id: `pi-${employeeId}-${narration.slice(-8).replace(/\s/g, "")}`,
    employeeId,
    payslipId: null,
    payeeName: name,
    bankName: broken === "no-account" ? "" : (person?.bankName ?? ""),
    accountNumberFull: full,
    accountNumberMasked: mask(full),
    accountNumberOk: /^\d{10}$/.test(full),
    bankCode: null,
    amountKobo: DEMO_NET_KOBO[employeeId] ?? 0,
    narration,
    status: "PENDING",
    failureReason: null,
    settledAt: null,
  };
}

/** Last four digits only, the same rule the API applies. */
function mask(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

const AUGUST_PAYEES: [string, "no-account" | "short-account" | "shares-account-with-p-04" | undefined][] = [
  ["p-01", undefined],
  ["p-02", undefined],
  ["p-03", undefined],
  ["p-04", undefined],
  ["p-05", undefined],
  ["p-06", undefined],
  ["p-07", undefined],
  ["p-08", "no-account"],
  ["p-09", "short-account"],
  ["p-10", "shares-account-with-p-04"],
];

/** July, before Grace Effiong started. Everybody in it can be paid. */
const JULY_PAYEES = ["p-01", "p-02", "p-03", "p-04", "p-05", "p-06", "p-07", "p-09", "p-10"];

function demoBatchSeed(
  reference: string,
  period: string,
  payDate: string,
  status: PaymentBatchStatus,
  narration: string,
  instructions: DemoInstruction[],
  extra: Partial<DemoBatch> = {},
): DemoBatch {
  const total = instructions.reduce((sum, row) => sum + row.amountKobo, 0);
  return {
    id: `batch-${reference}`,
    reference,
    narration,
    status,
    payrollRunId: `run-${period.slice(0, 7)}`,
    period,
    payDate,
    sourceAccountId: "acct-gtb",
    sourceBankName: "GTBank",
    sourceAccountName: "Schull Technologies Ltd",
    sourceAccountMasked: "******0110",
    /* Both figures are the same sum here, because the demo has no payroll run to
       source the expected total from independently. On the API they come from
       two places, which is what makes comparing them worth doing. */
    expectedTotalKobo: total,
    computedTotalKobo: total,
    itemCount: instructions.length,
    approvedById: null,
    approvedByName: null,
    approvedAt: null,
    submittedAt: null,
    completedAt: null,
    providerRef: null,
    providerName: null,
    failureReason: null,
    createdAt: `${period.slice(0, 7)}-24T09:12:00.000Z`,
    instructions,
    ...extra,
  };
}

const SEED_BOOK: DemoBook = {
  accounts: DEMO_ACCOUNTS,
  batches: [
    demoBatchSeed(
      "PAY-202608-1",
      "2026-08-01",
      "2026-08-28",
      "DRAFT",
      "Salary August 2026",
      AUGUST_PAYEES.map(([id, broken]) =>
        demoInstruction(id, "Salary August 2026", broken),
      ),
    ),
    demoBatchSeed(
      "PAY-202607-1",
      "2026-07-01",
      "2026-07-28",
      "APPROVED",
      "Salary July 2026",
      JULY_PAYEES.map((id) => demoInstruction(id, "Salary July 2026")),
      {
        approvedById: "p-02",
        approvedByName: "Tunde Bakare",
        approvedAt: "2026-07-26T10:41:00.000Z",
      },
    ),
    demoBatchSeed(
      "PAY-202606-1",
      "2026-06-01",
      "2026-06-26",
      "CANCELLED",
      "Salary June 2026",
      JULY_PAYEES.map((id) => demoInstruction(id, "Salary June 2026")),
      { failureReason: "Built against the wrong account — rebuilt as PAY-202606-2" },
    ),
  ],
  /**
   * Money in only.
   *
   * A salary line appears in this ledger when a payment **settles**, and nothing
   * can settle without a provider. So the demo's ledger holds what a real
   * company's would at this point: the transfers somebody typed in off a bank
   * statement. Two of the three carry the balance that was printed beside them;
   * the third does not, and shows a dash rather than a total worked out here.
   */
  ledger: [
    {
      id: "led-03",
      occurredAt: "2026-08-18",
      kind: "FUNDING",
      direction: "CREDIT",
      amountKobo: 9_500_000_000,
      balanceAfterKobo: 11_248_033_219,
      reference: "FT26081800194",
      note: "Transfer from the operations account",
      bankAccountId: "acct-gtb",
      bankAccount: "GTBank ******0110",
      paymentBatchId: null,
      batchReference: null,
    },
    {
      id: "led-02",
      occurredAt: "2026-07-24",
      kind: "FUNDING",
      direction: "CREDIT",
      amountKobo: 8_800_000_000,
      balanceAfterKobo: null,
      reference: "FT26072400881",
      note: "Transfer from the operations account",
      bankAccountId: "acct-gtb",
      bankAccount: "GTBank ******0110",
      paymentBatchId: null,
      batchReference: null,
    },
    {
      id: "led-01",
      occurredAt: "2026-06-23",
      kind: "FUNDING",
      direction: "CREDIT",
      amountKobo: 8_450_000_000,
      balanceAfterKobo: 9_120_411_866,
      reference: "FT26062300310",
      note: "Transfer from the operations account",
      bankAccountId: "acct-gtb",
      bankAccount: "GTBank ******0110",
      paymentBatchId: null,
      batchReference: null,
    },
  ],
};

/* ------------------------------------------------------------ the demo store */

/**
 * `book: null` means nothing local has happened, which is why it is not an
 * empty book: an empty one is indistinguishable from a book somebody emptied,
 * and would strand them with no accounts and no way back.
 */
const demo = createPersistedState<{ book: DemoBook | null }>({
  key: "approvehr.payments.store",
  empty: { book: null },
  version: 1,
});

function useDemoBook(): DemoBook {
  const state = useSyncExternalStore(demo.subscribe, demo.read, demo.getServerSnapshot);
  return state.book ?? SEED_BOOK;
}

const currentBook = (): DemoBook => demo.read().book ?? SEED_BOOK;
const commitBook = (book: DemoBook) => demo.commit({ book });

/* -------------------------------------------------------------------- revision */

/**
 * A counter every reader watches and every write bumps.
 *
 * Approve a batch and the list, the tiles, the detail panel and the ledger are
 * all stale at once. Threading a `reload` from each hook to each button is how
 * one of them gets forgotten and a figure on screen stops being true.
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
   client's first render agree. */
const ZERO = () => 0;

function useRevision(): number {
  return useSyncExternalStore(subscribeRevision, () => revision, ZERO);
}

/* --------------------------------------------------------------- the gate */

/**
 * The reconciliation gate, for the demo path only.
 *
 * `approvehr-api/src/modules/payments/service.ts` is authoritative and the
 * connected path uses its answer. This exists because a check step that says
 * "everything adds up" without having checked anything is worse than no check
 * step, and the demo has to be able to refuse for real.
 *
 * The codes and the wording match the API's. Exact integer equality, no
 * tolerance: a tolerance is a decision that being slightly wrong is acceptable,
 * and on a payment file it is not. Every finding returns every problem rather
 * than stopping at the first, because one refusal naming eleven problems beats
 * eleven refusals naming one.
 *
 * The two findings the API has and this does not are `run_total_changed` and
 * `run_no_longer_approved`: both are about a payroll run, and the demo has none.
 */
function evaluateDemo(
  batch: DemoBatch,
  accounts: ApiBankAccount[],
): {
  ok: boolean;
  discrepancies: PaymentDiscrepancy[];
  instructionTotalKobo: number;
} {
  const found: PaymentDiscrepancy[] = [];
  const rows = batch.instructions;
  const expected = batch.expectedTotalKobo;
  const computed = batch.computedTotalKobo;
  const summed = rows.reduce((total, row) => total + row.amountKobo, 0);
  const money = (kobo: number) => formatMoney(naira(kobo), "NGN", { decimals: true });

  if (rows.length === 0) {
    found.push({
      code: "no_instructions",
      severity: "BLOCKER",
      message: "This batch has nobody in it, so there is nothing to pay.",
    });
  }

  if (computed !== expected) {
    found.push({
      code: "total_does_not_match_run",
      severity: "BLOCKER",
      message: `The payroll run says ${money(expected)} but this batch comes to ${money(computed)}.`,
      expectedKobo: expected,
      actualKobo: computed,
    });
  }

  if (summed !== computed) {
    found.push({
      code: "instructions_do_not_sum",
      severity: "BLOCKER",
      message: `The ${rows.length} payments add up to ${money(summed)}, but this batch says ${money(computed)}.`,
      expectedKobo: computed,
      actualKobo: summed,
    });
  }

  if (summed !== expected) {
    found.push({
      code: "instructions_do_not_match_run",
      severity: "BLOCKER",
      message: `${money(summed)} would leave the account, but the payroll run comes to ${money(expected)}.`,
      expectedKobo: expected,
      actualKobo: summed,
    });
  }

  if (batch.itemCount !== rows.length) {
    found.push({
      code: "item_count_mismatch",
      severity: "BLOCKER",
      message: `This batch says ${batch.itemCount} ${batch.itemCount === 1 ? "person" : "people"} but carries ${rows.length}.`,
    });
  }

  if (expected <= 0) {
    found.push({
      code: "nothing_to_pay",
      severity: "BLOCKER",
      message: "The total on this batch is zero. Check the payroll run.",
    });
  }

  const source = accounts.find((account) => account.id === batch.sourceAccountId);
  if (!source || !source.active || source.archived) {
    found.push({
      code: "source_account_inactive",
      severity: "BLOCKER",
      message: `${source?.bankName ?? batch.sourceBankName} is no longer an active account. Pick one that is.`,
    });
  }

  /* Per payee, and every one names the person. "3 accounts are invalid" is a
     message somebody has to investigate; "Grace Effiong has no account number
     on file" is one they can fix. */
  const seen = new Map<string, string>();
  for (const row of rows) {
    const digits = row.accountNumberFull.replace(/\D/g, "");

    if (row.bankName.trim().length === 0) {
      found.push({
        code: "missing_bank_name",
        severity: "BLOCKER",
        payeeName: row.payeeName,
        instructionId: row.id,
        message: `${row.payeeName} has no bank on file. Add it to their record and build the batch again.`,
      });
    }

    if (!/^\d{10}$/.test(digits)) {
      found.push({
        code: "invalid_account_number",
        severity: "BLOCKER",
        payeeName: row.payeeName,
        instructionId: row.id,
        message:
          digits.length === 0
            ? `${row.payeeName} has no account number on file.`
            : `${row.payeeName}'s account number is ${digits.length} digits. A Nigerian account number is ten.`,
      });
    }

    if (row.amountKobo <= 0) {
      found.push({
        code: "non_positive_amount",
        severity: "BLOCKER",
        payeeName: row.payeeName,
        instructionId: row.id,
        message: `${row.payeeName}'s payment is ${money(row.amountKobo)}. Remove them from the run or fix their payslip.`,
        actualKobo: row.amountKobo,
      });
    }

    const previous = digits.length === 10 ? seen.get(digits) : undefined;
    if (previous && previous !== row.payeeName) {
      found.push({
        code: "duplicate_account",
        severity: "WARNING",
        payeeName: row.payeeName,
        instructionId: row.id,
        message: `${row.payeeName} and ${previous} have the same account number. Check that is right before you release this.`,
      });
    }
    if (digits.length === 10) seen.set(digits, row.payeeName);
  }

  return {
    ok: found.every((item) => item.severity !== "BLOCKER"),
    discrepancies: found,
    instructionTotalKobo: summed,
  };
}

/** What can be done next, decided the same way the API decides it. */
function demoAffordances(status: PaymentBatchStatus): BatchAffordances {
  const fileStatuses: PaymentBatchStatus[] = [
    "APPROVED",
    "SUBMITTED",
    "COMPLETED",
    "PARTIALLY_SETTLED",
    "FAILED",
  ];
  return {
    check: status === "DRAFT" || status === "AWAITING_APPROVAL",
    approve: status === "DRAFT" || status === "AWAITING_APPROVAL",
    submit: status === "APPROVED",
    cancel:
      status === "DRAFT" ||
      status === "AWAITING_APPROVAL" ||
      status === "APPROVED" ||
      status === "FAILED",
    downloadFile: fileStatuses.includes(status),
  };
}

/** Drops the full account number. Nothing a component sees ever carries one. */
function strip(row: DemoInstruction): ApiPaymentInstruction {
  const { accountNumberFull, ...rest } = row;
  void accountNumberFull;
  return rest;
}

function toBatch(batch: DemoBatch): ApiPaymentBatch {
  const { instructions, ...rest } = batch;
  void instructions;
  return {
    ...rest,
    balanced: batch.expectedTotalKobo === batch.computedTotalKobo,
    can: demoAffordances(batch.status),
  };
}

function toDetail(batch: DemoBatch, accounts: ApiBankAccount[]): ApiBatchDetail {
  const gate = evaluateDemo(batch, accounts);
  return {
    ...toBatch(batch),
    instructions: batch.instructions.map(strip),
    check: {
      ok: gate.ok,
      discrepancies: gate.discrepancies,
      instructionTotalKobo: gate.instructionTotalKobo,
    },
  };
}

/* --------------------------------------------------------------- the summary */

export type PaymentsSummaryState = {
  summary: ApiPaymentsSummary | null;
  loading: boolean;
  error: ApiError | null;
  live: boolean;
  reload: () => void;
};

export function usePaymentsSummary(): PaymentsSummaryState {
  const { isConnected } = useSession();
  const book = useDemoBook();
  const rev = useRevision();

  const [fetched, setFetched] = useState<{
    rev: number;
    summary: ApiPaymentsSummary | null;
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const summary = await paymentsApi.summary(controller.signal);
        if (!cancelled) setFetched({ rev, summary, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            rev,
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
  }, [isConnected, rev]);

  if (!isConnected) {
    const outstanding = book.batches
      .filter((batch) =>
        ["DRAFT", "AWAITING_APPROVAL", "APPROVED", "SUBMITTED"].includes(batch.status),
      )
      .map(toBatch);
    const august = book.batches.filter((batch) => batch.period?.startsWith("2026-08"));

    return {
      summary: {
        /* The demo says exactly what the API says, because it is the same fact
           about the same product: nothing here can pay anybody yet. */
        provider: {
          connected: false,
          name: null,
          note:
            "No payment provider is connected. Approve a batch and download the bank file — that is how payments go out today.",
        },
        primaryAccount: book.accounts.find((a) => a.isPrimary && !a.archived) ?? null,
        outstanding: {
          count: outstanding.length,
          totalKobo: outstanding.reduce((sum, b) => sum + b.computedTotalKobo, 0),
          batches: outstanding,
        },
        /* Nothing has completed, because nothing can. */
        lastCompleted: null,
        thisMonth: {
          period: "August 2026",
          batches: august.length,
          payments: august.reduce((sum, b) => sum + b.itemCount, 0),
          totalKobo: august.reduce((sum, b) => sum + b.computedTotalKobo, 0),
          /* What the ledger says left the account. No salary has settled. */
          settledKobo: 0,
        },
      },
      loading: false,
      error: null,
      live: false,
      reload: bumpRevision,
    };
  }

  const matched = fetched !== null && fetched.rev === rev;
  return {
    summary: matched ? fetched.summary : null,
    loading: !matched,
    error: matched ? fetched.error : null,
    live: true,
    reload: bumpRevision,
  };
}

/* ----------------------------------------------------------------- the lists */

export type BatchListState = {
  batches: ApiPaymentBatch[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  error: ApiError | null;
  live: boolean;
  reload: () => void;
};

export function usePaymentBatches(params: BatchListParams = {}): BatchListState {
  const { isConnected } = useSession();
  const book = useDemoBook();
  const rev = useRevision();

  const { page = 1, pageSize = 25, status, payrollRunId, sort, order = "desc" } = params;

  const query = useMemo<BatchListParams>(
    () => ({
      page,
      pageSize,
      order,
      ...(status ? { status } : {}),
      ...(payrollRunId ? { payrollRunId } : {}),
      ...(sort ? { sort } : {}),
    }),
    [page, pageSize, order, status, payrollRunId, sort],
  );

  const key = useMemo(() => JSON.stringify({ query, rev }), [query, rev]);

  /* The answer, tagged with the request it answers, so `loading` is derived
     during render rather than set inside the effect. */
  const [fetched, setFetched] = useState<{
    key: string;
    batches: ApiPaymentBatch[];
    total: number;
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await paymentsApi.batches(query, controller.signal);
        if (!cancelled) {
          setFetched({ key, batches: result.data, total: result.meta.total, error: null });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            batches: [],
            total: 0,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, query, key]);

  if (!isConnected) {
    let rows = book.batches.map(toBatch);
    if (status) rows = rows.filter((batch) => batch.status === status);
    rows = [...rows].sort((a, b) =>
      order === "asc"
        ? a.createdAt.localeCompare(b.createdAt)
        : b.createdAt.localeCompare(a.createdAt),
    );
    const start = (page - 1) * pageSize;
    return {
      batches: rows.slice(start, start + pageSize),
      total: rows.length,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
      loading: false,
      error: null,
      live: false,
      reload: bumpRevision,
    };
  }

  const matched = fetched !== null && fetched.key === key;
  return {
    batches: matched ? fetched.batches : [],
    total: matched ? fetched.total : 0,
    page,
    pageSize,
    totalPages: matched ? Math.max(1, Math.ceil(fetched.total / pageSize)) : 1,
    loading: !matched,
    error: matched ? fetched.error : null,
    live: true,
    reload: bumpRevision,
  };
}

/* ------------------------------------------------------------------ one batch */

export type BatchDetailState = {
  batch: ApiBatchDetail | null;
  loading: boolean;
  error: ApiError | null;
  live: boolean;
};

export function usePaymentBatch(id: string | null): BatchDetailState {
  const { isConnected } = useSession();
  const book = useDemoBook();
  const rev = useRevision();
  const active = Boolean(id) && isConnected;

  /* Kept as `{ id, batch }` so the result carries the id it belongs to: a slow
     answer for a batch you have navigated away from cannot be rendered, and
     there is nothing to clear when `id` changes. */
  const [fetched, setFetched] = useState<{
    id: string;
    rev: number;
    batch: ApiBatchDetail | null;
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!active || !id) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const batch = await paymentsApi.batch(id, controller.signal);
        if (!cancelled) setFetched({ id, rev, batch, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            id,
            rev,
            batch: null,
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
    const found = id ? book.batches.find((batch) => batch.id === id) : undefined;
    return {
      batch: found ? toDetail(found, book.accounts) : null,
      loading: false,
      error: null,
      live: false,
    };
  }

  const matched = fetched !== null && fetched.id === id && fetched.rev === rev;
  return {
    batch: matched ? fetched.batch : null,
    loading: active && !matched,
    error: matched ? fetched.error : null,
    live: true,
  };
}

/* -------------------------------------------------------------------- ledger */

export type LedgerState = {
  rows: ApiLedgerEntry[];
  total: number;
  totals: { inKobo: number; outKobo: number };
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  error: ApiError | null;
  live: boolean;
  reload: () => void;
};

export function useLedger(params: LedgerListParams = {}): LedgerState {
  const { isConnected } = useSession();
  const book = useDemoBook();
  const rev = useRevision();

  const { page = 1, pageSize = 25, kind, bankAccountId, from, to, order = "desc" } = params;

  const query = useMemo<LedgerListParams>(
    () => ({
      page,
      pageSize,
      order,
      ...(kind ? { kind } : {}),
      ...(bankAccountId ? { bankAccountId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
    [page, pageSize, order, kind, bankAccountId, from, to],
  );

  const key = useMemo(() => JSON.stringify({ query, rev }), [query, rev]);

  const [fetched, setFetched] = useState<{
    key: string;
    result: ApiLedgerPage | null;
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await paymentsApi.ledger(query, controller.signal);
        if (!cancelled) setFetched({ key, result, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            result: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, query, key]);

  if (!isConnected) {
    let rows = book.ledger;
    if (kind) rows = rows.filter((row) => row.kind === kind);
    if (bankAccountId) rows = rows.filter((row) => row.bankAccountId === bankAccountId);
    if (from) rows = rows.filter((row) => row.occurredAt >= from);
    if (to) rows = rows.filter((row) => row.occurredAt <= to);
    rows = [...rows].sort((a, b) =>
      order === "asc"
        ? a.occurredAt.localeCompare(b.occurredAt)
        : b.occurredAt.localeCompare(a.occurredAt),
    );
    const start = (page - 1) * pageSize;
    return {
      rows: rows.slice(start, start + pageSize),
      total: rows.length,
      totals: {
        inKobo: rows
          .filter((row) => row.direction === "CREDIT")
          .reduce((sum, row) => sum + row.amountKobo, 0),
        outKobo: rows
          .filter((row) => row.direction === "DEBIT")
          .reduce((sum, row) => sum + row.amountKobo, 0),
      },
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(rows.length / pageSize)),
      loading: false,
      error: null,
      live: false,
      reload: bumpRevision,
    };
  }

  const matched = fetched !== null && fetched.key === key;
  const result = matched ? fetched.result : null;
  return {
    rows: result?.rows ?? [],
    total: result?.total ?? 0,
    totals: result?.totals ?? { inKobo: 0, outKobo: 0 },
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil((result?.total ?? 0) / pageSize)),
    loading: !matched,
    error: matched ? fetched.error : null,
    live: true,
    reload: bumpRevision,
  };
}

/* ------------------------------------------------------------- bank accounts */

export type BankAccountsState = {
  accounts: ApiBankAccount[];
  primaryId: string | null;
  counts: { active: number; archived: number };
  loading: boolean;
  error: ApiError | null;
  live: boolean;
  reload: () => void;
  create: (body: CreateAccountBody) => Promise<void>;
  update: (id: string, body: UpdateAccountBody) => Promise<void>;
  archive: (id: string) => Promise<void>;
  /** Makes one primary and demotes the other, never leaving two. */
  makePrimary: (id: string) => Promise<void>;
};

export function useBankAccounts(includeArchived = false): BankAccountsState {
  const { isConnected } = useSession();
  const book = useDemoBook();
  const rev = useRevision();

  const [fetched, setFetched] = useState<{
    key: string;
    accounts: ApiBankAccount[];
    primaryId: string | null;
    counts: { active: number; archived: number };
    error: ApiError | null;
  } | null>(null);

  const key = useMemo(
    () => JSON.stringify({ includeArchived, rev }),
    [includeArchived, rev],
  );

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const result = await paymentsApi.accounts(includeArchived, controller.signal);
        if (!cancelled) {
          setFetched({
            key,
            accounts: result.rows,
            primaryId: result.primaryId,
            counts: result.counts,
            error: null,
          });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({
            key,
            accounts: [],
            primaryId: null,
            counts: { active: 0, archived: 0 },
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, includeArchived, key]);

  const create = useCallback(
    async (body: CreateAccountBody) => {
      if (isConnected) {
        await paymentsApi.createAccount(body);
        bumpRevision();
        return;
      }
      demoCreateAccount(body);
      bumpRevision();
    },
    [isConnected],
  );

  const update = useCallback(
    async (id: string, body: UpdateAccountBody) => {
      if (isConnected) {
        await paymentsApi.updateAccount(id, body);
        bumpRevision();
        return;
      }
      demoUpdateAccount(id, body);
      bumpRevision();
    },
    [isConnected],
  );

  const archive = useCallback(
    async (id: string) => {
      if (isConnected) {
        await paymentsApi.archiveAccount(id);
        bumpRevision();
        return;
      }
      demoArchiveAccount(id);
      bumpRevision();
    },
    [isConnected],
  );

  const makePrimary = useCallback(
    async (id: string) => {
      await update(id, { isPrimary: true });
    },
    [update],
  );

  if (!isConnected) {
    const rows = includeArchived
      ? book.accounts
      : book.accounts.filter((account) => !account.archived);
    return {
      accounts: [...rows].sort((a, b) =>
        a.isPrimary === b.isPrimary
          ? a.bankName.localeCompare(b.bankName)
          : a.isPrimary
            ? -1
            : 1,
      ),
      primaryId: book.accounts.find((a) => a.isPrimary && !a.archived)?.id ?? null,
      counts: {
        active: book.accounts.filter((a) => a.active && !a.archived).length,
        archived: book.accounts.filter((a) => a.archived).length,
      },
      loading: false,
      error: null,
      live: false,
      reload: bumpRevision,
      create,
      update,
      archive,
      makePrimary,
    };
  }

  const matched = fetched !== null && fetched.key === key;
  return {
    accounts: matched ? fetched.accounts : [],
    primaryId: matched ? fetched.primaryId : null,
    counts: matched ? fetched.counts : { active: 0, archived: 0 },
    loading: !matched,
    error: matched ? fetched.error : null,
    live: true,
    reload: bumpRevision,
    create,
    update,
    archive,
    makePrimary,
  };
}

/* ------------------------------------------------- bank accounts, demo writes */

/** References of batches still pointing at an account that has not gone out. */
function openBatchesFor(book: DemoBook, accountId: string): string[] {
  return book.batches
    .filter(
      (batch) =>
        batch.sourceAccountId === accountId &&
        ["DRAFT", "AWAITING_APPROVAL", "APPROVED", "SUBMITTED"].includes(batch.status),
    )
    .map((batch) => batch.reference);
}

function refuse(message: string): never {
  throw new ApiError(409, "conflict", message);
}

function demoCreateAccount(body: CreateAccountBody) {
  const book = currentBook();
  const digits = body.accountNumber.replace(/\D/g, "");
  const clash = book.accounts.find((account) => account.last4 === digits.slice(-4));
  if (clash) {
    refuse(
      clash.archived
        ? `That account is already on file for ${clash.bankName} but archived. Restore it instead of adding it again.`
        : `That account is already on file for ${clash.bankName}.`,
    );
  }

  /* The first account is always the primary one, whatever was sent: a company
     with accounts but no primary cannot build a batch, and a form that quietly
     leaves them there is a support call. */
  const hasPrimary = book.accounts.some((a) => a.isPrimary && !a.archived);
  const isPrimary = body.isPrimary === true || !hasPrimary;

  const account: ApiBankAccount = {
    id: `acct-${digits.slice(-4)}-${book.accounts.length + 1}`,
    bankName: body.bankName,
    accountName: body.accountName,
    /* Masked on the way in. The demo never stores a real account number. */
    accountNumberMasked: mask(digits),
    last4: digits.slice(-4),
    bankCode: body.bankCode ?? null,
    accountType: body.accountType ?? null,
    isPrimary,
    active: true,
    archived: false,
    addedOn: new Date().toISOString().slice(0, 10),
  };

  commitBook({
    ...book,
    accounts: [
      ...book.accounts.map((existing) =>
        isPrimary ? { ...existing, isPrimary: false } : existing,
      ),
      account,
    ],
  });
}

function demoUpdateAccount(id: string, body: UpdateAccountBody) {
  const book = currentBook();
  const existing = book.accounts.find((account) => account.id === id);
  if (!existing) refuse("That bank account is not on file.");
  if (existing.archived) {
    refuse("That account is archived. Restore it before editing it.");
  }

  if (body.isPrimary === false && existing.isPrimary) {
    refuse(
      `${existing.bankName} is the account salaries come from. Make another account the primary one instead — there is always exactly one.`,
    );
  }

  const deactivating = body.active === false && existing.active;
  const numberChanging =
    body.accountNumber !== undefined &&
    body.accountNumber.replace(/\D/g, "").slice(-4) !== existing.last4;

  if (deactivating || numberChanging) {
    const open = openBatchesFor(book, id);
    if (open.length > 0) {
      refuse(
        `${numberChanging ? "Changing the account number" : "Switching this account off"} would move ${
          open.length === 1 ? "a payment batch" : "payment batches"
        } that has not gone out yet: ${open.join(", ")}. Send or cancel ${
          open.length === 1 ? "it" : "those"
        } first.`,
      );
    }
  }

  const promoting = body.isPrimary === true;
  const digits = body.accountNumber?.replace(/\D/g, "");

  commitBook({
    ...book,
    accounts: book.accounts.map((account) => {
      if (account.id !== id) {
        return promoting ? { ...account, isPrimary: false } : account;
      }
      return {
        ...account,
        ...(body.bankName !== undefined ? { bankName: body.bankName } : {}),
        ...(body.accountName !== undefined ? { accountName: body.accountName } : {}),
        ...(digits
          ? { accountNumberMasked: mask(digits), last4: digits.slice(-4) }
          : {}),
        ...(body.bankCode !== undefined ? { bankCode: body.bankCode } : {}),
        ...(body.accountType !== undefined ? { accountType: body.accountType } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
        ...(promoting ? { isPrimary: true } : {}),
      };
    }),
  });
}

function demoArchiveAccount(id: string) {
  const book = currentBook();
  const account = book.accounts.find((row) => row.id === id);
  if (!account) refuse("That bank account is not on file.");
  if (account.archived) refuse("That account is already archived.");

  const open = openBatchesFor(book, id);
  if (open.length > 0) {
    refuse(
      `${open.length === 1 ? "A payment batch has" : `${open.length} payment batches have`} not gone out from this account yet: ${open.join(
        ", ",
      )}. Send or cancel ${open.length === 1 ? "it" : "those"} first.`,
    );
  }

  if (account.isPrimary) {
    const alternatives = book.accounts.filter(
      (row) => row.id !== id && row.active && !row.archived,
    );
    if (alternatives.length > 0) {
      refuse(
        `${account.bankName} is the account salaries come from. Make another account primary first — ${alternatives
          .map((row) => row.bankName)
          .join(", ")}.`,
      );
    }
  }

  commitBook({
    ...book,
    accounts: book.accounts.map((row) =>
      row.id === id
        ? { ...row, archived: true, active: false, isPrimary: false }
        : row,
    ),
  });
}

/* ---------------------------------------------------------------- the actions */

/**
 * The refusal, in one sentence, said the same way in both modes.
 *
 * Copied from `NO_PROVIDER_REASON` on the API rather than paraphrased, because
 * two versions of this sentence would drift and one of them would end up
 * sounding like a temporary error.
 */
export const NO_PROVIDER_REASON =
  "No payment provider is connected, so nothing was sent and no money moved. " +
  "Download the bank file for this batch and upload it to your bank — that is " +
  "how payments go out today.";

export type PaymentActions = {
  /** Runs the gate. Safe and repeatable: it releases nothing. */
  check: (id: string) => Promise<{ ok: boolean; discrepancies: PaymentDiscrepancy[] }>;
  approve: (id: string) => Promise<void>;
  /** Always refuses today. Throws `ApiError` carrying the reason. */
  release: (id: string) => Promise<never>;
  cancel: (id: string, reason?: string) => Promise<void>;
  /** The bank file. This is the one that works. */
  downloadFile: (id: string) => Promise<BankFileDownload>;
  createBatch: (payrollRunId: string, sourceBankAccountId?: string) => Promise<string>;
  recordFunding: (body: FundingBody) => Promise<void>;
  live: boolean;
};

export function usePaymentActions(): PaymentActions {
  const { isConnected, displayName } = useSession();

  const check = useCallback(
    async (id: string) => {
      if (isConnected) {
        const result = await paymentsApi.check(id);
        bumpRevision();
        return { ok: result.ok, discrepancies: result.discrepancies };
      }
      const book = currentBook();
      const batch = book.batches.find((row) => row.id === id);
      if (!batch) refuse("That payment batch is not on file.");
      const gate = evaluateDemo(batch, book.accounts);

      /* Only DRAFT and AWAITING_APPROVAL move. An approved batch is checked and
         reported on but never walked backwards, because that would discard a
         decision somebody signed. */
      let status = batch.status;
      if (gate.ok && batch.status === "DRAFT") status = "AWAITING_APPROVAL";
      else if (!gate.ok && batch.status === "AWAITING_APPROVAL") status = "DRAFT";

      if (status !== batch.status) {
        commitBook({
          ...book,
          batches: book.batches.map((row) => (row.id === id ? { ...row, status } : row)),
        });
      }
      bumpRevision();
      return { ok: gate.ok, discrepancies: gate.discrepancies };
    },
    [isConnected],
  );

  const approve = useCallback(
    async (id: string) => {
      if (isConnected) {
        await paymentsApi.approve(id);
        bumpRevision();
        return;
      }
      const book = currentBook();
      const batch = book.batches.find((row) => row.id === id);
      if (!batch) refuse("That payment batch is not on file.");
      if (!demoAffordances(batch.status).approve) {
        refuse("That batch cannot be approved from where it is now.");
      }
      const gate = evaluateDemo(batch, book.accounts);
      if (!gate.ok) {
        const blockers = gate.discrepancies.filter((d) => d.severity === "BLOCKER");
        throw new ApiError(
          422,
          "unprocessable",
          `This batch does not add up yet, so it cannot be approved. ${blockers
            .slice(0, 3)
            .map((d) => d.message)
            .join(" ")}`,
        );
      }
      commitBook({
        ...book,
        batches: book.batches.map((row) =>
          row.id === id
            ? {
                ...row,
                status: "APPROVED" as PaymentBatchStatus,
                approvedByName: displayName,
                approvedAt: new Date().toISOString(),
                failureReason: null,
              }
            : row,
        ),
      });
      bumpRevision();
    },
    [isConnected, displayName],
  );

  /**
   * Hands the batch to the provider. There is no provider.
   *
   * Refuses in both modes, with the same sentence, and never touches the batch:
   * nothing was attempted, so nothing failed, and the batch stays APPROVED with
   * a perfectly good bank file behind it.
   */
  const release = useCallback(
    async (id: string): Promise<never> => {
      if (isConnected) {
        await paymentsApi.release(id);
        /* Unreachable while no provider is wired: the call above throws 422. If
           an adapter is ever registered this is where success lands, and the
           screen will need a branch for it. */
        bumpRevision();
        throw new ApiError(500, "unexpected", "That batch reported a result nothing here can render yet.");
      }
      throw new ApiError(422, "no_payment_provider", NO_PROVIDER_REASON);
    },
    [isConnected],
  );

  const cancel = useCallback(
    async (id: string, reason?: string) => {
      if (isConnected) {
        await paymentsApi.cancel(id, reason);
        bumpRevision();
        return;
      }
      const book = currentBook();
      const batch = book.batches.find((row) => row.id === id);
      if (!batch) refuse("That payment batch is not on file.");
      if (!demoAffordances(batch.status).cancel) {
        refuse(
          batch.status === "SUBMITTED"
            ? "That batch has already been sent and we do not know the outcome yet. Cancel it with the bank, then record what happened."
            : "That batch cannot be cancelled from where it is now.",
        );
      }
      commitBook({
        ...book,
        batches: book.batches.map((row) =>
          row.id === id
            ? {
                ...row,
                status: "CANCELLED" as PaymentBatchStatus,
                ...(reason ? { failureReason: reason } : {}),
              }
            : row,
        ),
      });
      bumpRevision();
    },
    [isConnected],
  );

  /**
   * The bank file.
   *
   * Connected, the API builds it — it is the only endpoint that reads full
   * account numbers, and the download is audited. Demo, it is built here from
   * the same rows the gate just checked, to the same column contract, so what
   * somebody takes to a bank in a demonstration has the shape of the real thing.
   */
  const downloadFile = useCallback(
    async (id: string): Promise<BankFileDownload> => {
      if (isConnected) {
        return paymentsApi.bankFile(id);
      }
      const book = currentBook();
      const batch = book.batches.find((row) => row.id === id);
      if (!batch) refuse("That payment batch is not on file.");
      if (!demoAffordances(batch.status).downloadFile) {
        throw new ApiError(
          422,
          "unprocessable",
          batch.status === "CANCELLED"
            ? "That batch was cancelled, so there is no file to take to the bank."
            : "This batch has not been approved yet, so there is no file to take to the bank. Approve it and the download works.",
        );
      }
      const gate = evaluateDemo(batch, book.accounts);
      if (!gate.ok) {
        throw new ApiError(
          422,
          "unprocessable",
          "This batch no longer adds up, so no file was produced.",
        );
      }
      return {
        filename: `payments-${batch.reference}.csv`,
        csv: buildDemoBankFile(batch),
      };
    },
    [isConnected],
  );

  const createBatch = useCallback(
    async (payrollRunId: string, sourceBankAccountId?: string) => {
      if (!isConnected) {
        refuse(
          "Building a payment batch reads an approved payroll run from the API. Sign in to a connected instance to do it.",
        );
      }
      const created = await paymentsApi.createBatch({
        payrollRunId,
        ...(sourceBankAccountId ? { sourceBankAccountId } : {}),
      });
      bumpRevision();
      return created.id;
    },
    [isConnected],
  );

  const recordFunding = useCallback(
    async (body: FundingBody) => {
      if (isConnected) {
        await paymentsApi.recordFunding(body);
        bumpRevision();
        return;
      }
      const book = currentBook();
      const account = book.accounts.find((row) => row.id === body.bankAccountId);
      if (!account) refuse("That bank account is not on file.");
      const entry: ApiLedgerEntry = {
        id: `led-${Date.now()}`,
        occurredAt: body.occurredAt ?? new Date().toISOString().slice(0, 10),
        kind: "FUNDING",
        direction: "CREDIT",
        amountKobo: body.amountKobo,
        /* Stored only when it was typed in. A running total worked out here
           would look reconciled without being reconciled. */
        balanceAfterKobo: body.balanceAfterKobo ?? null,
        reference: body.reference ?? null,
        note: body.note ?? null,
        bankAccountId: account.id,
        bankAccount: `${account.bankName} ${account.accountNumberMasked}`,
        paymentBatchId: null,
        batchReference: null,
      };
      commitBook({ ...book, ledger: [entry, ...book.ledger] });
      bumpRevision();
    },
    [isConnected],
  );

  return {
    check,
    approve,
    release,
    cancel,
    downloadFile,
    createBatch,
    recordFunding,
    live: isConnected,
  };
}

/**
 * The demo's bank file, to the same column contract as the API's.
 *
 * No thousands separators in Amount, CRLF line endings, no byte-order mark. All
 * three are decisions about bank importers rather than about spreadsheets: a
 * separator in an amount becomes three columns, a BOM is read by some parsers as
 * part of the first heading, and every bank portal in question is a Windows
 * application. `lib/csv.ts` writes a BOM by default, which is right for a file
 * somebody opens in Excel and wrong for this one — so this is built by hand.
 */
function buildDemoBankFile(batch: DemoBatch): string {
  const lines: string[] = [BANK_FILE_COLUMNS.join(",")];
  batch.instructions.forEach((row, index) => {
    lines.push(
      [
        String(index + 1),
        row.accountNumberFull,
        cell(row.payeeName),
        cell(row.bankName),
        cell(row.bankCode),
        nairaCell(row.amountKobo),
        cell(row.narration),
        cell(row.id),
      ].join(","),
    );
  });
  return `${lines.join("\r\n")}\r\n`;
}

/** One CSV cell, quoted when it has to be, never carrying a line break. */
function cell(value: string | null): string {
  if (value === null) return "";
  const flat = value.replace(/[\r\n\t]+/g, " ").trim();
  /* A leading `=`, `+` or `@` is neutralised so a payee name cannot become a
     formula if the file is opened in a spreadsheet on the way to the bank. */
  const neutral = /^[=+@]/.test(flat) ? `'${flat}` : flat;
  return /[",]/.test(neutral) ? `"${neutral.replace(/"/g, '""')}"` : neutral;
}

/* ------------------------------------------------------------- payable runs */

export type PayableRunsState = {
  runs: ApiPayableRun[];
  loading: boolean;
  live: boolean;
};

/**
 * Approved payroll runs, so a batch can be built from one.
 *
 * Runs that already carry a live batch are not filtered out here — the screen
 * does that, because it is the thing holding the batch list. The API refuses a
 * second batch for one run either way, naming the first: two batches for one run
 * is how people get paid twice.
 *
 * Empty in demo mode, and that is the honest answer rather than a limitation
 * worth a message: a payment batch is built from a payroll run, the demo has no
 * run to build from, and the demo book already carries this month's batch. A
 * screen with no runs here simply does not offer the button — which is the same
 * thing it should do connected when there is nothing waiting to be paid.
 */
export function usePayableRuns(): PayableRunsState {
  const { isConnected } = useSession();
  const rev = useRevision();

  const [fetched, setFetched] = useState<{ rev: number; runs: ApiPayableRun[] } | null>(
    null,
  );

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const runs = await paymentsApi.payableRuns(controller.signal);
        if (!cancelled) setFetched({ rev, runs });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        /* A reader who cannot see payroll runs is not an error to report — they
           simply get no button. The API is the thing enforcing that. */
        if (!cancelled) setFetched({ rev, runs: [] });
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, rev]);

  if (!isConnected) return { runs: [], loading: false, live: false };

  const matched = fetched !== null && fetched.rev === rev;
  return {
    runs: matched ? fetched.runs : [],
    loading: !matched,
    live: true,
  };
}

/* ------------------------------------------------------------------- labels */

/**
 * Plain words for a status, and the shape that carries it.
 *
 * Never colour alone: every one of these is a label, and the badge that renders
 * it pairs the tone with the words. "Waiting at your bank" is what APPROVED
 * actually means today — the file has been produced and the money has not
 * moved — and calling it "Approved" invites somebody to read it as paid.
 */
export const BATCH_STATUS: Record<
  PaymentBatchStatus,
  { label: string; tone: "neutral" | "accent" | "warning" | "success" | "danger"; hint: string }
> = {
  DRAFT: {
    label: "Being built",
    tone: "neutral",
    hint: "Run the check to see whether it adds up.",
  },
  AWAITING_APPROVAL: {
    label: "Ready to approve",
    tone: "warning",
    hint: "Everything adds up. Nothing leaves the account until somebody approves it.",
  },
  APPROVED: {
    label: "Approved — not yet paid",
    tone: "accent",
    hint: "Download the payment file and upload it to your bank.",
  },
  SUBMITTED: {
    label: "Sent, outcome unknown",
    tone: "warning",
    hint: "Do not send it again. Find out what happened at the bank first.",
  },
  COMPLETED: {
    label: "Paid",
    tone: "success",
    hint: "Every payment in this batch settled.",
  },
  PARTIALLY_SETTLED: {
    label: "Partly paid",
    tone: "warning",
    hint: "Some payments settled and some did not.",
  },
  FAILED: {
    label: "Failed",
    tone: "danger",
    hint: "The payment was attempted and did not work.",
  },
  CANCELLED: {
    label: "Cancelled",
    tone: "neutral",
    hint: "Stopped before anything went out.",
  },
};

/** Plain words for a ledger row. `SALARY` out is the one people look for. */
export const LEDGER_KIND_LABEL: Record<string, string> = {
  SALARY: "Salaries",
  STATUTORY_REMITTANCE: "PAYE, pension and NHF",
  REIMBURSEMENT: "Expense claim",
  LOAN_DISBURSEMENT: "Staff loan paid out",
  LOAN_REPAYMENT: "Loan repayment",
  FUNDING: "Money in",
  FEE: "Bank charge",
  REVERSAL: "Reversal",
  ADJUSTMENT: "Correction",
};
