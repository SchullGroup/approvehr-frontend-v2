"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { approvalsApi, type ApprovalListParams } from "@/lib/api/approvals";
import type { ApprovalKind } from "@/lib/mock/workflows";
import {
  buildApprovalQueue,
  decidedItems,
  queueItemFromApproval,
  toQueueItem,
  type QueueItem,
} from "@/lib/workflows/queue";
import { useApprovalStore } from "./approvals";
import { useLeaveStore } from "./leave";
import { useSession } from "./session";

/**
 * The approval inbox, from whichever source is available.
 *
 * ## One decision, one write, in both modes
 *
 * | | Connected | Demo |
 * |---|---|---|
 * | The queue | `GET /approvals`, already ranked | `buildApprovalQueue`, derived from the leave requests |
 * | Deciding leave | `POST /approvals/:id/decide` → the API's leave service | `useLeaveStore().decide` |
 * | Deciding anything else | the same endpoint, which records it on the row and says nothing moved | `useApprovalStore`, which does the same |
 * | Counts | `GET /approvals/summary` | counted from the queue |
 *
 * The important line is the second one. Connected, approving leave here does not
 * write an approval row and hope the leave screen agrees — the API routes the
 * decision into the leave module, which updates the request and mirrors the
 * outcome back in one transaction. Demo mode reaches the same place by deriving
 * the row from the request in the first place. Either way `/people/leave` and
 * this screen are reading one status, which is the bug this whole design exists
 * to prevent.
 *
 * ## Filters
 *
 * "Moves money" and "Needs attention" are the API's own `movesMoney` and
 * `overdue`, so they filter server-side against everything rather than against
 * the page in hand. "People" spans four kinds and the endpoint takes one, so it
 * is applied to the loaded rows — stated here because a client-side filter over
 * a paged list can only ever be as complete as the page.
 *
 * The header counts are deliberately **not** filtered: "waiting on you" is the
 * whole queue whichever chip is selected, because that is the number somebody
 * came to this screen to find out.
 *
 * ## The "just decided" trail
 *
 * Demo mode's trail is derived from the store, so it survives a reload. When
 * connected it is what this session decided — the API has no "recently decided
 * by me" read, and listing every approved row ever would not be the same thing.
 * Undo works from both.
 */

export type QueueFilter = "all" | "money" | "people" | "overdue";

/** The kinds "People" covers. */
const PEOPLE_KINDS: ApprovalKind[] = [
  "leave",
  "offer",
  "requisition",
  "record_change",
];

export type QueueCounts = {
  pending: number;
  withDeadline: number;
  /** Waiting five days or more. */
  ageing: number;
  /** Naira across every pending decision. */
  atStake: number;
};

export type DecidedRow = {
  item: QueueItem;
  decision: "approved" | "declined";
};

/**
 * What actually happened.
 *
 * `subjectMoved` is false when the decision was recorded against the approval
 * and nothing downstream changed — true for every kind except leave, in both
 * modes. The screen has to say so: a green tick over a no-op is how a
 * demonstration turns into a false claim.
 */
export type DecideOutcome = {
  subjectMoved: boolean;
  note?: string;
};

export type QueueState = {
  items: QueueItem[];
  counts: QueueCounts;
  decided: DecidedRow[];
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  decide: (
    item: QueueItem,
    decision: "approved" | "declined",
    note?: string,
  ) => Promise<DecideOutcome>;
  reopen: (item: QueueItem) => Promise<void>;
  /** Everything with no deadline, waiting under five days. */
  approveRoutine: () => Promise<{ decided: number; skipped: number }>;
  /** How many `approveRoutine` would take, so the button can say. */
  routineCount: number;
  reload: () => void;
};

const NO_COUNTS: QueueCounts = {
  pending: 0,
  withDeadline: 0,
  ageing: 0,
  atStake: 0,
};

/** The one definition of "routine", shared by both modes and the API. */
const isRoutine = (item: QueueItem) => !item.deadline && item.waitingDays < 5;

export function useApprovalQueue(filter: QueueFilter = "all"): QueueState {
  const { isConnected } = useSession();
  const leave = useLeaveStore();
  const approvals = useApprovalStore();

  const [state, setState] = useState<{
    items: QueueItem[];
    counts: QueueCounts;
    loading: boolean;
    error: ApiError | null;
  }>({ items: [], counts: NO_COUNTS, loading: isConnected, error: null });

  /** Decided in this session, for the trail. Connected mode only. */
  const [justDecided, setJustDecided] = useState<DecidedRow[]>([]);

  const params: ApprovalListParams = useMemo(
    () => ({
      ...(filter === "money" ? { movesMoney: true } : {}),
      ...(filter === "overdue" ? { overdue: true } : {}),
    }),
    [filter],
  );
  const key = JSON.stringify(params);

  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!isConnected) return;
    const ticket = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      /* Both in one turn: the counts are about the whole queue and the rows are
         about the current filter, and two separate loading states would flicker
         against each other. */
      const [list, summary] = await Promise.all([
        approvalsApi.list(JSON.parse(key) as ApprovalListParams),
        approvalsApi.summary(),
      ]);
      if (ticket !== latest.current) return;
      setState({
        items: list.rows.map(queueItemFromApproval),
        counts: {
          pending: summary.pending,
          withDeadline: summary.withDeadline,
          ageing: summary.ageing,
          atStake: summary.atStake,
        },
        loading: false,
        error: null,
      });
    } catch (error) {
      if (ticket !== latest.current) return;
      setState((s) => ({
        ...s,
        loading: false,
        error: error instanceof ApiError ? error : null,
      }));
    }
  }, [isConnected, key]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ------------------------------------------------------------- demo mode */

  const demoItems = useMemo(
    () =>
      isConnected
        ? []
        : buildApprovalQueue({
            leaveRequests: leave.requests,
            decisions: approvals.decisions,
          }).map(toQueueItem),
    [isConnected, leave.requests, approvals.decisions],
  );

  const demoDecided = useMemo(
    () =>
      isConnected
        ? []
        : decidedItems({
            leaveRequests: leave.requests,
            decisions: approvals.decisions,
          }).map(({ item, decision }) => ({ item: toQueueItem(item), decision })),
    [isConnected, leave.requests, approvals.decisions],
  );

  /* --------------------------------------------------------------- writing */

  const decide = useCallback(
    async (
      item: QueueItem,
      decision: "approved" | "declined",
      note?: string,
    ): Promise<DecideOutcome> => {
      if (item.ref?.store === "approval") {
        const result = await approvalsApi.decide(
          item.ref.id,
          decision === "approved" ? "approve" : "decline",
          note,
        );
        setJustDecided((rows) => [
          { item, decision },
          ...rows.filter((row) => row.item.id !== item.id),
        ]);
        await load();
        return {
          subjectMoved: result.subjectMoved,
          ...(result.note ? { note: result.note } : {}),
        };
      }

      if (item.ref?.store === "leave") {
        leave.decide(item.ref.id, decision, note);
        return { subjectMoved: true };
      }

      /* A seed row with nothing behind it. The decision is recorded and the
         caller is told plainly that nothing downstream moved. */
      approvals.decide(item.id, decision, note);
      return {
        subjectMoved: false,
        note: "Recorded against the approval only. That module has no store behind it yet, so nothing else changed.",
      };
    },
    [approvals, leave, load],
  );

  const reopen = useCallback(
    async (item: QueueItem) => {
      if (item.ref?.store === "approval") {
        await approvalsApi.reopen(item.ref.id);
        setJustDecided((rows) => rows.filter((row) => row.item.id !== item.id));
        await load();
        return;
      }
      if (item.ref?.store === "leave") {
        leave.reopen(item.ref.id);
        return;
      }
      approvals.reopen(item.id);
    },
    [approvals, leave, load],
  );

  const items = isConnected ? state.items : demoItems;

  const visible = useMemo(
    () =>
      filter === "people"
        ? items.filter((item) => PEOPLE_KINDS.includes(item.kind))
        : /* "money" and "overdue" are the API's filters when connected, and have
             to be applied here in demo mode. */
          isConnected
          ? items
          : items.filter((item) => {
              if (filter === "money") return item.amount !== undefined;
              if (filter === "overdue") {
                return item.waitingDays >= 5 || Boolean(item.deadline);
              }
              return true;
            }),
    [items, filter, isConnected],
  );

  const routine = useMemo(() => items.filter(isRoutine), [items]);

  const approveRoutine = useCallback(async () => {
    if (isConnected) {
      const result = await approvalsApi.approveRoutine();
      await load();
      return { decided: result.decided, skipped: result.skipped.length };
    }
    /* Split by destination rather than one at a time, so each store commits
       once and the list does not re-rank between decisions. */
    for (const item of routine) {
      if (item.ref?.store === "leave") leave.decide(item.ref.id, "approved");
    }
    approvals.decideMany(
      routine.filter((item) => !item.ref).map((item) => item.id),
      "approved",
    );
    return { decided: routine.length, skipped: 0 };
  }, [isConnected, load, routine, leave, approvals]);

  const demoCounts = useMemo<QueueCounts>(
    () => ({
      pending: demoItems.length,
      withDeadline: demoItems.filter((item) => item.deadline).length,
      ageing: demoItems.filter((item) => item.waitingDays >= 5).length,
      atStake: demoItems.reduce((sum, item) => sum + (item.amount ?? 0), 0),
    }),
    [demoItems],
  );

  return {
    items: visible,
    counts: isConnected ? state.counts : demoCounts,
    decided: isConnected ? justDecided : demoDecided,
    loading: isConnected ? state.loading : false,
    error: isConnected ? state.error : null,
    connected: isConnected,
    decide,
    reopen,
    approveRoutine,
    routineCount: routine.length,
    reload: load,
  };
}
