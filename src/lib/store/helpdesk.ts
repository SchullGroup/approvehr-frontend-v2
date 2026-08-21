"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ApiError } from "@/lib/api/client";
import {
  helpdeskApi,
  WORKING_DAY_FALLBACK,
  type ApiPerson,
  type ApiTicket,
  type ApiTicketCategory,
  type ApiTicketComment,
  type ApiTicketDetail,
  type ApiWorkingDay,
  type CreateTicketBody,
  type TicketListParams,
  type TicketPriority,
} from "@/lib/api/helpdesk";
import { CURRENT_USER, employeeById } from "@/lib/mock/people";
import { useCan } from "@/lib/permissions";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";

/**
 * The help desk, from whichever source is available.
 *
 * The API when it answers; a book in this browser when it does not. Where the
 * line falls in demo mode is the part worth reading, because the two other
 * API-backed stores draw it in different places.
 *
 * | | Connected | Demo |
 * |---|---|---|
 * | Read the queue, a thread, the targets | yes | yes, from a seeded book |
 * | Raise a ticket, reply, resolve, reopen, assign | yes | **yes, to this browser** |
 * | Internal notes hidden from the requester | enforced by the API | enforced here, same rule |
 * | Working-minute figures advancing with the clock | yes | **no — see below** |
 *
 * `store/departments.ts` refuses its writes in demo mode and is right to: a
 * department is a payroll reporting boundary, and a tree in browser storage
 * would teach a demo's audience something false. A help desk is not that. It is
 * a question somebody asked and somebody else answered — the same shape as
 * leave, which has always persisted locally — and a queue you cannot answer
 * from is not a demonstration of a help desk.
 *
 * ## The demo clock does not tick, deliberately
 *
 * Every SLA figure the API returns is counted in **working** minutes against the
 * company's own calendar: its opening hours, its working weekdays, its public
 * holidays. Reimplementing that arithmetic in the browser would put a second
 * implementation of the one thing this module exists to get right next to the
 * first, and the two would disagree the first time somebody added a holiday.
 *
 * So the demo does not compute working minutes at all. The seeded tickets carry
 * fixed figures — the dataset is a snapshot on one fixed day, same as
 * `lib/today.ts` — and a ticket raised in the demo starts at zero and stays
 * there. Nothing in demo mode claims a target was breached that was not seeded
 * as breached, and no demo figure is presented as having been measured.
 *
 * ## Internal notes are filtered here too
 *
 * `canReadInternal` below is a port of the backend rule, including the part that
 * catches people out: **the requester never sees internal notes on their own
 * ticket, whatever permissions they hold.** Demo mode grants every permission by
 * default, so without this the demo would show a note to the person it was
 * written about. That is the exact failure the flag exists to prevent, and a demo
 * that performs it is worse than no demo.
 *
 * The permission behind it comes from `useCan`, not from the session's token
 * claims, so previewing a staff role on `/settings/roles` changes what the demo
 * book hands back too — otherwise the preview would show the queue's own
 * internal notes to a previewed staff member.
 */

/* ---------------------------------------------------------------- the scopes */

/** Whose tickets. One row shape, three scopes — see `lib/api/helpdesk.ts`. */
export type TicketScope = "queue" | "mine" | "assigned";

/**
 * Which of them. Each maps to one server query, listed in `paramsFor`.
 *
 * `overdue` is the API's own filter and is **narrower than "breached"**: open
 * tickets whose *first-reply* target has passed. A ticket answered in an hour and
 * then left unresolved past its resolution target is a breach too, but proving
 * that needs a column-to-column comparison the API does not do in SQL — its
 * schema says so — and a filter that is nearly right on a queue is worse than one
 * that says exactly what it means. So the screen labels this view "Not answered
 * in time", which is the question actually being asked.
 */
export type TicketView = "open" | "overdue" | "resolved";

export type TicketFilter = {
  scope: TicketScope;
  view: TicketView;
  q?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
};

/**
 * The query behind each view.
 *
 * `targetAt` ascending is triage order: the soonest promise first. Postgres
 * sorts nulls last on an ascending order of its own accord, so tickets with no
 * target fall to the bottom rather than to the top, which is where they belong.
 *
 * `overdue` and `openOnly` are left **undefined** rather than sent as false —
 * the API reads absent as "do not filter on this", and sending false would make
 * "the ones that are on time" unaskable.
 */
function paramsFor(filter: TicketFilter): TicketListParams {
  const base: TicketListParams = {
    page: filter.page ?? 1,
    pageSize: filter.pageSize ?? 25,
    ...(filter.q ? { q: filter.q } : {}),
    ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
  };

  if (filter.view === "resolved") {
    return { ...base, status: "RESOLVED", sort: "updatedAt", order: "desc" };
  }
  if (filter.view === "overdue") {
    return { ...base, overdue: true, sort: "targetAt", order: "asc" };
  }
  return { ...base, openOnly: true, sort: "targetAt", order: "asc" };
}

/* ------------------------------------------------------------- the demo book */

/** What the demo stores. The two viewer-dependent fields are derived on read. */
type DemoTicket = Omit<ApiTicketDetail, "showsInternalNotes" | "commentCount">;

type DemoBook = {
  tickets: DemoTicket[];
  /** Next reference number. References are what people say out loud. */
  nextRef: number;
};

const person = (id: string): ApiPerson | null => {
  const employee = employeeById(id);
  return employee
    ? {
        id: employee.id,
        name: `${employee.firstName} ${employee.lastName}`,
        employeeNo: employee.employeeNo,
      }
    : null;
};

/**
 * The categories the demo offers, with the targets behind them.
 *
 * "Something else" carries no policy on purpose. A company that has not set
 * targets is a normal state, and the raise form has to say "no target set"
 * honestly rather than inventing one — so the demo has to be able to reach it.
 */
const DEMO_CATEGORIES: ApiTicketCategory[] = [
  {
    id: "cat-payroll",
    name: "Pay and payslips",
    description: "Anything about what you were paid, or a payslip you cannot find.",
    active: true,
    defaultAssignee: person("p-05"),
    sla: {
      id: "sla-fast",
      name: "Pay questions",
      priority: "HIGH",
      firstResponseMinutes: 240,
      resolutionMinutes: 1080,
      active: true,
    },
    tickets: 2,
    openTickets: 2,
  },
  {
    id: "cat-leave",
    name: "Leave and time off",
    description: "Balances, a request that did not go through, a booking to change.",
    active: true,
    defaultAssignee: person("p-06"),
    sla: {
      id: "sla-standard",
      name: "Standard",
      priority: "NORMAL",
      firstResponseMinutes: 480,
      resolutionMinutes: 1620,
      active: true,
    },
    tickets: 1,
    openTickets: 1,
  },
  {
    id: "cat-records",
    name: "Records and letters",
    description: "A confirmation letter, a detail on your record that is wrong.",
    active: true,
    defaultAssignee: person("p-05"),
    sla: {
      id: "sla-letters",
      name: "Letters and records",
      priority: "NORMAL",
      firstResponseMinutes: 540,
      resolutionMinutes: 2700,
      active: true,
    },
    tickets: 3,
    openTickets: 2,
  },
  {
    id: "cat-it",
    name: "Laptop and accounts",
    description: "Equipment, logins, anything you cannot get into.",
    active: true,
    defaultAssignee: person("p-06"),
    sla: {
      id: "sla-it",
      name: "Equipment",
      priority: "HIGH",
      firstResponseMinutes: 120,
      resolutionMinutes: 1080,
      active: true,
    },
    tickets: 1,
    openTickets: 0,
  },
  {
    id: "cat-other",
    name: "Something else",
    description: "Not sure where it goes. Somebody will file it properly.",
    active: true,
    defaultAssignee: null,
    sla: null,
    tickets: 0,
    openTickets: 0,
  },
];

const comment = (
  id: string,
  authorId: string,
  body: string,
  createdAt: string,
  internal = false,
): ApiTicketComment => ({
  id,
  author: person(authorId),
  body,
  internal,
  createdAt,
});

/**
 * Seven tickets, on the day the rest of the demo data is on.
 *
 * Chosen so every state a queue row can be in is on screen at once: one with no
 * reply past its target, one twenty working minutes from breaching, one answered
 * promptly and then left past its *resolution* target, two comfortably on time,
 * one resolved inside target, and one carrying an internal note that the person
 * who raised it must not be shown.
 */
const DEMO_SEED: DemoBook = {
  nextRef: 2842,
  tickets: [
    {
      id: "tk-1",
      reference: "HR-2841",
      subject: "My July payslip is missing",
      body: "I can see June and August on my payslips page but not July. I need it for a loan application.",
      category: "Pay and payslips",
      categoryId: "cat-payroll",
      categoryName: "Pay and payslips",
      status: "IN_PROGRESS",
      priority: "HIGH",
      requester: person("p-07"),
      assignee: person("p-05"),
      raisedAt: "2026-08-18T09:12:00.000Z",
      updatedAt: "2026-08-19T08:40:00.000Z",
      resolvedAt: null,
      sla: {
        policyId: "sla-fast",
        policyName: "Pay questions",
        firstResponseMinutes: 240,
        resolutionMinutes: 1080,
      },
      responseDueAt: "2026-08-18T13:12:00.000Z",
      resolutionDueAt: "2026-08-20T11:12:00.000Z",
      firstRespondedAt: "2026-08-18T10:05:00.000Z",
      responseWorkingMinutes: 53,
      resolutionWorkingMinutes: null,
      openWorkingMinutes: 300,
      responseBreached: false,
      resolutionBreached: false,
      comments: [
        comment(
          "c-1",
          "p-05",
          "Found it — the July run was approved after you moved onto the new grade, so it filed under your old employee number. Reissuing it now.",
          "2026-08-18T10:05:00.000Z",
        ),
        comment(
          "c-2",
          "p-05",
          "Old employee number AHR-0619-A still has three payslips attached. Needs a proper fix before anyone else moves grade.",
          "2026-08-18T10:11:00.000Z",
          true,
        ),
        comment(
          "c-3",
          "p-07",
          "Thank you. How long does reissuing take?",
          "2026-08-19T08:40:00.000Z",
        ),
      ],
    },
    {
      id: "tk-2",
      reference: "HR-2840",
      subject: "I cannot see my leave balance",
      body: "The leave page shows zero days for me but I have not taken any leave this year.",
      category: "Leave and time off",
      categoryId: "cat-leave",
      categoryName: "Leave and time off",
      status: "OPEN",
      priority: "NORMAL",
      requester: person("p-09"),
      assignee: null,
      raisedAt: "2026-08-19T07:30:00.000Z",
      updatedAt: "2026-08-19T07:30:00.000Z",
      resolvedAt: null,
      sla: {
        policyId: "sla-standard",
        policyName: "Standard",
        firstResponseMinutes: 480,
        resolutionMinutes: 1620,
      },
      responseDueAt: "2026-08-20T08:30:00.000Z",
      resolutionDueAt: "2026-08-22T09:30:00.000Z",
      firstRespondedAt: null,
      responseWorkingMinutes: null,
      resolutionWorkingMinutes: null,
      openWorkingMinutes: 120,
      responseBreached: false,
      resolutionBreached: false,
      comments: [],
    },
    {
      id: "tk-3",
      reference: "HR-2838",
      subject: "Confirmation letter for a visa application",
      body: "I need a letter confirming my job title and salary, addressed to the embassy. Appointment is next Thursday.",
      category: "Records and letters",
      categoryId: "cat-records",
      categoryName: "Records and letters",
      status: "WAITING",
      priority: "NORMAL",
      requester: person("p-03"),
      assignee: person("p-05"),
      raisedAt: "2026-08-13T11:00:00.000Z",
      updatedAt: "2026-08-17T14:20:00.000Z",
      resolvedAt: null,
      sla: {
        policyId: "sla-letters",
        policyName: "Letters and records",
        firstResponseMinutes: 540,
        resolutionMinutes: 2700,
      },
      responseDueAt: "2026-08-14T11:00:00.000Z",
      resolutionDueAt: "2026-08-18T15:00:00.000Z",
      firstRespondedAt: "2026-08-13T13:40:00.000Z",
      responseWorkingMinutes: 160,
      resolutionWorkingMinutes: null,
      openWorkingMinutes: 2900,
      responseBreached: false,
      resolutionBreached: true,
      comments: [
        comment(
          "c-4",
          "p-05",
          "Which embassy is it going to? They each want the address written differently.",
          "2026-08-13T13:40:00.000Z",
        ),
      ],
    },
    {
      id: "tk-4",
      reference: "HR-2836",
      subject: "Pension PIN is not on my record",
      body: "My pension PIN field is empty. I gave it to HR when I joined.",
      category: "Records and letters",
      categoryId: "cat-records",
      categoryName: "Records and letters",
      status: "OPEN",
      priority: "HIGH",
      requester: person("p-09"),
      assignee: null,
      raisedAt: "2026-08-18T08:15:00.000Z",
      updatedAt: "2026-08-18T08:15:00.000Z",
      resolvedAt: null,
      sla: {
        policyId: "sla-letters",
        policyName: "Letters and records",
        firstResponseMinutes: 540,
        resolutionMinutes: 2700,
      },
      responseDueAt: "2026-08-19T08:15:00.000Z",
      resolutionDueAt: "2026-08-25T12:15:00.000Z",
      firstRespondedAt: null,
      responseWorkingMinutes: null,
      resolutionWorkingMinutes: null,
      openWorkingMinutes: 700,
      /* The seeded "nobody has replied and the target has gone" row. Every other
         state a queue can be in is covered by one of the others. */
      responseBreached: true,
      resolutionBreached: false,
      comments: [],
    },
    {
      id: "tk-7",
      reference: "HR-2837",
      subject: "I cannot get into the payslips page",
      body: "It says my password is wrong but it works everywhere else.",
      category: "Laptop and accounts",
      categoryId: "cat-it",
      categoryName: "Laptop and accounts",
      status: "OPEN",
      priority: "NORMAL",
      requester: person("p-08"),
      assignee: null,
      raisedAt: "2026-08-19T08:00:00.000Z",
      updatedAt: "2026-08-19T08:00:00.000Z",
      resolvedAt: null,
      sla: {
        policyId: "sla-it",
        policyName: "Equipment",
        firstResponseMinutes: 120,
        resolutionMinutes: 1080,
      },
      responseDueAt: "2026-08-19T10:00:00.000Z",
      resolutionDueAt: "2026-08-21T09:00:00.000Z",
      firstRespondedAt: null,
      responseWorkingMinutes: null,
      resolutionWorkingMinutes: null,
      /* Twenty working minutes of a two-working-hour promise left. The row this
         exists to show is "Due in 20 minutes" — the one somebody can still
         save. */
      openWorkingMinutes: 100,
      responseBreached: false,
      resolutionBreached: false,
      comments: [],
    },
    {
      id: "tk-5",
      reference: "HR-2830",
      subject: "Laptop keyboard has stopped working",
      body: "Three keys on the left side do not respond. I am using an external keyboard for now.",
      category: "Laptop and accounts",
      categoryId: "cat-it",
      categoryName: "Laptop and accounts",
      status: "RESOLVED",
      priority: "LOW",
      requester: person("p-04"),
      assignee: person("p-06"),
      raisedAt: "2026-08-11T10:00:00.000Z",
      updatedAt: "2026-08-13T09:30:00.000Z",
      resolvedAt: "2026-08-13T09:30:00.000Z",
      sla: {
        policyId: "sla-it",
        policyName: "Equipment",
        firstResponseMinutes: 120,
        resolutionMinutes: 1080,
      },
      responseDueAt: "2026-08-11T12:00:00.000Z",
      resolutionDueAt: "2026-08-13T13:00:00.000Z",
      firstRespondedAt: "2026-08-11T10:35:00.000Z",
      responseWorkingMinutes: 35,
      resolutionWorkingMinutes: 700,
      openWorkingMinutes: 700,
      responseBreached: false,
      resolutionBreached: false,
      comments: [
        comment(
          "c-5",
          "p-06",
          "Replacement unit is in the Lagos office. Bring the old one when you collect it.",
          "2026-08-11T10:35:00.000Z",
        ),
        comment(
          "c-6",
          "p-06",
          "Swapped over and the old unit is logged for repair. Anything else on it, reopen this rather than raising a new one.",
          "2026-08-13T09:30:00.000Z",
        ),
      ],
    },
    {
      id: "tk-6",
      reference: "HR-2839",
      subject: "Change the account my salary goes to",
      body: "I have moved bank. Old account is GTBank, new one is Kuda. What do you need from me?",
      category: "Pay and payslips",
      categoryId: "cat-payroll",
      categoryName: "Pay and payslips",
      status: "OPEN",
      priority: "NORMAL",
      requester: person("p-06"),
      assignee: person("p-05"),
      raisedAt: "2026-08-19T09:00:00.000Z",
      updatedAt: "2026-08-19T09:00:00.000Z",
      resolvedAt: null,
      sla: {
        policyId: "sla-fast",
        policyName: "Pay questions",
        firstResponseMinutes: 240,
        resolutionMinutes: 1080,
      },
      responseDueAt: "2026-08-19T13:00:00.000Z",
      resolutionDueAt: "2026-08-21T11:00:00.000Z",
      firstRespondedAt: null,
      responseWorkingMinutes: null,
      resolutionWorkingMinutes: null,
      openWorkingMinutes: 60,
      responseBreached: false,
      resolutionBreached: false,
      comments: [],
    },
  ],
};

const demoStore = createPersistedState<DemoBook>({
  key: "approvehr.helpdesk.store",
  empty: DEMO_SEED,
  version: 1,
});

/* --------------------------------------------------------------- visibility */

type Viewer = { employeeId: string; canManage: boolean };

/**
 * A port of the backend's `canReadInternal`, and it must stay one.
 *
 * The requester is checked **first** and refused unconditionally. That order is
 * the rule: somebody who holds every permission and raised the ticket still
 * does not read the notes written about it while it was being worked.
 */
function canReadInternal(ticket: DemoTicket, viewer: Viewer): boolean {
  if (ticket.requester && ticket.requester.id === viewer.employeeId) return false;
  if (viewer.canManage) return true;
  return ticket.assignee !== null && ticket.assignee.id === viewer.employeeId;
}

/** Requester, assignee, or staff. The demo answers nothing else. */
function canReadTicket(ticket: DemoTicket, viewer: Viewer): boolean {
  if (viewer.canManage) return true;
  return (
    ticket.requester?.id === viewer.employeeId ||
    ticket.assignee?.id === viewer.employeeId
  );
}

/** Adds the two fields the API derives per reader, and drops what they cannot see. */
function project(ticket: DemoTicket, viewer: Viewer): ApiTicketDetail {
  const internalAllowed = canReadInternal(ticket, viewer);
  const comments = ticket.comments.filter((c) => internalAllowed || !c.internal);
  return {
    ...ticket,
    comments,
    /* Counted after filtering, like the API. "12 messages" above a list of nine
       is the leak this flag exists to prevent. */
    commentCount: comments.length,
    showsInternalNotes: internalAllowed,
  };
}

/* -------------------------------------------------------------- demo queries */

function demoRows(book: DemoBook, viewer: Viewer, filter: TicketFilter): ApiTicket[] {
  const scoped = book.tickets.filter((ticket) => {
    if (filter.scope === "mine") return ticket.requester?.id === viewer.employeeId;
    if (filter.scope === "assigned") return ticket.assignee?.id === viewer.employeeId;
    return canReadTicket(ticket, viewer);
  });

  const viewed = scoped.filter((ticket) => {
    if (filter.view === "resolved") return ticket.status === "RESOLVED";
    if (ticket.status === "RESOLVED") return false;
    /* `responseBreached` alone, to mirror the API's `overdue=true` exactly. A
       resolution breach still shows on the row — see `ticketClock` — it is just
       not what this filter asks. */
    if (filter.view === "overdue") return ticket.responseBreached;
    return true;
  });

  const needle = filter.q?.trim().toLowerCase();
  const matched = viewed.filter((ticket) => {
    if (filter.categoryId && ticket.categoryId !== filter.categoryId) return false;
    if (!needle) return true;
    return (
      ticket.subject.toLowerCase().includes(needle) ||
      ticket.reference.toLowerCase().includes(needle) ||
      (ticket.body ?? "").toLowerCase().includes(needle)
    );
  });

  /* Soonest promise first, tickets with no promise last — the order the API's
     `sort=targetAt&order=asc` produces, so both paths read the same. */
  const ordered = [...matched].sort((a, b) => {
    if (filter.view === "resolved") return b.updatedAt.localeCompare(a.updatedAt);
    const left = a.responseDueAt ?? a.resolutionDueAt;
    const right = b.responseDueAt ?? b.resolutionDueAt;
    if (left === null && right === null) return a.raisedAt.localeCompare(b.raisedAt);
    if (left === null) return 1;
    if (right === null) return -1;
    return left.localeCompare(right);
  });

  return ordered.map((ticket) => project(ticket, viewer));
}

/* ------------------------------------------------------------------- the list */

/** What one answered page holds. `loading` is derived, so it is not in here. */
type TicketListState = {
  tickets: ApiTicket[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * One page of tickets, in whichever scope the screen asked for.
 *
 * `bump` exists so a write elsewhere on the screen can pull this list forward
 * without the caller holding a reload function it has to remember to call.
 * Passing the same number twice is a no-op.
 *
 * ## Two things here that look like accidents and are not
 *
 * **The answer is keyed by the query it answers**, not stored bare. A slow
 * response for the search the reader has already changed cannot overwrite a
 * fast one for the search they are looking at, and `loading` is then *derived* —
 * true exactly while the key held in state is not the key being asked for. So
 * there is no `setState` anywhere in an effect body, which is a lint error in
 * this repo and a cascading render everywhere else.
 *
 * **`bump` is a dependency of the effect but not part of the key.** Refreshing
 * after a reply should not blank the list back to skeletons — the rows on screen
 * are still the right rows, they are simply about to be a few seconds fresher.
 */
export function useTickets(filter: TicketFilter, bump = 0) {
  const { isConnected, actingId } = useSession();
  /* The same source the screen reads, deliberately. `useSession().permissions`
     is the token's claims and is empty in demo mode, which would hand the demo
     `canManage: true` even while a staff role is being previewed — and the
     preview would then show internal notes to the person who raised the
     ticket. `useCan` honours the preview. */
  const canManage = useCan("EDIT_RECORDS");
  const book = useSyncExternalStore(
    demoStore.subscribe,
    demoStore.read,
    demoStore.getServerSnapshot,
  );

  /* Taken apart into primitives on purpose. `filter` is an object literal at
     the call site, so it is a new reference on every render of the caller even
     when nothing about it moved — and a dependency array holding it would
     re-fetch the queue on every keystroke anywhere on the screen. */
  const { scope, view, q, categoryId } = filter;
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? 25;

  const normalised = useMemo<TicketFilter>(
    () => ({
      scope,
      view,
      page,
      pageSize,
      ...(q ? { q } : {}),
      ...(categoryId ? { categoryId } : {}),
    }),
    [scope, view, q, categoryId, page, pageSize],
  );

  const params = useMemo(() => paramsFor(normalised), [normalised]);
  const key = `${scope}|${view}|${q ?? ""}|${categoryId ?? ""}|${page}|${pageSize}`;

  const [answered, setAnswered] = useState<{
    key: string;
    state: TicketListState | null;
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    const controller = new AbortController();
    void (async () => {
      const fetcher =
        scope === "queue"
          ? helpdeskApi.queue
          : scope === "mine"
            ? helpdeskApi.mine
            : helpdeskApi.assigned;
      try {
        const result = await fetcher(params, controller.signal);
        if (controller.signal.aborted) return;
        setAnswered({
          key,
          state: {
            tickets: result.data,
            total: result.meta.total,
            page: result.meta.page,
            pageSize: result.meta.pageSize,
            totalPages: result.meta.totalPages,
          },
          error: null,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setAnswered({
          key,
          state: null,
          error: error instanceof ApiError ? error : null,
        });
      }
    })();
    return () => controller.abort();
  }, [isConnected, scope, params, key, bump]);

  /**
   * Demo rows are derived during render, not copied into state.
   *
   * The book is an external store, so a local write re-renders the caller and
   * this recomputes. Copying it into `useState` inside an effect would be the
   * same lint error, plus a wasted render.
   */
  const demo = useMemo(
    () =>
      isConnected
        ? null
        : demoRows(book, { employeeId: actingId, canManage }, normalised),
    [isConnected, book, actingId, canManage, normalised],
  );

  if (demo) {
    const start = (page - 1) * pageSize;
    return {
      tickets: demo.slice(start, start + pageSize),
      total: demo.length,
      page,
      pageSize,
      totalPages: Math.ceil(demo.length / pageSize),
      loading: false,
      error: null as ApiError | null,
      /** False in demo mode, so a screen can say which it is showing. */
      live: false,
    };
  }

  const matched = answered !== null && answered.key === key;
  const state = matched ? answered.state : null;

  return {
    tickets: state?.tickets ?? [],
    total: state?.total ?? 0,
    page: state?.page ?? page,
    pageSize: state?.pageSize ?? pageSize,
    totalPages: state?.totalPages ?? 0,
    /* True exactly while the stored answer is for a different query. No effect
       writes this, so there is no window where it lies. */
    loading: !matched,
    error: matched ? answered.error : null,
    live: true,
  };
}

/* ----------------------------------------------------------------- one ticket */

export type TicketActions = {
  reply: (body: string, internal: boolean) => Promise<void>;
  resolve: (resolution: string) => Promise<void>;
  reopen: (reason?: string) => Promise<void>;
  takeIt: () => Promise<void>;
  handOver: (assigneeId: string | null) => Promise<void>;
  setPriority: (priority: TicketPriority) => Promise<void>;
};

/**
 * One ticket and its thread.
 *
 * Kept as `{ id, detail }` rather than a bare detail, so the value carries the
 * id it belongs to. A response for a ticket the reader has already navigated
 * away from cannot be shown, and there is nothing to clear when `id` changes —
 * the stale value simply stops matching. Clearing it in an effect instead would
 * be a `setState` in an effect body, which cascades a render.
 */
export function useTicket(id: string | null) {
  const { isConnected, actingId } = useSession();
  /* The same source the screen reads, deliberately. `useSession().permissions`
     is the token's claims and is empty in demo mode, which would hand the demo
     `canManage: true` even while a staff role is being previewed — and the
     preview would then show internal notes to the person who raised the
     ticket. `useCan` honours the preview. */
  const canManage = useCan("EDIT_RECORDS");
  const book = useSyncExternalStore(
    demoStore.subscribe,
    demoStore.read,
    demoStore.getServerSnapshot,
  );

  const [fetched, setFetched] = useState<{
    id: string;
    detail: ApiTicketDetail | null;
    error: ApiError | null;
  } | null>(null);
  const [version, setVersion] = useState(0);

  const active = Boolean(id) && isConnected;

  useEffect(() => {
    if (!active || !id) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const detail = await helpdeskApi.get(id, controller.signal);
        if (!controller.signal.aborted) setFetched({ id, detail, error: null });
      } catch (error) {
        if (!controller.signal.aborted) {
          setFetched({
            id,
            detail: null,
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => controller.abort();
  }, [id, active, version]);

  const viewer = useMemo<Viewer>(
    () => ({ employeeId: actingId, canManage }),
    [actingId, canManage],
  );

  const demoDetail = useMemo(() => {
    if (isConnected || !id) return null;
    const found = book.tickets.find((ticket) => ticket.id === id);
    if (!found || !canReadTicket(found, viewer)) return null;
    return project(found, viewer);
  }, [isConnected, id, book, viewer]);

  const matched = active && fetched !== null && fetched.id === id;
  const detail = isConnected ? (matched ? fetched.detail : null) : demoDetail;

  /* Writes to the demo book. Every one of them replaces the ticket rather than
     mutating it, so the persisted payload and the render never disagree. */
  const writeDemo = useCallback(
    (change: (ticket: DemoTicket) => DemoTicket) => {
      const current = demoStore.read();
      demoStore.commit({
        ...current,
        tickets: current.tickets.map((ticket) =>
          ticket.id === id ? change(ticket) : ticket,
        ),
      });
    },
    [id],
  );

  const refresh = useCallback(() => setVersion((n) => n + 1), []);

  const actions = useMemo<TicketActions>(() => {
    const now = () => new Date().toISOString();

    return {
      reply: async (body: string, internal: boolean) => {
        if (!id) return;
        if (isConnected) {
          await helpdeskApi.comment(id, { body, internal });
          refresh();
          return;
        }
        writeDemo((ticket) => {
          const stamped = now();
          const authoredByRequester = ticket.requester?.id === actingId;
          const isFirstPublicReply =
            !internal && !authoredByRequester && ticket.firstRespondedAt === null;
          return {
            ...ticket,
            updatedAt: stamped,
            /* A requester chasing is not a first response, and neither is an
               internal note — the person waiting has still heard nothing. */
            firstRespondedAt: isFirstPublicReply ? stamped : ticket.firstRespondedAt,
            responseWorkingMinutes: isFirstPublicReply
              ? ticket.openWorkingMinutes
              : ticket.responseWorkingMinutes,
            comments: [
              ...ticket.comments,
              comment(`c-${stamped}`, actingId, body, stamped, internal),
            ],
          };
        });
      },

      resolve: async (resolution: string) => {
        if (!id) return;
        if (isConnected) {
          await helpdeskApi.resolve(id, resolution);
          refresh();
          return;
        }
        writeDemo((ticket) => {
          const stamped = now();
          return {
            ...ticket,
            status: "RESOLVED",
            resolvedAt: stamped,
            updatedAt: stamped,
            resolutionWorkingMinutes: ticket.openWorkingMinutes,
            /* The resolution is a public comment, not a hidden field. Somebody
               reading this thread next month has to see what was done. */
            comments: [
              ...ticket.comments,
              comment(`c-${stamped}`, actingId, resolution, stamped),
            ],
          };
        });
      },

      reopen: async (reason?: string) => {
        if (!id) return;
        if (isConnected) {
          await helpdeskApi.reopen(id, reason);
          refresh();
          return;
        }
        writeDemo((ticket) => {
          const stamped = now();
          return {
            ...ticket,
            status: ticket.assignee ? "IN_PROGRESS" : "OPEN",
            resolvedAt: null,
            resolutionWorkingMinutes: null,
            updatedAt: stamped,
            comments: reason
              ? [
                  ...ticket.comments,
                  comment(`c-${stamped}`, actingId, reason, stamped),
                ]
              : ticket.comments,
          };
        });
      },

      takeIt: async () => {
        if (!id) return;
        if (isConnected) {
          await helpdeskApi.assign(id, actingId);
          refresh();
          return;
        }
        writeDemo((ticket) => ({
          ...ticket,
          assignee: person(actingId),
          status: ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status,
          updatedAt: now(),
        }));
      },

      handOver: async (assigneeId: string | null) => {
        if (!id) return;
        if (isConnected) {
          await helpdeskApi.assign(id, assigneeId);
          refresh();
          return;
        }
        writeDemo((ticket) => ({
          ...ticket,
          assignee: assigneeId ? person(assigneeId) : null,
          status:
            assigneeId && ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status,
          updatedAt: now(),
        }));
      },

      setPriority: async (priority: TicketPriority) => {
        if (!id) return;
        if (isConnected) {
          await helpdeskApi.update(id, { priority });
          refresh();
          return;
        }
        writeDemo((ticket) => ({ ...ticket, priority, updatedAt: now() }));
      },
    };
  }, [id, isConnected, actingId, refresh, writeDemo]);

  return {
    ticket: detail,
    /* Derived rather than tracked: loading is exactly the window where an
       active id has no matching result yet, which is true from the moment `id`
       changes. No setState in an effect, and no window where the previous
       ticket's thread is shown as though it were this one's. */
    loading: active && !matched,
    error: matched ? fetched.error : null,
    ...actions,
  };
}

/* ------------------------------------------------------------------- raising */

/**
 * Raise a ticket, and the categories to raise it under.
 *
 * `workingDay` comes back with them because the category's target is in working
 * minutes and a screen cannot word it without knowing how long a working day
 * is. One hook, so no screen has to remember to fetch both.
 */
export function useRaiseTicket() {
  const { isConnected, actingId } = useSession();
  const [state, setState] = useState<{
    categories: ApiTicketCategory[];
    workingDay: ApiWorkingDay;
    loading: boolean;
    error: ApiError | null;
  }>({
    categories: [],
    workingDay: WORKING_DAY_FALLBACK,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!isConnected) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const [categories, sla] = await Promise.all([
          helpdeskApi.categories(false, controller.signal),
          helpdeskApi.sla(false, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setState({
          categories,
          workingDay: sla.workingDay,
          loading: false,
          error: null,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof ApiError ? error : null,
        }));
      }
    })();
    return () => controller.abort();
  }, [isConnected]);

  const raise = useCallback(
    async (body: CreateTicketBody): Promise<string> => {
      if (isConnected) {
        const created = await helpdeskApi.create(body);
        return created.id;
      }

      const current = demoStore.read();
      const category = DEMO_CATEGORIES.find((c) => c.id === body.categoryId) ?? null;
      const stamped = new Date().toISOString();
      const id = `tk-demo-${current.nextRef}`;

      demoStore.commit({
        nextRef: current.nextRef + 1,
        tickets: [
          {
            id,
            reference: `HR-${current.nextRef}`,
            subject: body.subject,
            body: body.body ?? null,
            category: category?.name ?? "Something else",
            categoryId: category?.id ?? null,
            categoryName: category?.name ?? null,
            status: "OPEN",
            priority: body.priority ?? "NORMAL",
            requester: person(actingId) ?? person(CURRENT_USER.id),
            assignee: category?.defaultAssignee ?? null,
            raisedAt: stamped,
            updatedAt: stamped,
            resolvedAt: null,
            sla: category?.sla
              ? {
                  policyId: category.sla.id,
                  policyName: category.sla.name,
                  firstResponseMinutes: category.sla.firstResponseMinutes,
                  resolutionMinutes: category.sla.resolutionMinutes,
                }
              : null,
            /* No deadline is written in demo mode. Computing one would need the
               company's calendar, and a made-up deadline is a made-up promise. */
            responseDueAt: null,
            resolutionDueAt: null,
            firstRespondedAt: null,
            responseWorkingMinutes: null,
            resolutionWorkingMinutes: null,
            openWorkingMinutes: 0,
            responseBreached: false,
            resolutionBreached: false,
            comments: [],
          },
          ...current.tickets,
        ],
      });
      return id;
    },
    [isConnected, actingId],
  );

  return {
    categories: isConnected ? state.categories : DEMO_CATEGORIES,
    workingDay: isConnected ? state.workingDay : WORKING_DAY_FALLBACK,
    loading: isConnected ? state.loading : false,
    error: isConnected ? state.error : null,
    raise,
  };
}

/* --------------------------------------------------------------------- pulse */

/**
 * The four numbers above a queue.
 *
 * Three of them are exact counts asked for directly — `meta.total` from a
 * one-row page, which is cheaper than loading a list to count it. The fourth is
 * the median first reply over the last thirty days, from `/analytics`, and it is
 * the only figure here that is an average rather than a count.
 *
 * `note` is the API's own caveat and is repeated verbatim: nothing watches these
 * targets between page loads. A screen that implied otherwise would be promising
 * a chaser that does not exist.
 */
export type HelpdeskPulse = {
  open: number;
  overdue: number;
  unassigned: number;
  unanswered: number;
  medianFirstResponseMinutes: number | null;
  minutesPerDay: number;
  loading: boolean;
  /** True when nothing is watching the targets between page loads. */
  unwatched: boolean;
};

const EMPTY_PULSE: HelpdeskPulse = {
  open: 0,
  overdue: 0,
  unassigned: 0,
  unanswered: 0,
  medianFirstResponseMinutes: null,
  minutesPerDay: WORKING_DAY_FALLBACK.minutesPerDay,
  loading: true,
  unwatched: true,
};

export function useHelpdeskPulse(enabled: boolean, bump = 0): HelpdeskPulse {
  const { isConnected, actingId } = useSession();
  /* The same source the screen reads, deliberately. `useSession().permissions`
     is the token's claims and is empty in demo mode, which would hand the demo
     `canManage: true` even while a staff role is being previewed — and the
     preview would then show internal notes to the person who raised the
     ticket. `useCan` honours the preview. */
  const canManage = useCan("EDIT_RECORDS");
  const book = useSyncExternalStore(
    demoStore.subscribe,
    demoStore.read,
    demoStore.getServerSnapshot,
  );
  const [state, setState] = useState<HelpdeskPulse>(EMPTY_PULSE);

  useEffect(() => {
    if (!enabled || !isConnected) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const [open, overdue, unassigned, analytics] = await Promise.all([
          helpdeskApi.queue(
            { openOnly: true, pageSize: 1 },
            controller.signal,
          ),
          helpdeskApi.queue({ overdue: true, pageSize: 1 }, controller.signal),
          helpdeskApi.queue(
            { openOnly: true, unassigned: true, pageSize: 1 },
            controller.signal,
          ),
          helpdeskApi.analytics({}, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        setState({
          open: open.meta.total,
          overdue: overdue.meta.total,
          unassigned: unassigned.meta.total,
          unanswered: analytics.firstResponse.unanswered,
          medianFirstResponseMinutes: analytics.firstResponse.medianWorkingMinutes,
          minutesPerDay: analytics.workingDay.minutesPerDay,
          loading: false,
          unwatched: true,
        });
      } catch {
        if (controller.signal.aborted) return;
        /* A pulse is a summary. Losing it is worth a blank number, not a
           blocked screen — the queue below it is the thing that matters. */
        setState((current) => ({ ...current, loading: false }));
      }
    })();
    return () => controller.abort();
  }, [enabled, isConnected, bump]);

  const demo = useMemo<HelpdeskPulse | null>(() => {
    if (isConnected || !enabled) return null;
    const viewer: Viewer = { employeeId: actingId, canManage };
    const readable = book.tickets.filter((ticket) => canReadTicket(ticket, viewer));
    const live = readable.filter((ticket) => ticket.status !== "RESOLVED");
    const measured = readable
      .map((ticket) => ticket.responseWorkingMinutes)
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    const middle = Math.floor(measured.length / 2);

    return {
      open: live.length,
      /* Same narrow question the connected path asks with `overdue=true`. */
      overdue: live.filter((t) => t.responseBreached).length,
      unassigned: live.filter((t) => t.assignee === null).length,
      unanswered: live.filter((t) => t.firstRespondedAt === null).length,
      /* The median of figures the seed was given, not a measurement this
         browser made. No working-hours arithmetic happens on this side. */
      medianFirstResponseMinutes:
        measured.length === 0
          ? null
          : measured.length % 2 === 1
            ? (measured[middle] ?? null)
            : Math.round(((measured[middle - 1] ?? 0) + (measured[middle] ?? 0)) / 2),
      minutesPerDay: WORKING_DAY_FALLBACK.minutesPerDay,
      loading: false,
      unwatched: true,
    };
  }, [isConnected, enabled, book, actingId, canManage]);

  return demo ?? state;
}
