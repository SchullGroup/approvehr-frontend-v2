import { toCsv } from "@/lib/csv";
import { channelLabel } from "@/lib/hiring/pipeline/filters";
import { referenceFor } from "@/lib/hiring/pipeline/reference";
import { REASON_MAX, REASON_MIN } from "./copy";
import type { ExistingEmployee } from "./errors";
import type {
  BulkOutcome,
  CreateEmployeeCheck,
  ExportExtra,
  HireState,
  HiredCounts,
  HiredFacets,
  HiredFilters,
  HiredPage,
  HiredPerson,
  HiredQuery,
  HiredSettings,
  HiredSort,
  OnOfferAccepted,
} from "./model";

/**
 * The demo's Hired list, as plain functions of a book.
 *
 * Every function here takes the book and answers with a new one, or with the
 * sentence the API would have refused with. No React, no storage: the book itself
 * lives in `demo-store.ts`. Refusals are the same rules, in the same words, the real
 * list enforces, so the demo cannot teach somebody an action that the connected
 * product will not allow. In particular an existing employee with the same email is
 * found **when the record is made**, not before, exactly as the API finds it.
 */

export type DemoHire = {
  id: string;
  name: string;
  email: string;
  phone: string;
  jobId: string;
  source: string | null;
  /** ISO instant. */
  acceptedAt: string;
  /** `YYYY-MM-DD`. */
  startDate: string;
  /** What the offer pays a month, in naira. */
  grossMonthlyNaira: number;
  employeeId: string | null;
  employeeVia: "CREATED" | "LINKED" | "AT_ACCEPTANCE" | null;
  didNotJoin: { reason: string; at: string; by: string } | null;
};

export type DemoEmployee = {
  id: string;
  employeeNo: string;
  name: string;
  email: string;
};

export type DemoJob = {
  id: string;
  title: string;
  reference: string;
  department: string;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";
  headcount: number;
  status: "OPEN" | "FILLED";
};

export type HiredBook = {
  hires: DemoHire[];
  employees: DemoEmployee[];
  jobs: DemoJob[];
  settings: { onOfferAccepted: OnOfferAccepted; coreHr: boolean };
};

export type Op<T = undefined> =
  | { ok: true; book: HiredBook; value: T }
  | { ok: false; error: string; existing?: ExistingEmployee };

const fail = (
  error: string,
  existing?: ExistingEmployee,
): { ok: false; error: string; existing?: ExistingEmployee } => ({
  ok: false,
  error,
  ...(existing ? { existing } : {}),
});

/** The instant the demo's actions are stamped with. */
export const NOW = "2026-08-19T09:00:00.000Z";

export const NO_CORE_HR =
  "Your plan does not include Core HR, so employee records cannot be made from here. The person stays on the Hired list, and you can export it.";

/* ------------------------------------------------------------------ reading */

/** The setting as the screens read it, with what will actually happen worked out. */
export function settingsOf(book: HiredBook): HiredSettings {
  const { onOfferAccepted, coreHr } = book.settings;
  return {
    onOfferAccepted,
    effective:
      onOfferAccepted === "CREATE_EMPLOYEE" && coreHr
        ? "CREATE_EMPLOYEE"
        : "HIRED_LIST_ONLY",
    coreHr,
    coreHrReason: coreHr ? null : NO_CORE_HR,
    canChange: true,
  };
}

export const stateOf = (hire: DemoHire): HireState =>
  hire.didNotJoin
    ? "DID_NOT_JOIN"
    : hire.employeeId
      ? "EMPLOYEE_CREATED"
      : "HIRED";

const jobOf = (book: HiredBook, id: string): DemoJob | undefined =>
  book.jobs.find((job) => job.id === id);

/** People who still hold a place on the job: everybody who has not said they will not join. */
export const placesTaken = (book: HiredBook, jobId: string): number =>
  book.hires.filter((hire) => hire.jobId === jobId && !hire.didNotJoin).length;

/** What the API says about making a record for somebody, before anybody tries. */
function checkFor(book: HiredBook, hire: DemoHire): CreateEmployeeCheck {
  if (hire.didNotJoin)
    return {
      allowed: false,
      reason: "They did not join, so there is no employee record to make.",
    };
  if (hire.employeeId)
    return {
      allowed: false,
      reason: "An employee record already exists for them.",
    };
  if (!book.settings.coreHr) return { allowed: false, reason: NO_CORE_HR };
  return { allowed: true };
}

/** An employee who already has this email, found only when somebody tries. */
function clashOf(book: HiredBook, hire: DemoHire): DemoEmployee | undefined {
  return book.employees.find(
    (employee) => employee.email.toLowerCase() === hire.email.toLowerCase(),
  );
}

export function personOf(book: HiredBook, hire: DemoHire): HiredPerson {
  const job = jobOf(book, hire.jobId);
  const employee = hire.employeeId
    ? book.employees.find((entry) => entry.id === hire.employeeId)
    : null;
  return {
    id: hire.id,
    applicationId: null,
    reference: referenceFor(hire.id),
    name: hire.name,
    email: hire.email,
    phone: hire.phone,
    requisitionId: hire.jobId,
    role: job?.title ?? "A role",
    requisitionReference: job?.reference ?? null,
    department: job?.department ?? null,
    source: hire.source,
    acceptedAt: hire.acceptedAt,
    startDate: hire.startDate,
    state: stateOf(hire),
    employee: hire.employeeId
      ? {
          id: hire.employeeId,
          name: employee?.name ?? null,
          employeeNo: employee?.employeeNo ?? null,
        }
      : null,
    employeeVia: hire.employeeId ? (hire.employeeVia ?? "CREATED") : null,
    didNotJoin: hire.didNotJoin
      ? {
          reason: hire.didNotJoin.reason,
          at: hire.didNotJoin.at,
          by: hire.didNotJoin.by,
        }
      : null,
    createEmployee: checkFor(book, hire),
  };
}

const day = (iso: string): string => iso.slice(0, 10);

function matches(
  book: HiredBook,
  hire: DemoHire,
  filters: HiredFilters,
  withState: boolean,
): boolean {
  const job = jobOf(book, hire.jobId);
  if (filters.requisitionId && hire.jobId !== filters.requisitionId)
    return false;
  /* The demo's department id is the department's name. */
  if (filters.departmentId && job?.department !== filters.departmentId)
    return false;
  if (withState && filters.state && stateOf(hire) !== filters.state)
    return false;
  if (filters.source && hire.source !== filters.source) return false;
  if (filters.acceptedFrom && day(hire.acceptedAt) < filters.acceptedFrom)
    return false;
  if (filters.acceptedTo && day(hire.acceptedAt) > filters.acceptedTo)
    return false;
  if (filters.startFrom && hire.startDate < filters.startFrom) return false;
  if (filters.startTo && hire.startDate > filters.startTo) return false;
  const words = (filters.q ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "");
  if (words.length > 0) {
    const haystack =
      `${hire.name} ${hire.email} ${referenceFor(hire.id)} ${job?.reference ?? ""} ${job?.title ?? ""}`.toLowerCase();
    if (!words.every((word) => haystack.includes(word))) return false;
  }
  return true;
}

const SORTS: Record<HiredSort, (a: DemoHire, b: DemoHire) => number> = {
  "accepted-desc": (a, b) =>
    b.acceptedAt.localeCompare(a.acceptedAt) || a.id.localeCompare(b.id),
  "accepted-asc": (a, b) =>
    a.acceptedAt.localeCompare(b.acceptedAt) || a.id.localeCompare(b.id),
  name: (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  "start-asc": (a, b) =>
    a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id),
};

/** Everybody a set of filters matches, in the order asked for. */
export function hiresMatching(
  book: HiredBook,
  filters: HiredFilters,
  sort: HiredSort = "accepted-desc",
): DemoHire[] {
  return book.hires
    .filter((hire) => matches(book, hire, filters, true))
    .sort(SORTS[sort]);
}

export function countsFor(book: HiredBook, filters: HiredFilters): HiredCounts {
  const counts: HiredCounts = {
    all: 0,
    HIRED: 0,
    EMPLOYEE_CREATED: 0,
    DID_NOT_JOIN: 0,
  };
  for (const hire of book.hires) {
    if (!matches(book, hire, filters, false)) continue;
    counts.all += 1;
    counts[stateOf(hire)] += 1;
  }
  return counts;
}

/** A page by offset, the cursor being the offset as text: the demo has no more to keep. */
export function queryHired(book: HiredBook, query: HiredQuery): HiredPage {
  const all = hiresMatching(book, query.filters, query.sort);
  const from = query.cursor ? Math.max(0, Number(query.cursor) || 0) : 0;
  const slice = all.slice(from, from + query.pageSize);
  const next =
    from + query.pageSize < all.length ? String(from + query.pageSize) : null;
  return {
    rows: slice.map((hire) => personOf(book, hire)),
    total: all.length,
    next,
    counts: countsFor(book, query.filters),
  };
}

export function facetsOf(book: HiredBook): HiredFacets {
  const usedJobs = book.jobs.filter((job) =>
    book.hires.some((hire) => hire.jobId === job.id),
  );
  const sources = [
    ...new Set(
      book.hires.flatMap((hire) => (hire.source ? [hire.source] : [])),
    ),
  ].sort((a, b) => channelLabel(a).localeCompare(channelLabel(b)));
  return {
    jobs: usedJobs.map((job) => ({
      id: job.id,
      title: job.title,
      reference: job.reference,
      headcount: job.headcount,
    })),
    departments: [...new Set(usedJobs.map((job) => job.department))]
      .sort()
      .map((name) => ({ id: name, name })),
    sources,
  };
}

/* ------------------------------------------------------------------- writes */

const replaceHire = (book: HiredBook, next: DemoHire): HiredBook => ({
  ...book,
  hires: book.hires.map((hire) => (hire.id === next.id ? next : hire)),
});

const nextEmployee = (book: HiredBook): { id: string; employeeNo: string } => ({
  id: `emp-demo-${String(book.employees.length + 1)}`,
  employeeNo: `EMP-${String(1000 + book.employees.length + 1)}`,
});

/**
 * Makes the employee record for one hire, or says why not.
 *
 * Refusals are the API's: no Core HR, already made, did not join, and **an employee
 * with the same email**, which comes back with who it is so the screen can offer to
 * link instead.
 */
export function createEmployee(
  book: HiredBook,
  id: string,
): Op<{ employeeId: string; name: string }> {
  const hire = book.hires.find((entry) => entry.id === id);
  if (!hire) return fail("That hire is not on the list.");
  if (!book.settings.coreHr) return fail(NO_CORE_HR);
  if (hire.employeeId)
    return fail("An employee record already exists for them.");
  if (hire.didNotJoin)
    return fail("They did not join, so there is no employee record to make.");

  const clash = clashOf(book, hire);
  if (clash) {
    return fail(
      `${hire.email} is already on ${clash.name}'s record (${clash.employeeNo}). Link this hire to that record if it is the same person, or give them another email first.`,
      {
        employeeId: clash.id,
        name: clash.name,
        employeeNo: clash.employeeNo,
        email: clash.email,
        archived: false,
      },
    );
  }

  const made = nextEmployee(book);
  const withEmployee: HiredBook = {
    ...book,
    employees: [
      ...book.employees,
      { ...made, name: hire.name, email: hire.email },
    ],
  };
  return {
    ok: true,
    book: replaceHire(withEmployee, {
      ...hire,
      employeeId: made.id,
      employeeVia: "CREATED",
    }),
    value: { employeeId: made.id, name: hire.name },
  };
}

export function linkEmployee(
  book: HiredBook,
  id: string,
  employeeId: string,
): Op {
  const hire = book.hires.find((entry) => entry.id === id);
  if (!hire) return fail("That hire is not on the list.");
  if (!book.settings.coreHr) return fail(NO_CORE_HR);
  if (hire.employeeId)
    return fail("An employee record is already linked to them.");
  if (hire.didNotJoin)
    return fail("They did not join, so there is no record to link.");
  if (!book.employees.some((employee) => employee.id === employeeId))
    return fail("That employee was not found.");
  if (book.hires.some((entry) => entry.employeeId === employeeId))
    return fail("That record is already linked to another hire.");
  return {
    ok: true,
    book: replaceHire(book, { ...hire, employeeId, employeeVia: "LINKED" }),
    value: undefined,
  };
}

export function didNotJoin(
  book: HiredBook,
  id: string,
  reason: string,
): Op<{ jobReopened: boolean; othersTurnedAway: number }> {
  const hire = book.hires.find((entry) => entry.id === id);
  if (!hire) return fail("That hire is not on the list.");
  const said = reason.trim();
  if (said.length < REASON_MIN)
    return fail("Say why they did not join, in a few words.");
  if (said.length > REASON_MAX)
    return fail(`Keep the reason under ${String(REASON_MAX)} characters.`);
  if (hire.employeeId)
    return fail(
      "They already have an employee record. If they have left, record that on their record in Core HR.",
    );
  if (hire.didNotJoin)
    return fail("They are already marked as not having joined.");

  const job = jobOf(book, hire.jobId);
  const before = placesTaken(book, hire.jobId);
  const marked = replaceHire(book, {
    ...hire,
    didNotJoin: { reason: said, at: NOW, by: "You" },
  });
  const after = placesTaken(marked, hire.jobId);
  /* The API reopens a filled job only when its hires had reached the headcount and
     this brings them back under it. */
  const reopen =
    job !== undefined &&
    job.status === "FILLED" &&
    before >= job.headcount &&
    after < job.headcount;
  return {
    ok: true,
    book: reopen
      ? {
          ...marked,
          jobs: marked.jobs.map((entry) =>
            entry.id === job.id ? { ...entry, status: "OPEN" as const } : entry,
          ),
        }
      : marked,
    value: { jobReopened: reopen, othersTurnedAway: 0 },
  };
}

export function setOnOfferAccepted(
  book: HiredBook,
  value: OnOfferAccepted,
): Op {
  if (value === "CREATE_EMPLOYEE" && !book.settings.coreHr)
    return fail(NO_CORE_HR);
  return {
    ok: true,
    book: { ...book, settings: { ...book.settings, onOfferAccepted: value } },
    value: undefined,
  };
}

/** One person, one result: the same sentences the API's bulk job uses. */
export function bulkCreate(
  book: HiredBook,
  ids: readonly string[],
): { book: HiredBook; outcome: BulkOutcome } {
  const outcome: BulkOutcome = {
    requested: ids.length,
    done: 0,
    skipped: 0,
    refused: [],
    emailed: null,
  };
  let current = book;
  for (const id of ids) {
    const hire = current.hires.find((entry) => entry.id === id);
    if (!hire) {
      outcome.refused.push({
        id,
        name: "Someone",
        reason: "That hire is not on the list.",
      });
      continue;
    }
    /* An employee record that already exists is nothing to do, not a failure. */
    if (hire.employeeId && !hire.didNotJoin) {
      outcome.skipped += 1;
      continue;
    }
    const result = createEmployee(current, id);
    if (result.ok) {
      current = result.book;
      outcome.done += 1;
    } else {
      outcome.refused.push({ id, name: hire.name, reason: result.error });
    }
  }
  return { book: current, outcome };
}

/* ------------------------------------------------------------------- export */

/** Every file carries these, in the file's own words. */
export const FIXED_COLUMNS = [
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
] as const;

/** The note that heads every file. */
export const FILE_NOTE =
  "This file contains personal data about people your company hired. Keep it somewhere safe, share it only with people who need it, and delete it when you are done.";

/** A cell that a spreadsheet will not run as a formula. */
const safe = (text: string): string =>
  /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

const STATE_WORDS: Record<HireState, string> = {
  HIRED: "Hired",
  EMPLOYEE_CREATED: "Employee record made",
  DID_NOT_JOIN: "Did not join",
};

/** The file: a note, the fixed columns, then whichever extras were asked for. */
export function exportCsv(
  book: HiredBook,
  hires: readonly DemoHire[],
  extras: readonly ExportExtra[],
): string {
  const headers: string[] = [
    ...FIXED_COLUMNS,
    ...(extras.includes("salary") ? ["Gross monthly pay (NGN)"] : []),
    ...(extras.includes("screening") ? ["Fit score", "Screening result"] : []),
    ...(extras.includes("answers")
      ? ["Q1: Do you have the right to work in Nigeria?"]
      : []),
  ];
  const rows = hires.map((hire) => {
    const person = personOf(book, hire);
    const job = jobOf(book, hire.jobId);
    const [first = "", ...rest] = hire.name.split(" ");
    const employee = hire.employeeId
      ? book.employees.find((entry) => entry.id === hire.employeeId)
      : undefined;
    const row: Record<string, string> = {
      "First name": safe(first),
      "Last name": safe(rest.join(" ")),
      Email: safe(hire.email),
      Phone: safe(hire.phone),
      Job: safe(person.role),
      "Job reference": person.requisitionReference ?? "",
      Department: safe(person.department ?? ""),
      "Employment type": job?.employmentType ?? "",
      "Application reference": referenceFor(hire.id),
      Source: person.source ? channelLabel(person.source) : "",
      "Offer accepted": day(hire.acceptedAt),
      "Start date": hire.startDate,
      Status: STATE_WORDS[person.state],
      "Employee number": employee?.employeeNo ?? "",
      "Employee record made on": hire.employeeId ? day(NOW) : "",
      "Did not join on": hire.didNotJoin ? day(hire.didNotJoin.at) : "",
      "Why they did not join": safe(hire.didNotJoin?.reason ?? ""),
    };
    if (extras.includes("salary"))
      row["Gross monthly pay (NGN)"] = hire.grossMonthlyNaira.toFixed(2);
    if (extras.includes("screening")) {
      row["Fit score"] = String(60 + (hire.name.length % 35));
      row["Screening result"] = "SCORED";
    }
    if (extras.includes("answers"))
      row["Q1: Do you have the right to work in Nigeria?"] = "Yes";
    return row;
  });
  const sheet = toCsv(headers, rows, { bom: false });
  return `﻿"${FILE_NOTE}"\r\n${sheet}`;
}
