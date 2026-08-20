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
 * ## There is no file. There is a reference.
 *
 * Nothing in the stack uploads, stores or serves a file yet. Every field is
 * `storageKey` and never `url`, and the API refuses a key that looks like a
 * link — so no interface here can offer a download it cannot serve. The two
 * routes that will change that are named in a TODO at the top of the API's
 * `src/modules/documents/router.ts`:
 *
 *     POST /api/v1/documents/upload-url   (presigned PUT)
 *     GET  /api/v1/documents/:id/file     (presigned GET, gated and audited)
 *
 * Until they exist the attach control is a field that takes a reference, which
 * beats a drop zone that loses somebody's certificate.
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
 * 2. **There is no remind route.** Creating a request notifies the employee
 *    once (`document.requested`, into their ApproveHR inbox). Chasing them
 *    again has no endpoint, so nothing in this module claims to send one — the
 *    register writes the message for you to send. The seam is named at
 *    `chaseMessage()` below.
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
  /** An object-storage key. There is nothing to fetch it with yet. */
  storageKey: string;
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
 * `notifiedEmployee: false` means the staff record has no sign-in, so nobody
 * received anything — HR would otherwise sit waiting on somebody who was never
 * asked. The register says so on screen rather than swallowing it.
 */
export type ApiCreatedRequest = ApiDocumentRequest & {
  notifiedEmployee: boolean;
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
  storageKey: string;
  sizeBytes?: number;
  mimeType?: string;
};

/* ------------------------------------------------------------------- calls */

export const documentsApi = {
  /** What is being asked of me. Takes no employee id, so there is nothing to tamper with. */
  myRequests(
    params: { page?: number; pageSize?: number; status?: DocumentRequestStatus } = {},
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

  add(employeeId: string, body: AddDocumentBody): Promise<ApiDocument> {
    return request<ApiDocument>(`/documents/employees/${employeeId}`, {
      method: "POST",
      body,
    });
  },

  /** Archive, not delete. Refused while it answers a fulfilled request. */
  archive(id: string): Promise<{ id: string; employeeId: string; archived: boolean }> {
    return request<{ id: string; employeeId: string; archived: boolean }>(
      `/documents/${id}`,
      { method: "DELETE" },
    );
  },
};
