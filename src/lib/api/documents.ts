"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * Documents and document requests — `/api/v1/documents`.
 *
 * Two halves of one question. **Documents** are what the company holds on a
 * person's file. **Requests** are the ones it has asked for and not received.
 * Every screen in this module shows both together, because a personnel file
 * that lists five documents and hides the missing work permit is the file that
 * fails the one inspection it exists for.
 *
 * ## The file goes up with the record, and is kept in the database
 *
 * A document holds its own bytes (`EmployeeDocument.content`, in Postgres). The
 * form reads the chosen file in the browser and sends it as `contentBase64` in
 * the same request that creates the record, so there is no window in which a
 * personnel file lists a certificate with nothing behind it. No bucket is
 * involved. `storageKey` is still on the row and on `AddDocumentBody` for a
 * document that was recorded against an object-storage key, and it is `null`
 * for every document held in the database: read `hasFile`, not `storageKey`, to
 * know whether there is something to open.
 *
 * ## Two surprises worth knowing before you use this
 *
 * 1. **`/expiring` covers half of what its name suggests, and says so.**
 *    `EmployeeDocument` has no expiry column, so the compliance list is
 *    documents *asked for and not received*, by the date they were asked for.
 *    The response carries a `note` saying exactly that, and every row carries
 *    `kind` — so when the column lands, rows with `kind: "DOCUMENT"` appear in
 *    the same list with the same shape and no screen changes. Both kinds are
 *    already handled here and in the register.
 *
 * 2. **Reminding sends a real notification.** `documentsApi.remind()` reaches
 *    the same inbox `createRequest` does. `chaseMessage()` in
 *    `lib/store/documents.ts` is not dead code even so — it is what the
 *    reminder dialog falls back to when `notifiedEmployee` comes back false,
 *    which is a staff record with no sign-in, a state this module has never
 *    been able to paper over and still cannot.
 *
 * No money crosses this module, so there is no kobo boundary in this file.
 */

/* ------------------------------------------------------------------- shapes */

/** Mirrors the `DocumentCategory` enum in the API's schema. */
export type DocumentCategory =
  | "CONTRACT"
  | "IDENTIFICATION"
  | "CERTIFICATE"
  | "LETTER"
  | "MEDICAL"
  | "OTHER";

export const DOCUMENT_CATEGORIES = [
  "CONTRACT",
  "IDENTIFICATION",
  "CERTIFICATE",
  "LETTER",
  "MEDICAL",
  "OTHER",
] as const satisfies readonly DocumentCategory[];

/**
 * What each category is, in the words somebody would use out loud.
 *
 * "IDENTIFICATION" is what the database calls it. "ID — passport, driver's
 * licence" is what a shop owner picking from a list needs to read.
 */
export const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  CONTRACT: "Contract",
  IDENTIFICATION: "ID",
  CERTIFICATE: "Certificate",
  LETTER: "Letter",
  MEDICAL: "Medical",
  OTHER: "Other",
};

/** `OPEN` is the only state anybody is waiting on. */
export type DocumentRequestStatus = "OPEN" | "FULFILLED" | "WAIVED";

/** Mirrors `SerializedDocument`. */
export type ApiDocument = {
  id: string;
  employeeId: string;
  name: string;
  category: DocumentCategory;
  /**
   * An object-storage key, for a row that has one. Null for a document held
   * in the database — read `hasFile` instead of this.
   */
  storageKey: string | null;
  /**
   * Whether there is a file to open.
   *
   * **Read this before offering a download.** A row with only a key, on a
   * deployment with no bucket, is a document by name and nothing else, and a
   * button that cannot work is worse than no button.
   */
  hasFile: boolean;
  sizeBytes: number | null;
  mimeType: string | null;
  /** Somebody has checked it is what it claims to be. */
  verified: boolean;
  verifiedAt: string | null;
  uploadedAt: string;
  archived: boolean;
  /** Set when this document is the answer to a request that was made. */
  fulfilsRequestId: string | null;
};

/** Mirrors `SerializedRequest`. */
export type ApiDocumentRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  name: string;
  category: DocumentCategory;
  /** Why it is needed. Shown to the employee, so it is worth writing. */
  reason: string | null;
  dueOn: string | null;
  /** Negative once it is late. `null` when no date was set. */
  daysLeft: number | null;
  overdue: boolean;
  status: DocumentRequestStatus;
  requestedById: string | null;
  requestedByName: string | null;
  requestedAt: string;
  documentId: string | null;
  fulfilledAt: string | null;
  waivedAt: string | null;
  waivedReason: string | null;
};

/**
 * `POST /requests` answers with the request plus whether the person was told.
 *
 * `notifiedEmployee: false` means nobody received anything — HR would otherwise
 * sit waiting on somebody who was never asked. There are two causes and the API
 * does not tell them apart: the staff record has no sign-in, or the company has
 * switched the notice off. The register says "nobody was told" on screen rather
 * than swallowing it, and does not name one cause.
 */
export type ApiCreatedRequest = ApiDocumentRequest & {
  notifiedEmployee: boolean;
};

/**
 * `POST /employees/:id` answers with the document, and, **only when
 * `notifyEmployee` was asked for and honoured**, whether the person was told.
 *
 * - `true`: a notification went to them.
 * - `false`: nobody was told, because the staff record has no sign-in or the
 *   company switched the notice off. The two are not told apart.
 * - **absent**: it was not asked for, or the server is older than the field and
 *   dropped it unread. Absent is "no claim", never "not told": a screen that
 *   read it as `false` would warn about a person who may well have been told,
 *   and one that read it as `true` would say so about one who was not.
 */
export type ApiAddedDocument = ApiDocument & {
  notifiedEmployee?: boolean;
};

/** `GET /employees/:id` — one person's file, both halves. */
export type ApiEmployeeFile = {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  documents: ApiDocument[];
  outstandingRequests: ApiDocumentRequest[];
};

/**
 * One line on the compliance list.
 *
 * `kind: "REQUEST"` is something asked for and not received. `kind: "DOCUMENT"`
 * is a document whose own renewal date is close, and arrives when
 * `EmployeeDocument.expiresOn` exists. The two need different buttons — chase
 * the person, or ask for a fresh one — which is why the discriminator is here
 * rather than inferred from which id is set.
 */
export type ApiComplianceRow = {
  kind: "REQUEST" | "DOCUMENT";
  requestId: string | null;
  documentId: string | null;
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  name: string;
  category: DocumentCategory;
  dueOn: string;
  /** Negative once the date has passed. */
  daysLeft: number;
  overdue: boolean;
};

export type ApiExpiring = {
  windowDays: number;
  asOf: string;
  until: string;
  counts: { overdue: number; dueSoon: number; total: number };
  rows: ApiComplianceRow[];
  /** What this list does and does not cover. Shown, not hidden. */
  note: string;
};

/* ------------------------------------------------------------------ params */

export type RequestListParams = {
  page?: number;
  pageSize?: number;
  sort?: "dueOn" | "createdAt" | "name" | "status";
  order?: "asc" | "desc";
  status?: DocumentRequestStatus;
  employeeId?: string;
  category?: DocumentCategory;
  /** Open and already past its date. Wins over `status` on the API side. */
  overdue?: boolean;
  /** Matches the document name, not the person. */
  q?: string;
};

export type CreateRequestBody = {
  employeeId: string;
  name: string;
  category?: DocumentCategory;
  reason?: string;
  /** `YYYY-MM-DD`. Absent means no date, which nobody chases. */
  dueOn?: string;
};

/**
 * Attaching something to a request: exactly one of the two forms.
 *
 * Either point at a document already on the person's file, or send the
 * reference of one just handed over. The API refuses both at once and refuses
 * neither, because a request marked answered with nothing behind it is the
 * failure this whole module exists to prevent.
 */
export type FulfilBody =
  | { documentId: string }
  /* The file itself. No `sizeBytes`: the API measures the buffer, and a length
     sent about a file sent alongside it is a number that can disagree. */
  | {
      contentBase64: string;
      name?: string;
      category?: DocumentCategory;
      mimeType?: string;
    }
  | {
      storageKey: string;
      name?: string;
      category?: DocumentCategory;
      sizeBytes?: number;
      mimeType?: string;
    };

export type AddDocumentBody = {
  name: string;
  category?: DocumentCategory;
  mimeType?: string;
  /**
   * Also tell the person: a notification that a document was added to their
   * file. Sent as `true` or **not at all**: an absent key is "do not tell", and
   * a `false` would be a second way to say it for the API to disagree about.
   * Only somebody adding to **another** person's file may ask; the API honours
   * it for nobody else and says so in the answer (`ApiAddedDocument`).
   */
  notifyEmployee?: boolean;
} & (
  | { contentBase64: string; storageKey?: never; sizeBytes?: never }
  | { storageKey: string; contentBase64?: never; sizeBytes?: number }
);

/* ------------------------------------------------------------------- calls */

export const documentsApi = {
  /** What is being asked of me. Takes no employee id, so there is nothing to tamper with. */
  myRequests(
    params: {
      page?: number;
      pageSize?: number;
      status?: DocumentRequestStatus;
    } = {},
    signal?: AbortSignal,
  ): Promise<Paged<ApiDocumentRequest>> {
    return requestPaged<ApiDocumentRequest>("/documents/me/requests", {
      query: { ...params },
      ...(signal ? { signal } : {}),
    });
  },

  /** The compliance list. `days` is 1–365 and defaults to 30 on the API. */
  expiring(days: number, signal?: AbortSignal): Promise<ApiExpiring> {
    return request<ApiExpiring>("/documents/expiring", {
      query: { days },
      ...(signal ? { signal } : {}),
    });
  },

  /** The HR register, paged. */
  requests(
    params: RequestListParams = {},
    signal?: AbortSignal,
  ): Promise<Paged<ApiDocumentRequest>> {
    return requestPaged<ApiDocumentRequest>("/documents/requests", {
      query: { ...params },
      ...(signal ? { signal } : {}),
    });
  },

  request(id: string, signal?: AbortSignal): Promise<ApiDocumentRequest> {
    return request<ApiDocumentRequest>(`/documents/requests/${id}`, {
      ...(signal ? { signal } : {}),
    });
  },

  createRequest(body: CreateRequestBody): Promise<ApiCreatedRequest> {
    return request<ApiCreatedRequest>("/documents/requests", {
      method: "POST",
      body,
    });
  },

  fulfil(id: string, body: FulfilBody): Promise<ApiDocumentRequest> {
    return request<ApiDocumentRequest>(`/documents/requests/${id}/fulfil`, {
      method: "POST",
      body,
    });
  },

  /** HR drops the requirement. The reason is stored, not just accepted. */
  waive(id: string, reason: string): Promise<ApiDocumentRequest> {
    return request<ApiDocumentRequest>(`/documents/requests/${id}/waive`, {
      method: "POST",
      body: { reason },
    });
  },

  /**
   * Nudge them again, through the same inbox `createRequest` used the first
   * time. `notifiedEmployee` is `false` for the same two reasons it can be on
   * `createRequest` — a staff record with no sign-in has no inbox, or the
   * company switched the notice off — and the caller shows the copy-paste
   * fallback exactly then, never as the default.
   */
  remind(id: string): Promise<{ notifiedEmployee: boolean }> {
    return request<{ notifiedEmployee: boolean }>(
      `/documents/requests/${id}/remind`,
      { method: "POST" },
    );
  },

  file(
    employeeId: string,
    includeArchived = false,
    signal?: AbortSignal,
  ): Promise<ApiEmployeeFile> {
    return request<ApiEmployeeFile>(`/documents/employees/${employeeId}`, {
      query: { includeArchived },
      ...(signal ? { signal } : {}),
    });
  },

  add(employeeId: string, body: AddDocumentBody): Promise<ApiAddedDocument> {
    return request<ApiAddedDocument>(`/documents/employees/${employeeId}`, {
      method: "POST",
      body,
    });
  },

  /** Archive, not delete. Refused while it answers a fulfilled request. */
  archive(
    id: string,
  ): Promise<{ id: string; employeeId: string; archived: boolean }> {
    return request<{ id: string; employeeId: string; archived: boolean }>(
      `/documents/${id}`,
      { method: "DELETE" },
    );
  },

  /**
   * HR confirms it is what it claims to be. Always HR's action, even on the
   * subject's own file — the point of checking is that somebody other than
   * whoever attached it looks it over.
   */
  verify(
    id: string,
  ): Promise<{ id: string; employeeId: string; verified: boolean }> {
    return request<{ id: string; employeeId: string; verified: boolean }>(
      `/documents/${id}/verify`,
      { method: "POST" },
    );
  },
};
