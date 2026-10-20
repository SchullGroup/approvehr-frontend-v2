import { describe, expect, it } from "vitest";
import {
  bulkCreate,
  countsFor,
  createEmployee,
  didNotJoin,
  exportCsv,
  facetsOf,
  FIXED_COLUMNS,
  hiresMatching,
  linkEmployee,
  personOf,
  queryHired,
  settingsOf,
  setOnOfferAccepted,
  type DemoHire,
  type HiredBook,
} from "@/lib/hiring/hired/demo-ops";

/**
 * The demo's Hired list enforces the same rules, in the same words, as the real one:
 * a demo that let somebody do what the product refuses teaches the wrong thing.
 */

const hire = (id: string, over: Partial<DemoHire> = {}): DemoHire => ({
  id,
  name: `Person ${id}`,
  email: `${id}@mail.com`,
  phone: "+234 803 000 0000",
  jobId: "job-a",
  source: "careers-page",
  acceptedAt: "2026-08-10T09:00:00.000Z",
  startDate: "2026-09-01",
  grossMonthlyNaira: 500_000,
  employeeId: null,
  employeeVia: null,
  didNotJoin: null,
  ...over,
});

const book = (over: Partial<HiredBook> = {}): HiredBook => ({
  hires: [
    hire("a1", { acceptedAt: "2026-08-12T09:00:00.000Z" }),
    hire("a2", { acceptedAt: "2026-08-11T09:00:00.000Z" }),
    hire("b1", {
      jobId: "job-b",
      name: "Ngozi Eze",
      email: "ngozi.eze@mail.com",
      source: "linkedin",
      startDate: "2026-10-01",
    }),
  ],
  employees: [],
  jobs: [
    {
      id: "job-a",
      title: "Analyst",
      reference: "FIN-1",
      department: "Finance",
      employmentType: "FULL_TIME",
      headcount: 2,
      status: "FILLED",
    },
    {
      id: "job-b",
      title: "Designer",
      reference: "PRD-1",
      department: "Product",
      employmentType: "FULL_TIME",
      headcount: 1,
      status: "OPEN",
    },
  ],
  settings: { onOfferAccepted: "HIRED_LIST_ONLY", coreHr: true },
  ...over,
});

const ok = <T>(result: { ok: boolean } & Record<string, unknown>): T => {
  if (!result.ok) throw new Error(String(result.error));
  return result as T;
};

describe("reading the list", () => {
  it("is newest hire first, counted by state, with the state itself left out of the counts", () => {
    const page = queryHired(book(), {
      filters: { state: "HIRED" },
      sort: "accepted-desc",
      cursor: null,
      pageSize: 10,
    });
    expect(page.rows.map((row) => row.id)).toEqual(["a1", "a2", "b1"]);
    expect(page.counts).toEqual({
      all: 3,
      HIRED: 3,
      EMPLOYEE_CREATED: 0,
      DID_NOT_JOIN: 0,
    });
  });

  it("narrows by job, department, source, search, and both date ranges, all at once", () => {
    const b = book();
    const ids = (filters: Parameters<typeof hiresMatching>[1]) =>
      hiresMatching(b, filters).map((h) => h.id);
    expect(ids({ requisitionId: "job-a" })).toEqual(["a1", "a2"]);
    expect(ids({ departmentId: "Product" })).toEqual(["b1"]);
    expect(ids({ source: "linkedin" })).toEqual(["b1"]);
    expect(ids({ q: "ngozi eze" })).toEqual(["b1"]);
    expect(ids({ q: "fin-1" })).toEqual(["a1", "a2"]);
    expect(ids({ acceptedFrom: "2026-08-12" })).toEqual(["a1"]);
    expect(ids({ acceptedTo: "2026-08-11" })).toEqual(["a2", "b1"]);
    expect(ids({ startFrom: "2026-09-15" })).toEqual(["b1"]);
    expect(ids({ startTo: "2026-09-15" })).toEqual(["a1", "a2"]);
    expect(ids({ requisitionId: "job-a", source: "linkedin" })).toEqual([]);
  });

  it("sorts by name and by start date, and pages with a cursor that runs out", () => {
    const b = book();
    expect(hiresMatching(b, {}, "name").map((h) => h.name)).toEqual([
      "Ngozi Eze",
      "Person a1",
      "Person a2",
    ]);
    expect(hiresMatching(b, {}, "start-asc")[2]?.id).toBe("b1");

    const first = queryHired(b, {
      filters: {},
      sort: "accepted-desc",
      cursor: null,
      pageSize: 2,
    });
    expect(first.rows).toHaveLength(2);
    expect(first.total).toBe(3);
    expect(first.next).toBe("2");
    const second = queryHired(b, {
      filters: {},
      sort: "accepted-desc",
      cursor: first.next,
      pageSize: 2,
    });
    expect(second.rows.map((row) => row.id)).toEqual(["b1"]);
    expect(second.next).toBeNull();
  });

  it("says the state from what happened to the person, and offers menus only from what the list holds", () => {
    const b = book({
      hires: [
        hire("a1", { employeeId: "emp-1", employeeVia: "LINKED" }),
        hire("a2", {
          didNotJoin: { reason: "Moved abroad", at: "x", by: "You" },
        }),
        hire("b1", { jobId: "job-b" }),
      ],
      employees: [
        {
          id: "emp-1",
          employeeNo: "EMP-0001",
          name: "Person a1",
          email: "a1@mail.com",
        },
      ],
    });
    expect(personOf(b, b.hires[0] as DemoHire).state).toBe("EMPLOYEE_CREATED");
    expect(personOf(b, b.hires[0] as DemoHire).employeeVia).toBe("LINKED");
    expect(personOf(b, b.hires[0] as DemoHire).employee?.employeeNo).toBe(
      "EMP-0001",
    );
    expect(personOf(b, b.hires[1] as DemoHire).state).toBe("DID_NOT_JOIN");
    expect(personOf(b, b.hires[2] as DemoHire).state).toBe("HIRED");
    expect(countsFor(b, {})).toEqual({
      all: 3,
      HIRED: 1,
      EMPLOYEE_CREATED: 1,
      DID_NOT_JOIN: 1,
    });
    const facets = facetsOf(b);
    expect(facets.departments).toEqual([
      { id: "Finance", name: "Finance" },
      { id: "Product", name: "Product" },
    ]);
    expect(facets.sources).toEqual(["careers-page"]);
    expect(facets.jobs.map((job) => job.title)).toEqual([
      "Analyst",
      "Designer",
    ]);
  });

  it("does not know about an employee with the same email until somebody tries, as the API does not", () => {
    const b = book({
      employees: [
        {
          id: "emp-9",
          employeeNo: "EMP-0009",
          name: "Ngozi Eze",
          email: "ngozi.eze@mail.com",
        },
      ],
    });
    const person = personOf(b, b.hires[2] as DemoHire);
    expect(person.createEmployee).toEqual({ allowed: true });
  });
});

describe("Create employee", () => {
  it("makes the record and marks the hire, and it appears among the employees", () => {
    const made = ok<{ book: HiredBook; value: { employeeId: string } }>(
      createEmployee(book(), "a1"),
    );
    const row = made.book.hires.find((h) => h.id === "a1");
    expect(row?.employeeId).toBe(made.value.employeeId);
    expect(made.book.employees.map((e) => e.id)).toContain(
      made.value.employeeId,
    );
    expect(personOf(made.book, row as DemoHire).state).toBe("EMPLOYEE_CREATED");
  });

  it("is refused where the company has no Core HR, and says why", () => {
    const result = createEmployee(
      book({ settings: { onOfferAccepted: "HIRED_LIST_ONLY", coreHr: false } }),
      "a1",
    );
    expect(!result.ok && result.error).toMatch(/does not include Core HR/);
    expect(!result.ok && result.error).toMatch(/stays on the Hired list/);
  });

  it("is refused for somebody who is already one, and for somebody who did not join", () => {
    const made = ok<{ book: HiredBook }>(createEmployee(book(), "a1"));
    expect(createEmployee(made.book, "a1")).toEqual({
      ok: false,
      error: "An employee record already exists for them.",
    });
    const gone = ok<{ book: HiredBook }>(
      didNotJoin(book(), "a2", "Moved away"),
    );
    expect(createEmployee(gone.book, "a2")).toEqual({
      ok: false,
      error: "They did not join, so there is no employee record to make.",
    });
  });

  it("does not count the job's headcount: places are taken when the offer is accepted, not here", () => {
    const b = book({
      hires: [hire("a1"), hire("a2"), hire("a3")],
    });
    for (const id of ["a1", "a2", "a3"]) {
      expect(createEmployee(b, id).ok).toBe(true);
    }
  });

  it("is refused when an employee with the same email exists, says who, and never merges", () => {
    const b = book({
      employees: [
        {
          id: "emp-9",
          employeeNo: "EMP-0009",
          name: "Ngozi Eze",
          email: "Ngozi.Eze@mail.com",
        },
      ],
    });
    const result = createEmployee(b, "b1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(
      /ngozi.eze@mail.com is already on Ngozi Eze's record \(EMP-0009\)/,
    );
    expect(result.error).toMatch(/Link this hire to that record/);
    expect(result.existing).toEqual({
      employeeId: "emp-9",
      name: "Ngozi Eze",
      employeeNo: "EMP-0009",
      email: "Ngozi.Eze@mail.com",
      archived: false,
    });
    expect(b.employees).toHaveLength(1);
  });
});

describe("Link to an existing employee", () => {
  const withEmployee = () =>
    book({
      employees: [
        {
          id: "emp-9",
          employeeNo: "EMP-0009",
          name: "Ngozi Eze",
          email: "ngozi.eze@mail.com",
        },
      ],
    });

  it("points the hire at that employee and creates nobody", () => {
    const linked = ok<{ book: HiredBook }>(
      linkEmployee(withEmployee(), "b1", "emp-9"),
    );
    const row = linked.book.hires.find((h) => h.id === "b1");
    expect(row?.employeeId).toBe("emp-9");
    expect(row?.employeeVia).toBe("LINKED");
    expect(linked.book.employees).toHaveLength(1);
  });

  it("refuses an employee who is not here, one already linked to somebody, and a hire who is done or gone", () => {
    expect(linkEmployee(withEmployee(), "b1", "emp-404")).toEqual({
      ok: false,
      error: "That employee was not found.",
    });
    const linked = ok<{ book: HiredBook }>(
      linkEmployee(withEmployee(), "b1", "emp-9"),
    );
    expect(linkEmployee(linked.book, "b1", "emp-9")).toEqual({
      ok: false,
      error: "An employee record is already linked to them.",
    });
    expect(linkEmployee(linked.book, "a1", "emp-9")).toEqual({
      ok: false,
      error: "That record is already linked to another hire.",
    });
    const gone = ok<{ book: HiredBook }>(
      didNotJoin(withEmployee(), "b1", "Left"),
    );
    expect(linkEmployee(gone.book, "b1", "emp-9")).toEqual({
      ok: false,
      error: "They did not join, so there is no record to link.",
    });
  });
});

describe("Did not join", () => {
  it("needs a reason, and keeps it with the person", () => {
    expect(didNotJoin(book(), "a1", "  ")).toEqual({
      ok: false,
      error: "Say why they did not join, in a few words.",
    });
    const done = ok<{ book: HiredBook }>(
      didNotJoin(book(), "a1", " Took a counter-offer "),
    );
    const row = done.book.hires.find((h) => h.id === "a1");
    expect(row?.didNotJoin?.reason).toBe("Took a counter-offer");
    expect(personOf(done.book, row as DemoHire).didNotJoin?.reason).toBe(
      "Took a counter-offer",
    );
  });

  it("frees the place, and reopens a job that had been filled", () => {
    const done = ok<{
      book: HiredBook;
      value: { jobReopened: boolean };
    }>(didNotJoin(book(), "a1", "Took a counter-offer"));
    expect(done.value.jobReopened).toBe(true);
    expect(done.book.jobs.find((job) => job.id === "job-a")?.status).toBe(
      "OPEN",
    );
  });

  it("leaves a job alone when it was not full, and refuses a second time", () => {
    const done = ok<{
      book: HiredBook;
      value: { jobReopened: boolean };
    }>(didNotJoin(book(), "b1", "Left"));
    expect(done.value.jobReopened).toBe(false);
    expect(didNotJoin(done.book, "b1", "Again")).toEqual({
      ok: false,
      error: "They are already marked as not having joined.",
    });
  });

  it("is refused for somebody who already has an employee record, and says where that is dealt with", () => {
    const made = ok<{ book: HiredBook }>(createEmployee(book(), "a1"));
    const result = didNotJoin(made.book, "a1", "Changed their mind");
    expect(!result.ok && result.error).toMatch(
      /already have an employee record/,
    );
    expect(!result.ok && result.error).toMatch(/Core HR/);
  });
});

describe("Create employees for many", () => {
  it("accounts for everybody: done, left as they were, and refused with the reason", () => {
    const b = book({
      hires: [
        hire("a1"),
        hire("a2", { employeeId: "emp-1", employeeVia: "CREATED" }),
        hire("a3", { didNotJoin: { reason: "Left", at: "x", by: "You" } }),
        hire("b1", { jobId: "job-b", email: "dup@mail.com" }),
      ],
      employees: [
        {
          id: "emp-1",
          employeeNo: "EMP-0001",
          name: "Person a2",
          email: "a2@mail.com",
        },
        {
          id: "emp-2",
          employeeNo: "EMP-0002",
          name: "Dee Uplicate",
          email: "dup@mail.com",
        },
      ],
    });
    const result = bulkCreate(b, ["a1", "a2", "a3", "b1", "zz"]);
    expect(result.outcome.requested).toBe(5);
    expect(result.outcome.done).toBe(1);
    expect(result.outcome.skipped).toBe(1);
    expect(result.outcome.refused.map((r) => r.reason)).toEqual([
      "They did not join, so there is no employee record to make.",
      expect.stringMatching(/already on Dee Uplicate's record \(EMP-0002\)/),
      "That hire is not on the list.",
    ]);
    expect(
      result.outcome.done +
        result.outcome.skipped +
        result.outcome.refused.length,
    ).toBe(5);
  });
});

describe("the setting", () => {
  it("is what the company chose, and says what will really happen", () => {
    expect(settingsOf(book())).toMatchObject({
      onOfferAccepted: "HIRED_LIST_ONLY",
      effective: "HIRED_LIST_ONLY",
      coreHr: true,
      coreHrReason: null,
    });
    const chosen = ok<{ book: HiredBook }>(
      setOnOfferAccepted(book(), "CREATE_EMPLOYEE"),
    );
    expect(settingsOf(chosen.book).effective).toBe("CREATE_EMPLOYEE");
  });

  it("refuses the old behaviour where there is no Core HR, and says why", () => {
    const result = setOnOfferAccepted(
      book({ settings: { onOfferAccepted: "HIRED_LIST_ONLY", coreHr: false } }),
      "CREATE_EMPLOYEE",
    );
    expect(!result.ok && result.error).toMatch(/does not include Core HR/);
    expect(
      settingsOf(
        book({
          settings: { onOfferAccepted: "CREATE_EMPLOYEE", coreHr: false },
        }),
      ),
    ).toMatchObject({
      onOfferAccepted: "CREATE_EMPLOYEE",
      effective: "HIRED_LIST_ONLY",
    });
  });
});

describe("the export", () => {
  const lines = (csv: string) => csv.replace("﻿", "").trim().split("\r\n");

  it("starts with a note that it is personal data, then the fixed columns, and nothing more by default", () => {
    const b = book();
    const out = lines(exportCsv(b, b.hires, []));
    expect(out[0]).toMatch(/contains personal data/);
    expect(out[1]).toBe(FIXED_COLUMNS.join(","));
    expect(out[2]).toMatch(/^Person,a1,a1@mail.com/);
    expect(out[1]).not.toMatch(/Gross monthly pay|Fit score|Q1/);
  });

  it("neutralises a name that a spreadsheet would run as a formula", () => {
    const b = book({
      hires: [hire("a1", { name: '=HYPERLINK("http://evil.test","x")' })],
    });
    expect(exportCsv(b, b.hires, [])).toMatch(/'=HYPERLINK/);
  });

  it("adds an extra only when it was asked for", () => {
    const b = book();
    const plain = exportCsv(b, b.hires, []);
    expect(plain).not.toMatch(/Gross monthly pay|Fit score/);
    const asked = exportCsv(b, b.hires, ["salary", "screening", "answers"]);
    expect(asked).toMatch(/Gross monthly pay \(NGN\)/);
    expect(asked).toMatch(/Fit score/);
    expect(asked).toMatch(/Q1: /);
  });
});
