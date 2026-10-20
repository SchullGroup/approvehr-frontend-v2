import type { BulkOutcome } from "@/lib/hiring/pipeline/model";

/**
 * What the Hired list draws, whichever side it came from.
 *
 * Accepting an offer puts somebody on this list. **Making an employee of them is a
 * second, explicit step**, and only for a company that has Core HR. The screens read
 * only these types: `api-gateway.ts` turns the API's answers into them and
 * `demo-gateway.ts` makes them from a book kept in this browser, so a screen has one
 * code path and cannot quietly behave differently offline.
 *
 * No React, no state.
 */

/* ---------------------------------------------------------------- settings */

/**
 * What accepting an offer does for this company.
 *
 * `HIRED_LIST_ONLY` is the default and is new: the person goes on the Hired list and
 * nothing else happens. `CREATE_EMPLOYEE` is what accepting an offer always did
 * before the list existed.
 */
export type OnOfferAccepted = "HIRED_LIST_ONLY" | "CREATE_EMPLOYEE";

export type HiredSettings = {
  /** What the company chose. */
  onOfferAccepted: OnOfferAccepted;
  /**
   * What will actually happen: a company that chose `CREATE_EMPLOYEE` and then lost
   * Core HR from its plan gets the list only, and the screen says so.
   */
  effective: OnOfferAccepted;
  /** Whether the company has Core HR, so there is somewhere for an employee to be made. */
  coreHr: boolean;
  /** The API's sentence for why not, when `coreHr` is false. */
  coreHrReason: string | null;
  /** Whether the person looking may change the setting. */
  canChange: boolean;
  /**
   * The two choices in the API's own words, and whether each is available. Absent
   * from the demo, and from an API that does not send them: the screen has its own.
   */
  options?: {
    value: OnOfferAccepted;
    label: string;
    description: string;
    available: boolean;
    unavailableReason: string | null;
  }[];
};

/* ------------------------------------------------------------------ people */

export type HireState = "HIRED" | "EMPLOYEE_CREATED" | "DID_NOT_JOIN";

/** What Create employee may do for one person, as the server says. */
export type CreateEmployeeCheck =
  | {
      allowed: true;
      /**
       * The server's own description of what will be made, when it gives one. Said
       * word for word; the screen's wording is only for when there is none.
       */
      description?: string | null;
    }
  | { allowed: false; reason: string };

export type HiredPerson = {
  /** The hire's own id. */
  id: string;
  /** The pipeline record they came through. `null` for somebody there is no record of. */
  applicationId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  requisitionId: string;
  /** The job title. */
  role: string;
  requisitionReference: string | null;
  department: string | null;
  /** The channel they came by, as the API normalised it. */
  source: string | null;
  /** ISO instant the offer was recorded as accepted. */
  acceptedAt: string;
  /** `YYYY-MM-DD`, from the offer. */
  startDate: string | null;
  state: HireState;
  /** What they quoted when they applied: `APP-J7ET3745`. */
  reference: string | null;
  /** Set once an employee record exists for them. */
  employee: {
    id: string;
    name: string | null;
    /** Their staff number. */
    employeeNo: string | null;
  } | null;
  /**
   * How the employee record came to be theirs: made from the list, linked to one
   * that was already there, or made at the moment the offer was accepted.
   */
  employeeVia: "CREATED" | "LINKED" | "AT_ACCEPTANCE" | null;
  /** Set when they did not join, with the reason that was given. */
  didNotJoin: { reason: string; at: string; by: string | null } | null;
  createEmployee: CreateEmployeeCheck;
};

/* ------------------------------------------------------------ the question */

export type HiredFilters = {
  /** Every word has to match the name, email or reference. */
  q?: string;
  requisitionId?: string;
  departmentId?: string;
  state?: HireState;
  /** The channel, exactly as listed. */
  source?: string;
  /** `YYYY-MM-DD`, inclusive: the day the offer was recorded as accepted. */
  acceptedFrom?: string;
  acceptedTo?: string;
  /** `YYYY-MM-DD`, inclusive: the start date on the offer. */
  startFrom?: string;
  startTo?: string;
};

export type HiredSort = "accepted-desc" | "accepted-asc" | "name" | "start-asc";

export const SORT_LABEL: Record<HiredSort, string> = {
  "accepted-desc": "Newest hire first",
  "accepted-asc": "Oldest hire first",
  name: "Name, A to Z",
  "start-asc": "Starting soonest",
};

export type HiredQuery = {
  filters: HiredFilters;
  sort: HiredSort;
  cursor: string | null;
  pageSize: number;
};

/** How many people each state holds under the filters, the state itself left out. */
export type HiredCounts = {
  all: number;
  HIRED: number;
  EMPLOYEE_CREATED: number;
  DID_NOT_JOIN: number;
};

export type HiredPage = {
  rows: HiredPerson[];
  /** The count under every filter, the state included. */
  total: number;
  /** `null` on the last page. */
  next: string | null;
  /** `null` from a server that does not count by state. */
  counts: HiredCounts | null;
};

export type HiredJob = {
  id: string;
  title: string;
  reference: string | null;
  headcount: number | null;
};

/** What fills the filter menus. */
export type HiredFacets = {
  jobs: HiredJob[];
  /** Empty where the company has no departments to filter by. */
  departments: { id: string; name: string }[];
  sources: string[];
};

/* ------------------------------------------------------------------ writes */

export type CreateEmployeeResult = {
  employeeId: string;
  name: string | null;
};

export type DidNotJoinResult = {
  /** The job had been filled and this put it back to open. */
  jobReopened: boolean;
  /**
   * People turned away when the job filled. They stay turned away: a rejection
   * somebody was told about is not taken back by another person's change of mind.
   * Said so a recruiter can go back to them.
   */
  othersTurnedAway: number;
};

/** Who an action is for: the ticked rows, or everyone a filter matches. */
export type HiredTarget =
  | { kind: "ids"; ids: string[] }
  | {
      kind: "filter";
      filters: HiredFilters;
      /** The count the person was shown and confirmed. */
      expected: number;
    };

export type BulkCreateRequest = {
  target: HiredTarget;
  /** One per click: the same key from the same company is the same action. */
  idempotencyKey: string;
  signal: AbortSignal;
  onProgress: (progress: { done: number; total: number }) => void;
};

/* ------------------------------------------------------------------ export */

export type ExportOptions = {
  /**
   * What every file carries, in the file's own words. Not a choice: the API writes
   * the hire's own record and nothing is left out of it.
   */
  fixed: string[];
  /**
   * More the viewer may see: an answer to each question, a screening score, pay. Only
   * what this person may read is in the list. A column they may not see is absent, not
   * greyed: a greyed one still tells them it exists.
   */
  extras: { key: ExportExtra; label: string; help: string | null }[];
  /** Most people one file holds. */
  maxRows: number;
  /** The API's own wording for the cap, when it has some. */
  capMessage: string | null;
};

/** The extra columns the API can add. */
export type ExportExtra = "answers" | "screening" | "salary";

export type ExportRequest = {
  target: HiredTarget;
  extras: ExportExtra[];
};

export type { BulkOutcome };
