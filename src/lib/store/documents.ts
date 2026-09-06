"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  documentsApi,
  type AddDocumentBody,
  type ApiComplianceRow,
  type ApiCreatedRequest,
  type ApiDocument,
  type ApiDocumentRequest,
  type ApiEmployeeFile,
  type ApiExpiring,
  type CreateRequestBody,
  type DocumentCategory,
  type FulfilBody,
  type RequestListParams,
} from "@/lib/api/documents";
import { EMPLOYEES } from "@/lib/mock/people";
import { daysSince, shortDate, TODAY } from "@/lib/today";
import { useSession } from "./session";
import { useRevalidation } from "@/lib/revalidate";

/**
 * Documents on file, and the ones still being chased.
 *
 * ## Demo mode is read-only, and that is the honest answer here
 *
 * `store/loans.ts` decides the other way and explains why: a loan decision is a
 * request somebody made and somebody else answered, and the arithmetic is pure,
 * so a demo approval is the real flow without a database.
 *
 * A document request is not that. Asking somebody for their work permit is a
 * **message to a named person** — the API notifies them and reports back whether
 * it reached anybody. A request written into this browser reaches nobody, and a
 * screen that showed it as sent would be teaching its audience something false
 * about what happened. Attaching a document is worse: the file itself is
 * evidence on a personnel record, and a reference held in localStorage is
 * evidence of nothing.
 *
 * So the demo shows a seeded file and a seeded chase list — the shape is real —
 * and every write refuses with a message that says which one it is. This is the
 * position `store/departments.ts` takes, for the same class of reason.
 *
 * The one action that works in **both** modes is writing the chase message,
 * because copying text needs no server. That matters more than it sounds: it is
 * the only thing on the register that actually moves a document along today.
 *
 * ## Dates
 *
 * Connected, `daysLeft` and `overdue` come from the API, computed against its
 * own UTC midnight. Demo, they are computed against `TODAY` — the demo's fixed
 * "now" — so a seeded due date does not drift into being four hundred days late.
 */

/* ------------------------------------------------------------------- labels */

/**
 * Turns a document name into something that reads inside a sentence.
 *
 * `Work permit` → `work permit`, but `NYSC certificate` stays put: lowercasing
 * an acronym produces `nYSC`, which looks like a bug to the reader. Mirrors
 * `inSentence` in the API's documents service so both sides phrase it the same.
 */
function inSentence(name: string): string {
  const first = name.split(" ")[0] ?? "";
  if (first.length > 1 && first === first.toUpperCase()) return name;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** The first word of a full name. What you call somebody when you chase them. */
export function firstNameOf(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

/** `null` days means nobody set a date, and nothing with no date gets chased. */
export function dueLabel(daysLeft: number | null): string {
  if (daysLeft === null) return "No date set";
  if (daysLeft === 0) return "Due today";
  if (daysLeft === 1) return "Due tomorrow";
  if (daysLeft === -1) return "1 day late";
  if (daysLeft < 0) return `${Math.abs(daysLeft)} days late`;
  return `Due in ${daysLeft} days`;
}

/**
 * The whole row as one sentence.
 *
 * `Adaeze’s work permit expires in 12 days` is worth more than a table cell
 * saying `12`, and it is the line the compliance list is built around. The two
 * `kind`s read differently on purpose: a document *expires*, a request we are
 * waiting on *is due*.
 */
export function complianceSentence(row: ApiComplianceRow): string {
  const who = `${firstNameOf(row.employeeName)}’s ${inSentence(row.name)}`;
  const days = Math.abs(row.daysLeft);
  if (row.kind === "DOCUMENT") {
    if (row.daysLeft < 0) {
      return `${who} expired ${days} ${days === 1 ? "day" : "days"} ago`;
    }
    if (row.daysLeft === 0) return `${who} expires today`;
    return `${who} expires in ${days} ${days === 1 ? "day" : "days"}`;
  }
  if (row.daysLeft < 0) {
    return `${who} was due ${days} ${days === 1 ? "day" : "days"} ago`;
  }
  if (row.daysLeft === 0) return `${who} is due today`;
  return `${who} is due in ${days} ${days === 1 ? "day" : "days"}`;
}

/**
 * The message to send somebody who owes you a document.
 *
 * TODO(remind): when `POST /api/v1/documents/requests/:id/remind` exists, this
 * becomes the body it sends and the register gets a Send button beside Copy.
 * Until then nothing in this module claims to have sent anything — the text is
 * handed to the person doing the chasing, which is what actually happens in a
 * thirty-person company anyway.
 */
export function chaseMessage(request: {
  employeeName: string;
  name: string;
  dueOn: string | null;
  daysLeft: number | null;
}): string {
  const who = firstNameOf(request.employeeName);
  const what = inSentence(request.name);
  const when =
    request.dueOn === null
      ? "Please send it when you can."
      : request.daysLeft !== null && request.daysLeft < 0
        ? `It was due on ${shortDate(request.dueOn)}.`
        : `It is due on ${shortDate(request.dueOn)}.`;
  return `Hi ${who}, we still need your ${what}. ${when} Open ApproveHR and go to My documents to attach it.`;
}

/* ---------------------------------------------------------------- the guard */

/** Demo mode refuses each write by name, rather than one vague message. */
function refuse(what: string): never {
  throw new ApiError(0, "offline", what);
}

const OFFLINE = {
  ask: "Asking for a document needs the API. The person is notified when you ask, and a request kept in this browser reaches nobody.",
  attach:
    "Attaching a document needs the API. A personnel file is evidence, and a reference held in this browser is on nobody’s record.",
  waive:
    "Waiving a request needs the API. The employee is told to stop looking for it, and that message has to come from the server.",
  remind:
    "Reminding needs the API: this browser has no inbox to put it in. Copy the message below instead.",
  remove: "Removing a document needs the API.",
  verify:
    "Marking a document as checked needs the API: there is no verifier behind this browser to record who confirmed it.",
} as const;

/* ------------------------------------------------------------- demo dataset */

/** Whole days from `TODAY` to an ISO date. Negative once the date has passed. */
const daysLeftFrom = (iso: string | null): number | null =>
  iso === null ? null : -daysSince(iso);

const seedEmployee = (id: string) => EMPLOYEES.find((e) => e.id === id);

type SeedRequest = {
  id: string;
  employeeId: string;
  name: string;
  category: DocumentCategory;
  reason: string | null;
  dueOn: string | null;
  status: ApiDocumentRequest["status"];
  requestedById: string;
  requestedAt: string;
  documentId?: string;
  fulfilledAt?: string;
  waivedAt?: string;
  waivedReason?: string;
};

/**
 * The seeded chase list.
 *
 * Sized so the screen shows what it is for on first load: one late, two inside
 * the thirty-day window, one further out, one answered and one dropped. Dates
 * are relative to `TODAY` (19 Aug 2026), so the demo does not decay.
 */
const SEED_REQUESTS: SeedRequest[] = DEMO_ENABLED ? [
  {
    id: "dr-01",
    employeeId: "p-01",
    name: "Work permit",
    category: "IDENTIFICATION",
    reason: "Renewal for the Lagos office.",
    dueOn: "2026-08-31",
    status: "OPEN",
    requestedById: "p-05",
    requestedAt: "2026-08-04T09:12:00.000Z",
  },
  {
    id: "dr-02",
    employeeId: "p-03",
    name: "NYSC certificate",
    category: "CERTIFICATE",
    reason: "Missing from the file since he joined.",
    dueOn: "2026-08-14",
    status: "OPEN",
    requestedById: "p-05",
    requestedAt: "2026-07-28T11:40:00.000Z",
  },
  {
    id: "dr-03",
    employeeId: "p-06",
    name: "Signed contract",
    category: "CONTRACT",
    reason: "We have the draft, not the signed copy.",
    dueOn: "2026-08-24",
    status: "OPEN",
    requestedById: "p-05",
    requestedAt: "2026-08-10T08:05:00.000Z",
  },
  {
    id: "dr-04",
    employeeId: "p-08",
    name: "Degree certificate",
    category: "CERTIFICATE",
    reason: null,
    dueOn: "2026-09-30",
    status: "OPEN",
    requestedById: "p-05",
    requestedAt: "2026-08-12T15:22:00.000Z",
  },
  {
    id: "dr-05",
    employeeId: "p-04",
    name: "Medical report",
    category: "MEDICAL",
    reason: "Company health cover.",
    dueOn: "2026-08-10",
    status: "FULFILLED",
    requestedById: "p-05",
    requestedAt: "2026-07-20T10:00:00.000Z",
    documentId: "dd-05",
    fulfilledAt: "2026-08-08T13:30:00.000Z",
  },
  {
    id: "dr-06",
    employeeId: "p-07",
    name: "Driver’s licence",
    category: "IDENTIFICATION",
    reason: "For the company vehicle.",
    dueOn: "2026-08-05",
    status: "WAIVED",
    requestedById: "p-05",
    requestedAt: "2026-07-15T09:00:00.000Z",
    waivedAt: "2026-08-06T09:15:00.000Z",
    waivedReason: "He no longer drives the company vehicle.",
  },
] : [];

function demoRequest(seed: SeedRequest): ApiDocumentRequest {
  const employee = seedEmployee(seed.employeeId);
  const requester = seedEmployee(seed.requestedById);
  const daysLeft = daysLeftFrom(seed.dueOn);
  return {
    id: seed.id,
    employeeId: seed.employeeId,
    employeeName: employee
      ? `${employee.firstName} ${employee.lastName}`
      : "Unknown",
    employeeNo: employee?.employeeNo ?? "",
    name: seed.name,
    category: seed.category,
    reason: seed.reason,
    dueOn: seed.dueOn,
    daysLeft,
    overdue: seed.status === "OPEN" && daysLeft !== null && daysLeft < 0,
    status: seed.status,
    requestedById: seed.requestedById,
    requestedByName: requester
      ? `${requester.firstName} ${requester.lastName}`
      : null,
    requestedAt: seed.requestedAt,
    documentId: seed.documentId ?? null,
    fulfilledAt: seed.fulfilledAt ?? null,
    waivedAt: seed.waivedAt ?? null,
    waivedReason: seed.waivedReason ?? null,
  };
}

type SeedDocument = {
  id: string;
  employeeId: string;
  name: string;
  category: DocumentCategory;
  uploadedAt: string;
  verified: boolean;
  archived?: boolean;
  fulfilsRequestId?: string;
  sizeBytes?: number;
};

const SEED_DOCUMENTS: SeedDocument[] = DEMO_ENABLED ? [
  { id: "dd-01", employeeId: "p-01", name: "Employment contract", category: "CONTRACT", uploadedAt: "2022-03-14T10:00:00.000Z", verified: true, sizeBytes: 412_880 },
  { id: "dd-02", employeeId: "p-01", name: "International passport", category: "IDENTIFICATION", uploadedAt: "2024-02-02T14:20:00.000Z", verified: true, sizeBytes: 1_204_112 },
  { id: "dd-03", employeeId: "p-01", name: "Employment contract (2021)", category: "CONTRACT", uploadedAt: "2021-08-01T10:00:00.000Z", verified: true, archived: true, sizeBytes: 388_210 },
  { id: "dd-04", employeeId: "p-03", name: "Employment contract", category: "CONTRACT", uploadedAt: "2023-06-12T09:30:00.000Z", verified: true, sizeBytes: 401_998 },
  { id: "dd-05", employeeId: "p-04", name: "Medical report", category: "MEDICAL", uploadedAt: "2026-08-08T13:30:00.000Z", verified: true, fulfilsRequestId: "dr-05", sizeBytes: 902_144 },
  { id: "dd-06", employeeId: "p-06", name: "Employment contract", category: "CONTRACT", uploadedAt: "2023-11-06T11:00:00.000Z", verified: true, sizeBytes: 396_204 },
  { id: "dd-07", employeeId: "p-06", name: "NIN slip", category: "IDENTIFICATION", uploadedAt: "2023-11-06T11:04:00.000Z", verified: false, sizeBytes: 210_880 },
] : [];

function demoDocument(seed: SeedDocument): ApiDocument {
  return {
    id: seed.id,
    employeeId: seed.employeeId,
    name: seed.name,
    category: seed.category,
    /* A key, never a URL — the same rule the API enforces. */
    storageKey: `demo/${seed.employeeId}/${seed.id}`,
    sizeBytes: seed.sizeBytes ?? null,
    mimeType: "application/pdf",
    verified: seed.verified,
    verifiedAt: seed.verified ? seed.uploadedAt : null,
    uploadedAt: seed.uploadedAt,
    archived: seed.archived === true,
    fulfilsRequestId: seed.fulfilsRequestId ?? null,
  };
}

function demoFile(employeeId: string, includeArchived: boolean): ApiEmployeeFile {
  const employee = seedEmployee(employeeId);
  const documents = SEED_DOCUMENTS.filter(
    (d) => d.employeeId === employeeId && (includeArchived || d.archived !== true),
  ).map(demoDocument);
  return {
    employeeId,
    employeeName: employee
      ? `${employee.firstName} ${employee.lastName}`
      : "Unknown",
    employeeNo: employee?.employeeNo ?? "",
    documents,
    outstandingRequests: SEED_REQUESTS.filter(
      (r) => r.employeeId === employeeId && r.status === "OPEN",
    ).map(demoRequest),
  };
}

/** The demo's compliance sweep, with the same window arithmetic the API uses. */
function demoExpiring(days: number): ApiExpiring {
  const open = SEED_REQUESTS.filter(
    (r) => r.status === "OPEN" && r.dueOn !== null,
  ).map(demoRequest);
  const inWindow = open.filter((r) => (r.daysLeft ?? Infinity) <= days);
  const rows: ApiComplianceRow[] = inWindow
    .map((r) => ({
      kind: "REQUEST" as const,
      requestId: r.id,
      documentId: r.documentId,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      employeeNo: r.employeeNo,
      name: r.name,
      category: r.category,
      dueOn: r.dueOn ?? TODAY,
      daysLeft: r.daysLeft ?? 0,
      overdue: (r.daysLeft ?? 0) < 0,
    }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const overdue = rows.filter((r) => r.overdue).length;
  return {
    windowDays: days,
    asOf: TODAY,
    until: new Date(new Date(TODAY).getTime() + days * 86_400_000)
      .toISOString()
      .slice(0, 10),
    counts: { overdue, dueSoon: rows.length - overdue, total: rows.length },
    rows,
    note: "Renewal dates on the documents themselves are not recorded yet, so this is what has been asked for and not received.",
  };
}

/* ------------------------------------------------------------- the register */

type RegisterState = {
  requests: ApiDocumentRequest[];
  total: number;
  loading: boolean;
  error: ApiError | null;
  /** False in demo mode: the list is seeded and every write refuses. */
  editable: boolean;
};

/**
 * The HR register: who owes what.
 *
 * Needs `EDIT_RECORDS` on the API. The screen gates the controls too — see
 * `lib/permissions.ts` — so this hook does not check: a 403 that never reaches
 * the interface is a nicer failure than a hook that silently returns nothing.
 */
export function useDocumentRegister(params: RequestListParams = {}) {
  const { isConnected, can } = useSession();

  /**
   * The register is `EDIT_RECORDS` — `modules/documents/router.ts` puts it on
   * the route, and `/people/documents` already renders the self-service variant
   * ("your own documents are on your documents page") to anybody without it.
   *
   * It asked anyway. So four of the six seeded roles opened that screen, saw the
   * right thing, and fired two requests behind it that could only ever come back
   * 403 — two red console lines on a screen that had already decided correctly
   * what to show. `mayRead` is a boolean, so it is safe in a dependency array;
   * `can` itself never is (see `store/grades.ts` for what that costs).
   */
  const mayRead = can("EDIT_RECORDS");

  const [state, setState] = useState<RegisterState>(() =>
    isConnected
      ? { requests: [], total: 0, loading: true, error: null, editable: true }
      : { requests: [], total: 0, loading: false, error: null, editable: false },
  );

  /* Serialised so the effect re-runs on a value change, not on every render. */
  const key = JSON.stringify(params);
  /* A search box types faster than a network answers: a slow response for an
     old query must not overwrite a fast one for the new query. */
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (isConnected && !mayRead) return;
    const parsed = JSON.parse(key) as RequestListParams;

    if (!isConnected) {
      const rows = SEED_REQUESTS.map(demoRequest)
        .filter((r) => (parsed.status ? r.status === parsed.status : true))
        .filter((r) => (parsed.overdue ? r.overdue : true))
        .filter((r) =>
          parsed.employeeId ? r.employeeId === parsed.employeeId : true,
        )
        .filter((r) =>
          parsed.q ? r.name.toLowerCase().includes(parsed.q.toLowerCase()) : true,
        )
        .sort((a, b) =>
          parsed.sort === "name"
            ? a.name.localeCompare(b.name)
            : (a.daysLeft ?? 9_999) - (b.daysLeft ?? 9_999),
        );
      setState({
        requests: rows,
        total: rows.length,
        loading: false,
        error: null,
        editable: false,
      });
      return;
    }

    const ticket = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await documentsApi.requests(parsed);
      if (ticket !== latest.current) return;
      setState({
        requests: result.data,
        total: result.meta.total,
        loading: false,
        error: null,
        editable: true,
      });
    } catch (error) {
      if (ticket !== latest.current) return;
      setState((s) => ({
        ...s,
        loading: false,
        error: error instanceof ApiError ? error : null,
      }));
    }
  }, [isConnected, key, mayRead]);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    void load();
  }, [load, revalidation]);

  /** How many different people are on the hook. The headline the screen leads with. */
  const peopleWaitingOn = useMemo(
    () =>
      new Set(
        state.requests.filter((r) => r.status === "OPEN").map((r) => r.employeeId),
      ).size,
    [state.requests],
  );

  return {
    ...state,
    /* Never loading for a reader who is not allowed to read it: nothing is in
       flight and nothing will be. Empty, not an error — nothing went wrong. */
    ...(isConnected && !mayRead ? { loading: false, editable: false } : {}),
    peopleWaitingOn,
    reload: load,
    ask: useCallback(
      async (body: CreateRequestBody): Promise<ApiCreatedRequest> => {
        if (!isConnected) refuse(OFFLINE.ask);
        const created = await documentsApi.createRequest(body);
        await load();
        return created;
      },
      [isConnected, load],
    ),
    waive: useCallback(
      async (id: string, reason: string) => {
        if (!isConnected) refuse(OFFLINE.waive);
        const waived = await documentsApi.waive(id, reason);
        await load();
        return waived;
      },
      [isConnected, load],
    ),
    remind: useCallback(
      async (id: string) => {
        if (!isConnected) refuse(OFFLINE.remind);
        return documentsApi.remind(id);
      },
      [isConnected],
    ),
    fulfil: useCallback(
      async (id: string, body: FulfilBody) => {
        if (!isConnected) refuse(OFFLINE.attach);
        const done = await documentsApi.fulfil(id, body);
        await load();
        return done;
      },
      [isConnected, load],
    ),
  };
}

/* ------------------------------------------------------- the compliance list */

type ExpiringState = {
  data: ApiExpiring | null;
  loading: boolean;
  error: ApiError | null;
};

/**
 * What is about to become a gap.
 *
 * The response's `note` is part of the payload and the screen shows it: today
 * this list covers documents asked for and not received, because
 * `EmployeeDocument` has no expiry column yet. Rows already carry `kind`, so
 * when it lands, renewal dates appear here with no change on this side.
 */
export function useExpiringDocuments(days = 30) {
  const { isConnected, can } = useSession();
  /* Same gate, same reason, same screen — see `useDocumentRegister` above. */
  const mayRead = can("EDIT_RECORDS");
  const [state, setState] = useState<ExpiringState>(() =>
    isConnected
      ? { data: null, loading: true, error: null }
      : { data: demoExpiring(days), loading: false, error: null },
  );

  const load = useCallback(async () => {
    if (!isConnected) {
      setState({ data: demoExpiring(days), loading: false, error: null });
      return;
    }
    if (!mayRead) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await documentsApi.expiring(days);
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState((s) => ({
        ...s,
        loading: false,
        error: error instanceof ApiError ? error : null,
      }));
    }
  }, [isConnected, days, mayRead]);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    void load();
  }, [load, revalidation]);

  return {
    rows: state.data?.rows ?? [],
    counts: state.data?.counts ?? { overdue: 0, dueSoon: 0, total: 0 },
    windowDays: state.data?.windowDays ?? days,
    /* The honest line about what this list covers. Rendered, not swallowed. */
    note: state.data?.note ?? null,
    loading: state.loading,
    error: state.error,
    reload: load,
  };
}

/* ----------------------------------------------------------------- one file */

type FileState = {
  file: ApiEmployeeFile | null;
  loading: boolean;
  error: ApiError | null;
};

/**
 * One person's file: what is held, and what is outstanding.
 *
 * `employeeId` may be `null` — the drawer this feeds is closed most of the time
 * — and the result is keyed by the id it belongs to, so a slow answer for the
 * person you have navigated away from cannot be shown, and there is nothing to
 * clear when the id changes. Clearing it in an effect would be a synchronous
 * setState, which cascades a render.
 */
export function useEmployeeFile(
  employeeId: string | null,
  includeArchived = false,
) {
  const { isConnected } = useSession();
  const [fetched, setFetched] = useState<{
    id: string;
    archived: boolean;
    state: FileState;
  } | null>(null);

  const load = useCallback(
    async (id: string) => {
      if (!isConnected) {
        setFetched({
          id,
          archived: includeArchived,
          state: {
            file: demoFile(id, includeArchived),
            loading: false,
            error: null,
          },
        });
        return;
      }
      try {
        const file = await documentsApi.file(id, includeArchived);
        setFetched({
          id,
          archived: includeArchived,
          state: { file, loading: false, error: null },
        });
      } catch (error) {
        setFetched({
          id,
          archived: includeArchived,
          state: {
            file: null,
            loading: false,
            error: error instanceof ApiError ? error : null,
          },
        });
      }
    },
    [isConnected, includeArchived],
  );

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    if (employeeId === null) return;
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await load(employeeId);
    })();
    return () => {
      cancelled = true;
    };
  }, [employeeId, load, revalidation]);

  const matched =
    employeeId !== null &&
    fetched !== null &&
    fetched.id === employeeId &&
    fetched.archived === includeArchived;

  return {
    file: matched ? fetched.state.file : null,
    error: matched ? fetched.state.error : null,
    /* Derived: we are loading exactly while an active id has no matching
       result, which is true from the moment the id changes. */
    loading: employeeId !== null && !matched,
    editable: isConnected,
    reload: useCallback(async () => {
      if (employeeId !== null) await load(employeeId);
    }, [employeeId, load]),
    add: useCallback(
      async (body: AddDocumentBody) => {
        if (employeeId === null) refuse("Pick somebody first.");
        if (!isConnected) refuse(OFFLINE.attach);
        const added = await documentsApi.add(employeeId, body);
        await load(employeeId);
        return added;
      },
      [employeeId, isConnected, load],
    ),
    remind: useCallback(
      async (id: string) => {
        if (!isConnected) refuse(OFFLINE.remind);
        return documentsApi.remind(id);
      },
      [isConnected],
    ),
    fulfil: useCallback(
      async (requestId: string, body: FulfilBody) => {
        if (!isConnected) refuse(OFFLINE.attach);
        const done = await documentsApi.fulfil(requestId, body);
        if (employeeId !== null) await load(employeeId);
        return done;
      },
      [employeeId, isConnected, load],
    ),
    waive: useCallback(
      async (requestId: string, reason: string) => {
        if (!isConnected) refuse(OFFLINE.waive);
        const waived = await documentsApi.waive(requestId, reason);
        if (employeeId !== null) await load(employeeId);
        return waived;
      },
      [employeeId, isConnected, load],
    ),
    remove: useCallback(
      async (documentId: string) => {
        if (!isConnected) refuse(OFFLINE.remove);
        const result = await documentsApi.archive(documentId);
        if (employeeId !== null) await load(employeeId);
        return result;
      },
      [employeeId, isConnected, load],
    ),
    /** HR confirms it is what it claims to be. Always HR's action, never the subject's own. */
    verify: useCallback(
      async (documentId: string) => {
        if (!isConnected) refuse(OFFLINE.verify);
        const result = await documentsApi.verify(documentId);
        if (employeeId !== null) await load(employeeId);
        return result;
      },
      [employeeId, isConnected, load],
    ),
  };
}

/* -------------------------------------------------------------- my own file */

type MineState = {
  requests: ApiDocumentRequest[];
  file: ApiEmployeeFile | null;
  error: ApiError | null;
  /**
   * False when this sign-in has no staff record. The API answers 422 and says
   * so; there is nothing useful to render, and inventing an empty file would
   * suggest the company holds nothing rather than that nobody linked the
   * account.
   */
  linked: boolean;
};

const EMPTY_MINE: MineState = {
  requests: [],
  file: null,
  error: null,
  linked: true,
};

/**
 * What the company holds about me, and what it is asking me for.
 *
 * Two requests, because the API keeps them apart on purpose: `/me/requests`
 * never takes an employee id, so there is nothing in it to tamper with, and
 * `/employees/:me` is the ordinary file route answering for the caller.
 * Reading your own file is deliberately **not** audited — logging somebody
 * opening their own passport scan answers no question anybody asks.
 *
 * The result is keyed by mode-and-person and `loading` is **derived** from
 * whether the key matches. Two things fall out of that: signing in as somebody
 * else cannot show the previous person's file for a frame, and the effect never
 * calls `setState` synchronously, which is an error in this repo rather than a
 * warning.
 */
export function useMyDocuments() {
  const { isConnected, employeeId } = useSession();

  const key = `${isConnected ? "api" : "demo"}:${employeeId ?? "-"}`;
  const [loaded, setLoaded] = useState<{ key: string; state: MineState } | null>(
    null,
  );

  const resolve = useCallback(async (): Promise<MineState> => {
    if (!isConnected) {
      /* The demo's signed-in employee, so the seeded outstanding request is
         somebody's. `store/session.ts` picks the same person. */
      const id = employeeId ?? "p-06";
      return {
        requests: SEED_REQUESTS.filter((r) => r.employeeId === id).map(demoRequest),
        file: demoFile(id, false),
        error: null,
        linked: true,
      };
    }
    if (employeeId === null) {
      return { requests: [], file: null, error: null, linked: false };
    }
    try {
      const [requests, file] = await Promise.all([
        documentsApi.myRequests({ pageSize: 50 }),
        documentsApi.file(employeeId),
      ]);
      return { requests: requests.data, file, error: null, linked: true };
    } catch (error) {
      const api = error instanceof ApiError ? error : null;
      return {
        requests: [],
        file: null,
        error: api?.status === 422 ? null : api,
        linked: api?.status !== 422,
      };
    }
  }, [isConnected, employeeId]);

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const state = await resolve();
      if (!cancelled) setLoaded({ key, state });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, resolve, revalidation]);

  const load = useCallback(async () => {
    const state = await resolve();
    setLoaded({ key, state });
  }, [key, resolve]);

  const matched = loaded !== null && loaded.key === key;
  const state = matched ? loaded.state : EMPTY_MINE;

  const outstanding = useMemo(
    () => state.requests.filter((r) => r.status === "OPEN"),
    [state.requests],
  );
  /* Answered or dropped — worth showing, because "did they get it?" is the
     question somebody opens this screen to settle. */
  const settled = useMemo(
    () => state.requests.filter((r) => r.status !== "OPEN"),
    [state.requests],
  );

  return {
    ...state,
    loading: !matched,
    outstanding,
    settled,
    documents: state.file?.documents ?? [],
    editable: isConnected,
    reload: load,
    attach: useCallback(
      async (requestId: string, body: FulfilBody) => {
        if (!isConnected) refuse(OFFLINE.attach);
        const done = await documentsApi.fulfil(requestId, body);
        await load();
        return done;
      },
      [isConnected, load],
    ),
    add: useCallback(
      async (body: AddDocumentBody) => {
        if (!isConnected) refuse(OFFLINE.attach);
        if (employeeId === null) refuse("This sign-in has no staff record.");
        const added = await documentsApi.add(employeeId, body);
        await load();
        return added;
      },
      [employeeId, isConnected, load],
    ),
  };
}
