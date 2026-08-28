"use client";

import type { Employee } from "@/lib/types";
import { request, requestPaged, tokens, type Paged } from "./client";

/**
 * Typed wrappers, one per endpoint.
 *
 * The shapes here are hand-written rather than generated. That is a deliberate
 * choice for now: the API is in the same head as this client, and a generator
 * would add a build step and a drift window for no benefit at this size. When
 * the surface stops moving weekly, generating from the zod schemas is the right
 * next step — the schemas already exist for it.
 *
 * ## Money
 *
 * The API speaks integer **kobo**. This file is the boundary where it becomes
 * naira for the frontend's existing domain types, and the only place that
 * conversion happens. Every API type below uses a `Kobo` suffix so a mistake is
 * visible: `grossMonthlyKobo` and `grossMonthly` cannot be confused at a glance.
 */

export const toNaira = (kobo: number): number => Math.round(kobo) / 100;
export const toKobo = (naira: number): number => Math.round(naira * 100);

/* --------------------------------------------------------------------- auth */

export type ApiUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  organizationId: string;
  /**
   * The company this account belongs to, by name.
   *
   * Optional because only `GET /auth/me` returns it — sign-in and refresh hand
   * back the account alone. Every page load restores through `/auth/me`, so in
   * practice it is present; a screen reading it must still handle the gap by
   * showing **nothing** rather than a guess, which is the point of the field
   * existing at all. See `CompanySwitcher`.
   */
  organization?: {
    id: string;
    legalName: string;
    tradingName: string | null;
  };
  employeeId: string | null;
  permissions: string[];
  /**
   * The roles behind those permissions, by their human names.
   *
   * A permission set cannot be read back into a role — `VIEW_SALARIES` does not
   * say whether its holder is the owner or the payroll officer — so anything
   * that wants to state *which lens* somebody is looking through needs the name
   * rather than the set. `lib/roles.ts` is the only consumer.
   *
   * All three endpoints that hand back an account now agree on this shape:
   * sign-in, register and `/auth/me`. `/auth/me` used to nest it one level
   * deeper, as the join table does.
   *
   * Possibly empty. An account in no role is a state the API can describe, and
   * it is not the same as being an employee.
   */
  roles: { id: string; name: string }[];
  /**
   * `null` means genuinely unverified. `undefined` means an API a deploy
   * behind this frontend didn't send the field at all — `/auth/me` has
   * carried it for a while, `sign-in` and `register` are catching up. Treat
   * the two differently: see `useSession()`'s `emailVerified`, which follows
   * the same defaulting reasoning as `roles` above rather than assuming
   * `Boolean(undefined)` is a safe stand-in for "unverified".
   */
  emailVerifiedAt?: string | null;
  /**
   * When this person finished or skipped the guided tour, or `null`.
   *
   * Absence is what makes the tour appear, the same way
   * `OrgFeatures.setupCompletedAt` being null is what routes a new company
   * into setup. Per person rather than per company: a teammate invited six
   * months later has not seen it either.
   */
  tourDismissedAt: string | null;
};

/**
 * What a sign-in answers with.
 *
 * A **discriminated union**, mirroring the API's. A shape with optional tokens
 * would let a screen render a signed-in state from a response that granted
 * nothing, which is the one mistake this feature cannot survive.
 */
export type SignInOutcome =
  | { kind: "signed-in"; user: ApiUser }
  | {
      kind: "two-factor";
      challengeId: string;
      expiresAt: string;
      /** The code itself, where the server has no mail transport. */
      delivery: { token: string; expiresAt: string; note: string } | null;
      recoveryCodesLeft: number;
    };

export const auth = {
  async signIn(email: string, password: string): Promise<SignInOutcome> {
    const result = await request<
      | { accessToken: string; refreshToken: string; user: ApiUser }
      | {
          twoFactorRequired: true;
          challengeId: string;
          expiresAt: string;
          delivery: { token: string; expiresAt: string; note: string } | null;
          recoveryCodesLeft: number;
        }
    >("/auth/sign-in", {
      method: "POST",
      body: { email, password },
      anonymous: true,
    });

    /* No token is stored on the challenge arm, because there is none to store —
       the API mints nothing until the code is verified. */
    if ("twoFactorRequired" in result) {
      return {
        kind: "two-factor",
        challengeId: result.challengeId,
        expiresAt: result.expiresAt,
        delivery: result.delivery,
        recoveryCodesLeft: result.recoveryCodesLeft,
      };
    }

    tokens.set(result.accessToken, result.refreshToken);
    return { kind: "signed-in", user: result.user };
  },

  /** Finish a challenged sign-in, with the emailed code or a recovery code. */
  async completeTwoFactor(input: {
    challengeId: string;
    code?: string;
    recoveryCode?: string;
  }): Promise<ApiUser> {
    const result = await request<{
      accessToken: string;
      refreshToken: string;
      user: ApiUser;
    }>("/auth/two-factor", {
      method: "POST",
      body: input,
      anonymous: true,
    });
    tokens.set(result.accessToken, result.refreshToken);
    return result.user;
  },

  /** This account's own two-factor state. See `twoFactorStatus` on the API. */
  twoFactorStatus: () =>
    request<{
      enabled: boolean;
      enabledAt: string | null;
      recoveryCodesLeft: number;
      /** Whether an emailed code could actually arrive. */
      emailWorks: boolean;
    }>("/auth/two-factor"),

  /**
   * Turn it on. The recovery codes come back **once** and never again.
   *
   * The caller must show them and must not discard them silently — they are
   * ten live credentials and the only way in if the email never arrives.
   */
  enrolTwoFactor: () =>
    /* `/enrol`, not `/two-factor` — that path is the sign-in completion, and
       mounting both on it made enrolment unreachable. */
    request<{ recoveryCodes: string[]; enabledAt: string }>(
      "/auth/two-factor/enrol",
      { method: "POST" },
    ),

  disableTwoFactor: () =>
    request<{ enabled: false }>("/auth/two-factor", { method: "DELETE" }),

  async signOut(): Promise<void> {
    const refreshToken = tokens.refresh();
    /* Told to the server so the session is revoked rather than merely
       forgotten. A token dropped from localStorage is still valid for 30 days. */
    if (refreshToken) {
      await request<void>("/auth/sign-out", {
        method: "POST",
        body: { refreshToken },
        anonymous: true,
      }).catch(() => {
        /* Already invalid, or offline. Clearing locally is what matters. */
      });
    }
    tokens.clear();
  },

  me: () =>
    request<
      ApiUser & {
        organization: {
          id: string;
          legalName: string;
          tradingName: string | null;
        };
      }
    >("/auth/me"),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
    }),

  /** Finished or skipped — both count as shown. Idempotent on the API. */
  dismissTour: () =>
    request<{ tourDismissedAt: string }>("/auth/tour/dismiss", {
      method: "POST",
    }),
};

/* ---------------------------------------------------------------- employees */

export type ApiEmployee = {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  jobTitle: string;
  departmentId: string | null;
  department: string | null;
  managerId: string | null;
  managerName: string | null;
  workLocationId: string | null;
  workLocation: string | null;
  employmentType: string;
  status: string;
  startDate: string;
  endDate: string | null;
  /**
   * The pay band this role sits in, or null on nobody. Never used to derive
   * `grossMonthlyKobo` — the two are independent figures, set independently,
   * so two people on the same grade can be paid differently.
   */
  salaryGradeId: string | null;
  salaryGrade: { id: string; code: string; name: string } | null;
  /** Whether a payroll run should open this person's PAYE editable by
   *  default. See `Employee.payeManualOverride`. */
  payeManualOverride: boolean;
  /**
   * Whether this record is entitled to a login at all. Most staff are not —
   * this is a payroll and HR record first, and a portal account is opt-in,
   * granted by an invitation (`@/lib/api/invites`). `true` does not mean an
   * account exists yet: it can mean invited-and-not-accepted just as well as
   * signed-in-for-years. There is no field on this type for which of those it
   * is — ask `GET /invites` for the pending half.
   */
  canLogin: boolean;
  /** Null where nobody has agreed a figure. Never rendered as ₦0.00. */
  grossMonthlyKobo: number | null;
  /**
   * Present only from the directory list, where the real fields below are
   * redacted (see `serializeDirectory` in the API). Whether each is on file,
   * never what it is. Absent (not `false`) from a single-record read, where
   * the real fields answer the same question directly.
   */
  hasBankAccount?: boolean;
  hasPensionPin?: boolean;
  hasTin?: boolean;
  bankName: string | null;
  bankAccount: string | null;
  addressLine: string | null;
  nin: string | null;
  stateOfOrigin: string | null;
  lgaOfOrigin: string | null;
  religion: string | null;
  pensionPin: string | null;
  pensionProvider: string | null;
  taxState: string;
  tin: string | null;
  nhfNumber: string | null;
  /** Integer kobo, or null for undeclared. See `Employee.annualRentKobo`. */
  annualRentKobo: number | null;
  rentDeclaredAt: string | null;
  nextOfKin: {
    name: string;
    relationship: string | null;
    phone: string | null;
  } | null;
  avatarUrl: string | null;
  archived: boolean;
  missingForPayroll: string[];
  payrollReady: boolean;
};

export type EmployeeListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  departmentId?: string;
  /** Which site or branch. */
  workLocationId?: string;
  status?: string;
  employmentType?: string;
  /** Widens the set to include archived records. */
  includeArchived?: boolean;
  /** Narrows it to *only* the archived ones. A different question. */
  archivedOnly?: boolean;
  /**
   * Completeness. Three states, not two.
   *
   * `true` — only records payroll cannot file. `false` **with**
   * `payrollReady: true` — only the ready ones. Omitted — do not filter on it.
   * A bare `false` reads as omitted on the wire, which is why readiness needs
   * its own flag rather than being the other half of this one.
   */
  payrollBlocked?: boolean;
  payrollReady?: boolean;
  sort?: string;
  order?: "asc" | "desc";
};

/**
 * The directory's header counts, from the API, under the caller's own filter.
 *
 * `total`, `departments` and `grossMonthlyKobo` follow the filter;
 * `archived` and `payrollBlocked` are whole-company counts, because they sit on
 * the view switcher and have to say how many rows are behind the tab you are
 * not looking at. `payrollBlockedInFilter` is the one for the stat card.
 */
export type EmployeeSummary = {
  total: number;
  archived: number;
  payrollBlocked: number;
  payrollBlockedInFilter: number;
  departments: number;
  /** Integer kobo, summed in the database. */
  grossMonthlyKobo: number;
  byStatus: Record<string, number>;
};

/**
 * `EmployeeListParams` as a query string the API will accept.
 *
 * The booleans have to go over the wire as `"true"` / `"false"` strings because
 * zod's `enum(["true","false"])` is what parses them — and `payrollBlocked`
 * needs its `false` sent explicitly, since it is the half of a three-state
 * filter that means "only the ready ones". Dropping a false here would silently
 * turn "show me who is ready" into "show me everybody".
 */
function employeeQuery(params: EmployeeListParams) {
  return {
    ...params,
    includeArchived: params.includeArchived ? "true" : undefined,
    archivedOnly: params.archivedOnly ? "true" : undefined,
    payrollBlocked:
      params.payrollBlocked === undefined
        ? undefined
        : params.payrollBlocked
          ? "true"
          : "false",
    payrollReady: params.payrollReady ? "true" : undefined,
  };
}

/** A detail somebody asked to change, waiting on payroll. */
export type ApiPendingChange = {
  id: string;
  field: string;
  /** "Account number". The API's wording, so the two cannot drift. */
  label: string;
  /** "••••4471 → ••••5566". Already masked server-side. */
  summary: string;
  requestedAt: string;
};

export type ApiSelfUpdateOutcome = {
  /** Written to the record just now. */
  applied: string[];
  /** Now waiting on somebody. */
  pending: { id: string; field: string; label: string }[];
  /** Sent, but nobody's to change from here — each with who can. */
  refused: { field: string; reason: string }[];
};

export const employees = {
  list: (params: EmployeeListParams = {}, signal?: AbortSignal) =>
    requestPaged<ApiEmployee>("/employees", {
      query: employeeQuery(params),
      ...(signal ? { signal } : {}),
    }),

  /**
   * The header counts, sent the **same** params as the list.
   *
   * Deliberately the same object: the numbers above a filtered table have to be
   * numbers of that filter, and the only way to guarantee they agree is to ask
   * one question twice rather than two questions once.
   */
  summary: (params: EmployeeListParams = {}, signal?: AbortSignal) =>
    request<EmployeeSummary>("/employees/summary", {
      query: employeeQuery(params),
      ...(signal ? { signal } : {}),
    }),

  get: (id: string, signal?: AbortSignal) =>
    request<ApiEmployee>(`/employees/${id}`, { ...(signal ? { signal } : {}) }),

  create: (body: Record<string, unknown>) =>
    request<ApiEmployee>("/employees", { method: "POST", body }),

  update: (id: string, body: Record<string, unknown>) =>
    request<ApiEmployee>(`/employees/${id}`, { method: "PATCH", body }),

  /**
   * The caller's own record, changed by them.
   *
   * Separate from `update` and deliberately so: that one takes an id and can
   * change anybody's salary, this one takes no id and can change only what
   * `self-service.ts` on the API lists. The response is a three-way outcome
   * rather than the employee, because that is what happened — some fields
   * landed, some are waiting on payroll, and some were never the caller's to
   * send. Returning the record alone would show the bank account unchanged
   * with nothing to say why.
   */
  updateMine: (body: Record<string, unknown>) =>
    request<ApiSelfUpdateOutcome>("/employees/me", { method: "PATCH", body }),

  /** What the caller has waiting on somebody. */
  myChanges: (signal?: AbortSignal) =>
    request<{ changes: ApiPendingChange[] }>("/employees/me/changes", {
      ...(signal ? { signal } : {}),
    }),

  archive: (id: string) =>
    request<ApiEmployee>(`/employees/${id}`, { method: "DELETE" }),

  restore: (id: string) =>
    request<ApiEmployee>(`/employees/${id}/restore`, { method: "POST" }),

  history: (id: string) =>
    requestPaged<{
      id: string;
      action: string;
      at: string;
      by: string;
      diff: unknown;
    }>(`/employees/${id}/history`),
};

/* -------------------------------------------------------------------- leave */

export type ApiLeaveType = {
  id: string;
  name: string;
  entitledDays: number;
  accrual: string;
  carryOverMax: number;
  carryOverExpiresMonths: number;
  requiresEvidence: boolean;
  minNoticeDays: number;
  isPaid: boolean;
};

export type ApiLeaveRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeJobTitle: string;
  leaveTypeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "DECLINED" | "CANCELLED";
  approverId: string | null;
  approverName: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
};

export type ApiBalance = {
  leaveTypeId: string;
  leaveType: string;
  year: number;
  entitled: number;
  taken: number;
  pending: number;
  remaining: number;
};

export const leave = {
  types: (signal?: AbortSignal) =>
    request<ApiLeaveType[]>("/leave/types", { ...(signal ? { signal } : {}) }),

  updateType: (id: string, body: Record<string, unknown>) =>
    request<{
      type: ApiLeaveType;
      overdrawn: { employeeId: string; name: string; remaining: number }[];
    }>(`/leave/types/${id}`, { method: "PATCH", body }),

  requests: (
    params: { employeeId?: string; status?: string; pageSize?: number } = {},
    signal?: AbortSignal,
  ) =>
    requestPaged<ApiLeaveRequest>("/leave/requests", {
      query: { pageSize: 200, ...params },
      ...(signal ? { signal } : {}),
    }),

  create: (body: {
    employeeId: string;
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    reason?: string;
  }) =>
    request<{ request: ApiLeaveRequest; warnings: string[] }>(
      "/leave/requests",
      {
        method: "POST",
        body,
      },
    ),

  decide: (id: string, decision: "approve" | "decline", note?: string) =>
    request<ApiLeaveRequest>(`/leave/requests/${id}/decide`, {
      method: "POST",
      body: { decision, ...(note ? { note } : {}) },
    }),

  reopen: (id: string) =>
    request<ApiLeaveRequest>(`/leave/requests/${id}/reopen`, {
      method: "POST",
    }),

  cancel: (id: string) =>
    request<ApiLeaveRequest>(`/leave/requests/${id}/cancel`, {
      method: "POST",
    }),

  balances: (employeeId: string, signal?: AbortSignal) =>
    request<ApiBalance[]>(`/leave/balances/${employeeId}`, {
      ...(signal ? { signal } : {}),
    }),
};

/* ---------------------------------------------------------------- approvals */

export type ApiApproval = {
  id: string;
  kind: string;
  subjectType: string;
  subjectId: string;
  title: string;
  summary: string | null;
  amountKobo: number | null;
  deadlineAt: string | null;
  status: string;
  requestedAt: string;
  waitingDays: number;
};

export const approvals = {
  list: (
    params: { kind?: string; movesMoney?: boolean; overdue?: boolean } = {},
    signal?: AbortSignal,
  ) =>
    requestPaged<ApiApproval>("/approvals", {
      query: {
        pageSize: 100,
        kind: params.kind,
        movesMoney: params.movesMoney ? "true" : undefined,
        overdue: params.overdue ? "true" : undefined,
      },
      ...(signal ? { signal } : {}),
    }),

  summary: (signal?: AbortSignal) =>
    request<{
      pending: number;
      withDeadline: number;
      ageing: number;
      atStakeKobo: number;
      byKind: Record<string, number>;
    }>("/approvals/summary", { ...(signal ? { signal } : {}) }),

  decide: (id: string, decision: "approve" | "decline", note?: string) =>
    request<{ approval: ApiApproval | null; subject: unknown; note?: string }>(
      `/approvals/${id}/decide`,
      { method: "POST", body: { decision, ...(note ? { note } : {}) } },
    ),

  reopen: (id: string) =>
    request<ApiApproval | null>(`/approvals/${id}/reopen`, { method: "POST" }),

  approveRoutine: () =>
    request<{ decided: number; skipped: { id: string; reason: string }[] }>(
      "/approvals/approve-routine",
      { method: "POST" },
    ),
};

/* --------------------------------------------------------------- attendance */

export type ApiRosterRow = {
  employeeId: string;
  employeeName: string;
  jobTitle: string;
  status: "PRESENT" | "LATE" | "ABSENT" | "ON_LEAVE" | "HOLIDAY" | "REST_DAY";
  clockIn: string | null;
  clockOut: string | null;
  lateByMinutes: number;
  workLocation: string | null;
  leave: { id: string; type: string; endDate: string } | null;
  anomaly: string | null;
  correctionNote: string | null;
};

export type ApiAttendancePolicy = {
  id: string;
  shiftStart: string;
  shiftEnd: string;
  graceMinutes: number;
  workingWeekdays: number[];
  selfServiceClockIn: boolean;
};

export type ApiTimesheetRow = {
  employeeId: string;
  employeeName: string;
  workingDays: number;
  daysPresent: number;
  daysLate: number;
  daysOnLeave: number;
  daysUnexplained: number;
  hours: number;
  proration: {
    unpaidDays: number;
    workingDaysPerMonth: number;
    amountKobo: number;
  };
};

export const attendance = {
  locations: (signal?: AbortSignal) =>
    request<
      {
        id: string;
        name: string;
        addressLine: string | null;
        remoteAllowed: boolean;
      }[]
    >("/attendance/locations", { ...(signal ? { signal } : {}) }),

  policy: (signal?: AbortSignal) =>
    request<ApiAttendancePolicy>("/attendance/policy", {
      ...(signal ? { signal } : {}),
    }),

  updatePolicy: (body: Record<string, unknown>) =>
    request<ApiAttendancePolicy>("/attendance/policy", {
      method: "PATCH",
      body,
    }),

  roster: (date?: string, signal?: AbortSignal) =>
    request<{
      date: string;
      policy: ApiAttendancePolicy;
      rows: ApiRosterRow[];
    }>("/attendance/roster", {
      query: { date },
      ...(signal ? { signal } : {}),
    }),

  timesheet: (days = 15, signal?: AbortSignal) =>
    request<{
      from: string;
      to: string;
      workingDays: number;
      rows: ApiTimesheetRow[];
    }>("/attendance/timesheet", {
      query: { days },
      ...(signal ? { signal } : {}),
    }),

  clockIn: (body: { employeeId?: string; workLocationId?: string } = {}) =>
    request<{ employeeId: string; date: string; clockIn: string }>(
      "/attendance/clock-in",
      { method: "POST", body },
    ),

  clockOut: (body: { employeeId?: string } = {}) =>
    request<{ employeeId: string; date: string; clockOut: string }>(
      "/attendance/clock-out",
      { method: "POST", body },
    ),

  correct: (
    employeeId: string,
    date: string,
    body: {
      clockIn?: string | null;
      clockOut?: string | null;
      workLocationId?: string | null;
      note: string;
    },
  ) =>
    request<{
      id: string;
      employeeId: string;
      date: string;
      clockIn: string | null;
      clockOut: string | null;
      workLocation: string | null;
      correctionNote: string | null;
    }>(`/attendance/entries/${employeeId}/${date}`, { method: "PATCH", body }),
};

/* -------------------------------------------------------------- departments */

export type ApiDepartment = {
  id: string;
  name: string;
  parentId: string | null;
  costCentre: string | null;
  headId: string | null;
  headName: string | null;
  /** Assigned to this unit only. */
  directEmployees: number;
  /** Including every team beneath it. */
  totalEmployees: number;
  childCount: number;
  /** 0 is a department; 1+ is a team. */
  depth: number;
  archived: boolean;
  payrollKobo: number;
  children: ApiDepartment[];
};

export type ApiDepartmentDetail = Omit<ApiDepartment, "children"> & {
  ancestors: { id: string; name: string }[];
  employees: {
    id: string;
    name: string;
    jobTitle: string;
    grossMonthlyKobo: number | null;
  }[];
};

export const departments = {
  tree: (includeArchived = false, signal?: AbortSignal) =>
    request<{
      tree: ApiDepartment[];
      flat: Omit<ApiDepartment, "children">[];
      counts: {
        departments: number;
        teams: number;
        unassignedEmployees: number;
      };
    }>("/departments", {
      query: { includeArchived: includeArchived ? "true" : undefined },
      ...(signal ? { signal } : {}),
    }),

  get: (id: string, signal?: AbortSignal) =>
    request<ApiDepartmentDetail>(`/departments/${id}`, {
      ...(signal ? { signal } : {}),
    }),

  create: (body: {
    name: string;
    parentId?: string;
    headId?: string;
    costCentre?: string;
  }) => request<ApiDepartmentDetail>("/departments", { method: "POST", body }),

  update: (
    id: string,
    body: { name?: string; headId?: string | null; costCentre?: string | null },
  ) =>
    request<ApiDepartmentDetail>(`/departments/${id}`, {
      method: "PATCH",
      body,
    }),

  /** `null` promotes it to a top-level department. */
  move: (id: string, parentId: string | null) =>
    request<ApiDepartmentDetail>(`/departments/${id}/move`, {
      method: "POST",
      body: { parentId },
    }),

  archive: (id: string) =>
    request<{ id: string; archived: boolean; note: string }>(
      `/departments/${id}`,
      { method: "DELETE" },
    ),

  restore: (id: string) =>
    request<ApiDepartmentDetail>(`/departments/${id}/restore`, {
      method: "POST",
    }),

  assign: (id: string, employeeIds: string[]) =>
    request<{ moved: number; departmentId: string | null }>(
      `/departments/${id}/employees`,
      { method: "POST", body: { employeeIds } },
    ),

  unassign: (employeeIds: string[]) =>
    request<{ moved: number; departmentId: string | null }>(
      "/departments/unassign",
      { method: "POST", body: { employeeIds } },
    ),
};

/* ------------------------------------------------------------------ company */

export type ApiCompanyProfile = {
  id: string;
  slug: string;
  legalName: string;
  tradingName: string | null;
  rcNumber: string | null;
  tin: string | null;
  industry: string | null;
  addressLine: string | null;
  city: string | null;
  /** An image `data:` URI, or null. Rendered on the payslip masthead. */
  logoUrl: string | null;
  taxState: string | null;
  timezone: string;
  currency: string;
  entities: {
    id: string;
    name: string;
    rcNumber: string | null;
    taxState: string;
    addressLine: string | null;
    isPrimary: boolean;
    employeeCount: number;
  }[];
};

export type ApiRole = {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  userCount: number;
};

export const company = {
  profile: (signal?: AbortSignal) =>
    request<ApiCompanyProfile>("/company/profile", {
      ...(signal ? { signal } : {}),
    }),

  updateProfile: (body: Record<string, unknown>) =>
    request<ApiCompanyProfile>("/company/profile", { method: "PATCH", body }),

  taxStates: (signal?: AbortSignal) =>
    request<string[]>("/company/tax-states", { ...(signal ? { signal } : {}) }),

  roles: (signal?: AbortSignal) =>
    request<{
      permissions: string[];
      roles: ApiRole[];
      warnings: { roleId: string; message: string }[];
    }>("/company/roles", { ...(signal ? { signal } : {}) }),

  updateRole: (id: string, permissions: string[]) =>
    request<{
      permissions: string[];
      roles: ApiRole[];
      warnings: { roleId: string; message: string }[];
    }>(`/company/roles/${id}`, { method: "PATCH", body: { permissions } }),

  notifications: (signal?: AbortSignal) =>
    request<
      {
        id: string;
        event: string;
        email: boolean;
        inApp: boolean;
        recipients: string | null;
      }[]
    >("/company/notifications", { ...(signal ? { signal } : {}) }),

  updateNotification: (
    id: string,
    body: { email?: boolean; inApp?: boolean },
  ) =>
    request<{
      id: string;
      event: string;
      email: boolean;
      inApp: boolean;
      warning: string | null;
    }>(`/company/notifications/${id}`, { method: "PATCH", body }),

  integrations: (signal?: AbortSignal) =>
    request<
      {
        provider: string;
        name: string;
        category: string;
        detail: string;
        status: "unavailable" | "requested";
        requestedAt: string | null;
      }[]
    >("/company/integrations", { ...(signal ? { signal } : {}) }),

  setIntegration: (provider: string, requested: boolean) =>
    request<unknown>("/company/integrations", {
      method: "POST",
      body: { provider, requested },
    }),
};

/* ------------------------------------------------------------------ mappers */

/**
 * `ApiEmployee` → the frontend's `Employee`.
 *
 * The one place kobo becomes naira. It exists so the store swap is a change of
 * data source rather than a rename across twenty-two files — and it is marked as
 * temporary on purpose: once the frontend's own payroll engine is deleted, the
 * domain type should move to kobo and this function should shrink to a
 * pass-through. Until then, this is the seam.
 */
export function toEmployee(api: ApiEmployee): Employee {
  return {
    id: api.id,
    employeeNo: api.employeeNo,
    firstName: api.firstName,
    lastName: api.lastName,
    middleName: api.middleName,
    email: api.email,
    phone: api.phone,
    dateOfBirth: api.dateOfBirth,
    ...(api.gender ? { gender: api.gender as Employee["gender"] } : {}),
    jobTitle: api.jobTitle,
    department: api.department ?? "—",
    managerId: api.managerId,
    location: api.workLocation ?? api.taxState,
    employmentType: api.employmentType as Employee["employmentType"],
    startDate: api.startDate,
    endDate: api.endDate,
    status: api.status.toLowerCase() as Employee["status"],
    salaryGradeId: api.salaryGradeId,
    payeManualOverride: api.payeManualOverride,
    canLogin: api.canLogin,
    grossMonthly:
      api.grossMonthlyKobo === null ? null : toNaira(api.grossMonthlyKobo),
    ...(api.hasBankAccount !== undefined
      ? { hasBankAccount: api.hasBankAccount }
      : {}),
    ...(api.hasPensionPin !== undefined
      ? { hasPensionPin: api.hasPensionPin }
      : {}),
    ...(api.hasTin !== undefined ? { hasTin: api.hasTin } : {}),
    bankName: api.bankName,
    bankAccount: api.bankAccount,
    pensionPin: api.pensionPin,
    pensionProvider: api.pensionProvider,
    taxState: api.taxState,
    tin: api.tin,
    nhfNumber: api.nhfNumber,
    addressLine: api.addressLine,
    nin: api.nin,
    stateOfOrigin: api.stateOfOrigin,
    lgaOfOrigin: api.lgaOfOrigin,
    religion: api.religion,
    /* Already kobo on both sides. Nothing to convert, which is the direction
       the rest of this function is meant to move in. */
    annualRentKobo: api.annualRentKobo,
    rentDeclaredAt: api.rentDeclaredAt,
    nextOfKin: api.nextOfKin
      ? {
          name: api.nextOfKin.name,
          relationship: api.nextOfKin.relationship ?? "",
          phone: api.nextOfKin.phone ?? "",
        }
      : null,
    ...(api.avatarUrl ? { avatarUrl: api.avatarUrl } : {}),
  };
}

export type { Paged };
