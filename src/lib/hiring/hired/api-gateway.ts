"use client";

import { ApiError } from "@/lib/api/client";
import { departments as departmentsApi } from "@/lib/api/endpoints";
import {
  hiredApi,
  type ApiHire,
  type ApiHireFilter,
  type ApiHireSelection,
  type ApiHireState,
  type ApiHireSummary,
} from "@/lib/api/hired";
import type { ApiBulkAnswer } from "@/lib/api/pipeline";
import { runBulkJobs } from "@/lib/hiring/pipeline/api-gateway";
import { EmployeeExistsError, existingEmployeeOf } from "./errors";
import type { HiredGateway } from "./gateway";
import type {
  ExportExtra,
  HiredFacets,
  HiredFilters,
  HiredPerson,
  HiredSettings,
  HiredSort,
  HiredTarget,
  OnOfferAccepted,
} from "./model";
import { careersApi, type ApiCareersSettings } from "@/lib/api/careers";

/**
 * The gateway for a connected company: the API, in its own words.
 *
 * It turns the wire into the shapes the screens draw and nothing else. A refusal is
 * left as the `ApiError` the client threw, so the sentence the screen shows is the one
 * the API wrote; the one refusal that is a question rather than a failure, an employee
 * who already has this email, is given a shape of its own.
 */

/* --------------------------------------------------------------------- wire */

const VIA = new Set(["CREATED", "LINKED", "AT_ACCEPTANCE"]);

export function personFrom(hire: ApiHire): HiredPerson {
  const via = hire.employeeVia;
  return {
    id: hire.id,
    applicationId: hire.applicationId,
    reference: hire.reference,
    name: hire.name,
    email: hire.email,
    phone: hire.phone,
    requisitionId: hire.requisitionId,
    role: hire.jobTitle,
    requisitionReference: hire.requisitionReference,
    department: hire.departmentName,
    source: hire.source,
    acceptedAt: hire.offerAcceptedAt,
    startDate: hire.startDate,
    state: hire.state,
    employee: hire.employee
      ? {
          id: hire.employee.id,
          name: hire.employee.name,
          employeeNo: hire.employee.employeeNo,
        }
      : hire.employeeId
        ? { id: hire.employeeId, name: null, employeeNo: null }
        : null,
    employeeVia:
      via !== null && VIA.has(via)
        ? (via as "CREATED" | "LINKED" | "AT_ACCEPTANCE")
        : null,
    didNotJoin: hire.didNotJoin
      ? {
          reason: hire.didNotJoin.reason ?? "No reason was given.",
          at: hire.didNotJoin.at,
          by: hire.didNotJoin.by,
        }
      : null,
    createEmployee: hire.canCreateEmployee.allowed
      ? { allowed: true }
      : {
          allowed: false,
          reason:
            hire.canCreateEmployee.reason ??
            "An employee record cannot be made for them now.",
        },
  };
}

/** The list's own sorts, in the API's words. Only the newest-first order pages by cursor. */
const SORTS: Record<
  HiredSort,
  { sort: "acceptedAt" | "name" | "startDate"; order: "asc" | "desc" }
> = {
  "accepted-desc": { sort: "acceptedAt", order: "desc" },
  "accepted-asc": { sort: "acceptedAt", order: "asc" },
  name: { sort: "name", order: "asc" },
  "start-asc": { sort: "startDate", order: "asc" },
};

const filterParams = (filters: HiredFilters): ApiHireFilter => ({
  ...(filters.q ? { q: filters.q } : {}),
  ...(filters.requisitionId ? { requisitionId: filters.requisitionId } : {}),
  ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
  ...(filters.state ? { state: filters.state as ApiHireState } : {}),
  ...(filters.source ? { source: filters.source } : {}),
  ...(filters.acceptedFrom ? { acceptedFrom: filters.acceptedFrom } : {}),
  ...(filters.acceptedTo ? { acceptedTo: filters.acceptedTo } : {}),
  ...(filters.startFrom ? { startFrom: filters.startFrom } : {}),
  ...(filters.startTo ? { startTo: filters.startTo } : {}),
});

const selectionOf = (target: HiredTarget): ApiHireSelection =>
  target.kind === "ids"
    ? { hireIds: target.ids }
    : { filter: filterParams(target.filters), expectedCount: target.expected };

/** The most hire ids one request takes. */
export const IDS_PER_REQUEST = 2_000;

/* ------------------------------------------------------------------- facets */

/** The channels a company can hear about people through, for the filter menu. */
const CHANNELS = [
  "careers-page",
  "linkedin",
  "referral",
  "agency",
  "sourced",
  "jobberman",
  "x",
  "whatsapp",
  "facebook",
  "email",
];

async function departmentsOf(
  signal: AbortSignal,
): Promise<{ id: string; name: string }[]> {
  try {
    const answer = await departmentsApi.tree(false, signal);
    return answer.flat
      .filter((entry) => entry.depth === 0 && !entry.archived)
      .map((entry) => ({ id: entry.id, name: entry.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    /* A company without Core HR has no departments to filter by. Not a failure. */
    return [];
  }
}

/* ----------------------------------------------------------------- settings */

const settingsFrom = (
  settings: ApiCareersSettings,
  canChange: boolean,
): HiredSettings => {
  const hiring = settings.hiring;
  const chosen: OnOfferAccepted = hiring?.onOfferAccepted ?? "HIRED_LIST_ONLY";
  return {
    onOfferAccepted: chosen,
    effective: hiring?.effective ?? "HIRED_LIST_ONLY",
    coreHr: hiring?.coreHr.available ?? true,
    coreHrReason: hiring?.coreHr.reason ?? null,
    canChange,
  };
};

/* ------------------------------------------------------------------ gateway */

export const apiHiredGateway: HiredGateway = {
  mode: "api",

  facets: async (signal) => {
    const [summary, departments]: [ApiHireSummary, HiredFacets["departments"]] =
      await Promise.all([hiredApi.summary(signal), departmentsOf(signal)]);
    return {
      jobs: summary.jobs.map((job) => ({
        id: job.requisitionId,
        title: job.jobTitle,
        reference: job.reference,
        headcount: job.headcount,
      })),
      departments,
      sources: CHANNELS,
    };
  },

  list: async (query, signal) => {
    const order = SORTS[query.sort];
    const byCursor = query.sort === "accepted-desc";
    /* Newest first pages by the API's cursor. Every other order pages by number, and
       the screen's cursor is that number as text. */
    const pageNumber = byCursor ? 1 : Math.max(1, Number(query.cursor) || 1);
    const answer = await hiredApi.list(
      {
        ...filterParams(query.filters),
        ...order,
        pageSize: query.pageSize,
        ...(byCursor
          ? query.cursor
            ? { cursor: query.cursor }
            : {}
          : { page: pageNumber }),
      },
      signal,
    );
    const counts = answer.meta.counts;
    return {
      rows: answer.data.map(personFrom),
      total: answer.meta.total,
      next: byCursor
        ? answer.meta.nextCursor
        : answer.meta.hasMore
          ? String(pageNumber + 1)
          : null,
      counts: {
        all: counts.total,
        HIRED: counts.byState.HIRED,
        EMPLOYEE_CREATED: counts.byState.EMPLOYEE_CREATED,
        DID_NOT_JOIN: counts.byState.DID_NOT_JOIN,
      },
    };
  },

  createEmployee: async (person) => {
    try {
      const made = await hiredApi.createEmployee(person.id);
      return {
        employeeId: made.employee.id,
        name: made.hire.employee?.name ?? person.name,
      };
    } catch (error) {
      /* An employee with this email is a question, not a failure: hand it on with
         who it is so the screen can offer to link. */
      const existing = existingEmployeeOf(error, person.email);
      if (existing && error instanceof ApiError) {
        throw new EmployeeExistsError(error.message, existing);
      }
      throw error;
    }
  },

  linkEmployee: async (person, employeeId) => {
    await hiredApi.linkEmployee(person.id, employeeId);
  },

  didNotJoin: async (person, reason) => {
    const done = await hiredApi.didNotJoin(person.id, reason);
    return {
      jobReopened: done.requisition.reopened,
      othersTurnedAway: done.requisition.othersTurnedAwayWhenFilled,
    };
  },

  bulkCreateEmployees: async ({
    target,
    idempotencyKey,
    signal,
    onProgress,
  }) => {
    const total =
      target.kind === "filter" ? target.expected : target.ids.length;
    type Body = ApiHireSelection & { idempotencyKey: string };
    const bodies: Body[] =
      target.kind === "filter"
        ? [{ ...selectionOf(target), idempotencyKey }]
        : chunks(target.ids, IDS_PER_REQUEST).map((ids, index, all) => ({
            hireIds: ids,
            idempotencyKey:
              all.length === 1
                ? idempotencyKey
                : `${idempotencyKey}:${String(index)}`,
          }));
    return runBulkJobs<Body>({
      bodies,
      send: (body, sendSignal): Promise<ApiBulkAnswer> =>
        hiredApi.employees(body, sendSignal),
      total,
      /* Making an employee record sends no email of its own. */
      asked: false,
      signal,
      onProgress,
    });
  },

  exportOptions: async (signal) => {
    /* Fixed by the API: every file carries the hire's own record. What can be added is
       narrowed to what this person may read. Salary needs the right to see offers and
       the export itself needs `MANAGE_HIRING`, which this screen already requires. */
    void signal;
    return {
      fixed: [
        "First name",
        "Last name",
        "Email",
        "Phone",
        "Job",
        "Job reference",
        "Department",
        "Employment type",
        "Application reference",
        "Source",
        "Offer accepted",
        "Start date",
        "Status",
        "Employee number",
        "Employee record made on",
        "Did not join on",
        "Why they did not join",
      ],
      extras: [
        {
          key: "answers",
          label: "What they answered on the application form",
          help: "One column per question. Only for people who came through the careers page.",
        },
        {
          key: "screening",
          label: "Screening score",
          help: "The fit score their application got. Advice for a person, not a verdict.",
        },
        {
          key: "salary",
          label: "Pay on the offer",
          help: "The gross monthly pay. Only for people who may see offers.",
        },
      ],
      maxRows: 10_000,
      capMessage: null,
    };
  },

  exportFile: async ({ target, extras }) =>
    hiredApi.exportCsv({
      ...selectionOf(target),
      ...(extras.length > 0 ? { include: extras as ExportExtra[] } : {}),
    }),

  settings: {
    get: async (signal) => {
      const settings = await careersApi.getSettings(signal);
      return settingsFrom(settings, true);
    },
    set: async (value) => {
      const settings = await careersApi.updateSettings({
        onOfferAccepted: value,
      });
      return settingsFrom(settings, true);
    },
  },
};

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < list.length; at += size)
    out.push(list.slice(at, at + size));
  return out;
}
