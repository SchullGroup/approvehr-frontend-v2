"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  approvalsApi,
  type ApprovalListParams,
  type ApprovalModule,
  type ApprovalRow,
} from "@/lib/api/approvals";
import {
  buildApprovalQueue,
  decidedItems,
  moduleOf,
  queueItemFromApproval,
  toQueueItem,
  type QueueItem,
} from "@/lib/workflows/queue";
import { useApprovalStore } from "./approvals";
import { useLeaveStore } from "./leave";
import { useOrgTimezone, useSession } from "./session";
import { useRevalidation } from "@/lib/revalidate";
import { announceApprovalChange, useApprovalGeneration } from "./approval-bus";

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
 * ## Filters, and what is deliberately not one
 *
 * Module and date range both go to the API, so they filter against everything
 * rather than against the page in hand. There is no "moves money" or "needs
 * attention" filter: nobody who raises an approval sets a priority on it, so a
 * chip claiming some are urgent was the screen's guess dressed as a property of
 * the request, and "moves money" is just payroll under another name.
 *
 * ## Archive
 *
 * Putting an approval away is personal and decides nothing: the row stays
 * pending for everybody else, and for this person it moves to "My archive" until
 * they bring it back. Archived rows drop out of the header counts and out of
 * "approve routine" — sweeping one up would decide the very thing somebody chose
 * not to decide yet.
 *
 * The header counts are deliberately **not** filtered by module or date:
 * "waiting on you" is the whole queue whichever chip is selected, because that
 * is the number somebody came to this screen to find out.
 *
 * ## The "just decided" trail
 *
 * Demo mode's trail is derived from the store, so it survives a reload. When
 * connected it is what this session decided — the API has no "recently decided
 * by me" read, and listing every approved row ever would not be the same thing.
 * Undo works from both.
 */

export type QueueFilters = {
  module: "all" | ApprovalModule;
  /** `YYYY-MM-DD`, inclusive. Empty means no bound. */
  from: string;
  to: string;
  /** Show what the person put away instead of what is in their way. */
  archived: boolean;
};

export const NO_FILTERS: QueueFilters = {
  module: "all",
  from: "",
  to: "",
  archived: false,
};

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
  /**
   * An approval that is not the last one: a department head said yes and HR has
   * not yet. It is recorded, and it is not "approved" — the person is not told
   * until HR has decided.
   */
  halfway?: boolean;
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
  /** See `DecidedRow.halfway`. */
  halfway?: boolean;
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
  /**
   * Approve these, which are the routine ones the person was shown and agreed to.
   * Connected, the ids go to the server, which re-checks each one; it never
   * decides anything that was not in the list.
   */
  approveRoutine: (items: QueueItem[]) => Promise<{
    decided: number;
    skipped: { id: string; reason: string }[];
  }>;
  /** Put one away for this person only, or bring it back. */
  setArchived: (item: QueueItem, archived: boolean) => Promise<void>;
  /** What the "approve routine" button counts: no deadline, waiting under five days. */
  routine: QueueItem[];
  /** How many of those there are, so the button can say. */
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

export function useApprovalQueue(
  filters: QueueFilters = NO_FILTERS,
): QueueState {
  const { isConnected } = useSession();
  const timeZone = useOrgTimezone();
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
      ...(filters.module !== "all" ? { module: filters.module } : {}),
      ...(filters.from ? { from: filters.from } : {}),
      ...(filters.to ? { to: filters.to } : {}),
      ...(filters.archived ? { archived: true } : {}),
    }),
    [filters.module, filters.from, filters.to, filters.archived],
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
        items: list.rows.map((row) => queueItemFromApproval(row, timeZone)),
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
  }, [isConnected, key, timeZone]);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  /* And when anything in this browser decides, reopens or withdraws — including
     a leave decision taken on `/people/leave`, which the API mirrors onto its
     approval row. Every instance of this hook listens, which is what stops the
     sidebar badge disagreeing with the inbox beside it. */
  const decided = useApprovalGeneration();
  useEffect(() => {
    void load();
  }, [load, revalidation, decided]);

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
          }).map(({ item, decision }) => ({
            item: toQueueItem(item),
            decision,
          })),
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
        const halfway =
          decision === "approved" && result.subjectStatus === "AWAITING_HR";
        setJustDecided((rows) => [
          { item, decision, ...(halfway ? { halfway: true } : {}) },
          ...rows.filter((row) => row.item.id !== item.id),
        ]);
        /* Not `load()`. This instance reloads through the announcement like
           every other one, so the screen that decided and the badge that counts
           are refreshed by the same event rather than by two call sites that
           have to remember each other. */
        announceApprovalChange();
        return {
          subjectMoved: result.subjectMoved,
          ...(halfway ? { halfway: true } : {}),
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
    [approvals, leave],
  );

  const reopen = useCallback(
    async (item: QueueItem) => {
      if (item.ref?.store === "approval") {
        await approvalsApi.reopen(item.ref.id);
        setJustDecided((rows) => rows.filter((row) => row.item.id !== item.id));
        announceApprovalChange();
        return;
      }
      if (item.ref?.store === "leave") {
        leave.reopen(item.ref.id);
        return;
      }
      approvals.reopen(item.id);
    },
    [approvals, leave],
  );

  const archivedIds = approvals.archived;
  const items = isConnected ? state.items : demoItems;

  /* Connected, the API has already narrowed all of this. In demo mode it is
     applied here, with the same meaning. A row with no raise date cannot be
     shown to be inside a date range, so a range leaves it out. */
  const visible = useMemo(
    () =>
      isConnected
        ? items
        : items.filter((item) => {
            if (archivedIds.includes(item.id) !== filters.archived)
              return false;
            if (filters.module !== "all" && moduleOf(item) !== filters.module) {
              return false;
            }
            if (filters.from || filters.to) {
              if (!item.raisedOn) return false;
              if (filters.from && item.raisedOn < filters.from) return false;
              if (filters.to && item.raisedOn > filters.to) return false;
            }
            return true;
          }),
    [items, filters, isConnected, archivedIds],
  );

  /* Never from the archive: those are the ones somebody chose not to decide. */
  const routine = useMemo(
    () => (filters.archived ? [] : visible.filter(isRoutine)),
    [visible, filters.archived],
  );

  const setArchived = useCallback(
    async (item: QueueItem, archived: boolean) => {
      if (item.ref?.store === "approval") {
        await (archived
          ? approvalsApi.archive(item.ref.id)
          : approvalsApi.unarchive(item.ref.id));
        announceApprovalChange();
        return;
      }
      approvals.setArchived(item.id, archived);
    },
    [approvals],
  );

  const approveRoutine = useCallback(
    async (items: QueueItem[]) => {
      if (isConnected) {
        /* The ids of the rows the person was shown and said yes to, not "whatever
           the server thinks is routine": the button's number and the decision are
           the same list. The server still re-checks each one. A page is at most
           100 rows, inside the server's limit of 200 per press. */
        const ids = items.flatMap((item) =>
          item.ref?.store === "approval" ? [item.ref.id] : [],
        );
        if (ids.length === 0) return { decided: 0, skipped: [] };
        const result = await approvalsApi.approveSelected(ids);
        announceApprovalChange();
        /* The array, not its length. The API says why each row was left —
           "you raised this one yourself", "it needs somebody who can approve
           payroll" — and a bare count made the screen invent a reason instead. */
        return { decided: result.decided, skipped: result.skipped };
      }
      /* Split by destination rather than one at a time, so each store commits
         once and the list does not re-rank between decisions. */
      for (const item of items) {
        if (item.ref?.store === "leave") leave.decide(item.ref.id, "approved");
      }
      approvals.decideMany(
        items.filter((item) => !item.ref).map((item) => item.id),
        "approved",
      );
      return { decided: items.length, skipped: [] };
    },
    [isConnected, leave, approvals],
  );

  const waiting = useMemo(
    () => demoItems.filter((item) => !archivedIds.includes(item.id)),
    [demoItems, archivedIds],
  );

  const demoCounts = useMemo<QueueCounts>(
    () => ({
      pending: waiting.length,
      withDeadline: waiting.filter((item) => item.deadline).length,
      ageing: waiting.filter((item) => item.waitingDays >= 5).length,
      atStake: waiting.reduce((sum, item) => sum + (item.amount ?? 0), 0),
    }),
    [waiting],
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
    setArchived,
    routine,
    routineCount: routine.length,
    reload: load,
  };
}

export type SentApprovalsState = {
  rows: readonly ApprovalRow[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  reload: () => void;
};

/**
 * Everything the signed-in person themselves requested — the other half of
 * the inbox from `useApprovalQueue`. Connected only: `GET /approvals/sent`
 * is a real, whole-company query with no demo-mode equivalent to derive it
 * from, and an empty list here is the honest answer to "what did I send" in
 * a browser with no server behind it — not a refusal, since nothing has
 * been asked to write anything.
 */
export function useSentApprovals(): SentApprovalsState {
  const { isConnected } = useSession();
  const [state, setState] = useState<{
    rows: ApprovalRow[];
    loading: boolean;
    error: string | null;
  }>({ rows: [], loading: isConnected, error: null });
  const [key, setKey] = useState(0);

  useEffect(() => {
    /* No synchronous reset here: the initial `useState` above already
       starts in the right state for the common case (not connected from the
       first render), and a manual reload leaving the previous rows on
       screen until the new ones land is the acceptable cost of not calling
       `setState` synchronously in the effect body — see the identical trade
       in `wizard.tsx`'s sheet-line-summary effect. */
    if (!isConnected) return;
    let cancelled = false;
    approvalsApi
      .sentByMe({ pageSize: 100 })
      .then((result) => {
        if (!cancelled)
          setState({ rows: result.rows, loading: false, error: null });
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setState({
            rows: [],
            loading: false,
            error:
              failure instanceof ApiError
                ? failure.message
                : "Something went wrong loading what you sent.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isConnected, key]);

  return {
    rows: state.rows,
    loading: state.loading,
    error: state.error,
    connected: isConnected,
    reload: () => setKey((k) => k + 1),
  };
}

/* ---------------------------------------------------------------- decided */

export type DecidedApprovalsState = {
  rows: ApprovalRow[];
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  reload: () => void;
};

/**
 * Approvals already decided, newest decision first.
 *
 * "Waiting on you" empties as you work, so without this there was no way to see
 * what had been approved or rejected, or by when. The API's `status` filter does
 * the work; this asks for one outcome at a time because approved and rejected are
 * two different questions and the server orders each by when it was decided.
 *
 * Connected only. In demo mode decisions live in the local store and the inbox
 * shows them as "Just decided", so there is no second list to build.
 *
 * Rows are matched to the outcome and filters they were asked for, so switching
 * from Approved to Rejected never leaves the first list under the second label.
 * A decision made elsewhere in this browser refetches without blanking the list.
 */
export function useDecidedApprovals(
  outcome: "approved" | "declined",
  filters: QueueFilters,
  enabled: boolean,
): DecidedApprovalsState {
  const { isConnected } = useSession();
  const generation = useApprovalGeneration();
  const [reloads, setReloads] = useState(0);
  const { module, from, to } = filters;
  const identity = JSON.stringify([outcome, module, from, to]);
  const [state, setState] = useState<{
    identity: string;
    rows: ApprovalRow[];
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected || !enabled) return;
    let cancelled = false;
    approvalsApi
      .list({
        status: outcome,
        ...(module !== "all" ? { module } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        pageSize: 100,
      })
      .then((result) => {
        if (!cancelled) {
          setState({ identity, rows: result.rows, error: null });
        }
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setState({
            identity,
            rows: [],
            error: failure instanceof ApiError ? failure : null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    isConnected,
    enabled,
    identity,
    outcome,
    module,
    from,
    to,
    generation,
    reloads,
  ]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);
  const matched = state !== null && state.identity === identity;
  return {
    rows: matched ? state.rows : [],
    loading: enabled && isConnected && !matched,
    error: matched ? state.error : null,
    connected: isConnected,
    reload,
  };
}
