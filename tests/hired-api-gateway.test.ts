import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiHire } from "@/lib/api/hired";
import type { ApiBulkJob, ApiBulkRow } from "@/lib/api/pipeline";

/**
 * The connected Hired list: what it asks the API, and what it makes of the answer.
 *
 * The API is faked at the edge (`hiredApi`, `pipelineApi`, `careersApi`), so these hold
 * the translation: a row's `canCreateEmployee` and `employee` become what the screen
 * draws, the newest-first order pages by cursor and every other by number, a filter
 * selection carries the count somebody confirmed, a queued job is waited for and every
 * refusal is fetched, and the one refusal that is a question (an employee already has
 * this email) comes out as a question with who it is.
 */

const calls = {
  list: vi.fn(),
  summary: vi.fn(),
  createEmployee: vi.fn(),
  linkEmployee: vi.fn(),
  didNotJoin: vi.fn(),
  employees: vi.fn(),
  exportCsv: vi.fn(),
  bulkJob: vi.fn(),
  bulkResults: vi.fn(),
  tree: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
};

const proxy = (names: readonly string[]) =>
  new Proxy(
    {},
    {
      get:
        (_t, name: string) =>
        (...args: unknown[]) =>
          names.includes(name)
            ? (calls as Record<string, (...a: unknown[]) => unknown>)[name]?.(
                ...args,
              )
            : undefined,
    },
  );

vi.mock("@/lib/api/hired", () => ({
  hiredApi: proxy([
    "list",
    "summary",
    "createEmployee",
    "linkEmployee",
    "didNotJoin",
    "employees",
    "exportCsv",
  ]),
}));
vi.mock("@/lib/api/pipeline", () => ({
  pipelineApi: proxy(["bulkJob", "bulkResults"]),
}));
vi.mock("@/lib/api/endpoints", () => ({
  departments: proxy(["tree"]),
}));
vi.mock("@/lib/api/careers", () => ({
  careersApi: proxy(["getSettings", "updateSettings"]),
}));

const { apiHiredGateway, IDS_PER_REQUEST } =
  await import("@/lib/hiring/hired/api-gateway");
const { EmployeeExistsError } = await import("@/lib/hiring/hired/errors");
const { person: hiredPerson } = await import("./hired-person");

const hire = (id: string, over: Partial<ApiHire> = {}): ApiHire => ({
  id,
  state: "HIRED",
  name: `Person ${id}`,
  firstName: "Person",
  lastName: id,
  email: `${id}@example.com`,
  phone: null,
  jobTitle: "Payroll Analyst",
  requisitionId: "req-1",
  requisitionReference: "FIN-032",
  departmentId: "dept-1",
  departmentName: "Finance",
  employmentType: "FULL_TIME",
  reference: "APP-J7ET3745",
  source: "linkedin",
  offerAcceptedAt: "2026-10-10T09:00:00.000Z",
  startDate: "2026-11-02",
  applicationId: `pa-${id}`,
  candidateId: `c-${id}`,
  offerId: `o-${id}`,
  jobApplicationId: null,
  employeeId: null,
  employeeCreatedAt: null,
  employeeVia: null,
  employee: null,
  didNotJoin: null,
  canCreateEmployee: { allowed: true, code: null, reason: null },
  ...over,
});

const meta = (over: Record<string, unknown> = {}) => ({
  page: 1,
  pageSize: 25,
  total: 2,
  totalPages: 1,
  hasMore: false,
  nextCursor: null,
  counts: {
    total: 5,
    byState: { HIRED: 3, EMPLOYEE_CREATED: 1, DID_NOT_JOIN: 1 },
  },
  coreHr: { available: true, reason: null },
  ...over,
});

const job = (over: Partial<ApiBulkJob>): ApiBulkJob => ({
  id: "job-1",
  action: "CREATE_EMPLOYEE" as ApiBulkJob["action"],
  status: "DONE",
  total: 2,
  applied: 2,
  skipped: 0,
  refused: 0,
  pending: 0,
  progress: 100,
  requisitionId: null,
  subjectType: "hire",
  idempotencyKey: "k",
  createdAt: "2026-10-01T09:00:00.000Z",
  startedAt: null,
  finishedAt: null,
  error: null,
  ...over,
});

const row = (
  id: string,
  status: ApiBulkRow["status"],
  code: string | null = null,
  message: string | null = null,
): ApiBulkRow => ({
  subjectId: id,
  subjectType: "hire",
  name: `Person ${id}`,
  status,
  code,
  message,
  settledAt: "2026-10-01T09:00:00.000Z",
});

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockReset();
});

describe("the list", () => {
  it("draws a row from what the API says, and counts every state from the envelope", async () => {
    calls.list.mockResolvedValue({
      data: [
        hire("a"),
        hire("b", {
          state: "EMPLOYEE_CREATED",
          employeeId: "e-1",
          employeeVia: "LINKED",
          employee: {
            id: "e-1",
            employeeNo: "EMP-0001",
            name: "Person b",
            archived: false,
          },
          canCreateEmployee: {
            allowed: false,
            code: "already_created",
            reason: "An employee record already exists for them.",
          },
        }),
        hire("c", {
          state: "DID_NOT_JOIN",
          didNotJoin: {
            at: "2026-10-12T09:00:00.000Z",
            reason: null,
            byUserId: "u-1",
            by: "Fatima Bello",
          },
        }),
      ],
      meta: meta({ total: 3 }),
    });
    const page = await apiHiredGateway.list(
      {
        filters: {},
        sort: "accepted-desc",
        cursor: null,
        pageSize: 25,
      },
      new AbortController().signal,
    );
    expect(page.total).toBe(3);
    expect(page.counts).toEqual({
      all: 5,
      HIRED: 3,
      EMPLOYEE_CREATED: 1,
      DID_NOT_JOIN: 1,
    });
    const [a, b, c] = page.rows;
    expect(a).toMatchObject({
      id: "a",
      applicationId: "pa-a",
      role: "Payroll Analyst",
      department: "Finance",
      acceptedAt: "2026-10-10T09:00:00.000Z",
      createEmployee: { allowed: true },
    });
    expect(b).toMatchObject({
      state: "EMPLOYEE_CREATED",
      employeeVia: "LINKED",
      employee: { id: "e-1", name: "Person b", employeeNo: "EMP-0001" },
      createEmployee: {
        allowed: false,
        reason: "An employee record already exists for them.",
      },
    });
    expect(c?.didNotJoin).toEqual({
      reason: "No reason was given.",
      at: "2026-10-12T09:00:00.000Z",
      by: "Fatima Bello",
    });
  });

  it("pages newest-first by the API's cursor, and any other order by page number", async () => {
    calls.list.mockResolvedValue({
      data: [],
      meta: meta({ hasMore: true, nextCursor: "abc" }),
    });
    const signal = new AbortController().signal;
    const first = await apiHiredGateway.list(
      { filters: {}, sort: "accepted-desc", cursor: null, pageSize: 25 },
      signal,
    );
    expect(first.next).toBe("abc");
    expect(calls.list.mock.calls[0]?.[0]).toMatchObject({
      sort: "acceptedAt",
      order: "desc",
      pageSize: 25,
    });
    expect(calls.list.mock.calls[0]?.[0]).not.toHaveProperty("page");

    await apiHiredGateway.list(
      { filters: {}, sort: "accepted-desc", cursor: "abc", pageSize: 25 },
      signal,
    );
    expect(calls.list.mock.calls[1]?.[0]).toMatchObject({ cursor: "abc" });

    calls.list.mockResolvedValue({
      data: [],
      meta: meta({ hasMore: true, nextCursor: null }),
    });
    const byName = await apiHiredGateway.list(
      { filters: {}, sort: "name", cursor: null, pageSize: 25 },
      signal,
    );
    expect(calls.list.mock.calls[2]?.[0]).toMatchObject({
      sort: "name",
      order: "asc",
      page: 1,
    });
    expect(calls.list.mock.calls[2]?.[0]).not.toHaveProperty("cursor");
    expect(byName.next).toBe("2");

    await apiHiredGateway.list(
      { filters: {}, sort: "name", cursor: "2", pageSize: 25 },
      signal,
    );
    expect(calls.list.mock.calls[3]?.[0]).toMatchObject({ page: 2 });
  });

  it("sends every filter in the API's words and nothing that was not set", async () => {
    calls.list.mockResolvedValue({ data: [], meta: meta() });
    await apiHiredGateway.list(
      {
        filters: {
          q: "ada",
          requisitionId: "req-1",
          departmentId: "dept-1",
          state: "HIRED",
          source: "linkedin",
          acceptedFrom: "2026-10-01",
          acceptedTo: "2026-10-31",
          startFrom: "2026-11-01",
          startTo: "2026-11-30",
        },
        sort: "start-asc",
        cursor: null,
        pageSize: 10,
      },
      new AbortController().signal,
    );
    expect(calls.list.mock.calls[0]?.[0]).toEqual({
      q: "ada",
      requisitionId: "req-1",
      departmentId: "dept-1",
      state: "HIRED",
      source: "linkedin",
      acceptedFrom: "2026-10-01",
      acceptedTo: "2026-10-31",
      startFrom: "2026-11-01",
      startTo: "2026-11-30",
      sort: "startDate",
      order: "asc",
      pageSize: 10,
      page: 1,
    });
  });

  it("fills the menus from the jobs that have hires, the company's departments, and a department failure is not a failure", async () => {
    calls.summary.mockResolvedValue({
      total: 2,
      byState: { HIRED: 2, EMPLOYEE_CREATED: 0, DID_NOT_JOIN: 0 },
      jobs: [
        {
          requisitionId: "req-1",
          reference: "FIN-032",
          jobTitle: "Payroll Analyst",
          status: "FILLED",
          headcount: 2,
          hired: 2,
          employeeCreated: 0,
          didNotJoin: 0,
          filled: 2,
          placesLeft: 0,
        },
      ],
      coreHr: { available: true, reason: null },
      onOfferAccepted: {
        setting: "HIRED_LIST_ONLY",
        effective: "HIRED_LIST_ONLY",
      },
    });
    calls.tree.mockResolvedValue({
      flat: [
        { id: "d1", name: "Finance", depth: 0, archived: false },
        { id: "d2", name: "Payroll team", depth: 1, archived: false },
        { id: "d3", name: "Old unit", depth: 0, archived: true },
      ],
    });
    const signal = new AbortController().signal;
    const facets = await apiHiredGateway.facets(signal);
    expect(facets.jobs).toEqual([
      {
        id: "req-1",
        title: "Payroll Analyst",
        reference: "FIN-032",
        headcount: 2,
      },
    ]);
    expect(facets.departments).toEqual([{ id: "d1", name: "Finance" }]);

    calls.tree.mockRejectedValue(new ApiError(402, "payment_required", "No."));
    expect((await apiHiredGateway.facets(signal)).departments).toEqual([]);
  });
});

describe("making an employee", () => {
  const person = hiredPerson("a");

  it("names the record that was made", async () => {
    calls.createEmployee.mockResolvedValue({
      employee: { id: "e-9", employeeNo: "EMP-0009" },
      hire: hire("a", {
        state: "EMPLOYEE_CREATED",
        employee: {
          id: "e-9",
          employeeNo: "EMP-0009",
          name: "Person a",
          archived: false,
        },
      }),
    });
    await expect(apiHiredGateway.createEmployee(person)).resolves.toEqual({
      employeeId: "e-9",
      name: "Person a",
    });
  });

  it("turns 'an employee has this email' into a question, with who it is", async () => {
    calls.createEmployee.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        "a@example.com is already on Ada Obi's record (EMP-0457). Link this hire to that record if it is the same person.",
        {
          reason: "employee_exists",
          employeeId: "e-1",
          employeeNo: "EMP-0457",
          employeeName: "Ada Obi",
          archived: false,
        },
      ),
    );
    const error = await apiHiredGateway.createEmployee(person).catch((e) => e);
    expect(error).toBeInstanceOf(EmployeeExistsError);
    expect(error.message).toMatch(/already on Ada Obi's record/);
    expect(error.existing).toEqual({
      employeeId: "e-1",
      name: "Ada Obi",
      employeeNo: "EMP-0457",
      email: "a@example.com",
      archived: false,
    });
  });

  it("leaves every other refusal exactly as the API said it", async () => {
    const refused = new ApiError(
      422,
      "unprocessable",
      "Your plan does not include Core HR.",
      { reason: "core_hr_off" },
    );
    calls.createEmployee.mockRejectedValue(refused);
    await expect(apiHiredGateway.createEmployee(person)).rejects.toBe(refused);
    const taken = new ApiError(409, "conflict", "They already have one.", {
      reason: "already_created",
    });
    calls.createEmployee.mockRejectedValue(taken);
    await expect(apiHiredGateway.createEmployee(person)).rejects.toBe(taken);
  });

  it("links by the employee's id, and says how a did-not-join went", async () => {
    calls.linkEmployee.mockResolvedValue(hire("a"));
    await apiHiredGateway.linkEmployee(person, "e-1");
    expect(calls.linkEmployee).toHaveBeenCalledWith("a", "e-1");

    calls.didNotJoin.mockResolvedValue({
      requisition: {
        id: "req-1",
        reference: "FIN-032",
        status: "OPEN",
        headcount: 2,
        hired: 1,
        reopened: true,
        othersTurnedAwayWhenFilled: 4,
      },
      hire: hire("a", { state: "DID_NOT_JOIN" }),
    });
    await expect(
      apiHiredGateway.didNotJoin(person, "Took a counter-offer"),
    ).resolves.toEqual({ jobReopened: true, othersTurnedAway: 4 });
    expect(calls.didNotJoin).toHaveBeenCalledWith("a", "Took a counter-offer");
  });
});

describe("making employees for many", () => {
  const signal = () => new AbortController().signal;

  it("sends a ticked list as hire ids, a big one in parts the API will take, and a filter with the count confirmed", async () => {
    calls.employees.mockResolvedValue({
      dryRun: false,
      replay: false,
      job: job({ total: 2 }),
      results: [row("a", "APPLIED"), row("b", "APPLIED")],
    });
    await apiHiredGateway.bulkCreateEmployees({
      target: { kind: "ids", ids: ["a", "b"] },
      idempotencyKey: "key-12345678",
      signal: signal(),
      onProgress: () => undefined,
    });
    expect(calls.employees.mock.calls[0]?.[0]).toEqual({
      hireIds: ["a", "b"],
      idempotencyKey: "key-12345678",
    });

    calls.employees.mockClear();
    const ids = Array.from({ length: IDS_PER_REQUEST + 5 }, (_, i) => `h${i}`);
    calls.employees.mockImplementation(async (body: { hireIds: string[] }) => ({
      dryRun: false,
      replay: false,
      job: job({ total: body.hireIds.length, applied: body.hireIds.length }),
      results: body.hireIds.map((id) => row(id, "APPLIED")),
    }));
    const big = await apiHiredGateway.bulkCreateEmployees({
      target: { kind: "ids", ids },
      idempotencyKey: "key-12345678",
      signal: signal(),
      onProgress: () => undefined,
    });
    expect(calls.employees).toHaveBeenCalledTimes(2);
    expect(calls.employees.mock.calls[0]?.[0].idempotencyKey).toBe(
      "key-12345678:0",
    );
    expect(big.requested).toBe(IDS_PER_REQUEST + 5);

    calls.employees.mockReset();
    calls.employees.mockResolvedValue({
      dryRun: false,
      replay: false,
      job: job({ total: 40, applied: 40 }),
      results: [],
    });
    await apiHiredGateway.bulkCreateEmployees({
      target: {
        kind: "filter",
        filters: { state: "HIRED", requisitionId: "req-1" },
        expected: 40,
      },
      idempotencyKey: "key-12345678",
      signal: signal(),
      onProgress: () => undefined,
    });
    expect(calls.employees.mock.calls[0]?.[0]).toEqual({
      filter: { state: "HIRED", requisitionId: "req-1" },
      expectedCount: 40,
      idempotencyKey: "key-12345678",
    });
  });

  it("accounts for everybody: done, skipped, and each refusal by name with the API's sentence, and says no email went", async () => {
    calls.employees.mockResolvedValue({
      dryRun: false,
      replay: false,
      job: job({ total: 3, applied: 1, skipped: 1, refused: 1 }),
      results: [
        row("a", "APPLIED"),
        row(
          "b",
          "SKIPPED",
          "already_created",
          "An employee record already exists for them.",
        ),
        row(
          "c",
          "REFUSED",
          "employee_exists",
          "c@example.com is already on Ada Obi's record (EMP-0457).",
        ),
      ],
    });
    const outcome = await apiHiredGateway.bulkCreateEmployees({
      target: { kind: "ids", ids: ["a", "b", "c"] },
      idempotencyKey: "key-12345678",
      signal: signal(),
      onProgress: () => undefined,
    });
    expect(outcome).toMatchObject({
      requested: 3,
      done: 1,
      skipped: 1,
      emailed: null,
    });
    expect(outcome.refused).toEqual([
      {
        id: "c",
        name: "Person c",
        reason: "c@example.com is already on Ada Obi's record (EMP-0457).",
      },
    ]);
  });

  it("waits for a queued job and then fetches who it refused", async () => {
    calls.employees.mockResolvedValue({
      dryRun: false,
      replay: false,
      job: job({ status: "QUEUED", total: 300, applied: 0, pending: 300 }),
      results: null,
    });
    calls.bulkJob.mockResolvedValueOnce(
      job({ status: "RUNNING", total: 300, applied: 120, pending: 180 }),
    );
    calls.bulkJob.mockResolvedValueOnce(
      job({ status: "DONE", total: 300, applied: 298, refused: 2, pending: 0 }),
    );
    calls.bulkResults.mockResolvedValue({
      data: [
        row("x", "REFUSED", "employee_exists", "x is taken."),
        row("y", "REFUSED", "did_not_join", "They did not join."),
      ],
      meta: { hasMore: false },
    });
    const progress: number[] = [];
    const outcome = await apiHiredGateway.bulkCreateEmployees({
      target: { kind: "filter", filters: {}, expected: 300 },
      idempotencyKey: "key-12345678",
      signal: signal(),
      onProgress: (p) => progress.push(p.done),
    });
    expect(outcome.done).toBe(298);
    expect(outcome.refused.map((r) => r.reason)).toEqual([
      "x is taken.",
      "They did not join.",
    ]);
    expect(progress.some((done) => done > 0 && done < 300)).toBe(true);
  }, 10_000);
});

describe("the export", () => {
  it("sends a selection by ids, or by filter with its count, and adds an extra only when asked", async () => {
    calls.exportCsv.mockResolvedValue({
      filename: "hired-people.csv",
      body: "x",
    });
    await apiHiredGateway.exportFile({
      target: { kind: "ids", ids: ["a"] },
      extras: [],
    });
    expect(calls.exportCsv.mock.calls[0]?.[0]).toEqual({ hireIds: ["a"] });

    await apiHiredGateway.exportFile({
      target: {
        kind: "filter",
        filters: { state: "HIRED" },
        expected: 12,
      },
      extras: ["answers", "salary"],
    });
    expect(calls.exportCsv.mock.calls[1]?.[0]).toEqual({
      filter: { state: "HIRED" },
      expectedCount: 12,
      include: ["answers", "salary"],
    });
  });

  it("offers the fixed columns and the three extras the API can add, with the cap", async () => {
    const options = await apiHiredGateway.exportOptions(
      new AbortController().signal,
    );
    expect(options.fixed).toContain("Email");
    expect(options.fixed).toContain("Why they did not join");
    expect(options.extras.map((e) => e.key)).toEqual([
      "answers",
      "screening",
      "salary",
    ]);
    expect(options.maxRows).toBe(10_000);
  });
});

describe("the setting", () => {
  const view = (hiring: Record<string, unknown> | undefined) => ({
    branding: {},
    ...(hiring ? { hiring } : {}),
  });

  it("is what the company chose, what will really happen, and why Core HR is not there", async () => {
    calls.getSettings.mockResolvedValue(
      view({
        onOfferAccepted: "CREATE_EMPLOYEE",
        effective: "HIRED_LIST_ONLY",
        coreHr: {
          available: false,
          reason: "Your plan does not include Core HR.",
        },
        options: [],
      }),
    );
    await expect(
      apiHiredGateway.settings.get(new AbortController().signal),
    ).resolves.toEqual({
      onOfferAccepted: "CREATE_EMPLOYEE",
      effective: "HIRED_LIST_ONLY",
      coreHr: false,
      coreHrReason: "Your plan does not include Core HR.",
      canChange: true,
    });
  });

  it("sends the choice, and a server that has no such setting reads as the list only", async () => {
    calls.updateSettings.mockResolvedValue(
      view({
        onOfferAccepted: "CREATE_EMPLOYEE",
        effective: "CREATE_EMPLOYEE",
        coreHr: { available: true, reason: null },
        options: [],
      }),
    );
    await expect(
      apiHiredGateway.settings.set("CREATE_EMPLOYEE"),
    ).resolves.toMatchObject({ effective: "CREATE_EMPLOYEE", coreHr: true });
    expect(calls.updateSettings).toHaveBeenCalledWith({
      onOfferAccepted: "CREATE_EMPLOYEE",
    });

    calls.getSettings.mockResolvedValue(view(undefined));
    await expect(
      apiHiredGateway.settings.get(new AbortController().signal),
    ).resolves.toMatchObject({
      onOfferAccepted: "HIRED_LIST_ONLY",
      effective: "HIRED_LIST_ONLY",
    });
  });

  it("passes the API's refusal through untouched when Core HR is not there for the old behaviour", async () => {
    const refused = new ApiError(
      422,
      "unprocessable",
      "Your plan does not include Core HR, so employee records cannot be made from here.",
    );
    calls.updateSettings.mockRejectedValue(refused);
    await expect(apiHiredGateway.settings.set("CREATE_EMPLOYEE")).rejects.toBe(
      refused,
    );
  });
});
