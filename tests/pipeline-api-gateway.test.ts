import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type {
  ApiBoardColumn,
  ApiBulkJob,
  ApiBulkRow,
} from "@/lib/api/pipeline";

/**
 * The connected gateway: what it asks the API, and what it makes of the answer.
 *
 * The API is faked at the edge (`pipelineApi`), so these hold the translation: the
 * columns the server draws become the screen's columns, a filter selection carries
 * the column and the count somebody confirmed, a big list is cut into requests the
 * API will take, and a queued job is waited for and every refusal is fetched.
 */

const calls = {
  board: vi.fn(),
  boardColumn: vi.fn(),
  bulk: vi.fn(),
  bulkJob: vi.fn(),
  bulkResults: vi.fn(),
  reject: vi.fn(),
  move: vi.fn(),
  setCandidateTags: vi.fn(),
  addToTalentPool: vi.fn(),
  removeFromTalentPool: vi.fn(),
  talentPool: vi.fn(),
  exportApplications: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  archiveTemplate: vi.fn(),
  listTemplates: vi.fn(),
  listReasons: vi.fn(),
  updateReason: vi.fn(),
  listTags: vi.fn(),
};

vi.mock("@/lib/api/pipeline", () => ({
  pipelineApi: new Proxy(
    {},
    {
      get:
        (_t, name: string) =>
        (...args: unknown[]) =>
          (calls as Record<string, (...a: unknown[]) => unknown>)[name]?.(
            ...args,
          ),
    },
  ),
}));

const { apiGateway, IDS_PER_REQUEST, POLL_MS } =
  await import("@/lib/hiring/pipeline/api-gateway");

const card = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  candidateId: `c-${id}`,
  name: `Person ${id}`,
  email: `${id}@example.com`,
  source: "LinkedIn",
  appliedAt: "2026-10-01T09:00:00.000Z",
  stageEnteredAt: "2026-10-01T09:00:00.000Z",
  daysInStage: 2,
  outcome: "IN_PROGRESS" as const,
  reference: "APP-AAAAAAAA",
  flagged: false,
  knockoutCount: 0,
  duplicate: false,
  talentPool: false,
  tags: [],
  hasCv: false,
  rejection: null,
  ...over,
});

const column = (over: Partial<ApiBoardColumn>): ApiBoardColumn => ({
  key: "stage:s1",
  stageId: "s1",
  name: "Applied",
  type: "APPLIED",
  typeLabel: "Applied",
  order: 0,
  terminal: false,
  synthetic: false,
  count: 0,
  cards: [],
  hasMore: false,
  nextCursor: null,
  ...over,
});

const job = (over: Partial<ApiBulkJob>): ApiBulkJob => ({
  id: "job-1",
  action: "MOVE",
  status: "DONE",
  total: 2,
  applied: 2,
  skipped: 0,
  refused: 0,
  pending: 0,
  progress: 100,
  requisitionId: "r1",
  subjectType: "application",
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
  subjectType: "application",
  name: `Person ${id}`,
  status,
  code,
  message,
  settledAt: null,
});

const signal = () => new AbortController().signal;

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockReset();
});

describe("the board", () => {
  it("draws the columns the server drew, with the server's count and its cursor", async () => {
    calls.board.mockResolvedValue({
      columns: [
        column({
          count: 300,
          hasMore: true,
          nextCursor: "abc",
          cards: [
            card("a1", {
              tags: [{ id: "t1", name: "Strong CV", color: "#2b3990" }],
            }),
          ],
        }),
        column({
          key: "stage:hired",
          stageId: "h",
          name: "Hired",
          type: "HIRED",
          terminal: true,
        }),
        column({
          key: "outcome:REJECTED",
          stageId: null,
          name: "Rejected",
          type: null,
          synthetic: true,
          terminal: true,
        }),
        column({
          key: "stage:none",
          stageId: null,
          name: "Not placed",
          type: null,
        }),
      ],
    });
    const board = await apiGateway.board(
      { requisitionId: "r1", filters: {}, limit: 25 },
      signal(),
    );
    expect(board.columns.map((c) => [c.key, c.ends])).toEqual([
      ["stage:s1", null],
      ["stage:hired", "HIRED"],
      ["outcome:REJECTED", "REJECTED"],
      ["stage:none", null],
    ]);
    const applied = board.columns[0];
    expect(applied).toMatchObject({
      total: 300,
      next: "abc",
      label: "Applied",
    });
    expect(applied?.cards[0]).toMatchObject({
      name: "Person a1",
      stageId: "s1",
      tags: [{ id: "t1", name: "Strong CV" }],
    });
    expect(board.columns[2]?.stageId).toBeNull();
  });

  it("sends every filter as the API's own words, and nothing that is off", async () => {
    calls.board.mockResolvedValue({ columns: [] });
    await apiGateway.board(
      {
        requisitionId: "r1",
        filters: {
          q: "ada",
          tagId: "t1",
          source: "linkedin",
          flagged: true,
          duplicate: true,
          talentPool: true,
          from: "2026-10-01",
          to: "2026-10-31",
        },
        limit: 25,
      },
      signal(),
    );
    expect(calls.board).toHaveBeenCalledWith(
      "r1",
      {
        q: "ada",
        tagId: "t1",
        source: "linkedin",
        flagged: true,
        duplicate: true,
        talentPool: true,
        from: "2026-10-01",
        to: "2026-10-31",
        limit: 25,
      },
      expect.anything(),
    );
    await apiGateway.board(
      { requisitionId: "r1", filters: {}, limit: 10 },
      signal(),
    );
    expect(calls.board.mock.calls[1]?.[1]).toEqual({ limit: 10 });
  });

  it("pages one column by its key and its cursor", async () => {
    calls.boardColumn.mockResolvedValue(
      column({
        count: 300,
        cards: [card("a26")],
        hasMore: true,
        nextCursor: "def",
      }),
    );
    const page = await apiGateway.listCards(
      {
        requisitionId: "r1",
        column: "stage:s1",
        filters: { q: "ada" },
        cursor: "abc",
        pageSize: 25,
      },
      signal(),
    );
    expect(calls.boardColumn).toHaveBeenCalledWith(
      "r1",
      "stage:s1",
      { q: "ada", limit: 25, cursor: "abc" },
      expect.anything(),
    );
    expect(page).toMatchObject({ total: 300, next: "def" });
    expect(page.cards).toHaveLength(1);
  });

  it("gives the reason a rejected person was turned down for as the one line the API writes", async () => {
    calls.board.mockResolvedValue({
      columns: [
        column({
          key: "stage:r",
          stageId: "r",
          name: "Rejected",
          type: "REJECTED",
          cards: [
            card("x", {
              outcome: "REJECTED",
              rejection: {
                reason: "Over the band: asked for twice",
                reasonLabel: "Over the band",
                note: "asked for twice",
              },
            }),
            card("y", {
              outcome: "WITHDRAWN",
              rejection: {
                reason: "Moved abroad",
                reasonLabel: null,
                note: null,
              },
            }),
          ],
        }),
      ],
    });
    const board = await apiGateway.board(
      { requisitionId: "r1", filters: {}, limit: 25 },
      signal(),
    );
    expect(board.columns[0]?.cards.map((c) => c.rejectionReason)).toEqual([
      "Over the band: asked for twice",
      "Moved abroad",
    ]);
  });
});

describe("moving, rejecting and tagging one person", () => {
  it("moves by the application's id", async () => {
    calls.move.mockResolvedValue({});
    await apiGateway.move({ id: "a1" } as never, "s2", { sendEmail: false });
    expect(calls.move).toHaveBeenCalledWith("a1", "s2", false);
  });

  it("rejects with a reason's id and the note, and says no email was asked for", async () => {
    calls.reject.mockResolvedValue({});
    const result = await apiGateway.reject({ id: "a1" } as never, {
      reasonId: "r1",
      note: "Asked for twice the band",
      sendEmail: false,
    });
    expect(calls.reject).toHaveBeenCalledWith("a1", {
      reasonId: "r1",
      note: "Asked for twice the band",
      sendEmail: false,
    });
    expect(result.email).toBeNull();
  });

  it("a refusal reaches the screen as the API wrote it", async () => {
    calls.move.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        "Nobody is moved into Hired directly.",
      ),
    );
    await expect(
      apiGateway.move({ id: "a1" } as never, "h", { sendEmail: false }),
    ).rejects.toThrow("Nobody is moved into Hired directly.");
  });

  it("puts a tag on the person, keeping the ones they have", async () => {
    await apiGateway.setTag(
      { candidateId: "c1", tags: [{ id: "t1", name: "A" }] } as never,
      "t2",
      true,
    );
    expect(calls.setCandidateTags).toHaveBeenCalledWith("c1", ["t1", "t2"]);
    await apiGateway.setTag(
      {
        candidateId: "c1",
        tags: [
          { id: "t1", name: "A" },
          { id: "t2", name: "B" },
        ],
      } as never,
      "t1",
      false,
    );
    expect(calls.setCandidateTags).toHaveBeenLastCalledWith("c1", ["t2"]);
  });

  it("the talent pool is the candidate's, not the application's", async () => {
    await apiGateway.setTalentPool({ candidateId: "c1" } as never, true);
    expect(calls.addToTalentPool).toHaveBeenCalledWith("c1");
    await apiGateway.setTalentPool({ candidateId: "c1" } as never, false);
    expect(calls.removeFromTalentPool).toHaveBeenCalledWith("c1");
  });
});

describe("a bulk action on ticked people", () => {
  const request = (
    ids: string[],
    action = { type: "move", stageId: "s2" } as const,
  ) => ({
    target: { kind: "ids" as const, requisitionId: "r1", ids },
    action,
    idempotencyKey: "one-per-click-key",
    signal: signal(),
    onProgress: vi.fn(),
  });

  it("is one request with the ids, the stage and the click's key", async () => {
    calls.bulk.mockResolvedValue({
      replay: false,
      job: job({ total: 2 }),
      results: [row("a1", "APPLIED"), row("a2", "APPLIED")],
    });
    const outcome = await apiGateway.bulk(request(["a1", "a2"]));
    expect(calls.bulk).toHaveBeenCalledTimes(1);
    expect(calls.bulk.mock.calls[0]?.[0]).toEqual({
      action: "MOVE",
      stageId: "s2",
      selection: { requisitionId: "r1", applicationIds: ["a1", "a2"] },
      idempotencyKey: "one-per-click-key",
    });
    expect(outcome).toEqual({
      requested: 2,
      done: 2,
      skipped: 0,
      refused: [],
      emailed: null,
    });
  });

  it("tells done from skipped from refused, naming each refusal with the API's sentence", async () => {
    calls.bulk.mockResolvedValue({
      replay: false,
      job: job({ total: 3, applied: 1, skipped: 1, refused: 1 }),
      results: [
        row("a1", "APPLIED"),
        row("a2", "SKIPPED", "already_there"),
        row(
          "a3",
          "REFUSED",
          "offer_out",
          "An offer is out: withdraw it first.",
        ),
      ],
    });
    const outcome = await apiGateway.bulk(request(["a1", "a2", "a3"]));
    expect(outcome.done).toBe(1);
    expect(outcome.skipped).toBe(1);
    expect(outcome.refused).toEqual([
      {
        id: "a3",
        name: "Person a3",
        reason: "An offer is out: withdraw it first.",
      },
    ]);
  });

  it("cuts a long list into requests the API will take, each with its own key", async () => {
    calls.bulk.mockImplementation(
      async (body: { selection: { applicationIds: string[] } }) => ({
        replay: false,
        job: job({
          total: body.selection.applicationIds.length,
          applied: body.selection.applicationIds.length,
        }),
        results: body.selection.applicationIds.map((id) => row(id, "APPLIED")),
      }),
    );
    const ids = Array.from(
      { length: IDS_PER_REQUEST + 5 },
      (_, i) => `a${String(i)}`,
    );
    const outcome = await apiGateway.bulk(request(ids));
    expect(calls.bulk).toHaveBeenCalledTimes(2);
    expect(calls.bulk.mock.calls[0]?.[0].selection.applicationIds).toHaveLength(
      IDS_PER_REQUEST,
    );
    expect(calls.bulk.mock.calls[1]?.[0].selection.applicationIds).toHaveLength(
      5,
    );
    expect(calls.bulk.mock.calls[0]?.[0].idempotencyKey).toBe(
      "one-per-click-key:0",
    );
    expect(calls.bulk.mock.calls[1]?.[0].idempotencyKey).toBe(
      "one-per-click-key:1",
    );
    expect(outcome.done).toBe(ids.length);
  });

  it("maps every action to the API's word, and a rejection always carries its reason", async () => {
    calls.bulk.mockResolvedValue({
      replay: false,
      job: job({ total: 1 }),
      results: [row("a1", "APPLIED")],
    });
    await apiGateway.bulk(
      request(["a1"], {
        type: "reject",
        reasonId: "r9",
        note: "n",
        sendEmail: false,
      } as never),
    );
    expect(calls.bulk.mock.calls[0]?.[0]).toMatchObject({
      action: "REJECT",
      reasonId: "r9",
      note: "n",
    });
    await apiGateway.bulk(
      request(["a1"], { type: "tag", tagId: "t1" } as never),
    );
    expect(calls.bulk.mock.calls[1]?.[0]).toMatchObject({
      action: "TAG",
      tagId: "t1",
    });
    await apiGateway.bulk(
      request(["a1"], { type: "talent-pool", on: false } as never),
    );
    expect(calls.bulk.mock.calls[2]?.[0]).toMatchObject({
      action: "TALENT_POOL_REMOVE",
    });
  });
});

describe("a bulk action on everyone matching", () => {
  it("sends the filter, the column it was chosen in and the count somebody confirmed", async () => {
    calls.bulk.mockResolvedValue({
      replay: false,
      job: job({ total: 312, applied: 312 }),
      results: Array.from({ length: 312 }, (_, i) =>
        row(`a${String(i)}`, "APPLIED"),
      ),
    });
    await apiGateway.bulk({
      target: {
        kind: "filter",
        requisitionId: "r1",
        column: "stage:s1",
        filters: { source: "linkedin", flagged: true, q: "ada" },
        expected: 312,
      },
      action: { type: "tag", tagId: "t1" },
      idempotencyKey: "k-everyone-1",
      signal: signal(),
      onProgress: vi.fn(),
    });
    expect(calls.bulk.mock.calls[0]?.[0]).toEqual({
      action: "TAG",
      tagId: "t1",
      selection: {
        requisitionId: "r1",
        filter: {
          q: "ada",
          source: "linkedin",
          flagged: true,
          column: "stage:s1",
        },
        expectedCount: 312,
      },
      idempotencyKey: "k-everyone-1",
    });
  });

  it("stops with the API's sentence when the count is no longer true, and does nothing", async () => {
    calls.bulk.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        "The selection has changed since you looked: it is 34 people now, not 999. Check it and confirm again.",
      ),
    );
    await expect(
      apiGateway.bulk({
        target: {
          kind: "filter",
          requisitionId: "r1",
          column: "stage:s1",
          filters: {},
          expected: 999,
        },
        action: { type: "talent-pool", on: true },
        idempotencyKey: "k-stale-1",
        signal: signal(),
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow(
      "The selection has changed since you looked: it is 34 people now, not 999.",
    );
  });
});

describe("a queued job", () => {
  const everyone = (signalArg = signal()) => ({
    target: {
      kind: "filter" as const,
      requisitionId: "r1",
      column: "stage:s1",
      filters: {},
      expected: 250,
    },
    action: { type: "move", stageId: "s2" } as const,
    idempotencyKey: "k-queued-1",
    signal: signalArg,
    onProgress: vi.fn(),
  });

  it("is waited for, with progress, and every refusal is fetched when it is done", async () => {
    vi.useFakeTimers();
    try {
      calls.bulk.mockResolvedValue({
        replay: false,
        job: job({ status: "QUEUED", total: 250, applied: 0, pending: 250 }),
        results: null,
      });
      calls.bulkJob
        .mockResolvedValueOnce(
          job({ status: "RUNNING", total: 250, applied: 100, pending: 150 }),
        )
        .mockResolvedValueOnce(
          job({
            status: "DONE",
            total: 250,
            applied: 247,
            refused: 3,
            pending: 0,
          }),
        );
      calls.bulkResults.mockResolvedValue({
        data: [
          row(
            "a1",
            "REFUSED",
            "scorecards_required",
            "Scorecards are not all in.",
          ),
          row("a2", "REFUSED", "offer_out", "An offer is out."),
          row("a3", "REFUSED", "hired", "They have been hired."),
        ],
        meta: {
          page: 1,
          pageSize: 200,
          total: 3,
          totalPages: 1,
          hasMore: false,
        },
      });
      const request = everyone();
      const settled = apiGateway.bulk(request);
      await vi.advanceTimersByTimeAsync(POLL_MS * 3);
      const outcome = await settled;

      expect(calls.bulkJob).toHaveBeenCalledTimes(2);
      expect(calls.bulkResults).toHaveBeenCalledWith(
        "job-1",
        { status: "REFUSED", page: 1, pageSize: 200 },
        expect.anything(),
      );
      expect(outcome.requested).toBe(250);
      expect(outcome.done).toBe(247);
      expect(outcome.refused.map((r) => r.reason)).toEqual([
        "Scorecards are not all in.",
        "An offer is out.",
        "They have been hired.",
      ]);
      const done = request.onProgress.mock.calls.map(
        ([p]) => (p as { done: number }).done,
      );
      expect(done).toContain(100);
      expect(done.at(-1)).toBe(250);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a job that failed says so, and how far it had got", async () => {
    vi.useFakeTimers();
    try {
      calls.bulk.mockResolvedValue({
        replay: false,
        job: job({ status: "QUEUED", total: 250, pending: 250 }),
        results: null,
      });
      calls.bulkJob.mockResolvedValue(
        job({
          status: "FAILED",
          total: 250,
          applied: 120,
          error: "The stage it was moving people to was deleted.",
        }),
      );
      const settled = apiGateway.bulk(everyone());
      const assertion = expect(settled).rejects.toThrow(
        "The stage it was moving people to was deleted. 120 of 250 had been dealt with when it stopped.",
      );
      await vi.advanceTimersByTimeAsync(POLL_MS * 2);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("exporting", () => {
  it("sends ticked people as ids, and everyone matching as the filter and its count", async () => {
    calls.exportApplications.mockResolvedValue({ filename: "x.csv", body: "" });
    await apiGateway.exportCards({
      kind: "ids",
      requisitionId: "r1",
      ids: ["a1", "a2"],
    });
    expect(calls.exportApplications).toHaveBeenLastCalledWith("r1", {
      applicationIds: ["a1", "a2"],
    });
    await apiGateway.exportCards({
      kind: "filter",
      requisitionId: "r1",
      column: "stage:s1",
      filters: { flagged: true },
      expected: 43,
    });
    expect(calls.exportApplications).toHaveBeenLastCalledWith("r1", {
      filter: { flagged: true, column: "stage:s1" },
      expectedCount: 43,
    });
  });
});

describe("templates, reasons and the talent pool", () => {
  it("a template is its stages in order, and Delete archives it", async () => {
    calls.listTemplates.mockResolvedValue([
      {
        id: "t1",
        name: "Standard",
        description: null,
        isDefault: true,
        archived: false,
        archivedAt: null,
        requisitionCount: 3,
        issues: [],
        createdAt: "",
        updatedAt: "",
        stages: [
          {
            id: "b",
            name: "Hired",
            order: 1,
            type: "HIRED",
            typeLabel: "Hired",
            terminal: true,
            requiresScorecards: false,
          },
          {
            id: "a",
            name: "Applied",
            order: 0,
            type: "APPLIED",
            typeLabel: "Applied",
            terminal: false,
            requiresScorecards: false,
          },
        ],
      },
    ]);
    const [template] = await apiGateway.templates.list(signal());
    expect(template?.stages.map((s) => s.name)).toEqual(["Applied", "Hired"]);
    expect(template).toMatchObject({ isDefault: true, usedBy: 3 });
    await apiGateway.templates.remove("t1");
    expect(calls.archiveTemplate).toHaveBeenCalledWith("t1");
  });

  it("saves a new template as a create and an old one as an update, in array order", async () => {
    const stages = [
      {
        id: "x",
        name: "Applied",
        type: "APPLIED" as const,
        requiresScorecards: false,
      },
      {
        id: "y",
        name: "Hired",
        type: "HIRED" as const,
        requiresScorecards: false,
      },
    ];
    const made = {
      id: "t9",
      name: "N",
      description: null,
      isDefault: false,
      archived: false,
      archivedAt: null,
      requisitionCount: 0,
      issues: [],
      createdAt: "",
      updatedAt: "",
      stages: [],
    };
    calls.createTemplate.mockResolvedValue(made);
    calls.updateTemplate.mockResolvedValue(made);
    await apiGateway.templates.save({ id: null, name: "N", stages });
    expect(calls.createTemplate).toHaveBeenCalledWith({
      name: "N",
      stages: [
        { name: "Applied", type: "APPLIED", requiresScorecards: false },
        { name: "Hired", type: "HIRED", requiresScorecards: false },
      ],
    });
    await apiGateway.templates.save({ id: "t9", name: "N", stages });
    expect(calls.updateTemplate).toHaveBeenCalledWith(
      "t9",
      expect.objectContaining({ name: "N" }),
    );
    await apiGateway.templates.makeDefault("t9");
    expect(calls.updateTemplate).toHaveBeenLastCalledWith("t9", {
      isDefault: true,
    });
  });

  it("an archived reason is one that is switched off", async () => {
    calls.listReasons.mockResolvedValue([
      { id: "r1", label: "A", order: 0, starter: true, archived: false },
      { id: "r2", label: "B", order: 1, starter: true, archived: true },
    ]);
    const reasons = await apiGateway.reasons.list(signal());
    expect(reasons.map((r) => r.active)).toEqual([true, false]);
    await apiGateway.reasons.update("r1", { active: false, label: "A2" });
    expect(calls.updateReason).toHaveBeenCalledWith("r1", {
      label: "A2",
      archived: true,
    });
  });

  it("tags carry how many people have them", async () => {
    calls.listTags.mockResolvedValue([
      { id: "t1", name: "Strong CV", color: null, candidateCount: 12 },
    ]);
    expect(await apiGateway.tags.list(signal())).toEqual([
      { id: "t1", name: "Strong CV", color: null, uses: 12 },
    ]);
  });

  it("the talent pool pages by number behind the same cursor the screens use", async () => {
    calls.talentPool.mockResolvedValue({
      data: [
        {
          candidateId: "c1",
          name: "Ada Okafor",
          email: "ada@example.com",
          source: "LinkedIn",
          talentPoolSince: null,
          talentPoolNote: "Call in March",
          tags: [],
          lastApplication: {
            requisitionId: "r1",
            requisitionReference: "REQ-1",
            jobTitle: "Payroll Analyst",
            outcome: "REJECTED",
            rejectionReasonLabel: "Over the band",
          },
        },
      ],
      meta: { page: 1, pageSize: 25, total: 60, totalPages: 3, hasMore: true },
    });
    const page = await apiGateway.talentPool.list(
      { q: "ada", cursor: null, pageSize: 25 },
      signal(),
    );
    expect(calls.talentPool).toHaveBeenCalledWith(
      { q: "ada", page: 1, pageSize: 25 },
      expect.anything(),
    );
    expect(page).toMatchObject({ total: 60, next: "2" });
    expect(page.entries[0]).toMatchObject({
      candidateId: "c1",
      note: "Call in March",
      applications: [
        { id: "c1", role: "Payroll Analyst", reason: "Over the band" },
      ],
    });
    calls.talentPool.mockResolvedValue({
      data: [],
      meta: { page: 3, pageSize: 25, total: 60, totalPages: 3, hasMore: false },
    });
    const last = await apiGateway.talentPool.list(
      { cursor: "3", pageSize: 25 },
      signal(),
    );
    expect(calls.talentPool).toHaveBeenLastCalledWith(
      { page: 3, pageSize: 25 },
      expect.anything(),
    );
    expect(last.next).toBeNull();
  });
});

describe("email and the connected gateway", () => {
  const request = (action: Record<string, unknown>, ids = ["a1", "a2"]) => ({
    target: { kind: "ids" as const, requisitionId: "r1", ids },
    action: action as never,
    idempotencyKey: "k",
    signal: signal(),
    onProgress: vi.fn(),
  });
  const done = (applied: number) => ({
    replay: false,
    job: job({ total: applied, applied }),
    results: Array.from({ length: applied }, (_, i) =>
      row(`a${String(i)}`, "APPLIED"),
    ),
  });

  it("says outright whether a move sends the stage's email, and reads what the API did", async () => {
    calls.move.mockResolvedValue({
      email: { id: "e1", kind: "INVITE", status: "PENDING", note: null },
    });
    const result = await apiGateway.move({ id: "a1" } as never, "s2", {
      sendEmail: true,
    });
    expect(calls.move).toHaveBeenCalledWith("a1", "s2", true);
    expect(result.email).toEqual({
      status: "PENDING",
      note: null,
      kindLabel: "Invitation to interview",
    });
  });

  it("reads no email as none, not as a failure", async () => {
    calls.move.mockResolvedValue({ email: null });
    expect(
      (await apiGateway.move({ id: "a1" } as never, "s2", { sendEmail: false }))
        .email,
    ).toBeNull();
  });

  it("never asks a bulk action to send email unless the person ticked it, and says nothing about email then", async () => {
    calls.bulk.mockResolvedValue(done(2));
    const quiet = await apiGateway.bulk(
      request({ type: "move", stageId: "s2" }),
    );
    expect(calls.bulk.mock.calls[0]?.[0]).not.toHaveProperty("sendEmails");
    expect(quiet.emailed).toBeNull();

    await apiGateway.bulk(
      request({ type: "move", stageId: "s2", sendEmail: false }),
    );
    expect(calls.bulk.mock.calls[1]?.[0]).not.toHaveProperty("sendEmails");

    await apiGateway.bulk(
      request({ type: "reject", reasonId: "r9", note: null, sendEmail: false }),
    );
    expect(calls.bulk.mock.calls[2]?.[0]).not.toHaveProperty("sendEmails");
  });

  it("asks for it when ticked, and counts one queued email for each person it was applied to", async () => {
    calls.bulk.mockResolvedValue({
      replay: false,
      job: job({ total: 3, applied: 2, skipped: 1 }),
      results: [
        row("a1", "APPLIED"),
        row("a2", "APPLIED"),
        row("a3", "SKIPPED"),
      ],
    });
    const outcome = await apiGateway.bulk(
      request({ type: "move", stageId: "s2", sendEmail: true }, [
        "a1",
        "a2",
        "a3",
      ]),
    );
    expect(calls.bulk.mock.calls[0]?.[0]).toMatchObject({ sendEmails: true });
    expect(outcome.emailed).toBe(2);

    calls.bulk.mockResolvedValue(done(4));
    const rejected = await apiGateway.bulk(
      request({ type: "reject", reasonId: "r9", note: null, sendEmail: true }, [
        "a1",
        "a2",
        "a3",
        "a4",
      ]),
    );
    expect(calls.bulk.mock.calls[1]?.[0]).toMatchObject({
      action: "REJECT",
      sendEmails: true,
    });
    expect(rejected.emailed).toBe(4);
  });

  it("refuses for the stage with no email in the API's words, and does nothing", async () => {
    calls.bulk.mockRejectedValue(
      new ApiError(
        422,
        "unprocessable",
        '"Interview" has no email to send. Set one on the stage, or move people without sending emails.',
      ),
    );
    await expect(
      apiGateway.bulk(
        request({ type: "move", stageId: "s2", sendEmail: true }),
      ),
    ).rejects.toThrow(/has no email to send/);
  });
});
