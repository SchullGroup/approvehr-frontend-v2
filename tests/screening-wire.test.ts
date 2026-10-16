import { describe, expect, it } from "vitest";
import type {
  ApiCriteria,
  ApiCriteriaView,
  ApiRun,
  ApiScreeningDetail,
} from "@/lib/api/screening";
import {
  criteriaFromApi,
  criteriaToApi,
  explanationFromApi,
  fitFromRow,
  previewFromApi,
  problemsFromApi,
  progressFromRuns,
  statusFromApi,
  statusToApi,
  suggestionFromApi,
  summaryFromRow,
  viewFromApi,
} from "@/lib/hiring/screening/wire";

/**
 * The API's words, turned into the screens' and back.
 *
 * What these hold: criteria survive a round trip with nothing lost (a skill's own
 * weight, its other spellings, the places and the two form questions), weights
 * equal to the defaults read as "the defaults" and are not sent, every API status
 * has a plain name and the reverse, a list row without scoring fields stays as it
 * was, and an explanation keeps unknown apart from missing.
 */

const DEFAULTS = {
  mustHave: 50,
  niceToHave: 15,
  experience: 15,
  education: 10,
  location: 10,
};

const api = (over: Partial<ApiCriteria> = {}): ApiCriteria => ({
  skills: {
    must: [{ term: "Node.js", aliases: ["NodeJS", "Node"], weight: 3 }],
    nice: [{ term: "Terraform", aliases: [], weight: 1 }],
  },
  experience: { minYears: 3.5 },
  education: { minLevel: "BACHELORS" },
  location: {
    places: ["Lagos", "Ikeja"],
    locationQuestionId: "q-where",
    relocateQuestionId: "q-move",
  },
  weights: DEFAULTS,
  ...over,
});

const run = (over: Partial<ApiRun> = {}): ApiRun => ({
  id: "r1",
  kind: "RESCORE",
  status: "RUNNING",
  trigger: "criteria_changed",
  criteriaVersion: 3,
  engineVersion: 1,
  total: 4210,
  processed: 1240,
  scored: 1200,
  waiting: 30,
  noScore: 10,
  failed: 0,
  progress: 29,
  error: null,
  createdAt: "2026-10-16T09:00:00.000Z",
  startedAt: "2026-10-16T09:00:01.000Z",
  finishedAt: null,
  ...over,
});

describe("criteria", () => {
  it("reads what the API saved, keeping each skill's weight and spellings", () => {
    const criteria = criteriaFromApi(api(), DEFAULTS);
    expect(criteria.mustHave).toEqual([
      expect.objectContaining({
        label: "Node.js",
        aliases: ["NodeJS", "Node"],
        weight: 3,
      }),
    ]);
    expect(criteria.minYears).toBe(3.5);
    expect(criteria.education).toBe("BACHELORS");
    expect(criteria.places).toEqual(["Lagos", "Ikeja"]);
    expect(criteria.locationQuestionId).toBe("q-where");
    expect(criteria.relocateQuestionId).toBe("q-move");
  });

  it("reads weights equal to the defaults as the defaults, and others as their own", () => {
    expect(criteriaFromApi(api(), DEFAULTS).weights).toBeNull();
    expect(
      criteriaFromApi(api({ weights: { ...DEFAULTS, mustHave: 70 } }), DEFAULTS)
        .weights,
    ).toEqual({ ...DEFAULTS, mustHave: 70 });
  });

  it("makes the same chip keys every time, so an edit keeps its place", () => {
    const a = criteriaFromApi(api(), DEFAULTS);
    const b = criteriaFromApi(api(), DEFAULTS);
    expect(a.mustHave[0]?.id).toBe(b.mustHave[0]?.id);
  });

  it("survives a round trip with nothing lost", () => {
    const original = api();
    const sent = criteriaToApi(criteriaFromApi(original, DEFAULTS));
    expect(sent.skills).toEqual(original.skills);
    expect(sent.experience).toEqual(original.experience);
    expect(sent.education).toEqual(original.education);
    expect(sent.location).toEqual(original.location);
  });

  it("does not send weights it was not given, and sends the ones it was", () => {
    const defaults = criteriaToApi(criteriaFromApi(api(), DEFAULTS));
    expect(defaults).not.toHaveProperty("weights");
    const own = criteriaToApi({
      ...criteriaFromApi(api(), DEFAULTS),
      weights: { ...DEFAULTS, location: 0 },
    });
    expect(own.weights).toEqual({ ...DEFAULTS, location: 0 });
  });

  it("sends null for what was not asked, never an empty object", () => {
    const sent = criteriaToApi({
      mustHave: [],
      niceToHave: [],
      minYears: null,
      education: null,
      places: [],
      locationQuestionId: "q",
      relocateQuestionId: null,
      weights: null,
    });
    expect(sent.experience).toBeNull();
    expect(sent.education).toBeNull();
    expect(sent.location).toBeNull();
  });

  it("builds the whole editor's view: scale lowest first, 0 as no version, the lists", () => {
    const view: ApiCriteriaView = {
      postingId: "p1",
      configured: false,
      version: 0,
      criteria: api({
        skills: { must: [], nice: [] },
        experience: null,
        education: null,
        location: null,
      }),
      savedAt: null,
      savedBy: null,
      catalogue: {
        engineVersion: 1,
        educationLevels: [
          {
            level: "MASTERS",
            label: "Master's degree",
            rank: 6,
            examples: "MSc",
          },
          {
            level: "SECONDARY",
            label: "Secondary school",
            rank: 1,
            examples: "SSCE",
          },
        ],
        defaultWeights: DEFAULTS,
        limits: {},
        neverUsed: ["name", "photo"],
        formQuestions: [{ id: "q1", kind: "YES_NO", label: "Relocate?" }],
      },
      runs: [],
    };
    const mapped = viewFromApi(view);
    expect(mapped.version).toBeNull();
    expect(mapped.configured).toBe(false);
    expect(mapped.scale.map((l) => l.value)).toEqual(["SECONDARY", "MASTERS"]);
    expect(mapped.neverUsed).toEqual(["name", "photo"]);
    expect(mapped.formQuestions).toHaveLength(1);
    expect(mapped.defaults).toEqual(DEFAULTS);
  });
});

describe("the API's refusals", () => {
  it("land on the part of the form they are about", () => {
    expect(
      problemsFromApi([
        { field: "skills.must.2.term", message: "Write the skill or keyword." },
        {
          field: "skills.nice.0.weight",
          message: "Use a whole number from 1 to 5.",
        },
        { field: "experience.minYears", message: "Use a number of years." },
        { field: "location.places", message: "Name at least one place." },
        { field: "weights", message: "Give one a weight above 0." },
        { field: "something", message: "Other." },
      ]),
    ).toEqual({
      mustHave: "Write the skill or keyword.",
      niceToHave: "Use a whole number from 1 to 5.",
      minYears: "Use a number of years.",
      places: "Name at least one place.",
      weights: "Give one a weight above 0.",
      form: "Other.",
    });
  });
});

describe("re-scoring", () => {
  it("is running while queued or running, with how far it has got", () => {
    expect(progressFromRuns([run()])).toEqual({
      running: true,
      done: 1240,
      total: 4210,
      cause: "CRITERIA",
      failure: null,
    });
    expect(
      progressFromRuns([run({ status: "QUEUED", processed: 0 })]).running,
    ).toBe(true);
  });

  it("says a pass mark change is a pass mark change", () => {
    expect(
      progressFromRuns([run({ kind: "CUTOFF", trigger: "cutoff_changed" })])
        .cause,
    ).toBe("PASS_MARK");
  });

  it("is not running when done, superseded or absent", () => {
    expect(progressFromRuns([run({ status: "DONE" })]).running).toBe(false);
    expect(progressFromRuns([run({ status: "SUPERSEDED" })]).running).toBe(
      false,
    );
    expect(progressFromRuns([])).toMatchObject({
      running: false,
      failure: null,
    });
  });

  it("says a pass that stopped, with the API's reason", () => {
    expect(
      progressFromRuns([
        run({ status: "FAILED", error: "The database restarted." }),
      ]).failure,
    ).toBe("The database restarted.");
    expect(
      progressFromRuns([run({ status: "FAILED", error: null })]).failure,
    ).toMatch(/stopped part way/);
  });
});

describe("a score's status", () => {
  it("has a plain name for each of the API's, and back", () => {
    expect(statusFromApi("SCORED")).toBe("SCORED");
    expect(statusFromApi("PENDING")).toBe("WAITING_FOR_TEXT");
    expect(statusFromApi("NO_CV")).toBe("NO_CV");
    expect(statusFromApi("NO_CRITERIA")).toBe("NO_CRITERIA");
    expect(statusFromApi("NEEDS_READING")).toBe("NO_TEXT");
    expect(statusFromApi("NEEDS_READING", true)).toBe("COULD_NOT_READ");
    expect(statusToApi("WAITING_FOR_TEXT")).toBe("PENDING");
    expect(statusToApi("NO_TEXT")).toBe("NEEDS_READING");
    expect(statusToApi("COULD_NOT_READ")).toBe("NEEDS_READING");
  });

  it("reads a list row's score, and never a score for somebody without one", () => {
    expect(fitFromRow({ score: 72, scoreStatus: "SCORED" })).toEqual({
      status: "SCORED",
      score: 72,
      version: null,
      stale: false,
    });
    expect(
      fitFromRow({ score: 0, scoreStatus: "NEEDS_READING" })?.score,
    ).toBeNull();
    expect(
      fitFromRow({ score: null, scoreStatus: "PENDING" })?.score,
    ).toBeNull();
  });

  it("leaves a row from an API that predates screening as it was", () => {
    expect(fitFromRow({})).toBeNull();
    expect(summaryFromRow({})).toBeNull();
    expect(
      summaryFromRow({ score: 40, scoreStatus: "SCORED", knockoutCount: 2 }),
    ).toMatchObject({
      knockoutCount: 2,
      assessment: null,
      belowPassMark: false,
    });
  });
});

const detail = (
  over: Partial<ApiScreeningDetail> = {},
): ApiScreeningDetail => ({
  status: "SCORED",
  score: 62,
  coverage: 77,
  reasons: "Matched: Node.js. Missing: Docker.",
  criteriaVersion: 3,
  engineVersion: 1,
  current: true,
  scoredAt: "2026-10-16T09:10:00.000Z",
  groups: [
    { group: "mustHave", weight: 50, value: 0.5, judged: true },
    { group: "experience", weight: 15, value: null, judged: false },
  ],
  criteria: [
    {
      key: "must:0",
      group: "mustHave",
      label: "Node.js",
      status: "MATCHED",
      value: 1,
      confidence: "HIGH",
      weight: 3,
      evidence: [
        { source: "cv", kind: "match", text: "…services in NodeJS for…" },
      ],
      note: null,
    },
    {
      key: "experience",
      group: "experience",
      label: "At least 3 years' experience",
      status: "UNKNOWN",
      value: null,
      confidence: "LOW",
      weight: 1,
      evidence: [],
      note: "The CV gives no number of years.",
    },
  ],
  why: null,
  extraction: {
    status: "DONE",
    reason: null,
    pages: 2,
    characters: 3000,
    truncated: false,
  },
  neverUsed: ["name"],
  ...over,
});

describe("an explanation", () => {
  it("keeps unknown apart from missing, and names the groups", () => {
    const e = explanationFromApi(detail());
    expect(e.status).toBe("SCORED");
    expect(e.score).toBe(62);
    expect(e.coverage).toBe(77);
    expect(e.items.map((i) => [i.kind, i.verdict, i.value])).toEqual([
      ["MUST_HAVE", "MATCHED", 1],
      ["YEARS", "UNKNOWN", null],
    ]);
    expect(e.groups).toEqual([
      { kind: "MUST_HAVE", weight: 50, value: 0.5, judged: true },
      { kind: "YEARS", weight: 15, value: null, judged: false },
    ]);
    expect(e.formula).toMatch(/weight/);
  });

  it("marks the skill and its other spellings in the words it was found in", () => {
    const e = explanationFromApi(detail(), { "must:0": ["NodeJS", "Node"] });
    expect(e.items[0]?.evidence[0]).toEqual({
      source: "cv",
      text: "…services in NodeJS for…",
      marks: ["Node.js", "NodeJS", "Node"],
    });
    expect(e.items[1]?.evidence).toEqual([]);
  });

  it("says a score made under older criteria is stale", () => {
    expect(explanationFromApi(detail({ current: false })).stale).toBe(true);
    expect(explanationFromApi(detail({ current: false })).version).toBe(3);
    expect(explanationFromApi(detail()).stale).toBe(false);
  });

  it("carries no items for somebody without a score, and the reason in words", () => {
    const e = explanationFromApi(
      detail({
        status: "NEEDS_READING",
        score: null,
        coverage: null,
        groups: [],
        criteria: [],
        why: "The CV is a scan or a picture with no text in it. A person needs to open it.",
        extraction: {
          status: "NO_TEXT",
          reason: "no_text_layer",
          pages: 1,
          characters: 0,
          truncated: false,
        },
      }),
    );
    expect(e.status).toBe("NO_TEXT");
    expect(e.items).toEqual([]);
    expect(e.extraction).toMatchObject({ state: "NO_TEXT", canRetry: false });
    expect(e.extraction.reason).toMatch(/scan or a picture/);
  });

  it("tells a file that could not be read from one with nothing in it", () => {
    const e = explanationFromApi(
      detail({
        status: "NEEDS_READING",
        score: null,
        criteria: [],
        groups: [],
        why: "The file is locked with a password. A person needs to open it.",
        extraction: {
          status: "FAILED",
          reason: "password_protected",
          pages: null,
          characters: null,
          truncated: false,
        },
      }),
    );
    expect(e.status).toBe("COULD_NOT_READ");
    expect(e.extraction.state).toBe("COULD_NOT_READ");
  });

  it("says waiting, no CV and no criteria as themselves", () => {
    expect(
      explanationFromApi(
        detail({
          status: "PENDING",
          score: null,
          criteria: [],
          groups: [],
          extraction: {
            status: "RUNNING",
            reason: null,
            pages: null,
            characters: null,
            truncated: false,
          },
        }),
      ),
    ).toMatchObject({
      status: "WAITING_FOR_TEXT",
      extraction: { state: "PENDING" },
    });
    expect(
      explanationFromApi(
        detail({
          status: "NO_CV",
          score: null,
          criteria: [],
          groups: [],
          extraction: null,
        }),
      ),
    ).toMatchObject({ status: "NO_CV", extraction: { state: "NO_CV" } });
    expect(
      explanationFromApi(
        detail({
          status: "NO_CRITERIA",
          score: null,
          criteria: [],
          groups: [],
          extraction: null,
        }),
      ).status,
    ).toBe("NO_CRITERIA");
  });
});

describe("a preview and a suggestion", () => {
  it("reads the sample as a sample, never as everybody", () => {
    const preview = previewFromApi({
      configured: true,
      available: 3000,
      sampled: 2,
      items: [
        {
          applicationId: "a",
          reference: "APP-1",
          name: "Ada",
          currentScore: 60,
          newScore: 72,
          change: 12,
          coverage: 90,
          reasons: "Matched: X.",
        },
        {
          applicationId: "b",
          reference: null,
          name: "Tunde",
          currentScore: null,
          newScore: null,
          change: null,
          coverage: 0,
          reasons: "",
        },
      ],
      summary: {
        scored: 1,
        notScorable: 1,
        mean: 72,
        distribution: Array.from({ length: 10 }, (_, i) => ({
          from: i * 10,
          to: i * 10 + 9,
          count: i === 7 ? 1 : 0,
        })),
      },
      notes: [],
    });
    expect(preview.available).toBe(3000);
    expect(preview.sampled).toBe(2);
    expect(preview.rows[0]).toEqual({
      id: "a",
      name: "Ada",
      current: 60,
      next: 72,
      change: 12,
      reasons: "Matched: X.",
    });
    expect(preview.rows[1]?.reasons).toBeNull();
    expect(preview.bands).toHaveLength(10);
    expect(preview.bands[7]).toBe(1);
  });

  it("reads a preview with nothing to try it on", () => {
    const preview = previewFromApi({
      configured: true,
      available: 0,
      sampled: 0,
      items: [],
      summary: null,
      notes: [],
    });
    expect(preview.sampled).toBe(0);
    expect(preview.scored).toBe(0);
    expect(preview.bands.every((n) => n === 0)).toBe(true);
  });

  it("gives each suggested skill the sentence it came from, sorted into its list", () => {
    const s = suggestionFromApi({
      skills: [
        {
          term: "Payroll",
          list: "must",
          confidence: "HIGH",
          from: "Strong payroll experience.",
        },
        {
          term: "Excel",
          list: "nice",
          confidence: "MEDIUM",
          from: "Excel is a plus.",
        },
      ],
      experience: { minYears: 5, from: "5 years." },
      education: {
        minLevel: "BACHELORS",
        label: "Bachelor's degree",
        from: "A degree.",
      },
      location: { places: ["Lagos"], from: "Based in Lagos." },
      readFrom: ["the advert's title, summary and description"],
    });
    expect(s.mustHave[0]).toMatchObject({
      label: "Payroll",
      from: "Strong payroll experience.",
      weight: 1,
    });
    expect(s.niceToHave[0]?.label).toBe("Excel");
    expect(s.minYears).toBe(5);
    expect(s.education).toBe("BACHELORS");
    expect(s.places).toEqual(["Lagos"]);
    expect(s.note).toMatch(/Read from the advert's title/);
  });
});
