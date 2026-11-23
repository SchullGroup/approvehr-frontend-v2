/**
 * Queries, stages 3 and 4: the wire shapes and the words for what a query is tied to.
 *
 * Read `docs/backend/queries-stage3-4-handover.md` in `approvehr-backend`. This file is the wire
 * layer for citations, leads, documents asked under a query, templates and counts. It does no
 * arithmetic on a figure and works out no rule.
 *
 * ## What every reader here must keep
 *
 * - **A citation is a copy of what a record said, as it stood.** It is shown as that and never as
 *   the record as it is now. A field the copy did not hold is `null` and draws no row: never a
 *   `0`, "none" or "No" made out of an absence.
 * - **Typed text is text.** Nothing here (and nothing in the screens that draw it) is turned into
 *   a link or put through anything but a text node.
 * - **A link is an id.** A lead's link is built from its kind and ids, never from a string the API
 *   sent, and it is drawn only for a lead the server sent.
 * - **A count that is withheld is `null`.** It is never read as 0, and nothing is added up or
 *   subtracted here: there are no totals, by design.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
const flag = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;
const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/* ---------------------------------------------------------------- warnings */

/** A warning about a day, a reply-by time or a short deadline. It never blocks anything. */
export type QueryWarning = {
  code: string;
  /** The server's sentence. Shown as it came. */
  message: string;
  /** `YYYY-MM-DD`, the days the message is about. Empty where the server named none. */
  dates: string[];
};

export function toWarnings(value: unknown): QueryWarning[] {
  return list(value).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const message = text(entry["message"]);
    if (!message) return [];
    return [
      {
        code: text(entry["code"]) ?? "",
        message,
        dates: list(entry["dates"]).flatMap((day) =>
          typeof day === "string" ? [day] : [],
        ),
      },
    ];
  });
}

/** The warnings about a cited or incident day, as against the reply-by time. */
export function isDayWarning(code: string): boolean {
  return code === "cited_day_on_leave" || code === "cited_day_not_rostered";
}

/* --------------------------------------------------------------- citations */

export type CitationKind =
  | "POLICY"
  | "EQUIPMENT"
  | "ATTENDANCE_DAY"
  | "LEAVE_REQUEST"
  | "ROTA_DAY"
  | "DOCUMENT_REQUEST";

export const CITATION_KINDS: readonly CitationKind[] = [
  "POLICY",
  "EQUIPMENT",
  "ATTENDANCE_DAY",
  "LEAVE_REQUEST",
  "ROTA_DAY",
  "DOCUMENT_REQUEST",
];

export const CITATION_KIND_LABEL: Record<CitationKind, string> = {
  POLICY: "A policy",
  EQUIPMENT: "Equipment",
  ATTENDANCE_DAY: "An attendance day",
  LEAVE_REQUEST: "A leave request",
  ROTA_DAY: "A rota day",
  DOCUMENT_REQUEST: "A document request",
};

/** The short word for a kind, on a row. */
export const CITATION_KIND_WORD: Record<CitationKind, string> = {
  POLICY: "Policy",
  EQUIPMENT: "Equipment",
  ATTENDANCE_DAY: "Attendance",
  LEAVE_REQUEST: "Leave",
  ROTA_DAY: "Rota",
  DOCUMENT_REQUEST: "Document",
};

/** What a record said, kind by kind. Every member that can be absent is `null` and draws no row. */
export type AsItStood =
  | {
      kind: "POLICY";
      title: string | null;
      category: string | null;
      version: number | null;
      publishedAt: string | null;
      requiresAcknowledgement: boolean | null;
      withdrawn: boolean | null;
      body: string | null;
      personAcknowledged: boolean | null;
      acknowledgedAt: string | null;
      publishedAfterIncident: boolean | null;
    }
  | {
      kind: "EQUIPMENT";
      item: string | null;
      tag: string | null;
      category: string | null;
      assignedOn: string | null;
      conditionOut: string | null;
      returnedOn: string | null;
      conditionBack: string | null;
      personConfirmedReceipt: boolean | null;
      confirmedAt: string | null;
    }
  | {
      kind: "ATTENDANCE_DAY";
      date: string | null;
      status: string | null;
      clockIn: string | null;
      clockOut: string | null;
      lateByMinutes: number | null;
      earlyByMinutes: number | null;
      source: string | null;
      clockOutFilledBySystem: boolean | null;
      correctedByAdministrator: boolean | null;
      workLocation: string | null;
    }
  | {
      kind: "LEAVE_REQUEST";
      startDate: string | null;
      endDate: string | null;
      days: number | null;
      status: string | null;
    }
  | {
      kind: "ROTA_DAY";
      date: string | null;
      shiftName: string | null;
      startTime: string | null;
      endTime: string | null;
      status: string | null;
    }
  | {
      kind: "DOCUMENT_REQUEST";
      name: string | null;
      category: string | null;
      dueOn: string | null;
      status: string | null;
      requestedAt: string | null;
    };

export type ApiCitation = {
  id: string;
  kind: CitationKind;
  /** One line, written by the server: "Code of conduct, version 3". */
  title: string;
  /** An instant. "As it stood when this letter was issued" once `frozen`. */
  takenAt: string | null;
  /** True from the moment the letter is issued. A draft's copy is a preview. */
  frozen: boolean;
  asItStood: AsItStood;
};

function toKind(value: unknown): CitationKind | null {
  return CITATION_KINDS.find((kind) => kind === value) ?? null;
}

function toAsItStood(kind: CitationKind, raw: unknown): AsItStood {
  const r = isRecord(raw) ? raw : {};
  switch (kind) {
    case "POLICY":
      return {
        kind,
        title: text(r["title"]),
        category: text(r["category"]),
        version: count(r["version"]),
        publishedAt: text(r["publishedAt"]),
        requiresAcknowledgement: flag(r["requiresAcknowledgement"]),
        withdrawn: flag(r["withdrawn"]),
        body: text(r["body"]),
        personAcknowledged: flag(r["personAcknowledged"]),
        acknowledgedAt: text(r["acknowledgedAt"]),
        publishedAfterIncident: flag(r["publishedAfterIncident"]),
      };
    case "EQUIPMENT":
      return {
        kind,
        item: text(r["item"]),
        tag: text(r["tag"]),
        category: text(r["category"]),
        assignedOn: text(r["assignedOn"]),
        conditionOut: text(r["conditionOut"]),
        returnedOn: text(r["returnedOn"]),
        conditionBack: text(r["conditionBack"]),
        personConfirmedReceipt: flag(r["personConfirmedReceipt"]),
        confirmedAt: text(r["confirmedAt"]),
      };
    case "ATTENDANCE_DAY":
      return {
        kind,
        date: text(r["date"]),
        status: text(r["status"]),
        clockIn: text(r["clockIn"]),
        clockOut: text(r["clockOut"]),
        lateByMinutes: count(r["lateByMinutes"]),
        earlyByMinutes: count(r["earlyByMinutes"]),
        source: text(r["source"]),
        clockOutFilledBySystem: flag(r["clockOutFilledBySystem"]),
        correctedByAdministrator: flag(r["correctedByAdministrator"]),
        workLocation: text(r["workLocation"]),
      };
    case "LEAVE_REQUEST":
      return {
        kind,
        startDate: text(r["startDate"]),
        endDate: text(r["endDate"]),
        days: count(r["days"]),
        status: text(r["status"]),
      };
    case "ROTA_DAY": {
      const shift = isRecord(r["shift"]) ? r["shift"] : {};
      return {
        kind,
        date: text(r["date"]),
        shiftName: text(shift["name"]),
        startTime: text(shift["startTime"]),
        endTime: text(shift["endTime"]),
        status: text(r["status"]),
      };
    }
    case "DOCUMENT_REQUEST":
      return {
        kind,
        name: text(r["name"]),
        category: text(r["category"]),
        dueOn: text(r["dueOn"]),
        status: text(r["status"]),
        requestedAt: text(r["requestedAt"]),
      };
  }
}

/** A citation, or `null` for something that is not one (a kind this build does not know is left out). */
export function toCitation(raw: unknown): ApiCitation | null {
  if (!isRecord(raw)) return null;
  const id = text(raw["id"]);
  const kind = toKind(raw["kind"]);
  const title = text(raw["title"]);
  if (!id || !kind || !title) return null;
  return {
    id,
    kind,
    title,
    takenAt: text(raw["takenAt"]),
    frozen: raw["frozen"] === true,
    asItStood: toAsItStood(kind, raw["asItStood"]),
  };
}

export const ATTENDANCE_STATUS_WORD: Record<string, string> = {
  PRESENT: "Present",
  LATE: "Late",
  ABSENT: "Absent",
  ON_LEAVE: "On leave",
  HOLIDAY: "A public holiday",
  REST_DAY: "A rest day",
};

export const ATTENDANCE_SOURCE_WORD: Record<string, string> = {
  SELF: "Clocked by the person themselves",
  ADMIN: "Entered by an administrator",
  IMPORT: "Imported",
  DEVICE: "From a clock-in device",
  SYSTEM: "Filled in by the system",
};

export const LEAVE_STATUS_WORD: Record<string, string> = {
  PENDING: "Waiting for approval",
  AWAITING_HR: "Waiting for HR",
  APPROVED: "Approved",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

export const ROTA_STATUS_WORD: Record<string, string> = {
  SCHEDULED: "Scheduled",
  WORKED: "Worked",
  SWAPPED: "Swapped",
  ABSENT: "Absent",
  CANCELLED: "Cancelled",
};

export const DOCUMENT_REQUEST_STATUS_WORD: Record<string, string> = {
  OPEN: "Still open",
  FULFILLED: "Sent",
  WAIVED: "Waived",
};

/** The body of `POST /queries/:id/citations`. */
export type CiteBody =
  | { kind: "POLICY"; policyId: string }
  | { kind: "EQUIPMENT"; assignmentId: string }
  | { kind: "ATTENDANCE_DAY"; date: string }
  | { kind: "LEAVE_REQUEST"; leaveRequestId: string }
  | { kind: "ROTA_DAY"; date: string }
  | { kind: "DOCUMENT_REQUEST"; documentRequestId: string };

/** The cap the server holds. It still refuses, and its sentence is what is shown if this drifts. */
export const MAX_CITATIONS = 20;

/** A citation just added: the citation, plus the warnings about the day it names. */
export type CitationAdded = { citation: ApiCitation; warnings: QueryWarning[] };

export function toCitationAdded(raw: unknown): CitationAdded | null {
  const citation = toCitation(raw);
  if (!citation) return null;
  const r = isRecord(raw) ? raw : {};
  return { citation, warnings: toWarnings(r["warnings"]) };
}

/* ------------------------------------------------- documents asked for */

export type ApiQueryDocumentRequest = {
  id: string;
  name: string;
  category: string | null;
  dueOn: string | null;
  status: "OPEN" | "FULFILLED" | "WAIVED";
  createdAt: string | null;
  fulfilledAt: string | null;
  waivedAt: string | null;
};

export function toDocumentRequest(raw: unknown): ApiQueryDocumentRequest | null {
  if (!isRecord(raw)) return null;
  const id = text(raw["id"]);
  const name = text(raw["name"]);
  if (!id || !name) return null;
  const status = raw["status"];
  return {
    id,
    name,
    category: text(raw["category"]),
    dueOn: text(raw["dueOn"]),
    status:
      status === "FULFILLED" ? "FULFILLED" : status === "WAIVED" ? "WAIVED" : "OPEN",
    createdAt: text(raw["createdAt"]),
    fulfilledAt: text(raw["fulfilledAt"]),
    waivedAt: text(raw["waivedAt"]),
  };
}

export type AskDocumentBody = {
  name: string;
  category?: string;
  reason?: string;
  dueOn?: string;
};

export type DocumentAsked = {
  requestId: string | null;
  /** False: nobody was told (no sign-in, or the company switched the rule off). Said, never hidden. */
  notifiedPerson: boolean | null;
};

export function toDocumentAsked(raw: unknown): DocumentAsked {
  const r = isRecord(raw) ? raw : {};
  const request = isRecord(r["request"]) ? r["request"] : {};
  return {
    requestId: text(request["id"]),
    notifiedPerson: flag(r["notifiedPerson"]),
  };
}

/** The limits the server holds for a document asked for under a query. */
export const ASK_DOCUMENT_LIMITS = {
  name: { min: 2, max: 120 },
  reason: { max: 300 },
} as const;

/* ------------------------------------------------------------------- leads */

export type LeadKind = "WARNING" | "EMPLOYMENT_CHANGE" | "EXIT";

export type ApiQueryLead = {
  kind: LeadKind;
  id: string;
  /** The warning's level, the change's kind or the exit's kind, as the enum. */
  subKind: string | null;
  /** `YYYY-MM-DD`. */
  date: string | null;
  dateMeans: "recorded" | "effective" | "last_working_day" | null;
};

export function toLead(raw: unknown): ApiQueryLead | null {
  if (!isRecord(raw)) return null;
  const id = text(raw["id"]);
  const kind = raw["kind"];
  if (!id) return null;
  if (kind !== "WARNING" && kind !== "EMPLOYMENT_CHANGE" && kind !== "EXIT")
    return null;
  const means = raw["dateMeans"];
  return {
    kind,
    id,
    subKind: text(raw["subKind"]),
    date: text(raw["date"]),
    dateMeans:
      means === "recorded" || means === "effective" || means === "last_working_day"
        ? means
        : null,
  };
}

export const LEAD_KIND_WORD: Record<LeadKind, string> = {
  WARNING: "A conduct warning",
  EMPLOYMENT_CHANGE: "An employment change",
  EXIT: "An exit",
};

export const LEAD_DATE_WORD: Record<
  NonNullable<ApiQueryLead["dateMeans"]>,
  string
> = {
  recorded: "recorded",
  effective: "takes effect",
  last_working_day: "last working day",
};

/**
 * Where a lead is read: built from the kind and ids and from nothing the API wrote. A warning has
 * no page of its own (it is a panel on the person's record), an employment change is on their
 * History tab and an exit has its own page.
 */
export function leadHref(lead: ApiQueryLead, subjectId: string): string {
  switch (lead.kind) {
    case "WARNING":
      return `/people/${encodeURIComponent(subjectId)}?tab=conduct`;
    case "EMPLOYMENT_CHANGE":
      return `/people/${encodeURIComponent(subjectId)}?tab=history`;
    case "EXIT":
      return `/people/offboarding/${encodeURIComponent(lead.id)}`;
  }
}

/** The address of a query, from its id. The one place the path is written for other modules. */
export function queryHref(id: string): string {
  return `/people/queries/${encodeURIComponent(id)}`;
}

/* --------------------------------------------------------------- templates */

export type ApiQueryTemplate = {
  id: string;
  name: string;
  subjectLine: string;
  whatHappened: string;
  rulesRelied: string | null;
  question: string;
  archived: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export function toTemplate(raw: unknown): ApiQueryTemplate | null {
  if (!isRecord(raw)) return null;
  const id = text(raw["id"]);
  const name = text(raw["name"]);
  if (!id || !name) return null;
  return {
    id,
    name,
    subjectLine: text(raw["subjectLine"]) ?? "",
    whatHappened: text(raw["whatHappened"]) ?? "",
    rulesRelied: text(raw["rulesRelied"]),
    question: text(raw["question"]) ?? "",
    archived: raw["archived"] === true,
    createdAt: text(raw["createdAt"]),
    updatedAt: text(raw["updatedAt"]),
  };
}

export type TemplateBody = {
  name: string;
  subjectLine: string;
  whatHappened?: string;
  rulesRelied?: string | null;
  question?: string;
};

export type MergeField = { token: string; label: string };

export type TemplateList = {
  rows: ApiQueryTemplate[];
  /** The fields a template may use. Closed: any other `{{token}}` is refused when it is saved. */
  mergeFields: MergeField[];
  /** The server's sentence: "These are your company's own words. Have counsel read them." */
  note: string | null;
};

export function toTemplateList(page: { data: unknown[]; meta: unknown }): TemplateList {
  const meta = isRecord(page.meta) ? page.meta : {};
  return {
    rows: list(page.data).flatMap((row) => {
      const template = toTemplate(row);
      return template ? [template] : [];
    }),
    mergeFields: list(meta["mergeFields"]).flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const token = text(entry["token"]);
      const label = text(entry["label"]);
      return token && label ? [{ token, label }] : [];
    }),
    note: text(meta["note"]),
  };
}

/** What the server holds for a template. */
export const TEMPLATE_LIMITS = {
  name: { min: 2, max: 80 },
  subjectLine: { min: 3, max: 150 },
  whatHappened: { max: 5000 },
  rulesRelied: { max: 1000 },
  question: { max: 2000 },
} as const;

/* ------------------------------------------------------------------ counts */

export type CountStatus = "ISSUED" | "REPLIED" | "CLOSED" | "WITHDRAWN";

export type CountCell<K extends string> = {
  key: K;
  /** `null` is **withheld**. It is never 0. */
  count: number | null;
};

export type ApiQueryCounts = {
  year: number;
  floor: number | null;
  byStatus: CountCell<CountStatus>[];
  byMonth: CountCell<string>[];
  /** The server's sentence about the floor. Shown as it is. */
  note: string | null;
};

const COUNT_STATUSES: readonly CountStatus[] = [
  "ISSUED",
  "REPLIED",
  "CLOSED",
  "WITHDRAWN",
];

/**
 * The counts as the API sent them. A cell whose count is not a number is **withheld** (`null`):
 * the server sends `null` for a withheld one, and anything it did not send as a number is not a
 * number to draw. Nothing is added up here, and a cell is never made into a zero.
 */
export function toCounts(raw: unknown): ApiQueryCounts | null {
  if (!isRecord(raw)) return null;
  const year = count(raw["year"]);
  if (year === null) return null;
  return {
    year,
    floor: count(raw["floor"]),
    byStatus: list(raw["byStatus"]).flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const status = COUNT_STATUSES.find((value) => value === entry["status"]);
      return status ? [{ key: status, count: count(entry["count"]) }] : [];
    }),
    byMonth: list(raw["byMonth"]).flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const month = text(entry["month"]);
      return month ? [{ key: month, count: count(entry["count"]) }] : [];
    }),
    note: text(raw["note"]),
  };
}

export const COUNT_STATUS_WORD: Record<CountStatus, string> = {
  ISSUED: "Waiting or issued",
  REPLIED: "Replied",
  CLOSED: "Closed",
  WITHDRAWN: "Withdrawn",
};
