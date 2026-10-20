"use client";

import { request, requestPaged } from "@/lib/api/client";
import type { ApiCvLink } from "@/lib/api/careers";
import type { ApiScoreStatus } from "@/lib/api/screening";
import type {
  ApplicationOutcome,
  InterviewKind,
  InterviewStatus,
  ScorecardRecommendation,
  SubmitScorecardBody,
} from "@/lib/api/recruitment";
import type { StageType } from "@/lib/hiring/pipeline/stage-types";

/**
 * Emails to candidates, interview panels, the panelist's own door and how long
 * rejected people are kept. `/api/v1/recruitment/*`.
 *
 * The wire and nothing else: no React, no state, no wording. Everything the screens
 * draw comes through `lib/hiring/pipeline/api-comms.ts`.
 */

/* --------------------------------------------------------------- email templates */

/** The API may send kinds this screen has no name for: they are drawn from the data. */
export type ApiEmailKind =
  | "ACKNOWLEDGE"
  | "INVITE"
  | "DECLINE"
  | "OFFER_SENT"
  | "STAGE_UPDATE"
  | "INTERVIEW_UPDATE"
  | "INTERVIEW_CANCELLED"
  | "PANELIST_INVITE"
  | "PANELIST_UPDATE"
  | "PANELIST_CANCELLED"
  | "INTERVIEW_REMINDER_CANDIDATE"
  | "INTERVIEW_REMINDER_PANELIST"
  | "SCORECARD_NUDGE"
  | (string & Record<never, never>);

export type ApiMergeField = {
  name: string;
  label: string;
  sample: string;
  /** Empty is allowed: the line that uses it is left out and the email goes. */
  optional?: boolean;
};

export type ApiEmailKindInfo = {
  kind: ApiEmailKind;
  label: string;
  /** When this kind is sent, in a sentence. */
  when: string;
  /** Who gets it. Absent from an API that predates interview emails: the candidate. */
  audience?: "CANDIDATE" | "PANELIST";
  /** The merge fields that exist at that moment: the only ones it may use. */
  fields: string[];
  /** What is sent when the company has not written its own. */
  builtIn: { subject: string; body: string };
  defaultTemplateId: string | null;
};

export type ApiEmailTemplate = {
  id: string;
  kind: ApiEmailKind;
  kindLabel: string;
  name: string;
  subject: string;
  body: string;
  isDefault: boolean;
  archived: boolean;
  /** Stages (of roles and of pipeline templates) that send it. */
  usedByStages: number;
  createdAt: string;
  updatedAt: string;
};

export type ApiEmailSender = {
  /** The name in the `From:` line. */
  name: string;
  source: "registered_name" | "display_name";
  /** `null` when there is no careers display name to decide about. */
  displayNameAccepted: boolean | null;
  registeredName: string;
  replyTo: string | null;
};

export type ApiEmailCatalog = {
  fields: ApiMergeField[];
  kinds: ApiEmailKindInfo[];
  templates: ApiEmailTemplate[];
  sender: ApiEmailSender | null;
};

export type ApiFieldProblem = { field: string; message: string };

export type ApiEmailPreview = {
  /** False when the text as written would be refused on save. */
  valid: boolean;
  errors: ApiFieldProblem[];
  /** Made-up values (`true`) or this person's own (`false`). */
  sample: boolean;
  subject: string | null;
  text: string | null;
  html: string | null;
  usedFields: string[];
  /** Used and have no value for this person: it would not be sent. */
  missing: string[];
};

export type EmailTemplateBody = {
  kind: ApiEmailKind;
  name: string;
  subject: string;
  body: string;
  isDefault?: boolean;
};

export type PreviewBody = {
  templateId?: string;
  kind?: ApiEmailKind;
  subject?: string;
  body?: string;
  applicationId?: string;
};

/* ------------------------------------------------------ what an application has had */

export type ApiEmailStatus =
  "PENDING" | "SENDING" | "SENT" | "SKIPPED" | "FAILED";
export type ApiEmailTrigger =
  "STAGE_ENTRY" | "REJECTION" | "INTERVIEW" | "OFFER";

/** One email an application has had or is owed. */
export type ApiCandidateEmail = {
  id: string;
  kind: ApiEmailKind;
  kindLabel: string;
  trigger: ApiEmailTrigger;
  status: ApiEmailStatus;
  /** Why it was not sent, or is waiting, in words. */
  note: string | null;
  subject: string | null;
  stageName: string | null;
  templateName: string | null;
  sentAt: string | null;
  createdAt: string;
};

/** What a move, a rejection, an interview or an offer says about the email it owed. */
export type ApiQueuedEmail = {
  id: string;
  kind: ApiEmailKind;
  status: ApiEmailStatus;
  note: string | null;
} | null;

/* ------------------------------------------------------------------ interview score */

export type ApiScoreSummary = {
  outOf: number;
  composite: number | null;
  compositeBp: number | null;
  interviews: {
    interviewId: string;
    kind: string;
    status: string;
    scheduledFor: string;
    composite: number | null;
    compositeBp: number | null;
    scorecards: {
      scorecardId: string;
      interviewerId: string;
      composite: number | null;
      compositeBp: number | null;
      recommendation: string | null;
    }[];
  }[];
  recommendations: {
    STRONG_YES: number;
    YES: number;
    NO: number;
    STRONG_NO: number;
  };
  byCompetency: {
    competency: string;
    average: number;
    averageBp: number;
    ratings: number;
  }[];
  scorecardsSubmitted: number;
};

export type ApiPanelist = {
  /** `null` for an invited account, who has no employee record. */
  employeeId: string | null;
  userId?: string | null;
  name: string;
  /** Whether their scorecard is in. */
  submitted: boolean;
};

/* ------------------------------------------------------------------------ panels */

export type ApiPanelMember = {
  /** `null` for an invited account (then `userId` names them). */
  employeeId: string | null;
  userId?: string | null;
  /** Absent from an API that predates invited accounts: then it is an employee. */
  kind?: "EMPLOYEE" | "ACCOUNT";
  name: string;
  jobTitle: string;
  email?: string | null;
};

export type ApiStagePanel = {
  stageId: string;
  stageName: string;
  members: ApiPanelMember[];
};

/* --------------------------------------------------------------------- retention */

/** On a record: when the person is scheduled to be deleted, or why there is no date. */
export type ApiRetentionNote = {
  /** `YYYY-MM-DD`. */
  scheduledDeletionOn: string | null;
  reason: "none_set" | "talent_pool" | "still_active" | "hired" | null;
};

export type ApiRetentionReport = {
  months: number | null;
  setAt: string | null;
  /** The first day anything can be purged on this period's strength. */
  purgeFrom: string | null;
  purgeActive: boolean;
  /** What the worker does with it on this deployment. */
  mode: "delete" | "report" | "off";
  due: { candidates: number; declinedApplications: number };
  dueWithin30Days: { candidates: number; declinedApplications: number };
  heldInTalentPool: number;
};

/* ------------------------------------------------------------- the panelist's door */

export type ApiMyRole =
  "HIRING_MANAGER" | "RECRUITER" | "STAGE_PANEL" | "INTERVIEW_PANEL";

export type ApiMyAccess = {
  employeeId: string | null;
  hiringManagerOf: {
    requisitionId: string;
    reference: string;
    jobTitle: string;
    status: string;
  }[];
  panelOf: {
    requisitionId: string;
    reference: string;
    jobTitle: string;
    status: string;
    stages: string[];
  }[];
  interviewsInvitedTo: number;
  hasAnyAccess: boolean;
};

export type ApiMyInterviewRow = {
  interviewId: string;
  applicationId: string;
  candidateName: string;
  requisitionReference: string;
  jobTitle: string;
  kind: InterviewKind;
  scheduledFor: string;
  durationMins: number;
  status: InterviewStatus;
  location: string | null;
  /** Where to join an online interview. Absent from an API that predates it. */
  joinUrl?: string | null;
  /** The zone its time is written in. Absent: the company's own. */
  timeZone?: string;
  /** The calendar file's sequence. */
  calendarSequence?: number;
  myScorecardSubmitted: boolean;
};

export type ApiMyInterview = {
  interviewId: string;
  kind: InterviewKind;
  scheduledFor: string;
  durationMins: number;
  status: InterviewStatus;
  location: string | null;
  joinUrl?: string | null;
  timeZone?: string;
  calendarSequence?: number;
  stageName: string | null;
  iAmPanelist: boolean;
  myScorecardSubmitted: boolean;
};

export type ApiMyApplicationCard = {
  id: string;
  requisitionId: string;
  requisitionReference: string;
  jobTitle: string;
  candidateName: string;
  stageName: string | null;
  stageType: StageType | null;
  outcome: ApplicationOutcome;
  stageEnteredAt: string;
  roles: ApiMyRole[];
  myInterviews: ApiMyInterview[];
  hasCv: boolean;
  /**
   * The fit score, only where the job lets this person see scores: **absent**, not
   * null, otherwise. `null` is somebody with no score yet.
   */
  score?: number | null;
  scoreStatus?: ApiScoreStatus | null;
};

export type ApiMyScorecard = {
  id: string;
  interviewerId: string;
  interviewerName: string | null;
  recommendation: ScorecardRecommendation | null;
  notes: string | null;
  submitted: boolean;
  submittedAt: string | null;
  composite: number | null;
  ratings: {
    competency: string;
    score: number;
    weight: number;
    comment: string | null;
  }[];
};

export type ApiMyApplication = {
  id: string;
  requisition: { id: string; reference: string; jobTitle: string };
  candidate: { firstName: string; lastName: string; hasCv: boolean };
  stage: { id: string; name: string; type: StageType } | null;
  outcome: ApplicationOutcome;
  stageEnteredAt: string;
  roles: ApiMyRole[];
  interviews: {
    id: string;
    kind: InterviewKind;
    scheduledFor: string;
    durationMins: number;
    status: InterviewStatus;
    location: string | null;
    joinUrl?: string | null;
    timeZone?: string;
    calendarSequence?: number;
    stageName: string | null;
    iAmPanelist: boolean;
    panel: ApiPanelist[];
    myScorecard: ApiMyScorecard | null;
    /** Everybody's, for a hiring manager. `null` for a panelist: scoring is blind. */
    scorecards: ApiMyScorecard[] | null;
  }[];
  /** The interview score and how it was reached. A hiring manager's; `null` for a panelist. */
  scores: ApiScoreSummary | null;
  /**
   * The fit score and the reasons for it, only where the job lets this person see
   * scores: **absent** otherwise. `null` is somebody added by hand, who has none.
   */
  screening?: {
    status: ApiScoreStatus;
    score: number | null;
    coverage: number | null;
    reasons: string | null;
  } | null;
};

export type MyApplicationsParams = {
  requisitionId?: string;
  stageId?: string;
  includeClosed?: boolean;
  page?: number;
  pageSize?: number;
};

export type MyInterviewsParams = {
  awaitingMyScorecard?: boolean;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

/* ------------------------------------------------------------------------ calls */

const BASE = "/recruitment";

export const candidateEmailApi = {
  catalog: (signal?: AbortSignal) =>
    request<ApiEmailCatalog>(`${BASE}/email-templates`, {
      query: { includeArchived: true },
      ...(signal ? { signal } : {}),
    }),
  create: (body: EmailTemplateBody) =>
    request<ApiEmailTemplate>(`${BASE}/email-templates`, {
      method: "POST",
      body,
    }),
  update: (
    id: string,
    body: Partial<
      Pick<EmailTemplateBody, "name" | "subject" | "body" | "isDefault">
    >,
  ) =>
    request<ApiEmailTemplate>(`${BASE}/email-templates/${id}`, {
      method: "PATCH",
      body,
    }),
  archive: (id: string) =>
    request<ApiEmailTemplate>(`${BASE}/email-templates/${id}/archive`, {
      method: "POST",
    }),
  restore: (id: string) =>
    request<ApiEmailTemplate>(`${BASE}/email-templates/${id}/restore`, {
      method: "POST",
    }),
  preview: (body: PreviewBody, signal?: AbortSignal) =>
    request<ApiEmailPreview>(`${BASE}/email-templates/preview`, {
      method: "POST",
      body,
      ...(signal ? { signal } : {}),
    }),

  getPanel: (requisitionId: string, stageId: string, signal?: AbortSignal) =>
    request<ApiStagePanel>(
      `${BASE}/requisitions/${requisitionId}/stages/${stageId}/panel`,
      { ...(signal ? { signal } : {}) },
    ),
  /**
   * Replaces the panel. Each list that is sent replaces that half (the staff, the
   * invited accounts) and a list that is left out leaves its half alone.
   */
  setPanel: (
    requisitionId: string,
    stageId: string,
    seats: { employeeIds?: string[]; userIds?: string[] },
  ) =>
    request<ApiStagePanel>(
      `${BASE}/requisitions/${requisitionId}/stages/${stageId}/panel`,
      { method: "PUT", body: seats },
    ),

  retention: (signal?: AbortSignal) =>
    request<ApiRetentionReport>(`${BASE}/retention`, {
      ...(signal ? { signal } : {}),
    }),

  myAccess: (signal?: AbortSignal) =>
    request<ApiMyAccess>(`${BASE}/my/access`, {
      ...(signal ? { signal } : {}),
    }),
  myApplications: (params: MyApplicationsParams, signal?: AbortSignal) =>
    requestPaged<ApiMyApplicationCard>(`${BASE}/my/applications`, {
      query: { ...params },
      ...(signal ? { signal } : {}),
    }),
  myApplication: (id: string, signal?: AbortSignal) =>
    request<ApiMyApplication>(`${BASE}/my/applications/${id}`, {
      ...(signal ? { signal } : {}),
    }),
  myCv: (id: string, signal?: AbortSignal) =>
    request<ApiCvLink & { candidateId: string }>(
      `${BASE}/my/applications/${id}/cv`,
      { ...(signal ? { signal } : {}) },
    ),
  myInterviews: (params: MyInterviewsParams, signal?: AbortSignal) =>
    requestPaged<ApiMyInterviewRow>(`${BASE}/my/interviews`, {
      query: { ...params },
      ...(signal ? { signal } : {}),
    }),
  submitMyScorecard: (interviewId: string, body: SubmitScorecardBody) =>
    request<ApiMyScorecard>(`${BASE}/my/interviews/${interviewId}/scorecard`, {
      method: "POST",
      body,
    }),
};
