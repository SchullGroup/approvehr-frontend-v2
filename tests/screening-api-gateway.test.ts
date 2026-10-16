import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The connected gateway, with the API faked at its edge.
 *
 * What these hold: criteria are saved only from the version that was read (a second
 * person's save is a refusal in words, not a quiet win), what is sent is what the
 * API takes, an explanation asks for the other spellings only when they are the
 * right ones, and what the server offers is what its gateway says it does.
 */

const screening = {
  getCriteria: vi.fn(),
  putCriteria: vi.fn(),
  previewCriteria: vi.fn(),
  suggest: vi.fn(),
  runs: vi.fn(),
  rescore: vi.fn(),
};
vi.mock("@/lib/api/screening", () => ({
  screeningApi: new Proxy(
    {},
    {
      get:
        (_t, name: string) =>
        (...args: unknown[]) =>
          (screening as Record<string, (...a: unknown[]) => unknown>)[name]?.(
            ...args,
          ),
    },
  ),
}));
const careers = { getApplication: vi.fn() };
vi.mock("@/lib/api/careers", () => ({
  careersApi: new Proxy(
    {},
    {
      get:
        (_t, name: string) =>
        (...args: unknown[]) =>
          (careers as Record<string, (...a: unknown[]) => unknown>)[name]?.(
            ...args,
          ),
    },
  ),
}));

const { apiScreeningGateway: gateway } =
  await import("@/lib/hiring/screening/api-gateway");

const WEIGHTS = {
  mustHave: 50,
  niceToHave: 15,
  experience: 15,
  education: 10,
  location: 10,
};

const apiView = (version: number) => ({
  postingId: "p1",
  configured: version > 0,
  version,
  criteria: {
    skills: {
      must: [{ term: "Payroll", aliases: ["PAYE"], weight: 1 }],
      nice: [],
    },
    experience: null,
    education: null,
    location: null,
    weights: WEIGHTS,
  },
  savedAt: null,
  savedBy: null,
  catalogue: {
    engineVersion: 1,
    educationLevels: [],
    defaultWeights: WEIGHTS,
    limits: {},
    neverUsed: ["name"],
    formQuestions: [],
  },
  runs: [],
});

const signal = new AbortController().signal;

beforeEach(() => {
  for (const fn of [...Object.values(screening), ...Object.values(careers)])
    fn.mockReset();
});

describe("saving criteria", () => {
  const draft = {
    mustHave: [{ id: "x", label: "Payroll", aliases: ["PAYE"], weight: 2 }],
    niceToHave: [],
    minYears: 3,
    education: null,
    places: [],
    locationQuestionId: null,
    relocateQuestionId: null,
    weights: null,
  };

  it("sends what the API takes, and reads the new version back", async () => {
    screening.getCriteria.mockResolvedValue(apiView(3));
    screening.putCriteria.mockResolvedValue({
      ...apiView(4),
      changed: true,
      notes: [],
      rescore: null,
    });
    const view = await gateway.criteria.save("p1", draft, 3);
    expect(screening.putCriteria).toHaveBeenCalledWith("p1", {
      skills: {
        must: [{ term: "Payroll", aliases: ["PAYE"], weight: 2 }],
        nice: [],
      },
      experience: { minYears: 3 },
      education: null,
      location: null,
    });
    expect(view.version).toBe(4);
  });

  it("refuses, in words, when somebody saved a newer version first", async () => {
    screening.getCriteria.mockResolvedValue(apiView(4));
    await expect(gateway.criteria.save("p1", draft, 3)).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(
        /Somebody saved newer criteria, version 4/,
      ),
    });
    expect(screening.putCriteria).not.toHaveBeenCalled();
  });

  it("saves the first version from nothing", async () => {
    screening.getCriteria.mockResolvedValue(apiView(0));
    screening.putCriteria.mockResolvedValue({
      ...apiView(1),
      changed: true,
      notes: [],
      rescore: null,
    });
    await expect(
      gateway.criteria.save("p1", draft, null),
    ).resolves.toMatchObject({
      version: 1,
    });
  });
});

describe("a preview and a re-score", () => {
  it("sends the draft, not the saved criteria, to be tried", async () => {
    screening.previewCriteria.mockResolvedValue({
      configured: true,
      available: 0,
      sampled: 0,
      items: [],
      summary: null,
      notes: [],
    });
    await gateway.criteria.preview(
      "p1",
      {
        mustHave: [{ id: "x", label: "Go", aliases: [], weight: 1 }],
        niceToHave: [],
        minYears: null,
        education: null,
        places: [],
        locationQuestionId: null,
        relocateQuestionId: null,
        weights: null,
      },
      signal,
    );
    expect(screening.previewCriteria.mock.calls[0]?.[1]).toMatchObject({
      skills: { must: [{ term: "Go" }] },
    });
  });

  it("asks for the latest pass only, and can score everybody again", async () => {
    screening.runs.mockResolvedValue([]);
    await gateway.rescore.progress("p1", signal);
    expect(screening.runs).toHaveBeenCalledWith("p1", 1, signal);
    screening.rescore.mockResolvedValue({});
    await gateway.rescore.start?.("p1");
    expect(screening.rescore).toHaveBeenCalledWith("p1");
  });
});

describe("an explanation", () => {
  const detail = (current: boolean) => ({
    id: "a1",
    postingId: "p1",
    screening: {
      status: "SCORED",
      score: 80,
      coverage: 100,
      reasons: "Matched: Payroll.",
      criteriaVersion: 3,
      engineVersion: 1,
      current,
      scoredAt: null,
      groups: [{ group: "mustHave", weight: 50, value: 1, judged: true }],
      criteria: [
        {
          key: "must:0",
          group: "mustHave",
          label: "Payroll",
          status: "MATCHED",
          value: 1,
          confidence: "HIGH",
          weight: 1,
          evidence: [{ source: "cv", kind: "match", text: "ran PAYE returns" }],
          note: null,
        },
      ],
      why: null,
      extraction: null,
      neverUsed: [],
    },
  });

  it("marks the other spellings when the score was made under the criteria in force", async () => {
    careers.getApplication.mockResolvedValue(detail(true));
    screening.getCriteria.mockResolvedValue(apiView(3));
    const e = await gateway.explanation(
      { kind: "application", id: "a1" },
      signal,
    );
    expect(e.items[0]?.evidence[0]?.marks).toEqual(["Payroll", "PAYE"]);
  });

  it("does not guess the spellings of an older score, and does not ask for them", async () => {
    careers.getApplication.mockResolvedValue(detail(false));
    const e = await gateway.explanation(
      { kind: "application", id: "a1" },
      signal,
    );
    expect(screening.getCriteria).not.toHaveBeenCalled();
    expect(e.items[0]?.evidence[0]?.marks).toEqual(["Payroll"]);
    expect(e.stale).toBe(true);
  });

  it("says plainly when the server does not explain scores", async () => {
    careers.getApplication.mockResolvedValue({ id: "a1", postingId: "p1" });
    await expect(
      gateway.explanation({ kind: "application", id: "a1" }, signal),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("what this server can do", () => {
  it("offers the sorts the queue can take, the assessment one included", () => {
    expect(gateway.supports.sorts).toEqual([
      "newest",
      "fit-desc",
      "fit-asc",
      "assessment-desc",
    ]);
  });

  it("offers the pass mark, the scores, the list and the board", () => {
    expect(gateway.supports).toMatchObject({
      passMark: true,
      assessment: true,
      below: true,
      board: true,
      belowState: true,
    });
  });
});
