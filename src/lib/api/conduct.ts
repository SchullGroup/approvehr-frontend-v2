"use client";

import { request, requestPaged, type Paged } from "@/lib/api/client";

/**
 * The handbook and the warnings register — `/api/v1/conduct`.
 *
 * Typed wrappers only, in the same style as `loans.ts` and `grades.ts`. This
 * file knows the shape of the wire and nothing else: no React, no state, no
 * copy. Two resources share the router because they are the same shape — a
 * dated record about a person that somebody authorised — and they share this
 * file for the same reason.
 *
 * ## No money, and no `version` you can send
 *
 * Nothing here is money, so there is no kobo boundary to get wrong. The thing
 * that *is* easy to get wrong is the version: there is no `version` field on
 * any request body below, deliberately. A client that could send one could
 * claim somebody accepted wording they never saw, which is the single thing
 * this module exists to make impossible. `publish` owns the version and nothing
 * else touches it.
 *
 * ## Reads are audited, so do not poll
 *
 * `GET /actions`, `GET /actions/:id` and `GET /employees/:id/actions` each write
 * an audit event before answering. A component that re-fetches on an interval
 * would fill the audit trail with reads nobody made, and the trail is the thing
 * that answers "who has been looking at this person's warnings". Load on mount,
 * reload after a write, and nowhere else.
 *
 * ## What the acknowledgements list does not tell you
 *
 * `GET /policies/:id/acknowledgements` is paged over **people**, not acceptance
 * rows — the useful half of the answer ("who has not") has no rows to page. Its
 * envelope is `{ data, meta }`, so the version those rows are measured against
 * is *not* in the response. Take it from the policy row you already hold; see
 * `ApiAcknowledgementRow.previouslyAcceptedVersion` for why the pairing matters.
 */

/* ------------------------------------------------------------------- shapes */

/** Mirrors `DisciplinaryLevel` in the Prisma schema, in escalating order. */
export type DisciplinaryLevel =
  | "VERBAL"
  | "WRITTEN"
  | "FINAL_WRITTEN"
  | "SUSPENSION"
  | "DISMISSAL";

/**
 * A handbook section as the list returns it.
 *
 * `body` is absent on purpose — twenty-five sections at forty thousand
 * characters each is a megabyte nobody asked for. `ApiPolicyDetail` carries the
 * text.
 */
export type ApiPolicy = {
  id: string;
  title: string;
  /** Groups it in the handbook — "Leave", "Conduct", "IT". */
  category: string | null;
  version: number;
  published: boolean;
  publishedAt: string | null;
  /** False on a reference section: there to read, not to accept. */
  requiresAcknowledgement: boolean;
  archived: boolean;
  /**
   * Accepted **this** version.
   *
   * Somebody who accepted version 1 of a policy now on version 2 is not counted
   * here, and that is the entire point of the field. Counted against current
   * staff only, so `acceptedCount` of `acceptedCount + outstandingCount` always
   * adds up — a leaver cannot accept a handbook, and counting them would mean
   * no policy is ever fully accepted again.
   */
  acceptedCount: number;
  outstandingCount: number;
  /** Nobody left to ask. `true` on a draft, a reference section or a withdrawal. */
  fullyAccepted: boolean;
  createdAt: string;
  updatedAt: string;
};

/** `GET /policies/:id`, and the answer to every policy write. */
export type ApiPolicyDetail = ApiPolicy & { body: string };

/**
 * `POST /policies/:id/publish`.
 *
 * The three extra fields are the consequence, named rather than narrated. The
 * first publish keeps version 1 and invalidates nothing; every publish after
 * bumps, and `acceptancesInvalidated` is how many people are about to be asked
 * again. No acceptance is deleted — they stop answering "has this person
 * accepted what is in force" without ceasing to be true.
 */
export type ApiPublishResult = ApiPolicyDetail & {
  republished: boolean;
  acceptancesInvalidated: number;
  /** How many accounts were told. Zero is possible and worth showing. */
  notified: number;
};

/** `POST /policies/:id/acknowledge`. Idempotent; a second press is not an error. */
export type ApiPolicyAcceptance = {
  id: string;
  policyId: string;
  version: number;
  acknowledgedAt: string;
  /** True when this version was already accepted. Carries the first timestamp. */
  alreadyAccepted: boolean;
};

/**
 * One person against one policy.
 *
 * `ipAddress` is weak evidence and is labelled as such wherever it is shown: a
 * click plus an IP address is not a signature. `acknowledgePolicy` on the API
 * is the single adapter point if a customer ever needs a real one.
 */
export type ApiAcknowledgementRow = {
  employeeId: string;
  name: string;
  employeeNo: string;
  jobTitle: string;
  accepted: boolean;
  acceptedAt: string | null;
  ipAddress: string | null;
  /**
   * They accepted an *older* version, set only while they owe the current one.
   * It is what lets a re-ask say which version they did accept instead of
   * implying they have never read the thing.
   */
  previouslyAcceptedVersion: number | null;
};

/** A policy as it appears on somebody's own list. No `body`, no counts. */
export type ApiMyPolicy = {
  id: string;
  title: string;
  category: string | null;
  version: number;
  publishedAt: string | null;
};

/**
 * `GET /me/policies`. Not paged, and that is deliberate: a to-do list split
 * across pages stops being a to-do list.
 *
 * Three lists rather than one flag, because they are three different things —
 * a to-do, a receipt, and a handbook to read.
 */
export type ApiMyPolicies = {
  outstanding: (ApiMyPolicy & { previouslyAcceptedVersion: number | null })[];
  accepted: (ApiMyPolicy & { acceptedAt: string })[];
  reference: ApiMyPolicy[];
  counts: { outstanding: number; accepted: number; reference: number };
};

/** One warning, as every action endpoint returns it. */
export type ApiAction = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  level: DisciplinaryLevel;
  /** How the level reads in a sentence, so five screens do not each map it. */
  levelLabel: string;
  /** The day it happened, which is not the day it was recorded. */
  incidentOn: string;
  summary: string;
  detail: string | null;
  outcome: string | null;
  issuedById: string | null;
  issuedByName: string | null;
  issuedAt: string;
  /** The **last day** it counts. Null means it never lapses. */
  expiresOn: string | null;
  neverLapses: boolean;
  /** Still counting today. One field, so nothing recomputes it and disagrees. */
  active: boolean;
  acknowledgedAt: string | null;
  disputedAt: string | null;
  disputeNote: string | null;
  awaitingConfirmation: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * `POST /actions`.
 *
 * `employeeNotified` is false when the subject has no sign-in, and there is no
 * mail transport behind any of this — see `src/modules/auth/delivery.ts` on the
 * API. A warning recorded against somebody with no account has reached nobody
 * through this product, and the response says so instead of pretending. Show
 * it; do not swallow it.
 */
export type ApiCreatedAction = ApiAction & { employeeNotified: boolean };

/**
 * `GET /employees/:id/actions`.
 *
 * The summary is why this is not `GET /actions?employeeId=`. "How many active
 * warnings does this person have" must have exactly one answer, and handing a
 * screen a list to count itself is how two parts of a product come to disagree
 * about whether somebody is on a final warning.
 */
export type ApiConductRecord = {
  employee: { id: string; name: string; employeeNo: string; jobTitle: string };
  summary: {
    active: number;
    lapsed: number;
    total: number;
    awaitingConfirmation: number;
    disputed: number;
    /** Active only. A lapsed final warning is not a live final warning. */
    activeByLevel: Record<DisciplinaryLevel, number>;
  };
  actions: ApiAction[];
  total: number;
  page: number;
  pageSize: number;
};

/* -------------------------------------------------------------------- input */

export type PolicyListParams = {
  page?: number;
  pageSize?: number;
  /** Allow-list: title | category | version | publishedAt | createdAt | updatedAt. */
  sort?: "title" | "category" | "version" | "publishedAt" | "createdAt" | "updatedAt";
  order?: "asc" | "desc";
  q?: string;
  category?: string;
  /**
   * Both are forced to `false` for a caller without `MANAGE_SETTINGS` rather
   * than 403ing the route — an employee opening the handbook should see the
   * handbook. Sending them is safe from any screen.
   */
  includeDrafts?: boolean;
  includeArchived?: boolean;
};

export type CreatePolicyBody = {
  title: string;
  category?: string;
  body: string;
  /** Defaults to true on the API: staff normally have to accept. */
  requiresAcknowledgement?: boolean;
  /** Publish in the same call, rather than saving a draft nobody remembers. */
  publish?: boolean;
};

/**
 * Editing a section.
 *
 * `body` is accepted here and **refused with a 409 on a published policy**,
 * naming how many people accepted the current version. That is not an
 * oversight: changing the words under an acceptance means somebody accepted
 * text that no longer exists. `publish` takes new wording instead, and re-asks.
 */
export type UpdatePolicyBody = {
  title?: string;
  /** `null` takes it out of every group. */
  category?: string | null;
  body?: string;
  requiresAcknowledgement?: boolean;
  /** Withdraw it, or bring it back. Acceptances are kept either way. */
  archived?: boolean;
};

/** Publishing a draft unchanged is a bare `{}`. */
export type PublishPolicyBody = {
  title?: string;
  category?: string | null;
  body?: string;
  requiresAcknowledgement?: boolean;
};

export type AcknowledgementListParams = {
  page?: number;
  pageSize?: number;
  sort?: "firstName" | "lastName" | "employeeNo";
  order?: "asc" | "desc";
  q?: string;
  /**
   * `outstanding` is the chase list and `meta.total` is then the number still
   * to ask. `accepted` is the evidence. `all` is the register.
   */
  state?: "all" | "accepted" | "outstanding";
};

export type ActionListParams = {
  page?: number;
  pageSize?: number;
  sort?: "incidentOn" | "issuedAt" | "level" | "expiresOn";
  order?: "asc" | "desc";
  q?: string;
  employeeId?: string;
  level?: DisciplinaryLevel;
  /** `true` is what still counts; `false` is what has lapsed. */
  active?: boolean;
  /** `false` is the chase list — recorded, and the person has not confirmed. */
  acknowledged?: boolean;
  disputed?: boolean;
};

/**
 * Recording a warning.
 *
 * Refused for a subject who is also the issuer, an incident in the future, or
 * an expiry on or before the incident. All three are mistakes rather than
 * policy choices, and the API names each one.
 */
export type CreateActionBody = {
  employeeId: string;
  level: DisciplinaryLevel;
  incidentOn: string;
  summary: string;
  detail?: string;
  outcome?: string;
  /** Absent means it never lapses — right for a dismissal, rarely for a verbal. */
  expiresOn?: string;
  /** Absent means the caller. Set it when recording a warning somebody else gave. */
  issuedById?: string;
};

/**
 * Editing a record.
 *
 * `level`, `incidentOn` and `summary` freeze with a 409 once the employee has
 * confirmed they were told, naming who confirmed and when. `detail`, `outcome`
 * and `expiresOn` stay editable, because the write-up and the review date
 * genuinely come later.
 */
export type UpdateActionBody = {
  level?: DisciplinaryLevel;
  incidentOn?: string;
  summary?: string;
  detail?: string | null;
  outcome?: string | null;
  /** `null` makes it permanent. A date moves when it lapses. */
  expiresOn?: string | null;
};

/**
 * The subject confirming they were told, and contesting it in the same act.
 *
 * One shape rather than two routes because being told and disagreeing happen in
 * the same conversation, and a separate dispute endpoint would allow "disputed
 * but unacknowledged", which means nothing. `{}` — a plain "yes, I was told" —
 * is valid.
 */
export type AcknowledgeActionBody = {
  dispute?: boolean;
  /** Required when disputing, refused when not. */
  disputeNote?: string;
};

/* -------------------------------------------------------------------- calls */

/** Query-string booleans go over the wire as the strings the API validates. */
const flag = (value: boolean | undefined): string | undefined =>
  value === undefined ? undefined : value ? "true" : "false";

export const conductApi = {
  /* ------------------------------------------------------------- policies */

  policies: (params: PolicyListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiPolicy>("/conduct/policies", {
      query: {
        page: params.page,
        pageSize: params.pageSize,
        sort: params.sort,
        order: params.order,
        q: params.q,
        category: params.category,
        includeDrafts: flag(params.includeDrafts),
        includeArchived: flag(params.includeArchived),
      },
      ...(signal ? { signal } : {}),
    }),

  /** With its text. 403 on a draft or a withdrawal without `MANAGE_SETTINGS`. */
  policy: (id: string, signal?: AbortSignal) =>
    request<ApiPolicyDetail>(`/conduct/policies/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  /** Refuses a duplicate title, and names the withdrawn one if that is the clash. */
  createPolicy: (body: CreatePolicyBody) =>
    request<ApiPolicyDetail>("/conduct/policies", { method: "POST", body }),

  updatePolicy: (id: string, body: UpdatePolicyBody) =>
    request<ApiPolicyDetail>(`/conduct/policies/${id}`, { method: "PATCH", body }),

  /** The one call that can change the words of a policy people have accepted. */
  publishPolicy: (id: string, body: PublishPolicyBody = {}) =>
    request<ApiPublishResult>(`/conduct/policies/${id}/publish`, {
      method: "POST",
      body,
    }),

  /** 422 on a draft, a withdrawn policy, or a reference-only one. */
  acceptPolicy: (id: string) =>
    request<ApiPolicyAcceptance>(`/conduct/policies/${id}/acknowledge`, {
      method: "POST",
    }),

  acknowledgements: (
    id: string,
    params: AcknowledgementListParams = {},
    signal?: AbortSignal,
  ) =>
    requestPaged<ApiAcknowledgementRow>(
      `/conduct/policies/${id}/acknowledgements`,
      {
        query: {
          page: params.page,
          pageSize: params.pageSize,
          sort: params.sort,
          order: params.order,
          q: params.q,
          state: params.state,
        },
        ...(signal ? { signal } : {}),
      },
    ),

  /** 422 for a sign-in with no staff record, naming the fix. */
  myPolicies: (signal?: AbortSignal) =>
    request<ApiMyPolicies>("/conduct/me/policies", {
      ...(signal ? { signal } : {}),
    }),

  /* -------------------------------------------------------------- actions */

  /** The register. `EDIT_RECORDS`, and every call is audited. */
  actions: (params: ActionListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiAction>("/conduct/actions", {
      query: {
        page: params.page,
        pageSize: params.pageSize,
        sort: params.sort,
        order: params.order,
        q: params.q,
        employeeId: params.employeeId,
        level: params.level,
        active: flag(params.active),
        acknowledged: flag(params.acknowledged),
        disputed: flag(params.disputed),
      },
      ...(signal ? { signal } : {}),
    }),

  /** The subject, or `EDIT_RECORDS`. No third case. Audited. */
  action: (id: string, signal?: AbortSignal) =>
    request<ApiAction>(`/conduct/actions/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  createAction: (body: CreateActionBody) =>
    request<ApiCreatedAction>("/conduct/actions", { method: "POST", body }),

  updateAction: (id: string, body: UpdateActionBody) =>
    request<ApiAction>(`/conduct/actions/${id}`, { method: "PATCH", body }),

  /** History plus the counts. The subject, or `EDIT_RECORDS`. Audited. */
  record: (
    employeeId: string,
    params: { page?: number; pageSize?: number } = {},
    signal?: AbortSignal,
  ) =>
    request<ApiConductRecord>(`/conduct/employees/${employeeId}/actions`, {
      query: { page: params.page, pageSize: params.pageSize },
      ...(signal ? { signal } : {}),
    }),

  /**
   * The subject confirms, and nobody else.
   *
   * An administrator holding every permission in the enum gets 403 here, which
   * is correct: a confirmation somebody else entered is manufactured evidence.
   * There is a test for it.
   */
  acknowledgeAction: (id: string, body: AcknowledgeActionBody = {}) =>
    request<ApiAction>(`/conduct/actions/${id}/acknowledge`, {
      method: "POST",
      body,
    }),
};

export type PagedPolicies = Paged<ApiPolicy>;
export type PagedAcknowledgements = Paged<ApiAcknowledgementRow>;
export type PagedActions = Paged<ApiAction>;
