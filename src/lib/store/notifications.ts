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
  notificationsApi,
  type ApiNotification,
  type NotificationSeverity,
} from "@/lib/api/notifications";
import { todayDate } from "@/lib/today";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";

/**
 * The notification inbox.
 *
 * We shipped `/settings/notifications` — the page that configures which events
 * send — long before building the place they arrive. This is that place.
 *
 * ## Two modes, same as every other store
 *
 * **Connected** reads the API. **Demo** reads a seeded list and keeps your
 * read/dismissed decisions in localStorage.
 *
 * Unlike `lib/store/departments.ts`, the demo here is fully interactive rather
 * than read-only, and that is a deliberate difference rather than an
 * inconsistency. A department is a payroll reporting boundary, so a tree built
 * in browser storage would teach a demo audience something false about how the
 * product works. Marking a message read is a decision about *your own inbox*
 * with no downstream effect on anybody's pay — there is nothing to be wrong
 * about, and an inbox you cannot clear does not demonstrate an inbox.
 *
 * ## What persists, and what does not
 *
 * Only a diff: which seeded ids you have read, and which you have dismissed.
 * The messages themselves are regenerated from `SEED` on every load, the same
 * "overrides are a patch, not a copy" rule the employee store established.
 * Changing the seed then never strands an unrelated decision, and the stored
 * payload stays two small arrays.
 *
 * ## Why demo timestamps hang off `TODAY` and not the wall clock
 *
 * A notification is almost entirely *when*, so the obvious move is to date the
 * seed from `Date.now()` and always look fresh. Two reasons not to:
 *
 * 1. It puts a clock reading in render. The server and the client would compute
 *    different values for the same row and React would flag the mismatch — the
 *    exact trap `lib/store/persisted.ts` documents at length.
 * 2. It would be the only part of the demo dataset not anchored to `TODAY`,
 *    which is what keeps the August run, September's leave and this week's
 *    interviews telling one coherent story.
 *
 * So the seed is dated from `TODAY` and the screen is told what "now" is — see
 * the `now` field returned below. Demo rows read "Today" and "Yesterday"
 * because the reference moves with the dataset, not because the clock does.
 */

export type InboxItem = ApiNotification;
export type { NotificationSeverity };

/** The three filter chips. `action` is "needs you". */
export type InboxTab = "all" | "action" | "unread";

/* ------------------------------------------------------------- the seed */

/**
 * Late afternoon on the demo's day.
 *
 * `todayDate()` is midnight, so anything measured back from it lands in
 * yesterday and no row would ever group under "Today". Seventeen hours in gives
 * the seed a plausible working day to sit inside.
 */
const DEMO_NOW = new Date(todayDate().getTime() + 17 * 3_600_000);

type Seed = {
  id: string;
  /** The `NotificationRule.id` in `lib/store/company.ts` that would send it. */
  ruleId: string;
  title: string;
  body: string;
  actionHref: string | null;
  entityType: string;
  entityId: string | null;
  severity: NotificationSeverity;
  minutesAgo: number;
  /** Set on rows that arrive already read, so the demo shows both states. */
  readMinutesAgo?: number;
};

/*
 * Every row here is one the configured rules in `/settings/notifications` would
 * actually produce, pointed at a record that really exists in the seed data —
 * so following one lands on a real screen rather than a 404. The two `CRITICAL`
 * rows are the two the settings page refuses to let a company silence quietly:
 * a bank account change and a filing deadline.
 */
const SEED: Seed[] = [
  {
    id: "nt-01",
    ruleId: "n-record-change",
    title: "Ngozi Eze's bank account changed",
    body: "Changed today, with the August run still waiting for approval.",
    actionHref: "/people/p-04",
    entityType: "employee",
    entityId: "p-04",
    severity: "CRITICAL",
    minutesAgo: 45,
  },
  {
    id: "nt-02",
    ruleId: "n-payroll-approval",
    title: "August payroll needs your approval",
    body: "10 people. Bank cut-off is 26 August.",
    actionHref: "/payroll",
    entityType: "payroll_run",
    entityId: "run-2026-08",
    severity: "ACTION",
    minutesAgo: 95,
  },
  {
    id: "nt-03",
    ruleId: "n-leave-request",
    title: "Chidi Nwosu asked for 2 days annual leave",
    body: "14–15 September. You are the approver.",
    actionHref: "/approvals",
    entityType: "leave_request",
    entityId: "lv-02",
    severity: "ACTION",
    minutesAgo: 220,
  },
  {
    id: "nt-04",
    ruleId: "n-offer-approval",
    title: "Oluwaseun Adeyemi's offer is above the band",
    body: "Asking ₦1.9m against a band top of ₦1.8m on ENG-114.",
    actionHref: "/hiring/candidates/c-05",
    entityType: "offer",
    entityId: "c-05",
    severity: "ACTION",
    minutesAgo: 380,
  },
  {
    id: "nt-05",
    ruleId: "n-statutory-due",
    title: "PAYE for August is due in 7 days",
    body: "Lagos State, due 10 September.",
    actionHref: "/payroll/statutory",
    entityType: "statutory_filing",
    entityId: "paye-2026-08",
    severity: "CRITICAL",
    minutesAgo: 600,
  },
  {
    id: "nt-06",
    ruleId: "n-attendance-exception",
    title: "Musa Ibrahim did not clock in",
    body: "No approved leave behind it, so the day is unpaid as it stands.",
    actionHref: "/people/attendance",
    entityType: "attendance",
    entityId: "p-07",
    severity: "WARNING",
    minutesAgo: 1_290,
  },
  {
    id: "nt-07",
    ruleId: "n-payslip",
    title: "Musa Ibrahim's payslip bounced",
    body: "The address on his record was rejected by the mail server.",
    actionHref: "/payroll/payslips",
    entityType: "payslip",
    entityId: "p-07",
    severity: "WARNING",
    minutesAgo: 1_460,
    readMinutesAgo: 1_200,
  },
  {
    id: "nt-08",
    ruleId: "n-payslip",
    title: "August payslips went out",
    body: "10 sent. 1 bounced and 1 person has no email on file.",
    actionHref: "/payroll/payslips",
    entityType: "payslip",
    entityId: "run-2026-08",
    severity: "INFO",
    minutesAgo: 1_520,
    readMinutesAgo: 1_180,
  },
  {
    id: "nt-09",
    ruleId: "n-leave-decision",
    title: "Your leave for 3–7 September was approved",
    body: "Approved by Adaeze Okonkwo.",
    actionHref: "/people/leave",
    entityType: "leave_request",
    entityId: "lv-05",
    severity: "INFO",
    minutesAgo: 2_760,
    readMinutesAgo: 2_700,
  },
  {
    id: "nt-10",
    ruleId: "n-record-change",
    title: "Emeka Anyanwu finished onboarding",
    body: "Every starter task is signed off. He is on the next run.",
    actionHref: "/people/onboarding",
    entityType: "employee",
    entityId: "p-09",
    severity: "INFO",
    minutesAgo: 4_320,
    readMinutesAgo: 4_100,
  },
];

const iso = (minutesAgo: number): string =>
  new Date(DEMO_NOW.getTime() - minutesAgo * 60_000).toISOString();

function toItem(seed: Seed): InboxItem {
  return {
    id: seed.id,
    ruleId: seed.ruleId,
    title: seed.title,
    body: seed.body,
    actionHref: seed.actionHref,
    entityType: seed.entityType,
    entityId: seed.entityId,
    severity: seed.severity,
    read: seed.readMinutesAgo !== undefined,
    readAt:
      seed.readMinutesAgo !== undefined ? iso(seed.readMinutesAgo) : null,
    createdAt: iso(seed.minutesAgo),
  };
}

/* Computed once. Every value derives from `TODAY`, so this is a constant in the
   arithmetic sense — it does not read a clock and cannot differ between the
   server's copy of this module and the browser's. */
const DEMO_ITEMS: InboxItem[] = SEED.map(toItem);

/* --------------------------------------------------- the persisted diff */

type Diff = {
  /** Ids marked read here. Seeded-read rows are read regardless. */
  read: string[];
  /** Ids dismissed here. Hidden, and the API's delete is a real delete too. */
  deleted: string[];
};

const EMPTY: Diff = { read: [], deleted: [] };

const demo = createPersistedState<Diff>({
  key: "approvehr.notifications.store",
  empty: EMPTY,
});

/* ---------------------------------------------- the shared unread count */

/**
 * One number, one subscription.
 *
 * The bell in the top bar, the nav badge and the inbox page all show the same
 * count and must never disagree. They cannot each hold their own copy, or
 * "Mark all read" on the page leaves the bell claiming six.
 *
 * So the count is a tiny external store that anything can read and only this
 * module writes. Every mutation on the API returns the new count, which is why
 * this can be kept current without polling.
 */
let liveUnread = 0;
/**
 * Who the current count belongs to.
 *
 * Not a bare boolean: signing out and back in as somebody else has to refetch,
 * or the second person inherits the first person's badge. Keyed by account id
 * rather than reset on sign-out because the reset is the thing that gets
 * forgotten.
 */
let liveUnreadFor: string | null = null;
const liveListeners = new Set<() => void>();

function publishUnread(next: number) {
  liveUnread = next;
  liveListeners.forEach((l) => l());
}

function subscribeUnread(listener: () => void) {
  liveListeners.add(listener);
  return () => {
    liveListeners.delete(listener);
  };
}

async function refreshUnread(): Promise<void> {
  try {
    const { unread } = await notificationsApi.unreadCount();
    publishUnread(unread);
  } catch {
    /* The badge is the least important thing on screen. A failed count leaves
       the previous number rather than throwing inside the app shell, which
       would take the whole page down for a decoration. */
  }
}

/** Unread in demo mode: the seed, less what has been read or dismissed. */
function demoUnread(diff: Diff): number {
  const read = new Set(diff.read);
  const deleted = new Set(diff.deleted);
  return DEMO_ITEMS.filter(
    (item) => !item.read && !read.has(item.id) && !deleted.has(item.id),
  ).length;
}

/**
 * The number on the bell and on the nav badge.
 *
 * Kept to a bare `number` on purpose: both call sites want one, and a hook that
 * returned an object would make the shell re-render on every identity change.
 * Zero means no badge.
 */
export function useUnreadCount(): number {
  const { isConnected, isSignedIn, user } = useSession();

  const diff = useSyncExternalStore(
    demo.subscribe,
    demo.read,
    demo.getServerSnapshot,
  );
  const live = useSyncExternalStore(
    subscribeUnread,
    () => liveUnread,
    () => 0,
  );

  /* Fetched once per account rather than once per mount, because the top bar,
     the nav badge and the inbox page all call this hook and three requests for
     one number is two too many. Mutations keep it current from there. */
  const accountId = user?.id ?? null;
  useEffect(() => {
    if (!isConnected) return;
    const key = accountId ?? "self";
    if (liveUnreadFor === key) return;
    liveUnreadFor = key;
    void refreshUnread();
  }, [isConnected, accountId]);

  if (!isSignedIn) return 0;
  return isConnected ? live : demoUnread(diff);
}

/* ---------------------------------------------------------- the inbox */

/** How many rows a page asks for. "Show older" adds another band of this size. */
const PAGE_SIZE = 40;

type LiveState = {
  rows: InboxItem[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  error: ApiError | null;
};

const LIVE_EMPTY: LiveState = {
  rows: [],
  total: 0,
  hasMore: false,
  loading: true,
  error: null,
};

/**
 * Unread first, then newest — the same order the API's index serves.
 *
 * Applied in demo mode too, so the two modes cannot present a different inbox
 * from the same data. It is also what keeps a row that has just been marked
 * read from jumping under the fold mid-click: the sort is on the fetched list,
 * and connected mode re-sorts only when it reloads.
 */
function byUnreadThenNewest(a: InboxItem, b: InboxItem): number {
  if (a.read !== b.read) return a.read ? 1 : -1;
  return b.createdAt.localeCompare(a.createdAt);
}

function matches(item: InboxItem, tab: InboxTab): boolean {
  if (tab === "unread") return !item.read;
  if (tab === "action") return item.severity === "ACTION";
  return true;
}

export function useNotifications(tab: InboxTab) {
  const { isConnected, isLoading: sessionLoading } = useSession();

  /* The same hook the bell uses, so the page and the badge cannot disagree —
     and it carries the one-shot fetch, so the inbox works on a direct visit
     with no shell having asked first. */
  const unread = useUnreadCount();

  const diff = useSyncExternalStore(
    demo.subscribe,
    demo.read,
    demo.getServerSnapshot,
  );

  const [live, setLive] = useState<LiveState>(LIVE_EMPTY);
  const [limit, setLimit] = useState(PAGE_SIZE);

  /* One page, grown in place. Asking for a bigger first page rather than
     appending pages means a mark-read never leaves two fetched pages holding
     contradictory copies of the same row, and the API caps pageSize at 200
     anyway — this is an inbox, not a ledger. */
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!isConnected) return;
      setLive((s) => ({ ...s, loading: true, error: null }));
      try {
        const result = await notificationsApi.list(
          {
            pageSize: limit,
            ...(tab === "unread" ? { unread: true } : {}),
            ...(tab === "action" ? { severity: "ACTION" as const } : {}),
          },
          signal,
        );
        setLive({
          rows: result.data,
          total: result.meta.total,
          hasMore: result.meta.hasMore,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLive((s) => ({
          ...s,
          loading: false,
          error: error instanceof ApiError ? error : null,
        }));
      }
    },
    [isConnected, tab, limit],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const items = useMemo(() => {
    if (isConnected) return live.rows;
    const read = new Set(diff.read);
    const deleted = new Set(diff.deleted);
    return DEMO_ITEMS.filter((item) => !deleted.has(item.id))
      .map((item) =>
        !item.read && read.has(item.id)
          ? { ...item, read: true, readAt: DEMO_NOW.toISOString() }
          : item,
      )
      .filter((item) => matches(item, tab))
      .sort(byUnreadThenNewest);
  }, [isConnected, live.rows, diff, tab]);

  /* ------------------------------------------------------ mutations */

  const markRead = useCallback(
    async (id: string) => {
      if (!isConnected) {
        const current = demo.read();
        if (current.read.includes(id)) return;
        demo.commit({ ...current, read: [...current.read, id] });
        return;
      }
      const result = await notificationsApi.markRead(id);
      publishUnread(result.unread);
      setLive((s) => ({
        ...s,
        rows: s.rows.map((row) =>
          row.id === id
            ? { ...row, read: true, readAt: new Date().toISOString() }
            : row,
        ),
      }));
    },
    [isConnected],
  );

  const markAllRead = useCallback(async () => {
    if (!isConnected) {
      const current = demo.read();
      const deleted = new Set(current.deleted);
      const ids = DEMO_ITEMS.filter(
        (item) => !item.read && !deleted.has(item.id),
      ).map((item) => item.id);
      demo.commit({ ...current, read: [...new Set([...current.read, ...ids])] });
      return ids.length;
    }
    const result = await notificationsApi.markAllRead();
    publishUnread(result.unread);
    /* Reload rather than patch: on the Unread tab every row has just stopped
       matching the filter, and the honest answer is an empty list. */
    await load();
    return result.marked;
  }, [isConnected, load]);

  const remove = useCallback(
    async (id: string) => {
      if (!isConnected) {
        const current = demo.read();
        if (current.deleted.includes(id)) return;
        demo.commit({ ...current, deleted: [...current.deleted, id] });
        return;
      }
      const result = await notificationsApi.remove(id);
      publishUnread(result.unread);
      setLive((s) => ({
        ...s,
        rows: s.rows.filter((row) => row.id !== id),
        total: Math.max(0, s.total - 1),
      }));
    },
    [isConnected],
  );

  const showMore = useCallback(() => setLimit((n) => n + PAGE_SIZE), []);

  /**
   * What "now" is, for day grouping and relative times. The wall clock when
   * connected; the demo dataset's own day otherwise, so seeded rows read
   * "Today" instead of drifting further into the past every morning.
   */
  const now = useMemo(() => (isConnected ? new Date() : DEMO_NOW), [isConnected]);

  return {
    items,
    /** Every unread message, not just the ones passing the current filter. */
    unread,
    /** Rows on the current filter, which may exceed what has been fetched. */
    total: isConnected ? live.total : items.length,
    loading: isConnected ? live.loading : sessionLoading,
    error: isConnected ? live.error : null,
    hasMore: isConnected ? live.hasMore : false,
    showMore,
    now,
    /** False in demo mode, so the screen can say so rather than imply a server. */
    live: isConnected,
    reload: load,
    markRead,
    markAllRead,
    remove,
  };
}
