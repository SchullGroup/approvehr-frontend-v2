"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * The internal recruitment pipeline — requisitions, candidates, interviews,
 * scorecards and offers. `/api/v1/recruitment/*`.
 *
 * Downstream of `careers.ts`: a `JobApplication` becomes a `Candidate` plus a
 * pipeline `Application` via `careersApi.advance()`. Everything here is what
 * happens to that pair afterwards — stage moves, interviews, scorecards,
 * offers. Same money convention as `careers.ts`: `naira()`/`kobo()` at the
 * bottom, every wire field carrying an amount named with a `Kobo` suffix.
 *
 * Unlike `endpoints.ts` and `careers.ts`, there is no local/demo fallback for
 * any of this — the module never existed in the frontend before, so there is
 * no store to fall back to. Every hook in `store/recruitment.ts` is honest
 * about that rather than inventing one.
 */

export type RequisitionStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "OPEN"
  | "ON_HOLD"
  | "FILLED"
  | "CANCELLED";

export type EmploymentType = "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN" | "NYSC";

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  CONTRACT: "Contract",
  INTERN: "Intern",
  NYSC: "NYSC",
};

export type ApplicationOutcome =
  | "IN_PROGRESS"
  | "OFFER_MADE"
  | "HIRED"
  | "REJECTED"
  | "WITHDRAWN";

export type InterviewKind = "SCREEN" | "TECHNICAL" | "PANEL" | "FINAL";
export const INTERVIEW_KIND_LABEL: Record<InterviewKind, string> = {
  SCREEN: "Screen",
  TECHNICAL: "Technical",
  PANEL: "Panel",
  FINAL: "Final",
};

export type InterviewStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

export type ScorecardRecommendation = "STRONG_YES" | "YES" | "NO" | "STRONG_NO";
export const RECOMMENDATION_LABEL: Record<ScorecardRecommendation, string> = {
  STRONG_YES: "Strong yes",
  YES: "Yes",
  NO: "No",
  STRONG_NO: "Strong no",
};

export type OfferStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "SENT"
  | "ACCEPTED"
  | "DECLINED"
  | "WITHDRAWN";

/* -------------------------------------------------------------------- shapes */

export type ApiRequisition = {
  id: string;
  reference: string;
  jobTitle: string;
  departmentId: string | null;
  departmentName: string | null;
  headcount: number;
  employmentType: EmploymentType;
  location: string | null;
  bandMinKobo: number | null;
  bandMaxKobo: number | null;
  description: string | null;
  status: RequisitionStatus;
  hiringManagerId: string | null;
  hiringManagerName: string | null;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiStage = {
  id: string;
  requisitionId: string;
  name: string;
  order: number;
  requiresScorecards: boolean;
};

export type ApiRequisitionDetail = ApiRequisition & {
  stages: (ApiStage & { currentCount: number })[];
  applications: {
    inProgress: number;
    offerMade: number;
    hired: number;
    rejected: number;
    withdrawn: number;
  };
};

export type ApiApplication = {
  id: string;
  requisitionId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  stageId: string | null;
  stageName: string | null;
  outcome: ApplicationOutcome;
  stageEnteredAt: string;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiOffer = {
  id: string;
  applicationId: string;
  grossMonthlyKobo: number;
  /** `YYYY-MM-DD`. */
  startDate: string;
  status: OfferStatus;
  outsideBand: boolean;
  approvedById: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  employeeId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiInterviewScorecardRef = { id: string; interviewerId: string; submitted: boolean };

export type ApiInterviewSummary = {
  id: string;
  kind: InterviewKind;
  scheduledFor: string;
  durationMins: number;
  status: InterviewStatus;
  location: string | null;
  scorecards: ApiInterviewScorecardRef[];
};

export type ApiCandidate = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string | null;
  cvStorageKey: string | null;
  source: string | null;
  noticeDays: number | null;
  currentSalaryKobo: number | null;
  expectedSalaryKobo: number | null;
  rightToWork: boolean | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiCandidateApplication = {
  id: string;
  requisitionId: string;
  requisitionReference: string;
  requisitionJobTitle: string;
  outcome: ApplicationOutcome;
  appliedAt: string;
};

export type ApiCandidateDetail = ApiCandidate & { applications: ApiCandidateApplication[] };

export type ApiApplicationDetail = ApiApplication & {
  requisitionReference: string;
  requisitionJobTitle: string;
  candidate: ApiCandidate;
  interviews: ApiInterviewSummary[];
  offer: ApiOffer | null;
};

export type ApiScorecardRating = {
  competency: string;
  score: number;
  weight: number;
  comment: string | null;
};

/** Note: `interviewerName` is always `null` on this backend today. See below. */
export type ApiScorecard = {
  id: string;
  interviewId: string;
  interviewerId: string;
  interviewerName: string | null;
  recommendation: ScorecardRecommendation | null;
  notes: string | null;
  submitted: boolean;
  submittedAt: string | null;
  ratings: ApiScorecardRating[];
};

export type ApiInterview = {
  id: string;
  applicationId: string;
  requisitionId: string;
  requisitionReference: string;
  candidateName: string;
  kind: InterviewKind;
  scheduledFor: string;
  durationMins: number;
  status: InterviewStatus;
  location: string | null;
  scorecardsSubmitted: number;
};

export type ApiInterviewDetail = ApiInterview & { scorecards: ApiScorecard[] };

export type ApiAnalytics = {
  totals: {
    requisitionsOpen: number;
    requisitionsTotal: number;
    applications: number;
    applicationsInProgress: number;
    applicationsHired: number;
    applicationsRejected: number;
    applicationsWithdrawn: number;
    offersSent: number;
    offersAccepted: number;
    offersDeclined: number;
    offerAcceptanceRate: number | null;
    averageTimeToHireDays: number | null;
  };
  perRequisition: {
    requisitionId: string;
    reference: string;
    jobTitle: string;
    status: RequisitionStatus;
    applications: number;
    byStage: { stageId: string; name: string; currentCount: number }[];
  }[];
};

/* -------------------------------------------------------------------- input */

export type RequisitionListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: string;
  order?: "asc" | "desc";
  status?: RequisitionStatus;
  departmentId?: string;
};

export type CreateRequisitionBody = {
  jobTitle: string;
  departmentId?: string | null;
  headcount?: number;
  employmentType?: EmploymentType;
  location?: string | null;
  bandMinKobo?: number | null;
  bandMaxKobo?: number | null;
  description?: string | null;
  hiringManagerId?: string | null;
  reference?: string;
};

export type UpdateRequisitionBody = Partial<Omit<CreateRequisitionBody, "reference">>;

export type CreateStageBody = { name: string; requiresScorecards?: boolean; order?: number };
export type UpdateStageBody = { name?: string; requiresScorecards?: boolean };

export type ApplicationListParams = {
  page?: number;
  pageSize?: number;
  outcome?: ApplicationOutcome;
  stageId?: string;
  sort?: string;
  order?: "asc" | "desc";
};

export type CandidateListParams = { page?: number; pageSize?: number; q?: string };

export type UpdateCandidateBody = {
  phone?: string;
  cvStorageKey?: string;
  source?: string;
  noticeDays?: number;
  currentSalaryKobo?: number;
  expectedSalaryKobo?: number;
  rightToWork?: boolean;
};

export type InterviewListParams = {
  page?: number;
  pageSize?: number;
  status?: InterviewStatus;
  requisitionId?: string;
  from?: string;
  to?: string;
};

export type ScheduleInterviewBody = {
  kind: InterviewKind;
  /** Full ISO timestamp. */
  scheduledFor: string;
  durationMins?: number;
  location?: string;
};

export type RescheduleInterviewBody = {
  kind?: InterviewKind;
  scheduledFor?: string;
  durationMins?: number;
  location?: string | null;
};

export type SubmitScorecardBody = {
  recommendation?: ScorecardRecommendation | null;
  notes?: string;
  ratings: { competency: string; score: number; weight?: number; comment?: string }[];
};

export type OfferListParams = {
  page?: number;
  pageSize?: number;
  status?: OfferStatus;
  requisitionId?: string;
};

export type CreateOfferBody = { grossMonthlyKobo: number; startDate: string };
export type UpdateOfferBody = Partial<CreateOfferBody>;
export type ApiAcceptOfferResult = ApiOffer & { rejectedOthers: number };

/* -------------------------------------------------------------------- calls */

export const recruitmentApi = {
  listRequisitions: (params: RequisitionListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiRequisition>("/recruitment/requisitions", {
      query: { ...params },
      ...(signal ? { signal } : {}),
    }),
  createRequisition: (body: CreateRequisitionBody) =>
    request<ApiRequisitionDetail>("/recruitment/requisitions", { method: "POST", body }),
  getRequisition: (id: string, signal?: AbortSignal) =>
    request<ApiRequisitionDetail>(`/recruitment/requisitions/${id}`, {
      ...(signal ? { signal } : {}),
    }),
  updateRequisition: (id: string, body: UpdateRequisitionBody) =>
    request<ApiRequisitionDetail>(`/recruitment/requisitions/${id}`, {
      method: "PATCH",
      body,
    }),
  submitRequisition: (id: string) =>
    request<ApiRequisitionDetail>(`/recruitment/requisitions/${id}/submit`, {
      method: "POST",
    }),
  approveRequisition: (id: string) =>
    request<ApiRequisitionDetail>(`/recruitment/requisitions/${id}/approve`, {
      method: "POST",
    }),
  holdRequisition: (id: string, reason?: string) =>
    request<ApiRequisitionDetail>(`/recruitment/requisitions/${id}/hold`, {
      method: "POST",
      body: reason ? { reason } : {},
    }),
  reopenRequisition: (id: string) =>
    request<ApiRequisitionDetail>(`/recruitment/requisitions/${id}/reopen`, {
      method: "POST",
    }),
  fillRequisition: (id: string) =>
    request<ApiRequisitionDetail>(`/recruitment/requisitions/${id}/fill`, {
      method: "POST",
    }),
  cancelRequisition: (id: string, reason?: string) =>
    request<ApiRequisitionDetail>(`/recruitment/requisitions/${id}/cancel`, {
      method: "POST",
      body: reason ? { reason } : {},
    }),

  listStages: (requisitionId: string, signal?: AbortSignal) =>
    request<ApiStage[]>(`/recruitment/requisitions/${requisitionId}/stages`, {
      ...(signal ? { signal } : {}),
    }),
  createStage: (requisitionId: string, body: CreateStageBody) =>
    request<ApiStage>(`/recruitment/requisitions/${requisitionId}/stages`, {
      method: "POST",
      body,
    }),
  updateStage: (requisitionId: string, stageId: string, body: UpdateStageBody) =>
    request<ApiStage>(`/recruitment/requisitions/${requisitionId}/stages/${stageId}`, {
      method: "PATCH",
      body,
    }),
  deleteStage: (requisitionId: string, stageId: string) =>
    request<{ id: string; deleted: true }>(
      `/recruitment/requisitions/${requisitionId}/stages/${stageId}`,
      { method: "DELETE" },
    ),
  reorderStages: (requisitionId: string, stageIds: string[]) =>
    request<ApiStage[]>(`/recruitment/requisitions/${requisitionId}/stages/reorder`, {
      method: "POST",
      body: { stageIds },
    }),

  listApplications: (
    requisitionId: string,
    params: ApplicationListParams = {},
    signal?: AbortSignal,
  ) =>
    requestPaged<ApiApplication>(`/recruitment/requisitions/${requisitionId}/applications`, {
      query: { ...params },
      ...(signal ? { signal } : {}),
    }),
  getApplication: (id: string, signal?: AbortSignal) =>
    request<ApiApplicationDetail>(`/recruitment/applications/${id}`, {
      ...(signal ? { signal } : {}),
    }),
  moveApplication: (id: string, stageId: string) =>
    request<ApiApplicationDetail>(`/recruitment/applications/${id}/move`, {
      method: "POST",
      body: { stageId },
    }),
  rejectApplication: (id: string, reason?: string) =>
    request<ApiApplicationDetail>(`/recruitment/applications/${id}/reject`, {
      method: "POST",
      body: reason ? { reason } : {},
    }),
  withdrawApplication: (id: string, reason?: string) =>
    request<ApiApplicationDetail>(`/recruitment/applications/${id}/withdraw`, {
      method: "POST",
      body: reason ? { reason } : {},
    }),

  listCandidates: (params: CandidateListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiCandidate>("/recruitment/candidates", {
      query: { ...params },
      ...(signal ? { signal } : {}),
    }),
  getCandidate: (id: string, signal?: AbortSignal) =>
    request<ApiCandidateDetail>(`/recruitment/candidates/${id}`, {
      ...(signal ? { signal } : {}),
    }),
  updateCandidate: (id: string, body: UpdateCandidateBody) =>
    request<ApiCandidate>(`/recruitment/candidates/${id}`, { method: "PATCH", body }),

  listInterviews: (params: InterviewListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiInterview>("/recruitment/interviews", {
      query: { ...params },
      ...(signal ? { signal } : {}),
    }),
  getInterview: (id: string, signal?: AbortSignal) =>
    request<ApiInterviewDetail>(`/recruitment/interviews/${id}`, {
      ...(signal ? { signal } : {}),
    }),
  scheduleInterview: (applicationId: string, body: ScheduleInterviewBody) =>
    request<ApiInterviewDetail>(`/recruitment/applications/${applicationId}/interviews`, {
      method: "POST",
      body,
    }),
  rescheduleInterview: (id: string, body: RescheduleInterviewBody) =>
    request<ApiInterviewDetail>(`/recruitment/interviews/${id}`, { method: "PATCH", body }),
  cancelInterview: (id: string) =>
    request<ApiInterviewDetail>(`/recruitment/interviews/${id}/cancel`, { method: "POST" }),
  completeInterview: (id: string) =>
    request<ApiInterviewDetail>(`/recruitment/interviews/${id}/complete`, { method: "POST" }),
  noShowInterview: (id: string) =>
    request<ApiInterviewDetail>(`/recruitment/interviews/${id}/no-show`, { method: "POST" }),
  submitScorecard: (interviewId: string, body: SubmitScorecardBody) =>
    request<ApiInterviewDetail>(`/recruitment/interviews/${interviewId}/scorecards`, {
      method: "POST",
      body,
    }),

  listOffers: (params: OfferListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiOffer>("/recruitment/offers", {
      query: { ...params },
      ...(signal ? { signal } : {}),
    }),
  getOffer: (id: string, signal?: AbortSignal) =>
    request<ApiOffer>(`/recruitment/offers/${id}`, { ...(signal ? { signal } : {}) }),
  createOffer: (applicationId: string, body: CreateOfferBody) =>
    request<ApiOffer>(`/recruitment/applications/${applicationId}/offers`, {
      method: "POST",
      body,
    }),
  updateOffer: (id: string, body: UpdateOfferBody) =>
    request<ApiOffer>(`/recruitment/offers/${id}`, { method: "PATCH", body }),
  submitOffer: (id: string) =>
    request<ApiOffer>(`/recruitment/offers/${id}/submit`, { method: "POST" }),
  approveOffer: (id: string) =>
    request<ApiOffer>(`/recruitment/offers/${id}/approve`, { method: "POST" }),
  sendOffer: (id: string) =>
    request<ApiOffer>(`/recruitment/offers/${id}/send`, { method: "POST" }),
  acceptOffer: (id: string) =>
    request<ApiAcceptOfferResult>(`/recruitment/offers/${id}/accept`, { method: "POST" }),
  declineOffer: (id: string, reason?: string) =>
    request<ApiOffer>(`/recruitment/offers/${id}/decline`, {
      method: "POST",
      body: reason ? { reason } : {},
    }),
  withdrawOffer: (id: string, reason?: string) =>
    request<ApiOffer>(`/recruitment/offers/${id}/withdraw`, {
      method: "POST",
      body: reason ? { reason } : {},
    }),
  redoOffer: (id: string, body: CreateOfferBody) =>
    request<ApiOffer>(`/recruitment/offers/${id}/redo`, { method: "POST", body }),

  analytics: (signal?: AbortSignal) =>
    request<ApiAnalytics>("/recruitment/analytics", { ...(signal ? { signal } : {}) }),
};

export type PagedRequisitions = Paged<ApiRequisition>;
export type PagedApplications = Paged<ApiApplication>;
export type PagedInterviews = Paged<ApiInterview>;
export type PagedOffers = Paged<ApiOffer>;
export type PagedCandidates = Paged<ApiCandidate>;

/* ---------------------------------------------------------------- the money */

export const naira = (amount: number): number => Math.round(amount) / 100;
export const kobo = (amount: number): number => Math.round(amount * 100);
