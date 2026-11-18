"use client";

import { request, requestPaged, type PageMeta } from "@/lib/api/client";
import { fetchBinary } from "@/lib/api/download";

/**
 * Queries: `/api/v1/queries`.
 *
 * A query is the employer's written request that one named person explain something by a stated
 * time, and the person's one written reply. It is its own record, beside Conduct and apart from
 * the help desk. Read `docs/backend/queries-stage1-handover.md` in `approvehr-backend` for the
 * routes; this file is the wire layer and the words, and **nothing here works out a rule**.
 *
 * ## Rules this side must never break
 *
 * - **A query changes no pay, no status and no exit.** Nothing here reaches payroll, offboarding or
 *   an employee's status, and an outcome of `WARNING` or `HEARING` is recorded and performed by
 *   nothing.
 * - **Silence is not a finding.** "No reply by 5:00 pm" is a fact about a clock. The API writes
 *   that sentence (`replyStateLabel`) and this side shows it as it comes: never "refused",
 *   "ignored" or "failed to reply", and never in a danger colour.
 * - **Nothing about a letter leaves the letter.** A notification, an email, a toast and the
 *   profile entry carry no word of the subject line or the allegation. The server writes the
 *   notifications; this side writes toasts, and every toast here is about an act, never a subject.
 * - **Absent is not zero.** Every field below is read as the API sent it. A field the server does
 *   not send is `null` or an empty list that draws nothing, never a claim: `can` absent offers no
 *   button, `reply` absent shows no reply (not an empty one), `outcome` absent shows none.
 * - **Draw the buttons from `can`.** It is computed by the same rules the guards enforce, the
 *   maker/checker rule included, so a screen never offers what the API will refuse.
 */

export type QueryStatus =
  "DRAFT" | "ISSUED" | "REPLIED" | "CLOSED" | "WITHDRAWN";
export type QueryReplyState =
  | "not_served"
  | "withdrawn"
  | "waiting"
  | "no_reply_by_deadline"
  | "replied_on_time"
  | "replied_late"
  | "closed_without_reply";
export type QueryServedHow = "IN_PRODUCT" | "IN_PERSON" | "OUTSIDE_PRODUCT";
export type QueryOutcome =
  "NO_FURTHER_ACTION" | "WARNING" | "HEARING" | "OTHER";
export type QueryFileRole = "LETTER" | "REPLY";
export type QueryRegisterState =
  | "draft"
  | "awaiting_reply"
  | "no_reply_by_deadline"
  | "replied"
  | "closed"
  | "withdrawn";

export type ApiQuerySubject = {
  id: string;
  name: string;
  employeeNo: string;
};

/** A row of the register or of "mine". No body text beyond the subject line. */
export type ApiQuerySummary = {
  id: string;
  reference: string | null;
  status: QueryStatus;
  archived: boolean;
  subject: ApiQuerySubject;
  subjectLine: string;
  replyBy: string | null;
  replyState: QueryReplyState;
  /** The API's own sentence: "No reply by 14 Nov 2026, 5:00 pm." Say this; do not write your own. */
  replyStateLabel: string;
  issuedAt: string | null;
  openedAt: string | null;
  receiptConfirmedAt: string | null;
  outcome: QueryOutcome | null;
  updatedAt: string;
};

export type ApiQueryFile = {
  id: string;
  role: QueryFileRole;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
};

export type ApiQueryEvent = {
  kind: string;
  at: string;
  /** Ids and counts, never text. Not read here. */
  detail?: unknown;
};

export type ApiQueryExtension = {
  previousReplyBy: string;
  newReplyBy: string;
  reason: string;
  createdAt: string;
};

export type ApiQueryReply = {
  body: string;
  source: "IN_PRODUCT" | "FROM_PAPER";
  sent: boolean;
  sentAt: string | null;
  receivedOn: string | null;
  enteredByName: string | null;
  replyHash: string | null;
};

export type ApiQueryServed = {
  how: QueryServedHow | null;
  at: string | null;
  handedByName: string | null;
  witnessName: string | null;
  /** A recorded fact, never a verdict. */
  refusedToReceive: boolean;
  note: string | null;
  subjectHadSignIn: boolean | null;
  /** Staff only. `null` for the person, and `null` before there is an answer. */
  subjectHasSignInNow: boolean | null;
  /** Served "in the product" and nobody was told there: said plainly. */
  nobodyToldInProduct: boolean;
};

export type ApiQueryCan = {
  edit: boolean;
  issue: boolean;
  confirmReceipt: boolean;
  reply: boolean;
  enterPaperReply: boolean;
  extend: boolean;
  decide: boolean;
  withdraw: boolean;
  archive: boolean;
};

/** Everything false: what a server that sends no `can` is read as, so nothing is offered. */
export const CAN_NOTHING: ApiQueryCan = {
  edit: false,
  issue: false,
  confirmReceipt: false,
  reply: false,
  enterPaperReply: false,
  extend: false,
  decide: false,
  withdraw: false,
  archive: false,
};

export type ApiQueryDetail = {
  id: string;
  reference: string | null;
  status: QueryStatus;
  archived: boolean;
  subject: ApiQuerySubject;
  subjectLine: string;
  whatHappened: string;
  rulesRelied: string | null;
  incidentOn: string | null;
  incidentUntil: string | null;
  question: string;
  replyBy: string | null;
  replyState: QueryReplyState | null;
  replyStateLabel: string | null;
  served: ApiQueryServed;
  issuedBy: string | null;
  /** Staff only. Absent for the person. */
  issuedById: string | null;
  issuedAt: string | null;
  letterHash: string | null;
  openedAt: string | null;
  receiptConfirmedAt: string | null;
  /** `null` when there is none, or when the reader may not see it. Never an empty reply. */
  reply: ApiQueryReply | null;
  extensions: ApiQueryExtension[];
  outcome: {
    outcome: QueryOutcome;
    reasons: string;
    decidedByName: string | null;
    decidedAt: string | null;
  } | null;
  withdrawn: { reason: string | null; at: string | null } | null;
  files: ApiQueryFile[];
  events: ApiQueryEvent[];
  /** A draft, for staff: "This gives 6 hours to reply …". Nothing blocks. */
  warnings: { code: string; message: string }[];
  can: ApiQueryCan;
};

export type ApiQuerySettings = {
  replyHours: number;
  warnHours: number;
  issuerMayDecideIfSole: boolean;
  retention: "archive_only" | null;
};

export type RegisterParams = {
  state?: QueryRegisterState;
  subjectId?: string;
  q?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
};

export type LetterBody = {
  subjectLine?: string;
  whatHappened?: string;
  rulesRelied?: string | null;
  incidentOn?: string | null;
  incidentUntil?: string | null;
  question?: string;
  replyBy?: string;
  servedHow?: QueryServedHow;
  servedAt?: string | null;
  servedHandedByName?: string | null;
  servedWitnessName?: string | null;
  servedRefusedToReceive?: boolean;
  servedNote?: string | null;
};

export type IssueResult = {
  detail: ApiQueryDetail;
  warnings: { code: string; message: string }[];
  subjectHasSignIn: boolean | null;
  toldInProduct: boolean | null;
  nobodyToldInProduct: boolean | null;
};

/* ----------------------------------------------------------------- limits and words */

/** The server's own bounds. It still refuses, and its sentence is what is shown if they drift. */
export const QUERY_LIMITS = {
  subjectLine: { min: 5, max: 150 },
  whatHappened: { min: 20, max: 5000 },
  rulesRelied: { max: 1000 },
  question: { min: 10, max: 2000 },
  servedNote: { max: 300 },
  personName: { min: 2, max: 120 },
  reply: { max: 10_000 },
  extendReason: { min: 5, max: 500 },
  outcomeReasons: { min: 10, max: 4000 },
  withdrawReason: { min: 5, max: 500 },
  /** Files per side (the letter, the reply), and the size of each. */
  filesPerSide: 10,
  fileBytes: 10 * 1024 * 1024,
} as const;

/** Said before the Send button, as text on the page. The server has no route that edits a sent reply. */
export const ONCE_SENT =
  "Once sent, a reply cannot be changed. Read it through first.";

/** Said wherever a person may confirm receipt. Receipt is not agreement. */
export const RECEIPT_IS_NOT_AGREEMENT =
  "Confirming that you received it is not agreeing with it, and nothing waits on it: you can reply without confirming.";

/** What a query never does. One sentence, written once, and shown where a letter is read. */
export const QUERY_CHANGES_NOTHING =
  "A query changes no pay, no employment status and no exit. Whatever follows it is a separate decision, made by a person.";

export const STATUS_LABEL: Record<QueryStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  REPLIED: "Replied",
  CLOSED: "Closed",
  WITHDRAWN: "Withdrawn",
};

/**
 * What the badge says for a reply state, or `null` where the status already says it.
 *
 * "No reply in time" is the only state worked out rather than stored, and it is a label about a
 * clock. It is never "refused" or "overdue" (a missing reply can be a missed notification, leave
 * or a phone with no data), and its tone is never danger.
 */
export function replyBadgeText(state: QueryReplyState | null): string | null {
  switch (state) {
    case "no_reply_by_deadline":
      return "No reply in time";
    case "replied_late":
      return "Replied late";
    case "closed_without_reply":
      return "Closed without a reply";
    case "waiting":
      return "Waiting for a reply";
    default:
      return null;
  }
}

export const SERVED_HOW_LABEL: Record<QueryServedHow, string> = {
  IN_PRODUCT: "In the product",
  IN_PERSON: "In person",
  OUTSIDE_PRODUCT: "Outside the product",
};

export const SERVED_HOW_HELP: Record<QueryServedHow, string> = {
  IN_PRODUCT:
    "They are told in the product and can read and answer it there. Somebody with no sign-in cannot be told this way.",
  IN_PERSON:
    "You hand it over on paper and record when and by whom. Nobody is told in the product.",
  OUTSIDE_PRODUCT:
    "Sent some other way, by post or email. Nobody is told in the product.",
};

export const OUTCOME_LABEL: Record<QueryOutcome, string> = {
  NO_FURTHER_ACTION: "No further action",
  WARNING: "A warning",
  HEARING: "A hearing",
  OTHER: "Something else",
};

/** What recording each outcome does, which is the same in every case: nothing beyond the record. */
export const OUTCOME_HELP: Record<QueryOutcome, string> = {
  NO_FURTHER_ACTION: "The matter ends here.",
  WARNING:
    "Recorded, and nothing more: no warning is issued from here. If one is to be given, that is done where warnings are recorded.",
  HEARING:
    "Recorded, and nothing more: no hearing is arranged from here. Arranging one is a separate act.",
  OTHER: "Say what it is in the reasons.",
};

export const REGISTER_STATE_LABEL: Record<QueryRegisterState, string> = {
  draft: "Drafts",
  awaiting_reply: "Waiting for a reply",
  no_reply_by_deadline: "No reply in time",
  replied: "Replied",
  closed: "Closed",
  withdrawn: "Withdrawn",
};

/** An event kind in words. Unknown kinds are not shown (a server a deploy ahead may add some). */
export const EVENT_LABEL: Record<string, string> = {
  DRAFTED: "Draft started",
  ISSUED: "Issued",
  OPENED: "Opened by the person",
  RECEIPT_CONFIRMED: "Receipt confirmed by the person",
  REPLY_SENT: "Reply sent",
  REPLY_ENTERED_FROM_PAPER: "Reply entered from paper",
  DEADLINE_EXTENDED: "Reply-by time extended",
  OUTCOME_RECORDED: "Outcome recorded",
  WITHDRAWN: "Withdrawn",
  ARCHIVED: "Archived",
};

/** The size of a file in words. Binary megabytes, as the rest of this product prints them. */
export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${bytes} bytes`;
}

/**
 * The longest reply-by gap, and what is left, in words: "1 day 4 hours left", "3 hours left",
 * "Past". Counted from instants (a gap between two moments, not between two calendar days), and
 * `null` for a missing or unreadable one. "Past" is a statement about a clock, not a finding.
 */
export function timeLeft(
  replyBy: string | null | undefined,
  now: Date,
): string | null {
  if (!replyBy) return null;
  const at = new Date(replyBy).getTime();
  if (Number.isNaN(at)) return null;
  const minutes = Math.floor((at - now.getTime()) / 60_000);
  if (minutes <= 0) return "The reply-by time has passed";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) {
    return `${days} ${days === 1 ? "day" : "days"}${hours > 0 ? ` ${hours} ${hours === 1 ? "hour" : "hours"}` : ""} left`;
  }
  if (hours > 0) return `${hours} ${hours === 1 ? "hour" : "hours"} left`;
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"} left`;
}

/* ------------------------------------------------------------------------ reading */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
const bool = (value: unknown): boolean => value === true;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

function toCan(value: unknown): ApiQueryCan {
  if (!isRecord(value)) return CAN_NOTHING;
  return {
    edit: bool(value["edit"]),
    issue: bool(value["issue"]),
    confirmReceipt: bool(value["confirmReceipt"]),
    reply: bool(value["reply"]),
    enterPaperReply: bool(value["enterPaperReply"]),
    extend: bool(value["extend"]),
    decide: bool(value["decide"]),
    withdraw: bool(value["withdraw"]),
    archive: bool(value["archive"]),
  };
}

function toSubject(value: unknown): ApiQuerySubject {
  const raw = isRecord(value) ? value : {};
  return {
    id: text(raw["id"]) ?? "",
    name: text(raw["name"]) ?? "",
    employeeNo: text(raw["employeeNo"]) ?? "",
  };
}

/**
 * A detail as the API sent it, with nothing invented.
 *
 * `can` that is not an object offers nothing; a list that is not a list is empty (and every list
 * here draws nothing when empty); a reply that is not an object is `null`, never an empty reply.
 * Exported so the tests can feed it the shapes a server one deploy behind would send.
 */
export function toDetail(raw: unknown): ApiQueryDetail {
  const r = isRecord(raw) ? raw : {};
  const served = isRecord(r["served"]) ? r["served"] : {};
  const reply = isRecord(r["reply"]) ? r["reply"] : null;
  const outcome = isRecord(r["outcome"]) ? r["outcome"] : null;
  const withdrawn = isRecord(r["withdrawn"]) ? r["withdrawn"] : null;
  const how = text(served["how"]);
  return {
    id: text(r["id"]) ?? "",
    reference: text(r["reference"]),
    status: (text(r["status"]) as QueryStatus | null) ?? "DRAFT",
    archived: bool(r["archived"]),
    subject: toSubject(r["subject"]),
    subjectLine: text(r["subjectLine"]) ?? "",
    whatHappened: text(r["whatHappened"]) ?? "",
    rulesRelied: text(r["rulesRelied"]),
    incidentOn: text(r["incidentOn"]),
    incidentUntil: text(r["incidentUntil"]),
    question: text(r["question"]) ?? "",
    replyBy: text(r["replyBy"]),
    replyState: text(r["replyState"]) as QueryReplyState | null,
    replyStateLabel: text(r["replyStateLabel"]),
    served: {
      how:
        how === "IN_PRODUCT" || how === "IN_PERSON" || how === "OUTSIDE_PRODUCT"
          ? how
          : null,
      at: text(served["at"]),
      handedByName: text(served["handedByName"]),
      witnessName: text(served["witnessName"]),
      refusedToReceive: bool(served["refusedToReceive"]),
      note: text(served["note"]),
      subjectHadSignIn:
        typeof served["subjectHadSignIn"] === "boolean"
          ? served["subjectHadSignIn"]
          : null,
      subjectHasSignInNow:
        typeof served["subjectHasSignInNow"] === "boolean"
          ? served["subjectHasSignInNow"]
          : null,
      nobodyToldInProduct: bool(served["nobodyToldInProduct"]),
    },
    issuedBy: text(r["issuedBy"]),
    issuedById: text(r["issuedById"]),
    issuedAt: text(r["issuedAt"]),
    letterHash: text(r["letterHash"]),
    openedAt: text(r["openedAt"]),
    receiptConfirmedAt: text(r["receiptConfirmedAt"]),
    reply: reply
      ? {
          body: text(reply["body"]) ?? "",
          source:
            reply["source"] === "FROM_PAPER" ? "FROM_PAPER" : "IN_PRODUCT",
          sent: bool(reply["sent"]),
          sentAt: text(reply["sentAt"]),
          receivedOn: text(reply["receivedOn"]),
          enteredByName: text(reply["enteredByName"]),
          replyHash: text(reply["replyHash"]),
        }
      : null,
    extensions: list(r["extensions"]).flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const previousReplyBy = text(entry["previousReplyBy"]);
      const newReplyBy = text(entry["newReplyBy"]);
      if (!previousReplyBy || !newReplyBy) return [];
      return [
        {
          previousReplyBy,
          newReplyBy,
          reason: text(entry["reason"]) ?? "",
          createdAt: text(entry["createdAt"]) ?? newReplyBy,
        },
      ];
    }),
    outcome:
      outcome && text(outcome["outcome"])
        ? {
            outcome: text(outcome["outcome"]) as QueryOutcome,
            reasons: text(outcome["reasons"]) ?? "",
            decidedByName: text(outcome["decidedByName"]),
            decidedAt: text(outcome["decidedAt"]),
          }
        : null,
    withdrawn: withdrawn
      ? { reason: text(withdrawn["reason"]), at: text(withdrawn["at"]) }
      : null,
    files: list(r["files"]).flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const id = text(entry["id"]);
      if (!id) return [];
      return [
        {
          id,
          role:
            entry["role"] === "REPLY"
              ? ("REPLY" as const)
              : ("LETTER" as const),
          filename: text(entry["filename"]) ?? "File",
          contentType: text(entry["contentType"]) ?? "",
          sizeBytes:
            typeof entry["sizeBytes"] === "number" ? entry["sizeBytes"] : 0,
          sha256: text(entry["sha256"]) ?? "",
          createdAt: text(entry["createdAt"]) ?? "",
        },
      ];
    }),
    events: list(r["events"]).flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const kind = text(entry["kind"]);
      const at = text(entry["at"]);
      return kind && at ? [{ kind, at }] : [];
    }),
    warnings: list(r["warnings"]).flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const message = text(entry["message"]);
      return message ? [{ code: text(entry["code"]) ?? "", message }] : [];
    }),
    can: toCan(r["can"]),
  };
}

/** A register row, or `null` for something that is not one. */
export function toSummary(raw: unknown): ApiQuerySummary | null {
  if (!isRecord(raw)) return null;
  const id = text(raw["id"]);
  if (!id) return null;
  return {
    id,
    reference: text(raw["reference"]),
    status: (text(raw["status"]) as QueryStatus | null) ?? "DRAFT",
    archived: bool(raw["archived"]),
    subject: toSubject(raw["subject"]),
    subjectLine: text(raw["subjectLine"]) ?? "",
    replyBy: text(raw["replyBy"]),
    replyState:
      (text(raw["replyState"]) as QueryReplyState | null) ?? "waiting",
    replyStateLabel: text(raw["replyStateLabel"]) ?? "",
    issuedAt: text(raw["issuedAt"]),
    openedAt: text(raw["openedAt"]),
    receiptConfirmedAt: text(raw["receiptConfirmedAt"]),
    outcome: text(raw["outcome"]) as QueryOutcome | null,
    updatedAt: text(raw["updatedAt"]) ?? "",
  };
}

export type QueryPage = {
  rows: ApiQuerySummary[];
  meta: PageMeta;
  /** `GET /mine` only: how many wait for the caller's reply. `null` where the server did not say. */
  waiting: number | null;
};

function toPage(page: {
  data: unknown[];
  meta: PageMeta & { waiting?: unknown };
}): QueryPage {
  const waiting = page.meta?.waiting;
  return {
    rows: list(page.data).flatMap((row) => {
      const summary = toSummary(row);
      return summary ? [summary] : [];
    }),
    meta: page.meta,
    waiting: typeof waiting === "number" ? waiting : null,
  };
}

export function toSettings(raw: unknown): ApiQuerySettings | null {
  if (!isRecord(raw)) return null;
  const { replyHours, warnHours, issuerMayDecideIfSole } = raw;
  if (
    typeof replyHours !== "number" ||
    typeof warnHours !== "number" ||
    typeof issuerMayDecideIfSole !== "boolean"
  ) {
    return null;
  }
  return {
    replyHours,
    warnHours,
    issuerMayDecideIfSole,
    retention: raw["retention"] === "archive_only" ? "archive_only" : null,
  };
}

/* --------------------------------------------------------------------------- calls */

const base = "/queries";

export const queriesApi = {
  register: async (
    params: RegisterParams,
    signal?: AbortSignal,
  ): Promise<QueryPage> =>
    toPage(
      await requestPaged<unknown>(base, {
        query: {
          ...(params.state ? { state: params.state } : {}),
          ...(params.subjectId ? { subjectId: params.subjectId } : {}),
          ...(params.q ? { q: params.q } : {}),
          ...(params.includeArchived ? { includeArchived: "true" } : {}),
          page: params.page ?? 1,
          pageSize: params.pageSize ?? 50,
        },
        ...(signal ? { signal } : {}),
      }),
    ),

  mine: async (signal?: AbortSignal): Promise<QueryPage> =>
    toPage(
      await requestPaged<unknown>(`${base}/mine`, {
        query: { page: 1, pageSize: 50 },
        ...(signal ? { signal } : {}),
      }),
    ),

  get: async (id: string, signal?: AbortSignal): Promise<ApiQueryDetail> =>
    toDetail(
      await request<unknown>(`${base}/${id}`, {
        ...(signal ? { signal } : {}),
      }),
    ),

  create: async (
    body: { subjectId: string; subjectLine: string } & LetterBody,
  ): Promise<ApiQueryDetail> =>
    toDetail(await request<unknown>(base, { method: "POST", body })),

  update: async (
    id: string,
    body: LetterBody & { subjectId?: string },
  ): Promise<ApiQueryDetail> =>
    toDetail(
      await request<unknown>(`${base}/${id}`, { method: "PATCH", body }),
    ),

  issue: async (id: string): Promise<IssueResult> => {
    const raw = await request<unknown>(`${base}/${id}/issue`, {
      method: "POST",
    });
    const r = isRecord(raw) ? raw : {};
    const optionalBool = (key: string): boolean | null =>
      typeof r[key] === "boolean" ? (r[key] as boolean) : null;
    return {
      detail: toDetail(r["detail"]),
      warnings: list(r["warnings"]).flatMap((entry) => {
        if (!isRecord(entry)) return [];
        const message = text(entry["message"]);
        return message ? [{ code: text(entry["code"]) ?? "", message }] : [];
      }),
      subjectHasSignIn: optionalBool("subjectHasSignIn"),
      toldInProduct: optionalBool("toldInProduct"),
      nobodyToldInProduct: optionalBool("nobodyToldInProduct"),
    };
  },

  addFile: (
    id: string,
    body: { role: QueryFileRole; filename: string; contentBase64: string },
  ) => request<ApiQueryFile>(`${base}/${id}/files`, { method: "POST", body }),

  removeFile: (id: string, fileId: string) =>
    request<void>(`${base}/${id}/files/${fileId}`, { method: "DELETE" }),

  /**
   * The bytes of one file. Needs the bearer token, so it cannot be a link: it is fetched on a
   * click and nowhere else, and handed to the browser as a download. **Every open is written to
   * the audit trail before anything is served**, so a prefetch or a speculative open would put a
   * look in the record that nobody took.
   */
  fileContent: (id: string, fileId: string) =>
    fetchBinary(`${base}/${id}/files/${fileId}/content`, "letter", "bin"),

  confirmReceipt: async (id: string): Promise<ApiQueryDetail> =>
    toDetail(
      await request<unknown>(`${base}/${id}/receipt`, { method: "POST" }),
    ),

  saveReply: async (id: string, body: string): Promise<ApiQueryDetail> =>
    toDetail(
      await request<unknown>(`${base}/${id}/reply`, {
        method: "PUT",
        body: { body },
      }),
    ),

  sendReply: async (id: string): Promise<ApiQueryDetail> =>
    toDetail(
      await request<unknown>(`${base}/${id}/reply/send`, { method: "POST" }),
    ),

  replyFromPaper: async (
    id: string,
    body: {
      body: string;
      receivedOn: string;
      files?: { filename: string; contentBase64: string }[];
    },
  ): Promise<ApiQueryDetail> =>
    toDetail(
      await request<unknown>(`${base}/${id}/reply/from-paper`, {
        method: "POST",
        body,
      }),
    ),

  extend: async (
    id: string,
    body: { replyBy: string; reason: string },
  ): Promise<ApiQueryDetail> =>
    toDetail(
      await request<unknown>(`${base}/${id}/extend`, { method: "POST", body }),
    ),

  outcome: async (
    id: string,
    body: { outcome: QueryOutcome; reasons: string },
  ): Promise<ApiQueryDetail> =>
    toDetail(
      await request<unknown>(`${base}/${id}/outcome`, {
        method: "POST",
        body,
      }),
    ),

  withdraw: async (
    id: string,
    body: { reason: string },
  ): Promise<ApiQueryDetail> =>
    toDetail(
      await request<unknown>(`${base}/${id}/withdraw`, {
        method: "POST",
        body,
      }),
    ),

  archive: async (id: string): Promise<ApiQueryDetail> =>
    toDetail(
      await request<unknown>(`${base}/${id}/archive`, { method: "POST" }),
    ),

  settings: async (signal?: AbortSignal): Promise<ApiQuerySettings | null> =>
    toSettings(
      await request<unknown>(`${base}/settings`, {
        ...(signal ? { signal } : {}),
      }),
    ),

  updateSettings: async (
    body: Partial<
      Pick<
        ApiQuerySettings,
        "replyHours" | "warnHours" | "issuerMayDecideIfSole"
      >
    >,
  ): Promise<ApiQuerySettings | null> =>
    toSettings(
      await request<unknown>(`${base}/settings`, { method: "PATCH", body }),
    ),
};

/** The names the issue 422 gives for what a letter still needs, or an empty list. */
export function missingFor(error: unknown): string[] {
  const details = (error as { details?: unknown } | null)?.details;
  if (!isRecord(details)) return [];
  return list(details["missing"]).flatMap((entry) =>
    typeof entry === "string" ? [entry] : [],
  );
}

/** Whether a refusal says the module is switched off, from its stable `details.reason`. */
export function isModuleOff(error: unknown): boolean {
  const details = (error as { details?: unknown } | null)?.details;
  return isRecord(details) && details["reason"] === "module_off";
}
