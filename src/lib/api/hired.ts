import { request, requestPaged, type Paged } from "@/lib/api/client";
import { fetchFile, type FileDownload } from "@/lib/api/download";
import type { ApiBulkAnswer } from "@/lib/api/pipeline";

/**
 * The Hired list's own endpoints: who accepted an offer, and what became of them.
 *
 * Under `/recruitment/hires`. Reads need `MANAGE_HIRING` or `APPROVE_HIRING`; making
 * an employee needs `MANAGE_HIRING` and `EDIT_RECORDS`; the export is `MANAGE_HIRING`
 * only because it carries contact details. `api-gateway.ts` turns these into what the
 * screens draw, and is the one file to edit if either side renames a thing.
 */

const BASE = "/recruitment";

export type ApiHireState = "HIRED" | "EMPLOYEE_CREATED" | "DID_NOT_JOIN";

export type ApiHire = {
  id: string;
  state: ApiHireState;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobTitle: string;
  requisitionId: string;
  requisitionReference: string;
  departmentId: string | null;
  departmentName: string | null;
  employmentType: string;
  /** What the applicant quoted (`APP-…`). */
  reference: string | null;
  source: string | null;
  offerAcceptedAt: string;
  /** `YYYY-MM-DD`. */
  startDate: string;
  applicationId: string;
  candidateId: string;
  offerId: string;
  jobApplicationId: string | null;
  employeeId: string | null;
  employeeCreatedAt: string | null;
  /** `CREATED` (from the list), `LINKED` (to one that was there) or `AT_ACCEPTANCE`. */
  employeeVia: string | null;
  employee: {
    id: string;
    employeeNo: string;
    name: string;
    archived: boolean;
  } | null;
  didNotJoin: {
    at: string;
    reason: string | null;
    byUserId: string | null;
    by: string | null;
  } | null;
  /** Whether an employee record can be made now, and if not, why in words. */
  canCreateEmployee: {
    allowed: boolean;
    code: string | null;
    reason: string | null;
  };
  /** Only when asked for, and only for somebody who may see offers. */
  offer?: { grossMonthlyKobo: number };
};

export type ApiCoreHr = { available: boolean; reason: string | null };

export type ApiHireListMeta = {
  nextCursor: string | null;
  /** The people in each state under every filter but the state itself. */
  counts: {
    total: number;
    byState: Record<ApiHireState, number>;
  };
  coreHr: ApiCoreHr;
};

export type ApiHireSort =
  "acceptedAt" | "name" | "startDate" | "jobTitle" | "state";

/** What narrows a list, a bulk selection and an export: one set of words. */
export type ApiHireFilter = {
  requisitionId?: string;
  departmentId?: string;
  state?: ApiHireState;
  /** `YYYY-MM-DD`, inclusive. */
  acceptedFrom?: string;
  acceptedTo?: string;
  startFrom?: string;
  startTo?: string;
  source?: string;
  q?: string;
};

export type ApiHireListParams = ApiHireFilter & {
  page?: number;
  pageSize?: number;
  sort?: ApiHireSort;
  order?: "asc" | "desc";
  cursor?: string;
};

export type ApiHireJobSummary = {
  requisitionId: string;
  reference: string;
  jobTitle: string;
  status: string;
  headcount: number;
  hired: number;
  employeeCreated: number;
  didNotJoin: number;
  /** Hired plus employees: the people counted against the headcount. */
  filled: number;
  placesLeft: number;
};

export type ApiHireSummary = {
  total: number;
  byState: Record<ApiHireState, number>;
  jobs: ApiHireJobSummary[];
  coreHr: ApiCoreHr;
  onOfferAccepted: {
    setting: "HIRED_LIST_ONLY" | "CREATE_EMPLOYEE";
    effective: "HIRED_LIST_ONLY" | "CREATE_EMPLOYEE";
  };
};

export type ApiDidNotJoin = {
  requisition: {
    id: string;
    reference: string;
    status: string;
    headcount: number;
    hired: number;
    reopened: boolean;
    othersTurnedAwayWhenFilled: number;
  };
  hire: ApiHire;
};

/** The selection a bulk action or an export takes: ids, or a filter and its confirmed count. */
export type ApiHireSelection =
  { hireIds: string[] } | { filter: ApiHireFilter; expectedCount: number };

export type ApiExportExtra = "answers" | "screening" | "salary";

export type PagedHires = Paged<ApiHire, ApiHireListMeta>;

export const hiredApi = {
  list: (params: ApiHireListParams, signal?: AbortSignal) =>
    requestPaged<ApiHire, ApiHireListMeta>(`${BASE}/hires`, {
      query: { ...params },
      ...(signal ? { signal } : {}),
    }),

  summary: (signal?: AbortSignal) =>
    request<ApiHireSummary>(`${BASE}/hires/summary`, {
      ...(signal ? { signal } : {}),
    }),

  get: (id: string, signal?: AbortSignal) =>
    request<ApiHire>(`${BASE}/hires/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  /** `409` with `details.reason: "employee_exists"` and who, when the email is taken. */
  createEmployee: (id: string) =>
    request<{ employee: { id: string; employeeNo: string }; hire: ApiHire }>(
      `${BASE}/hires/${id}/employee`,
      { method: "POST" },
    ),

  linkEmployee: (id: string, employeeId: string) =>
    request<ApiHire>(`${BASE}/hires/${id}/link-employee`, {
      method: "POST",
      body: { employeeId },
    }),

  didNotJoin: (id: string, reason: string) =>
    request<ApiDidNotJoin>(`${BASE}/hires/${id}/did-not-join`, {
      method: "POST",
      body: { reason },
    }),

  /**
   * Employee records for many: a bulk job like any other. Answers `201` with the job
   * (and every row when it was small), polled through `GET /bulk/:id`.
   */
  employees: (
    body: ApiHireSelection & { dryRun?: boolean; idempotencyKey?: string },
    signal?: AbortSignal,
  ) =>
    request<ApiBulkAnswer>(`${BASE}/hires/employees`, {
      method: "POST",
      body,
      ...(signal ? { signal } : {}),
    }),

  /** The list as a spreadsheet. Audited: who, which filter, how many; never the contents. */
  exportCsv: (
    body: ApiHireSelection & { include?: ApiExportExtra[] },
  ): Promise<FileDownload> =>
    fetchFile(
      `${BASE}/hires/export.csv`,
      "hired-people",
      undefined,
      "No file was produced.",
      body,
    ),
};
