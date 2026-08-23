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
  naira,
  reimbursementsApi as api,
  type ApiClaim,
  type ApiExpenseType,
  type ClaimListParams,
  type ClaimStatus,
  type SettledThrough,
} from "@/lib/api/reimbursements";
import { CURRENT_USER, employeeById } from "@/lib/mock/people";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";

/**
 * Expense claims, from whichever source is available.
 *
 * The API when it answers, a localStorage demo when it does not — the same two
 * modes as every other store. The interesting decision is **where the line is
 * drawn in demo mode**, and here the demo writes.
 *
 * `store/departments.ts` made its demo read-only because a department is a
 * payroll reporting boundary and a tree built in browser storage would teach a
 * demo audience something false about how the product works. An expense claim
 * is the opposite case: the thing worth showing *is* the flow — somebody claims,
 * somebody else approves, the money is marked paid, and the outstanding total
 * moves. A read-only version of that shows nothing.
 *
 * So the demo writes, and the whole of its value depends on it **refusing what
 * the API refuses, in the same words**. All eight refusals are implemented
 * below, against the same wording as `approvehr-api/src/modules/reimbursements/service.ts`:
 *
 *   1. a claim over its type's cap, naming the cap and the claim
 *   2. a claim with no receipt reference against a type that requires one
 *   3. a cost dated in the future
 *   4. a claim against a switched-off or archived type
 *   5. an edit to anything past SUBMITTED, naming the decision in the way
 *   6. approving your own claim
 *   7. declining with no reason
 *   8. marking an unapproved, declined or already-paid claim as paid
 *
 * A demo that let you approve your own claim would be demonstrating a product
 * that does not exist, and the self-approval refusal is the one an owner
 * actually asks about.
 *
 * ## Money
 *
 * The API speaks integer kobo. The mappers here — `toClaim`, `toType` — are the
 * boundary, and everything above them is naira. The demo state deliberately
 * stores the **wire** shapes rather than view models, so both modes go through
 * exactly the same mapper and a bug cannot exist in one and not the other.
 */

/* -------------------------------------------------------------- view types */

export type { ClaimStatus, SettledThrough };

export type ExpenseType = {
  id: string;
  name: string;
  description: string | null;
  requiresReceipt: boolean;
  /** Naira, per claim. `null` means no cap. */
  cap: number | null;
  active: boolean;
  archived: boolean;
  /** Claims ever made against it, including decided and paid ones. */
  claimCount: number;
  /** False for an archived or switched-off type: nothing new can be claimed. */
  claimable: boolean;
};

export type Claim = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  typeId: string;
  type: string;
  /** Naira. */
  amount: number;
  /** `YYYY-MM-DD`. When the money went out, not when it was claimed. */
  incurredOn: string;
  description: string;
  /** A reference somebody typed. There is nothing to fetch with it yet. */
  receiptKey: string | null;
  hasReceipt: boolean;
  status: ClaimStatus;
  editable: boolean;
  approvedByName: string | null;
  decidedAt: string | null;
  declinedReason: string | null;
  paidAt: string | null;
  settledThrough: SettledThrough | null;
  submittedAt: string;
  /** Approved and unpaid: the employee is still out of pocket. */
  outstanding: boolean;
};

export type ExpenseSummary = {
  outstanding: {
    claimCount: number;
    /** Naira. What the company owes named people right now. */
    amount: number;
    oldestIncurredOn: string | null;
  };
  byType: { typeId: string; type: string; claimCount: number; amount: number }[];
  /** A queue, not a liability. Never added to the figure above. */
  awaitingDecision: { claimCount: number; amount: number };
};

/* ----------------------------------------------------------------- mappers */

function toType(row: ApiExpenseType): ExpenseType {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    requiresReceipt: row.requiresReceipt,
    cap: row.capAmountKobo === null ? null : naira(row.capAmountKobo),
    active: row.active,
    archived: row.archived,
    claimCount: row.claimCount ?? 0,
    claimable: row.active && !row.archived,
  };
}

function toClaim(row: ApiClaim): Claim {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    employeeNo: row.employeeNo,
    typeId: row.typeId,
    type: row.type,
    amount: naira(row.amountKobo),
    incurredOn: row.incurredOn,
    description: row.description,
    receiptKey: row.receiptKey,
    hasReceipt: Boolean(row.receiptKey),
    status: row.status,
    editable: row.editable,
    approvedByName: row.approvedByName,
    decidedAt: row.decidedAt,
    declinedReason: row.declinedReason,
    paidAt: row.paidAt,
    settledThrough: row.settledThrough,
    submittedAt: row.submittedAt,
    outstanding: row.status === "APPROVED" && row.paidAt === null,
  };
}

/* ------------------------------------------------------------- the refusals */

/** Naira, formatted exactly as `formatNaira` in the API's `lib/money.ts` does. */
function nairaText(amountKobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(naira(amountKobo));
}

/** A 422 shaped like the API's, so `policyBreach()` reads the demo's too. */
function unprocessable(
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError(422, "unprocessable_entity", message, details);
}

const conflict = (message: string) => new ApiError(409, "conflict", message);

/** `YYYY-MM-DD` for today, in the local calendar the date input uses. */
export function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The two limits a type imposes, checked in one place — the demo's copy of
 * `assertWithinPolicy`. Both refusals name the limit and its value, because
 * "claim refused" on its own is the message that generates a phone call.
 */
function assertWithinPolicy(
  type: ApiExpenseType,
  amountKobo: number,
  receiptKey: string | null,
): void {
  if (type.requiresReceipt && !receiptKey) {
    throw unprocessable(
      `${type.name} needs a receipt. Attach one and submit again.`,
      { limit: "requiresReceipt", typeId: type.id, typeName: type.name },
    );
  }
  if (type.capAmountKobo !== null && amountKobo > type.capAmountKobo) {
    throw unprocessable(
      `${type.name} is capped at ${nairaText(type.capAmountKobo)} a claim, and ` +
        `this one is ${nairaText(amountKobo)}. Split it, or ask for the cap to ` +
        `be raised.`,
      {
        limit: "capAmount",
        typeId: type.id,
        typeName: type.name,
        capKobo: type.capAmountKobo,
        amountKobo,
      },
    );
  }
}

/** The message a decided claim refuses an edit with. Names what is in the way. */
function alreadyDecided(claim: ApiClaim): string {
  switch (claim.status) {
    case "APPROVED":
      return (
        `That claim was approved${claim.decidedAt ? ` on ${claim.decidedAt.slice(0, 10)}` : ""}, ` +
        "so it cannot be edited. Raise a new claim for anything that changed."
      );
    case "PAID":
      return "That claim has been paid, so it cannot be edited.";
    case "DECLINED":
      return "That claim was declined. Raise a new one rather than editing it.";
    default:
      return "That claim can no longer be edited.";
  }
}

/* ------------------------------------------------------------------ the demo */

/** Days back from today as `YYYY-MM-DD`. Keeps the seed plausible on any day. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const isoDaysAgo = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString();

const NAIRA = 100;

/**
 * The types a Nigerian small business already needs on day one.
 *
 * Shipped populated rather than left to be configured — PARITY.md's Rule 3.
 * Nobody should have to define "Transport" before their driver can claim a bus
 * fare. The caps are deliberately the sort of figure an owner recognises, and
 * two types carry no cap because travel and treatment genuinely vary.
 *
 * Which types require a receipt is the one judgement here. Transport and airtime
 * do not, because a keke fare and a recharge card do not produce one and
 * pretending otherwise means every claim arrives with a made-up reference.
 */
const SEED_TYPES: ApiExpenseType[] = DEMO_ENABLED ? [
  {
    id: "demo-type-transport",
    name: "Transport",
    description: "Buses, keke and ride-hailing for work trips around town.",
    requiresReceipt: false,
    capAmountKobo: 25_000 * NAIRA,
    active: true,
    archived: false,
    claimCount: 3,
  },
  {
    id: "demo-type-fuel",
    name: "Fuel",
    description: "Petrol or diesel for a work journey, or for the generator.",
    requiresReceipt: true,
    capAmountKobo: 75_000 * NAIRA,
    active: true,
    archived: false,
    claimCount: 2,
  },
  {
    id: "demo-type-airtime",
    name: "Airtime and data",
    description: "Calls and data bought for work.",
    requiresReceipt: false,
    capAmountKobo: 15_000 * NAIRA,
    active: true,
    archived: false,
    claimCount: 1,
  },
  {
    id: "demo-type-meals",
    name: "Meals",
    description: "Feeding on a work trip, or while working late.",
    requiresReceipt: true,
    capAmountKobo: 20_000 * NAIRA,
    active: true,
    archived: false,
    claimCount: 1,
  },
  {
    id: "demo-type-travel",
    name: "Travel and hotel",
    description: "Flights, buses between cities, and a night in a hotel.",
    requiresReceipt: true,
    capAmountKobo: null,
    active: true,
    archived: false,
    claimCount: 2,
  },
  {
    id: "demo-type-medical",
    name: "Medical",
    description: "Treatment the company has agreed to cover.",
    requiresReceipt: true,
    capAmountKobo: null,
    active: true,
    archived: false,
    claimCount: 0,
  },
] : [];

/** A demo claim, written as the wire shape so it goes through `toClaim`. */
function seedClaim(input: {
  id: string;
  employeeId: string;
  typeId: string;
  typeName: string;
  amount: number;
  daysAgo: number;
  description: string;
  receiptKey?: string;
  status: ClaimStatus;
  approvedBy?: string;
  declinedReason?: string;
  paidDaysAgo?: number;
}): ApiClaim {
  const employee = employeeById(input.employeeId) ?? CURRENT_USER;
  /* Only ever called from inside a `DEMO_ENABLED` branch, so the seed is
     there. Throwing rather than inventing a person: reaching this in a
     production build would mean a fabricated claim was about to be
     presented as a real one, and that should fail loudly. */
  if (!employee) throw new Error("No demo employee behind a demo claim.");
  const decided = input.status !== "SUBMITTED";
  return {
    id: input.id,
    employeeId: employee.id,
    employeeName: `${employee.firstName} ${employee.lastName}`,
    employeeNo: employee.employeeNo,
    typeId: input.typeId,
    type: input.typeName,
    amountKobo: input.amount * NAIRA,
    incurredOn: daysAgo(input.daysAgo),
    description: input.description,
    receiptKey: input.receiptKey ?? null,
    status: input.status,
    editable: input.status === "SUBMITTED",
    approvedById: decided ? "p-02" : null,
    approvedByName: decided ? (input.approvedBy ?? (DEMO_ENABLED ? "Tunde Bakare" : "")) : null,
    decidedAt: decided ? isoDaysAgo(Math.max(0, input.daysAgo - 2)) : null,
    declinedReason: input.declinedReason ?? null,
    paidAt:
      input.status === "PAID" ? isoDaysAgo(input.paidDaysAgo ?? 1) : null,
    payslipId: null,
    settledThrough: input.status === "PAID" ? "direct" : null,
    submittedAt: isoDaysAgo(input.daysAgo),
  };
}

/**
 * Claims across every state, so no tab is empty and the totals are non-zero.
 *
 * One of them belongs to `CURRENT_USER` and is still awaiting a decision. That
 * is the point of it: the demo account holds every permission, so the only way
 * to show that the product refuses self-approval is to put a claim of their own
 * in the queue.
 */
const SEED_CLAIMS: ApiClaim[] = DEMO_ENABLED ? [
  seedClaim({
    id: "demo-claim-01",
    employeeId: "p-07",
    typeId: "demo-type-travel",
    typeName: "Travel and hotel",
    amount: 184_500,
    daysAgo: 21,
    description: "Abuja trip for the Federal Ministry meeting — bus and one night",
    receiptKey: "receipts/2026/abuja-hotel-folio.pdf",
    status: "APPROVED",
  }),
  seedClaim({
    id: "demo-claim-02",
    employeeId: "p-08",
    typeId: "demo-type-fuel",
    typeName: "Fuel",
    amount: 62_000,
    daysAgo: 12,
    description: "Diesel for the office generator during the outage",
    receiptKey: "receipts/2026/total-filling-station-0912",
    status: "APPROVED",
  }),
  seedClaim({
    id: "demo-claim-03",
    employeeId: "p-06",
    typeId: "demo-type-transport",
    typeName: "Transport",
    amount: 18_400,
    daysAgo: 6,
    description: "Site visits in Ikeja and Yaba over three days",
    status: "SUBMITTED",
  }),
  seedClaim({
    id: "demo-claim-04",
    employeeId: "p-03",
    typeId: "demo-type-meals",
    typeName: "Meals",
    amount: 14_800,
    daysAgo: 4,
    description: "Feeding for the team during the Saturday deployment",
    receiptKey: "receipts/2026/chicken-republic-4471",
    status: "SUBMITTED",
  }),
  seedClaim({
    id: "demo-claim-05",
    employeeId: "p-10",
    typeId: "demo-type-airtime",
    typeName: "Airtime and data",
    amount: 9_000,
    daysAgo: 3,
    description: "Data for the field team in Kano",
    status: "SUBMITTED",
  }),
  seedClaim({
    id: "demo-claim-06",
    employeeId: "p-09",
    typeId: "demo-type-transport",
    typeName: "Transport",
    amount: 7_200,
    daysAgo: 30,
    description: "Ride to the bank to sign the mandate",
    status: "PAID",
    paidDaysAgo: 20,
  }),
  seedClaim({
    id: "demo-claim-07",
    employeeId: "p-04",
    typeId: "demo-type-travel",
    typeName: "Travel and hotel",
    amount: 96_000,
    daysAgo: 45,
    description: "Flight to Port Harcourt",
    status: "DECLINED",
    declinedReason:
      "This one goes on the client's invoice, not ours. Send it to me and I will bill it.",
  }),
] : [];

type DemoState = { types: ApiExpenseType[]; claims: ApiClaim[] };

const demo = createPersistedState<DemoState>({
  key: "approvehr.expenses.store",
  empty: { types: SEED_TYPES, claims: SEED_CLAIMS },
  version: 1,
});

let demoCounter = 0;
const demoId = (prefix: string) =>
  `demo-${prefix}-${Date.now().toString(36)}-${(demoCounter += 1)}`;

/* -------------------------------------------------------------- revision bus */

/**
 * One counter every connected read watches.
 *
 * A decision on the queue changes three things at once: the queue, the register,
 * and the outstanding total in the page header. Each is its own request, so
 * without a shared signal a screen would approve a claim and leave a stale
 * liability figure on display — the sort of number somebody reconciles against a
 * bank statement. Bumping this after every write re-reads all three.
 *
 * Demo mode needs no equivalent: `createPersistedState` already notifies every
 * subscriber on commit.
 */
let revision = 0;
const watchers = new Set<() => void>();

function bumpRevision(): void {
  revision += 1;
  watchers.forEach((watcher) => watcher());
}

function useRevision(): number {
  return useSyncExternalStore(
    (listener) => {
      watchers.add(listener);
      return () => {
        watchers.delete(listener);
      };
    },
    () => revision,
    () => 0,
  );
}

function useDemoState(): DemoState {
  return useSyncExternalStore(demo.subscribe, demo.read, demo.getServerSnapshot);
}

/* ---------------------------------------------------------------- the types */

export type CreateTypeInput = {
  name: string;
  description?: string;
  requiresReceipt: boolean;
  /** Naira. `null` for no cap. */
  cap: number | null;
};

export type UpdateTypeInput = Partial<CreateTypeInput> & { active?: boolean };

/**
 * Expense types — what people are allowed to claim for, capped and receipted.
 *
 * Kept in its own hook because the claim form needs it and the settings view
 * needs it, and the form must not wait on a claims page to render its picker.
 */
export function useExpenseTypes(includeArchived = false) {
  const { isConnected } = useSession();
  const revisionValue = useRevision();
  const demoState = useDemoState();

  /**
   * What is being asked for. Every read is stamped with it, and `loading` is
   * *derived* from whether the answer in hand matches — which is what keeps a
   * `setState` out of the effect body. Setting a loading flag there cascades a
   * render, and the answer for a query you have already navigated away from can
   * never be mistaken for the current one.
   */
  const stamp = `${includeArchived}|${revisionValue}`;

  const [remote, setRemote] = useState<{
    stamp: string;
    types: ExpenseType[];
    error: ApiError | null;
  } | null>(null);

  /* The request lives in the effect body as an inline async call rather than
     behind a `useCallback`: nothing here sets state synchronously, so there is
     no cascading render, and the cleanup can abort a read the screen has
     already navigated past. */
  useEffect(() => {
    if (!isConnected) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const rows = await api.types(includeArchived, controller.signal);
        if (!cancelled) setRemote({ stamp, types: rows.map(toType), error: null });
      } catch (error) {
        if (cancelled || error instanceof DOMException) return;
        setRemote({
          stamp,
          types: [],
          error: error instanceof ApiError ? error : null,
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, includeArchived, stamp]);

  const answered = remote !== null && remote.stamp === stamp;

  const demoTypes = useMemo(
    () =>
      demoState.types
        .filter((type) => includeArchived || !type.archived)
        .map(toType)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [demoState.types, includeArchived],
  );

  const createType = useCallback(
    async (input: CreateTypeInput): Promise<void> => {
      if (isConnected) {
        await api.createType({
          name: input.name,
          ...(input.description ? { description: input.description } : {}),
          requiresReceipt: input.requiresReceipt,
          ...(input.cap === null ? {} : { capAmountKobo: kobo(input.cap) }),
        });
        bumpRevision();
        return;
      }

      const state = demo.current();
      const clash = state.types.find(
        (type) => type.name.toLowerCase() === input.name.toLowerCase(),
      );
      if (clash) {
        throw conflict(
          clash.archived
            ? `"${input.name}" exists but is archived. Switch it back on instead of creating a second one.`
            : `"${input.name}" already exists.`,
        );
      }
      demo.commit({
        ...state,
        types: [
          ...state.types,
          {
            id: demoId("type"),
            name: input.name,
            description: input.description ?? null,
            requiresReceipt: input.requiresReceipt,
            capAmountKobo: input.cap === null ? null : kobo(input.cap),
            active: true,
            archived: false,
            claimCount: 0,
          },
        ],
      });
    },
    [isConnected],
  );

  const updateType = useCallback(
    async (id: string, input: UpdateTypeInput): Promise<void> => {
      if (isConnected) {
        await api.updateType(id, {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined
            ? {}
            : { description: input.description || null }),
          ...(input.requiresReceipt === undefined
            ? {}
            : { requiresReceipt: input.requiresReceipt }),
          ...(input.cap === undefined
            ? {}
            : { capAmountKobo: input.cap === null ? null : kobo(input.cap) }),
          ...(input.active === undefined ? {} : { active: input.active }),
        });
        bumpRevision();
        return;
      }

      const state = demo.current();
      const existing = state.types.find((type) => type.id === id);
      if (!existing) throw new ApiError(404, "not_found", "That expense type is gone.");
      if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
        const clash = state.types.find(
          (type) =>
            type.id !== id && type.name.toLowerCase() === input.name?.toLowerCase(),
        );
        if (clash) throw conflict(`"${input.name}" already exists.`);
      }
      demo.commit({
        ...state,
        types: state.types.map((type) =>
          type.id === id
            ? {
                ...type,
                ...(input.name === undefined ? {} : { name: input.name }),
                ...(input.description === undefined
                  ? {}
                  : { description: input.description || null }),
                ...(input.requiresReceipt === undefined
                  ? {}
                  : { requiresReceipt: input.requiresReceipt }),
                ...(input.cap === undefined
                  ? {}
                  : {
                      capAmountKobo: input.cap === null ? null : kobo(input.cap),
                    }),
                ...(input.active === undefined
                  ? {}
                  : {
                      active: input.active,
                      /* Switching a type back on un-archives it, so a freed
                         name can be reclaimed without a restore route. */
                      archived: input.active ? false : type.archived,
                    }),
              }
            : type,
        ),
      });
    },
    [isConnected],
  );

  /**
   * Archive, never delete — past claims reference the type they were made
   * under. Refuses while claims of that kind are still undecided, and reports
   * how many approved ones are still owed.
   */
  const archiveType = useCallback(
    async (id: string): Promise<string> => {
      if (isConnected) {
        const result = await api.archiveType(id);
        bumpRevision();
        return result.note;
      }

      const state = demo.current();
      const type = state.types.find((row) => row.id === id);
      if (!type) throw new ApiError(404, "not_found", "That expense type is gone.");
      if (type.archived) throw conflict("That is already archived.");

      const undecided = state.claims.filter(
        (claim) => claim.typeId === id && claim.status === "SUBMITTED",
      ).length;
      if (undecided > 0) {
        throw conflict(
          `${undecided} ${undecided === 1 ? "claim is" : "claims are"} still ` +
            `waiting for a decision on ${type.name}. Decide those first.`,
        );
      }
      const outstanding = state.claims.filter(
        (claim) =>
          claim.typeId === id && claim.status === "APPROVED" && claim.paidAt === null,
      ).length;

      demo.commit({
        ...state,
        types: state.types.map((row) =>
          row.id === id ? { ...row, archived: true, active: false } : row,
        ),
      });

      return outstanding > 0
        ? `Archived. ${outstanding} approved ${
            outstanding === 1 ? "claim" : "claims"
          } of this kind are still owed and will still be paid.`
        : "Archived, not deleted. Past claims still reference it.";
    },
    [isConnected],
  );

  const types = isConnected ? (remote?.types ?? []) : demoTypes;

  return {
    types,
    /** Only the ones something new can be claimed against. For the form picker. */
    claimable: types.filter((type) => type.claimable),
    loading: isConnected && !answered,
    error: isConnected ? (answered ? remote.error : null) : null,
    connected: isConnected,
    createType,
    updateType,
    archiveType,
  };
}

/* --------------------------------------------------------------- the claims */

/** `mine` is the caller's own; `pending` is the approval queue. */
export type ClaimScope = "all" | "mine" | "pending";

/** A stable empty array, so a disabled hook does not re-render its consumers. */
const EMPTY_CLAIMS: Claim[] = [];

export type SubmitClaimInput = {
  /** Absent means the signed-in person. Anybody else needs `EDIT_RECORDS`. */
  employeeId?: string;
  typeId: string;
  /** Naira. */
  amount: number;
  incurredOn: string;
  description: string;
  receiptKey?: string;
};

export type EditClaimInput = {
  typeId?: string;
  amount?: number;
  incurredOn?: string;
  description?: string;
  /** `null` detaches the reference. Refused where the type requires one. */
  receiptKey?: string | null;
};

/**
 * A list of claims and everything that can be done to one.
 *
 * All three scopes come back through here rather than three hooks, because the
 * mutations are identical and the only difference is which rows are asked for.
 */
export function useExpenseClaims(
  scope: ClaimScope = "all",
  params: ClaimListParams = {},
  /**
   * `false` keeps the hook quiet. `pending` is gated on `APPROVE_EXPENSES`, so a
   * screen that mounts the queue for a member of staff would collect a 403 it
   * has no use for; the hook is called unconditionally, as hooks must be, and
   * turned off instead.
   */
  enabled = true,
) {
  const { isConnected, employeeId, actingId } = useSession();
  const revisionValue = useRevision();
  const demoState = useDemoState();

  /* Serialised so a fresh object literal from a caller does not re-fire the
     read on every render. */
  const key = JSON.stringify(params);

  /* The same stamp-and-derive shape as `useExpenseTypes`. It earns its keep
     twice here: a filter typed quickly enough produces two overlapping reads,
     and the stamp means the slower one cannot land on top of the faster. */
  const stamp = `${scope}|${key}|${revisionValue}`;

  const [remote, setRemote] = useState<{
    stamp: string;
    claims: Claim[];
    total: number;
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected || !enabled) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      const read =
        scope === "mine" ? api.mine : scope === "pending" ? api.pending : api.list;
      try {
        const result = await read(
          JSON.parse(key) as ClaimListParams,
          controller.signal,
        );
        if (cancelled) return;
        setRemote({
          stamp,
          claims: result.data.map(toClaim),
          total: result.meta.total,
          error: null,
        });
      } catch (error) {
        if (cancelled || error instanceof DOMException) return;
        setRemote({
          stamp,
          claims: [],
          total: 0,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, enabled, scope, key, stamp]);

  const answered = remote !== null && remote.stamp === stamp;

  /**
   * The demo's copy of the API's filtering and ordering.
   *
   * Undecided first whatever the sort, because a queue is a queue — the same
   * `orderBy: [{ status: "asc" }, …]` the service applies.
   */
  const demoClaims = useMemo(() => {
    const order: Record<ClaimStatus, number> = {
      SUBMITTED: 0,
      APPROVED: 1,
      DECLINED: 2,
      PAID: 3,
    };
    const mineId = employeeId ?? actingId;
    return demoState.claims
      .filter((claim) => {
        if (scope === "mine" && claim.employeeId !== mineId) return false;
        if (scope === "pending" && claim.status !== "SUBMITTED") return false;
        if (params.status && claim.status !== params.status) return false;
        if (params.employeeId && claim.employeeId !== params.employeeId) return false;
        if (params.typeId && claim.typeId !== params.typeId) return false;
        if (params.from && claim.incurredOn < params.from) return false;
        if (params.to && claim.incurredOn > params.to) return false;
        if (
          params.q &&
          !claim.description.toLowerCase().includes(params.q.toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        /* Undecided first whatever the sort, because a queue is a queue —
           exactly what the API does with `[{ status: "asc" }, ...orderBy(…)]`. */
        const queue = order[a.status] - order[b.status];
        if (queue !== 0) return queue;

        const dir = params.order === "desc" ? -1 : 1;
        /* `createdAt` on the wire is `submittedAt` on the row — the serializer
           renames it, and sorting on a field that does not exist would silently
           fall through to `incurredOn` and look like a header that does
           nothing. */
        const of = (claim: ApiClaim): string | number =>
          params.sort === "amount"
            ? claim.amountKobo
            : params.sort === "createdAt"
              ? claim.submittedAt
              : claim.incurredOn;
        const left = of(a);
        const right = of(b);
        if (left !== right) return left < right ? -dir : dir;
        /* The tiebreaker. Claims tie on `incurredOn` constantly — a team on the
           same trip files the same date — so without this, paging a long
           register shows some of them twice and misses others. */
        return a.id.localeCompare(b.id) * dir;
      })
      .map(toClaim);
  }, [
    demoState.claims,
    scope,
    employeeId,
    actingId,
    params.status,
    params.employeeId,
    params.typeId,
    params.from,
    params.to,
    params.q,
    params.sort,
    params.order,
  ]);

  /* The page, cut after the count. */
  const demoPage = useMemo(() => {
    const size = params.pageSize ?? 25;
    const start = ((params.page ?? 1) - 1) * size;
    return demoClaims.slice(start, start + size);
  }, [demoClaims, params.page, params.pageSize]);

  const claims = !enabled
    ? EMPTY_CLAIMS
    : isConnected
      ? (remote?.claims ?? EMPTY_CLAIMS)
      : demoPage;

  /**
   * What this view is worth while it waits for a decision.
   *
   * Derived from the rows rather than read from the response: the API assembles
   * it, but the list routes serialise through `page()`, which sends `{ data,
   * meta }` and drops everything else. Derived is honest here because these
   * routes page at 100 and a company with more than 100 undecided claims has a
   * different problem — and `useExpenseSummary` gives the authoritative figure.
   */
  const awaitingDecision = useMemo(() => {
    const undecided = claims.filter((claim) => claim.status === "SUBMITTED");
    return {
      claimCount: undecided.length,
      amount: undecided.reduce((total, claim) => total + claim.amount, 0),
    };
  }, [claims]);

  /** Approved, unpaid, on this view. Money owed to somebody. */
  const outstanding = useMemo(() => {
    const owed = claims.filter((claim) => claim.outstanding);
    return {
      claimCount: owed.length,
      amount: owed.reduce((total, claim) => total + claim.amount, 0),
    };
  }, [claims]);

  /* ------------------------------------------------------------ mutations */

  const submit = useCallback(
    async (input: SubmitClaimInput): Promise<void> => {
      if (isConnected) {
        await api.create({
          ...(input.employeeId ? { employeeId: input.employeeId } : {}),
          typeId: input.typeId,
          amountKobo: kobo(input.amount),
          incurredOn: input.incurredOn,
          description: input.description,
          ...(input.receiptKey ? { receiptKey: input.receiptKey } : {}),
        });
        bumpRevision();
        return;
      }

      const state = demo.current();
      const type = state.types.find((row) => row.id === input.typeId);
      if (!type) throw unprocessable("Pick an expense type from the list.");
      if (type.archived || !type.active) {
        throw unprocessable(
          `${type.name} is switched off, so nothing new can be claimed against it.`,
        );
      }
      if (input.incurredOn > today()) {
        throw unprocessable(
          "That date is in the future. Claim it once the money has gone out.",
        );
      }
      const amountKobo = kobo(input.amount);
      assertWithinPolicy(type, amountKobo, input.receiptKey ?? null);

      const subject = employeeById(input.employeeId ?? employeeId ?? actingId);
      if (!subject) {
        throw unprocessable("That employee does not exist, or has left.");
      }

      demo.commit({
        types: state.types.map((row) =>
          row.id === type.id
            ? { ...row, claimCount: (row.claimCount ?? 0) + 1 }
            : row,
        ),
        claims: [
          {
            id: demoId("claim"),
            employeeId: subject.id,
            employeeName: `${subject.firstName} ${subject.lastName}`,
            employeeNo: subject.employeeNo,
            typeId: type.id,
            type: type.name,
            amountKobo,
            incurredOn: input.incurredOn,
            description: input.description,
            receiptKey: input.receiptKey ?? null,
            status: "SUBMITTED",
            editable: true,
            approvedById: null,
            approvedByName: null,
            decidedAt: null,
            declinedReason: null,
            paidAt: null,
            payslipId: null,
            settledThrough: null,
            submittedAt: new Date().toISOString(),
          },
          ...state.claims,
        ],
      });
    },
    [isConnected, employeeId, actingId],
  );

  const edit = useCallback(
    async (id: string, input: EditClaimInput): Promise<void> => {
      if (isConnected) {
        await api.update(id, {
          ...(input.typeId === undefined ? {} : { typeId: input.typeId }),
          ...(input.amount === undefined ? {} : { amountKobo: kobo(input.amount) }),
          ...(input.incurredOn === undefined
            ? {}
            : { incurredOn: input.incurredOn }),
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          ...(input.receiptKey === undefined
            ? {}
            : { receiptKey: input.receiptKey }),
        });
        bumpRevision();
        return;
      }

      const state = demo.current();
      const existing = state.claims.find((claim) => claim.id === id);
      if (!existing) throw new ApiError(404, "not_found", "That claim is gone.");
      if (existing.status !== "SUBMITTED") throw conflict(alreadyDecided(existing));

      const type = state.types.find(
        (row) => row.id === (input.typeId ?? existing.typeId),
      );
      if (!type) throw unprocessable("Pick an expense type from the list.");
      if (input.typeId && (type.archived || !type.active)) {
        throw unprocessable(
          `${type.name} is switched off, so nothing new can be claimed against it.`,
        );
      }
      if (input.incurredOn && input.incurredOn > today()) {
        throw unprocessable(
          "That date is in the future. Claim it once the money has gone out.",
        );
      }

      /* Checked against the resolved end state, not against what was sent: a
         claim that only changes its type must still clear that type's cap, and
         one that only drops its receipt must still satisfy `requiresReceipt`. */
      const amountKobo =
        input.amount === undefined ? existing.amountKobo : kobo(input.amount);
      const receiptKey =
        input.receiptKey === undefined ? existing.receiptKey : input.receiptKey;
      assertWithinPolicy(type, amountKobo, receiptKey);

      demo.commit({
        ...state,
        claims: state.claims.map((claim) =>
          claim.id === id
            ? {
                ...claim,
                typeId: type.id,
                type: type.name,
                amountKobo,
                incurredOn: input.incurredOn ?? claim.incurredOn,
                description: input.description ?? claim.description,
                receiptKey,
              }
            : claim,
        ),
      });
    },
    [isConnected],
  );

  const decide = useCallback(
    async (
      id: string,
      decision: "approve" | "decline",
      reason?: string,
    ): Promise<void> => {
      if (isConnected) {
        if (decision === "approve") await api.approve(id);
        else await api.decline(id, reason ?? "");
        bumpRevision();
        return;
      }

      const state = demo.current();
      const claim = state.claims.find((row) => row.id === id);
      if (!claim) throw new ApiError(404, "not_found", "That claim is gone.");
      if (claim.status === "PAID") throw conflict("That claim has already been paid.");
      if (claim.status !== "SUBMITTED") {
        throw conflict(`That claim was already ${claim.status.toLowerCase()}.`);
      }

      const decider = employeeById(employeeId ?? actingId) ?? CURRENT_USER;
      if (!decider) {
        throw new ApiError(
          403,
          "forbidden",
          "We cannot tell who is deciding this. Sign in again.",
        );
      }

      if (decision === "approve" && decider.id === claim.employeeId) {
        throw new ApiError(
          403,
          "forbidden",
          "You cannot approve your own claim. Somebody else with expense " +
            "approval has to look at it.",
        );
      }
      if (decision === "decline" && !reason?.trim()) {
        throw new ApiError(
          400,
          "bad_request",
          "Say why, so they know what to change.",
        );
      }

      demo.commit({
        ...state,
        claims: state.claims.map((row) =>
          row.id === id
            ? {
                ...row,
                status: decision === "approve" ? "APPROVED" : "DECLINED",
                editable: false,
                approvedById: decider.id,
                approvedByName: `${decider.firstName} ${decider.lastName}`,
                decidedAt: new Date().toISOString(),
                declinedReason:
                  decision === "decline" ? (reason?.trim() ?? null) : null,
              }
            : row,
        ),
      });
    },
    [isConnected, employeeId, actingId],
  );

  const approve = useCallback((id: string) => decide(id, "approve"), [decide]);
  const decline = useCallback(
    (id: string, reason: string) => decide(id, "decline", reason),
    [decide],
  );

  const markPaid = useCallback(
    async (id: string, paidOn?: string): Promise<void> => {
      if (isConnected) {
        await api.markPaid(id, paidOn);
        bumpRevision();
        return;
      }

      const state = demo.current();
      const claim = state.claims.find((row) => row.id === id);
      if (!claim) throw new ApiError(404, "not_found", "That claim is gone.");
      if (claim.status === "PAID") {
        throw conflict(
          `That claim was already paid${
            claim.paidAt ? ` on ${claim.paidAt.slice(0, 10)}` : ""
          }.`,
        );
      }
      if (claim.status !== "APPROVED") {
        throw conflict(
          claim.status === "DECLINED"
            ? "That claim was declined, so there is nothing to pay."
            : "That claim has not been approved yet.",
        );
      }

      demo.commit({
        ...state,
        claims: state.claims.map((row) =>
          row.id === id
            ? {
                ...row,
                status: "PAID",
                paidAt: paidOn
                  ? new Date(`${paidOn}T12:00:00`).toISOString()
                  : new Date().toISOString(),
                settledThrough: "direct",
              }
            : row,
        ),
      });
    },
    [isConnected],
  );

  return {
    claims,
    /**
     * How many match, from the server. **`undefined` until it answers.**
     *
     * Not `?? 0`: a zero renders as "No claims" over a table that is loading,
     * and the reader cannot tell that from an empty register.
     */
    total: !enabled
      ? 0
      : isConnected
        ? remote?.total
        : demoClaims.length,
    awaitingDecision,
    outstanding,
    loading: enabled && isConnected && !answered,
    error: enabled && isConnected && answered ? remote.error : null,
    connected: isConnected,
    /** The signed-in person's employee id, for the self-approval check. */
    myEmployeeId: employeeId ?? actingId,
    reload: bumpRevision,
    submit,
    edit,
    approve,
    decline,
    markPaid,
  };
}

/* -------------------------------------------------------------- the liability */

const EMPTY_SUMMARY: ExpenseSummary = {
  outstanding: { claimCount: 0, amount: 0, oldestIncurredOn: null },
  byType: [],
  awaitingDecision: { claimCount: 0, amount: 0 },
};

/**
 * What the company owes staff right now.
 *
 * `enabled` exists because `GET /summary` is gated on `APPROVE_EXPENSES`, and a
 * screen that asks for it without the permission gets a 403 it has no use for.
 * Pass `can("APPROVE_EXPENSES")` and the hook stays quiet otherwise.
 */
export function useExpenseSummary(enabled = true) {
  const { isConnected } = useSession();
  const revisionValue = useRevision();
  const demoState = useDemoState();

  const stamp = String(revisionValue);

  const [remote, setRemote] = useState<{
    stamp: string;
    summary: ExpenseSummary;
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected || !enabled) return;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const result = await api.summary(controller.signal);
        if (cancelled) return;
        setRemote({
          stamp,
          summary: {
            outstanding: {
              claimCount: result.outstanding.claimCount,
              amount: naira(result.outstanding.amountKobo),
              oldestIncurredOn: result.outstanding.oldestIncurredOn,
            },
            byType: result.byType.map((row) => ({
              typeId: row.typeId,
              type: row.type,
              claimCount: row.claimCount,
              amount: naira(row.amountKobo),
            })),
            awaitingDecision: {
              claimCount: result.awaitingDecision.claimCount,
              amount: naira(result.awaitingDecision.amountKobo),
            },
          },
          error: null,
        });
      } catch (error) {
        if (cancelled || error instanceof DOMException) return;
        setRemote({
          stamp,
          summary: EMPTY_SUMMARY,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, enabled, stamp]);

  const answered = remote !== null && remote.stamp === stamp;

  const demoSummary = useMemo<ExpenseSummary>(() => {
    const owed = demoState.claims.filter(
      (claim) => claim.status === "APPROVED" && claim.paidAt === null,
    );
    const undecided = demoState.claims.filter(
      (claim) => claim.status === "SUBMITTED",
    );

    const byType = new Map<string, { type: string; claimCount: number; amount: number }>();
    for (const claim of owed) {
      const row = byType.get(claim.typeId) ?? {
        type: claim.type,
        claimCount: 0,
        amount: 0,
      };
      row.claimCount += 1;
      row.amount += naira(claim.amountKobo);
      byType.set(claim.typeId, row);
    }

    const oldest = owed
      .map((claim) => claim.incurredOn)
      .sort((a, b) => a.localeCompare(b))[0];

    return {
      outstanding: {
        claimCount: owed.length,
        amount: owed.reduce((total, claim) => total + naira(claim.amountKobo), 0),
        oldestIncurredOn: oldest ?? null,
      },
      byType: [...byType.entries()]
        .map(([typeId, row]) => ({ typeId, ...row }))
        .sort((a, b) => b.amount - a.amount),
      awaitingDecision: {
        claimCount: undecided.length,
        amount: undecided.reduce(
          (total, claim) => total + naira(claim.amountKobo),
          0,
        ),
      },
    };
  }, [demoState.claims]);

  if (!enabled) {
    return { ...EMPTY_SUMMARY, loading: false, error: null, connected: isConnected };
  }

  const summary = isConnected ? (remote?.summary ?? EMPTY_SUMMARY) : demoSummary;
  return {
    ...summary,
    loading: isConnected && !answered,
    error: isConnected && answered ? remote.error : null,
    connected: isConnected,
  };
}

/** How many days a date is behind today. For "waiting since" on the queue. */
export function daysSince(isoDate: string): number {
  const then = new Date(`${isoDate.slice(0, 10)}T12:00:00`).getTime();
  const now = new Date(`${today()}T12:00:00`).getTime();
  return Math.max(0, Math.round((now - then) / 86_400_000));
}
