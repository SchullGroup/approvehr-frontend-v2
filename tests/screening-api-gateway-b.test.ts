import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * The connected gateway's second half, with the API faked at its edge.
 *
 * What these hold: the pass mark goes to the API in the API's words and comes back
 * in the screen's, a count is the API's own count of undecided people, the list
 * below the pass mark is asked for in the API's reasons and pages by its cursor,
 * rejecting from it is a bulk job that names the advert and the confirmed count and
 * emails nobody unless asked, results are typed in under the test's name, and a file
 * of results is checked in parts and saved as those same parts.
 */

const screening = {
  getCutoff: vi.fn(),
  previewCutoff: vi.fn(),
  putCutoff: vi.fn(),
  confirmList: vi.fn(),
  keep: vi.fn(),
  assessments: vi.fn(),
  putAssessment: vi.fn(),
  getCriteria: vi.fn(),
};
const careers = { getApplication: vi.fn() };
const recruitment = { getApplication: vi.fn() };
const importing = { validate: vi.fn(), apply: vi.fn() };
const pipeline = { bulk: vi.fn(), bulkJob: vi.fn(), bulkResults: vi.fn() };

const proxy = (target: Record<string, unknown>) =>
  new Proxy(
    {},
    {
      get:
        (_t, name: string) =>
        (...args: unknown[]) =>
          (target[name] as ((...a: unknown[]) => unknown) | undefined)?.(
            ...args,
          ),
    },
  );

vi.mock("@/lib/api/screening", () => ({ screeningApi: proxy(screening) }));
vi.mock("@/lib/api/careers", () => ({ careersApi: proxy(careers) }));
vi.mock("@/lib/api/recruitment", () => ({
  recruitmentApi: proxy(recruitment),
}));
vi.mock("@/lib/api/imports", () => ({ imports: proxy(importing) }));
vi.mock("@/lib/api/pipeline", () => ({ pipelineApi: proxy(pipeline) }));

const { apiScreeningGateway: gateway } =
  await import("@/lib/hiring/screening/api-gateway");
const { planSpans } = await import("@/lib/hiring/screening/assessment-import");
const { refusalOf } = await import("@/lib/hiring/screening/wire");

const signal = new AbortController().signal;

const counts = (over: Record<string, unknown> = {}) => ({
  working: 30,
  undecided: 20,
  wouldBeBelow: 5,
  byReason: { SCORE: 4, ASSESSMENT: 2, KNOCKOUT: 1 },
  kept: 1,
  withoutScore: 3,
  withoutAssessment: 2,
  currentlyBelow: 5,
  ...over,
});

const cutoff = (over: Record<string, unknown> = {}) => ({
  postingId: "p1",
  configured: true,
  fitScoreMin: 50,
  assessmentMinPct: 60,
  assessmentTest: "Aptitude",
  flagKnockouts: true,
  updatedAt: "2026-10-16T09:00:00.000Z",
  updatedBy: "Fatima Bello",
  tests: [{ key: "aptitude", name: "Aptitude", applicants: 3 }],
  counts: counts(),
  ...over,
});

beforeEach(() => {
  Object.values({
    ...screening,
    ...careers,
    ...recruitment,
    ...importing,
    ...pipeline,
  }).forEach((fn) => fn.mockReset());
});

/* ------------------------------------------------------------------- pass mark */

describe("the pass mark", () => {
  it("reads the API's figures as the screen's, with the test and the knockout switch", async () => {
    screening.getCutoff.mockResolvedValue(cutoff());
    expect(await gateway.passMark.get("p1", signal)).toEqual({
      fitMin: 50,
      assessmentMin: 60,
      assessmentMax: 100,
      assessmentTest: "Aptitude",
      flagKnockouts: true,
      tests: [{ key: "aptitude", name: "Aptitude", applicants: 3 }],
      knockouts: [],
      version: null,
      updatedAt: "2026-10-16T09:00:00.000Z",
      updatedBy: "Fatima Bello",
    });
  });

  it("counts who would be below an unsaved pass mark, in the API's own sums", async () => {
    screening.previewCutoff.mockResolvedValue({
      postingId: "p1",
      draft: {},
      counts: counts(),
    });
    const count = await gateway.passMark.count(
      "p1",
      {
        fitMin: 55,
        assessmentMin: null,
        assessmentTest: null,
        flagKnockouts: false,
      },
      signal,
    );
    expect(screening.previewCutoff).toHaveBeenCalledWith(
      "p1",
      {
        fitScoreMin: 55,
        assessmentMinPct: null,
        assessmentTest: null,
        flagKnockouts: false,
      },
      signal,
    );
    expect(count).toEqual({
      total: 20,
      below: 5,
      byReason: { fit: 4, assessment: 2, knockout: 1 },
      notScored: 3,
      noAssessment: 2,
      kept: 1,
    });
  });

  it("saves what is typed and reads the answer back", async () => {
    screening.putCutoff.mockResolvedValue({
      ...cutoff({ fitScoreMin: 70 }),
      changed: true,
      run: null,
    });
    const saved = await gateway.passMark.save("p1", {
      fitMin: 70,
      assessmentMin: 60,
      assessmentTest: "Aptitude",
      flagKnockouts: true,
    });
    expect(screening.putCutoff).toHaveBeenCalledWith("p1", {
      fitScoreMin: 70,
      assessmentMinPct: 60,
      assessmentTest: "Aptitude",
      flagKnockouts: true,
    });
    expect(saved.fitMin).toBe(70);
  });

  it("lets the API's own refusal through, sentence and all", async () => {
    screening.putCutoff.mockRejectedValue(
      new ApiError(422, "unprocessable", "Set the criteria first."),
    );
    await expect(
      gateway.passMark.save("p1", {
        fitMin: 70,
        assessmentMin: null,
        assessmentTest: null,
        flagKnockouts: true,
      }),
    ).rejects.toMatchObject({ message: "Set the criteria first." });
  });
});

/* ------------------------------------------------------------------ the list */

const apiRow = (n: number, over: Record<string, unknown> = {}) => ({
  id: `a${String(n)}`,
  reference: `APP-${String(n)}`,
  name: `Applicant ${String(n)}`,
  email: `applicant${String(n)}@example.test`,
  source: null,
  appliedAt: "2026-10-01T09:00:00.000Z",
  state: "WAITING",
  pipeline: null,
  score: 31,
  scoreStatus: "SCORED",
  assessment: null,
  knockoutCount: 0,
  reasons: [
    { code: "SCORE", text: "Fit score 31 is below the pass mark of 50." },
  ],
  flaggedAt: "2026-10-02T09:00:00.000Z",
  hasCv: true,
  ...over,
});

const page = (rows: unknown[], over: Record<string, unknown> = {}) => ({
  data: rows,
  meta: {
    total: 412,
    page: 1,
    pageSize: 50,
    hasMore: true,
    nextCursor: "cursor-2",
    counts: {
      byReason: { SCORE: 400, ASSESSMENT: 0, KNOCKOUT: 22 },
      byState: { WAITING: 400, IN_PIPELINE: 12 },
    },
    ...over,
  },
});

describe("the list below the pass mark", () => {
  it("asks in the API's reasons, pages by its cursor, and says where the next page starts", async () => {
    screening.confirmList.mockResolvedValue(page([apiRow(1)]));
    const result = await gateway.below.list(
      {
        postingId: "p1",
        filters: { reason: "FIT", state: "IN_PIPELINE", q: "ada" },
        cursor: "cursor-1",
        pageSize: 50,
      },
      signal,
    );
    expect(screening.confirmList).toHaveBeenCalledWith(
      "p1",
      {
        reason: "SCORE",
        state: "IN_PIPELINE",
        q: "ada",
        sort: "score",
        pageSize: 50,
        cursor: "cursor-1",
      },
      signal,
    );
    expect(result.total).toBe(412);
    expect(result.next).toBe("cursor-2");
  });

  it("has no next page when the API says there is none", async () => {
    screening.confirmList.mockResolvedValue(
      page([apiRow(1)], { hasMore: false, nextCursor: null }),
    );
    const result = await gateway.below.list(
      { postingId: "p1", filters: {}, cursor: null, pageSize: 50 },
      signal,
    );
    expect(result.next).toBeNull();
  });

  it("turns a row into the screen's: the score, the assessment, the reasons and where they are", async () => {
    screening.confirmList.mockResolvedValue(
      page([
        apiRow(2, {
          state: "IN_PIPELINE",
          pipeline: {
            applicationId: "pp1",
            requisitionId: "r1",
            stage: "Phone screen",
          },
          assessment: { test: "Aptitude", percent: 48.5 },
          knockoutCount: 1,
          reasons: [
            {
              code: "SCORE",
              text: "Fit score 31 is below the pass mark of 50.",
            },
            { code: "ASSESSMENT", text: "Aptitude: 48.5% is below 60%." },
            { code: "KNOCKOUT", text: "Right to work: answered No." },
          ],
        }),
        apiRow(3, { score: null, scoreStatus: "NEEDS_READING", reasons: [] }),
      ]),
    );
    const { rows } = await gateway.below.list(
      { postingId: "p1", filters: {}, cursor: null, pageSize: 50 },
      signal,
    );
    expect(rows[0]).toMatchObject({
      id: "a2",
      name: "Applicant 2",
      state: "IN_PIPELINE",
      stage: "Phone screen",
      summary: {
        fit: { status: "SCORED", score: 31 },
        assessment: 48.5,
        knockoutCount: 1,
        belowPassMark: true,
      },
    });
    expect(rows[0]?.reasons.map((r) => r.kind)).toEqual([
      "FIT",
      "ASSESSMENT",
      "KNOCKOUT",
    ]);
    expect(rows[0]?.reasons[1]?.text).toBe("Aptitude: 48.5% is below 60%.");
    /* No score is said as no score, never as a low one. */
    expect(rows[1]?.summary.fit).toMatchObject({
      status: "NO_TEXT",
      score: null,
    });
  });

  it("counts from the list's own total and the people it could apply to", async () => {
    screening.getCutoff.mockResolvedValue(cutoff());
    screening.confirmList.mockResolvedValue(page([apiRow(1)]));
    expect(await gateway.below.count("p1", signal)).toEqual({
      below: 412,
      total: 20,
    });
  });

  it("keeps somebody in the running with the reason given", async () => {
    screening.keep.mockResolvedValue({});
    await gateway.below.keep("a1", "Referred by the hiring manager");
    expect(screening.keep).toHaveBeenCalledWith(
      "a1",
      "Referred by the hiring manager",
    );
  });

  it("lets the API's refusal to keep somebody through in its words", async () => {
    screening.keep.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        "They are already being kept in the running.",
      ),
    );
    await expect(gateway.below.keep("a1", "Because")).rejects.toMatchObject({
      message: "They are already being kept in the running.",
    });
  });
});

describe("rejecting from the list", () => {
  const job = (over: Record<string, unknown> = {}) => ({
    dryRun: false,
    replay: false,
    job: {
      id: "j1",
      action: "REJECT",
      status: "DONE",
      total: 2,
      applied: 2,
      skipped: 0,
      refused: 0,
      pending: 0,
      progress: 100,
      requisitionId: null,
      subjectType: "jobApplication",
      idempotencyKey: "k",
      createdAt: "2026-10-16T09:00:00.000Z",
      startedAt: null,
      finishedAt: null,
      error: null,
    },
    results: [
      {
        subjectId: "a1",
        subjectType: "jobApplication",
        name: "A",
        status: "APPLIED",
        code: null,
        message: null,
        settledAt: null,
      },
      {
        subjectId: "a2",
        subjectType: "jobApplication",
        name: "B",
        status: "APPLIED",
        code: null,
        message: null,
        settledAt: null,
      },
    ],
    ...over,
  });

  const reasonOnly = { reasonId: "reason-1", note: null, sendEmails: false };

  it("sends the ticked people for this advert, with the company's reason, and emails nobody", async () => {
    pipeline.bulk.mockResolvedValue(job());
    const onProgress = vi.fn();
    const outcome = await gateway.below.reject({
      target: { kind: "ids", postingId: "p1", ids: ["a1", "a2"] },
      decision: reasonOnly,
      idempotencyKey: "click-1",
      signal,
      onProgress,
    });
    expect(pipeline.bulk).toHaveBeenCalledTimes(1);
    const [body] = pipeline.bulk.mock.calls[0] as [Record<string, unknown>];
    expect(body).toEqual({
      action: "REJECT",
      reasonId: "reason-1",
      selection: { postingId: "p1", jobApplicationIds: ["a1", "a2"] },
      idempotencyKey: "click-1",
    });
    /* No tick, no key: the API reads absent as false. */
    expect(body).not.toHaveProperty("sendEmails");
    expect(outcome).toMatchObject({
      requested: 2,
      done: 2,
      refused: [],
      emailed: null,
    });
  });

  it("selects everyone matching by the list's own filter and the count that was confirmed", async () => {
    pipeline.bulk.mockResolvedValue(
      job({ job: { ...job().job, total: 412, applied: 412 }, results: null }),
    );
    pipeline.bulkJob.mockResolvedValue({
      ...job().job,
      total: 412,
      applied: 412,
    });
    await gateway.below.reject({
      target: {
        kind: "filter",
        postingId: "p1",
        filters: { reason: "ASSESSMENT", state: "WAITING", q: "ada" },
        expected: 412,
      },
      decision: {
        reasonId: "reason-1",
        note: "Below the line",
        sendEmails: false,
      },
      idempotencyKey: "click-2",
      signal,
      onProgress: vi.fn(),
    });
    const [body] = pipeline.bulk.mock.calls[0] as [Record<string, unknown>];
    expect(body).toMatchObject({
      note: "Below the line",
      selection: {
        postingId: "p1",
        confirmList: { reason: "ASSESSMENT", state: "WAITING", q: "ada" },
        expectedCount: 412,
      },
    });
    expect(body["selection"]).not.toHaveProperty("jobApplicationIds");
  });

  it("sends the decline emails only when the box was ticked, and says they are queued, not sent", async () => {
    pipeline.bulk.mockResolvedValue(job());
    const outcome = await gateway.below.reject({
      target: { kind: "ids", postingId: "p1", ids: ["a1", "a2"] },
      decision: { ...reasonOnly, sendEmails: true },
      idempotencyKey: "click-3",
      signal,
      onProgress: vi.fn(),
    });
    const [body] = pipeline.bulk.mock.calls[0] as [Record<string, unknown>];
    expect(body["sendEmails"]).toBe(true);
    expect(outcome.emailed).toBe(2);
  });

  it("names who the API refused, and why, in its words", async () => {
    pipeline.bulk.mockResolvedValue(
      job({
        job: { ...job().job, applied: 1, refused: 1 },
        results: [
          job().results?.[0],
          {
            subjectId: "a2",
            subjectType: "jobApplication",
            name: "B",
            status: "REFUSED",
            code: "kept_in_running",
            message: "B was kept in the running since this list was made.",
            settledAt: null,
          },
        ],
      }),
    );
    const outcome = await gateway.below.reject({
      target: { kind: "ids", postingId: "p1", ids: ["a1", "a2"] },
      decision: reasonOnly,
      idempotencyKey: "click-4",
      signal,
      onProgress: vi.fn(),
    });
    expect(outcome.done).toBe(1);
    expect(outcome.refused).toEqual([
      {
        id: "a2",
        name: "B",
        reason: "B was kept in the running since this list was made.",
      },
    ]);
  });

  it("does nothing and says why when the list is no longer the size that was confirmed", async () => {
    pipeline.bulk.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        "The list changed while you were choosing: it was 412 people and is now 409.",
      ),
    );
    await expect(
      gateway.below.reject({
        target: {
          kind: "filter",
          postingId: "p1",
          filters: {},
          expected: 412,
        },
        decision: reasonOnly,
        idempotencyKey: "click-5",
        signal,
        onProgress: vi.fn(),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

/* ------------------------------------------------------------------ assessments */

describe("a person's assessment results", () => {
  it("reads each test's result and every value ever set", async () => {
    screening.assessments.mockResolvedValue({
      current: [
        {
          test: "Aptitude",
          score: 42,
          max: 60,
          percent: 70,
          takenOn: "2026-10-12",
          source: "IMPORT",
          enteredAt: "2026-10-12T09:00:00.000Z",
        },
      ],
      history: [
        {
          test: "Aptitude",
          cleared: false,
          score: 42,
          max: 60,
          percent: 70,
          takenOn: "2026-10-12",
          source: "IMPORT",
          importBatchId: "b1",
          by: "Fatima Bello",
          at: "2026-10-12T09:00:00.000Z",
        },
      ],
    });
    const history = await gateway.assessment.history(
      { kind: "application", id: "a1" },
      signal,
    );
    expect(history.current[0]).toMatchObject({ test: "Aptitude", percent: 70 });
    expect(history.entries[0]).toMatchObject({
      test: "Aptitude",
      by: "Fatima Bello",
      source: "IMPORT",
      cleared: false,
    });
  });

  it("types a result in under the test's name, and leaves the name out for the default", async () => {
    screening.putAssessment.mockResolvedValue({ outcome: "created" });
    await gateway.assessment.enter(
      { kind: "application", id: "a1" },
      { test: "Aptitude", score: 42, max: 60, takenOn: "2026-10-12" },
    );
    expect(screening.putAssessment).toHaveBeenLastCalledWith("a1", {
      test: "Aptitude",
      score: 42,
      max: 60,
      takenOn: "2026-10-12",
    });
    await gateway.assessment.enter(
      { kind: "application", id: "a1" },
      { test: null, score: 64, max: null, takenOn: null },
    );
    expect(screening.putAssessment).toHaveBeenLastCalledWith("a1", {
      score: 64,
      max: null,
      takenOn: null,
    });
  });

  it("finds the application behind a pipeline record, and says so when there is none", async () => {
    recruitment.getApplication.mockResolvedValueOnce({
      screening: { jobApplicationId: "a9" },
    });
    screening.assessments.mockResolvedValue({ current: [], history: [] });
    await gateway.assessment.history({ kind: "pipeline", id: "pp1" }, signal);
    expect(screening.assessments).toHaveBeenCalledWith("a9", signal);

    recruitment.getApplication.mockResolvedValueOnce({ screening: null });
    await expect(
      gateway.assessment.history({ kind: "pipeline", id: "pp2" }, signal),
    ).rejects.toMatchObject({
      status: 404,
      message: expect.stringMatching(/added by hand/),
    });
  });
});

/* ------------------------------------------------------------------ the import */

const fileRow = (n: number, over: Record<string, string> = {}) => ({
  row: n,
  email: `person${String(n)}@example.test`,
  reference: "",
  score: "42",
  max: "60",
  test: "",
  date: "",
  ...over,
});

const report = (
  row: number,
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  row,
  employeeNo: null,
  name: `Person ${String(row)}`,
  action: "create",
  errors: [],
  warnings: [],
  duplicate: null,
  missing: [],
  employeeNoGenerated: false,
  ...over,
});

const validated = (rows: unknown[], batchId = "b1") => ({
  batchId,
  filename: "boot.csv",
  status: "VALIDATED",
  totalRows: rows.length,
  toCreate: 0,
  toUpdate: 0,
  toSkip: 0,
  rows,
});

describe("checking a file of results", () => {
  it("sends the rows under the API's headings, with the advert and the test chosen on screen", async () => {
    importing.validate.mockResolvedValue(validated([report(1), report(2)]));
    await gateway.assessment.check(
      "p1",
      "boot.csv",
      [
        fileRow(1),
        fileRow(2, {
          email: "",
          reference: "APP-J7ET3745",
          max: "",
          date: "2026-10-12",
        }),
      ],
      { test: "Aptitude test" },
      signal,
    );
    expect(importing.validate).toHaveBeenCalledTimes(1);
    const [entity, body] = importing.validate.mock.calls[0] as [
      string,
      { rows: unknown[]; context: unknown; filename: string },
    ];
    expect(entity).toBe("assessment-scores");
    expect(body.filename).toBe("boot.csv");
    expect(body.context).toEqual({ postingId: "p1", test: "Aptitude test" });
    expect(body.rows).toEqual([
      {
        "Applicant email": "person1@example.test",
        Score: "42",
        "Out of": "60",
      },
      {
        "Application reference": "APP-J7ET3745",
        Score: "42",
        "Date taken": "2026-10-12",
      },
    ]);
  });

  it("leaves the test out of the context when none was chosen, so the API's default name applies", async () => {
    importing.validate.mockResolvedValue(validated([report(1)]));
    await gateway.assessment.check(
      "p1",
      "a.csv",
      [fileRow(1)],
      { test: "" },
      signal,
    );
    const [, body] = importing.validate.mock.calls[0] as [
      string,
      { context: unknown },
    ];
    expect(body.context).toEqual({ postingId: "p1" });
  });

  it("says what each row would do, and every refusal in the API's own sentence", async () => {
    importing.validate.mockResolvedValue(
      validated([
        report(1),
        report(2, { action: "update" }),
        report(3, {
          action: "update",
          warnings: [
            {
              row: 3,
              column: "Score",
              value: "42",
              problem:
                "Already recorded with this same result. Nothing changes.",
            },
          ],
        }),
        report(4, {
          action: "skip",
          name: null,
          errors: [
            {
              row: 4,
              column: "Applicant email",
              value: "x@example.test",
              problem:
                'Nobody who applied for "Senior Backend Engineer" has the email x@example.test. Check the advert you chose, and the spelling.',
            },
          ],
        }),
        report(5, {
          action: "skip",
          errors: [
            {
              row: 5,
              column: "Score",
              value: "130",
              problem:
                "130 is over 100 and no maximum was given, so it cannot be read as a percentage. Give the maximum the mark is out of.",
            },
          ],
        }),
      ]),
    );
    const check = await gateway.assessment.check(
      "p1",
      "boot.csv",
      [1, 2, 3, 4, 5].map((n) => fileRow(n)),
      { test: "" },
      signal,
    );
    expect(check.rows.map((r) => r.effect)).toEqual([
      "new",
      "replaces",
      "unchanged",
      null,
      null,
    ]);
    expect(check.rows.map((r) => r.refusal)).toEqual([
      null,
      null,
      null,
      "unmatched_email",
      "out_of_range",
    ]);
    expect(check.rows[3]?.message).toMatch(/Nobody who applied/);
    expect(check).toMatchObject({
      total: 5,
      usable: 3,
      refused: 2,
      replacing: 1,
      unchanged: 1,
    });
    /* What the person's file said, beside what the API made of it. */
    expect(check.rows[0]).toMatchObject({
      score: 42,
      max: 60,
      name: "Person 1",
    });
  });

  it("keeps the file's own row numbers when it goes in parts", async () => {
    const rows = Array.from({ length: 1200 }, (_, i) =>
      fileRow(i + 1, { email: `p${String(i + 1)}@x.test`, max: "" }),
    );
    importing.validate.mockImplementation(
      async (_e: string, body: { rows: unknown[] }) =>
        validated(
          body.rows.map((_r, i) => report(i + 1)),
          `b${String(importing.validate.mock.calls.length)}`,
        ),
    );
    const check = await gateway.assessment.check(
      "p1",
      "big.csv",
      rows,
      { test: "" },
      signal,
    );
    expect(importing.validate.mock.calls.length).toBeGreaterThan(1);
    const sent = importing.validate.mock.calls.reduce(
      (sum, call) => sum + (call[1] as { rows: unknown[] }).rows.length,
      0,
    );
    expect(sent).toBe(1200);
    expect(check.rows).toHaveLength(1200);
    expect(check.rows.map((r) => r.row)).toEqual(rows.map((r) => r.row));
    expect(check.rows[1199]?.email).toBe("p1200@x.test");
  });

  it("never sends more rows in a part than the API reads", () => {
    const rows = Array.from({ length: 3000 }, () => ({ Score: "1" }));
    const spans = planSpans(rows);
    expect(Math.max(...spans.map((s) => s.end - s.start))).toBeLessThanOrEqual(
      500,
    );
    expect(spans[0]?.start).toBe(0);
    expect(spans.at(-1)?.end).toBe(3000);
  });

  it("names the nearest of our words for what the API refused, and falls back to a plain one", () => {
    expect(refusalOf("Nobody who applied for X has the email y.")).toBe(
      "unmatched_email",
    );
    expect(refusalOf("A score is required.")).toBe("not_a_number");
    expect(refusalOf("70 is more than the maximum of 60.")).toBe(
      "out_of_range",
    );
    expect(
      refusalOf("Row 2 already gives this applicant a different result for X."),
    ).toBe("duplicate_in_file");
    expect(refusalOf("Something nobody has thought of.")).toBe("refused");
  });
});

describe("saving a checked file", () => {
  const applied = (created: number, updated: number) => ({
    batchId: "b1",
    created,
    updated,
    skipped: 0,
  });

  it("applies the same parts with the same rows and the same context, and adds up what was written", async () => {
    importing.validate.mockResolvedValue(validated([report(1), report(2)]));
    const rows = [fileRow(1), fileRow(2)];
    const check = await gateway.assessment.check(
      "p1",
      "boot.csv",
      rows,
      { test: "Aptitude" },
      signal,
    );
    importing.apply.mockResolvedValue(applied(1, 1));
    const result = await gateway.assessment.commit("p1", check, rows, {
      test: "Aptitude",
    });
    const [entity, batch, body] = importing.apply.mock.calls[0] as [
      string,
      string,
      { confirm: boolean; rows: unknown[]; context: unknown },
    ];
    expect(entity).toBe("assessment-scores");
    expect(batch).toBe("b1");
    expect(body.confirm).toBe(true);
    expect(body.context).toEqual({ postingId: "p1", test: "Aptitude" });
    expect(body.rows).toEqual(
      (importing.validate.mock.calls[0] as [string, { rows: unknown[] }])[1]
        .rows,
    );
    expect(result).toEqual({
      saved: 2,
      unchanged: 0,
      refused: 0,
      movedBelow: null,
    });
  });

  it("refuses a different file, or a different test name, in words and writes nothing", async () => {
    importing.validate.mockResolvedValue(validated([report(1)]));
    const rows = [fileRow(1)];
    const check = await gateway.assessment.check(
      "p1",
      "boot.csv",
      rows,
      { test: "Aptitude" },
      signal,
    );
    await expect(
      gateway.assessment.commit("p1", check, [fileRow(1), fileRow(2)], {
        test: "Aptitude",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      gateway.assessment.commit("p1", check, rows, { test: "Another" }),
    ).rejects.toMatchObject({
      status: 409,
      message: "The file is not the one that was checked. Check it again.",
    });
    expect(importing.apply).not.toHaveBeenCalled();
  });

  it("says how far it got when a later part is refused", async () => {
    const rows = Array.from({ length: 1200 }, (_, i) =>
      fileRow(i + 1, { max: "" }),
    );
    importing.validate.mockImplementation(
      async (_e: string, body: { rows: unknown[] }) =>
        validated(
          body.rows.map((_r, i) => report(i + 1)),
          `b${String(importing.validate.mock.calls.length)}`,
        ),
    );
    const check = await gateway.assessment.check(
      "p1",
      "big.csv",
      rows,
      { test: "" },
      signal,
    );
    importing.apply
      .mockResolvedValueOnce(applied(500, 0))
      .mockRejectedValueOnce(
        new ApiError(
          409,
          "conflict",
          "That batch has changed since it was checked.",
        ),
      );
    await expect(
      gateway.assessment.commit("p1", check, rows, { test: "" }),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(
        /^\d+ of 1200 rows were saved before this stopped\. That batch has changed/,
      ),
    });
  });
});
