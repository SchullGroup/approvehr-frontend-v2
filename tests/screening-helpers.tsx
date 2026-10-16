import { vi, type Mock } from "vitest";
import type { ScreeningGateway } from "@/lib/hiring/screening/gateway";
import {
  FALLBACK_WEIGHTS,
  DEFAULT_SCALE,
} from "@/lib/hiring/screening/criteria";
import {
  NO_CRITERIA,
  type BelowRow,
  type CriteriaView,
  type Explanation,
  type FitSummary,
  type Keyword,
  type ScreeningSummary,
} from "@/lib/hiring/screening/model";

/**
 * Furniture for the screening screens' tests: a gateway that answers with fixtures
 * and records what it was asked, and the fixtures themselves.
 *
 * Not a test file (no `.test.`): vitest only runs `*.test.*`.
 *
 * A test replaces `@/lib/hiring/screening/use-gateway` so the screen under test
 * talks to this and not to the demo's book or the API:
 *
 *     const current = { gateway: fakeGateway() };
 *     vi.mock("@/lib/hiring/screening/use-gateway", () => ({
 *       useScreeningGateway: () => current.gateway,
 *     }));
 */

export const kw = (
  label: string,
  aliases: string[] = [],
  weight = 1,
): Keyword => ({
  id: `k-${label}`,
  label,
  aliases,
  weight,
});

/** A suggested skill, with the sentence the advert gave it. */
export const sk = (label: string, from = "We need payroll experience.") => ({
  ...kw(label),
  from,
  confidence: "HIGH" as const,
});

export const fit = (over: Partial<FitSummary> = {}): FitSummary => ({
  status: "SCORED",
  score: 72,
  version: 2,
  stale: false,
  ...over,
});

export const summary = (
  over: Partial<ScreeningSummary> = {},
): ScreeningSummary => ({
  fit: fit(),
  assessment: null,
  knockoutCount: 0,
  belowPassMark: false,
  ...over,
});

export const savedView = (over: Partial<CriteriaView> = {}): CriteriaView => ({
  postingId: "p1",
  configured: true,
  version: 3,
  criteria: {
    ...NO_CRITERIA,
    mustHave: [kw("Payroll", ["PAYE"])],
    niceToHave: [kw("Excel")],
    minYears: 3,
    education: "BACHELORS",
  },
  defaults: FALLBACK_WEIGHTS,
  scale: DEFAULT_SCALE,
  formQuestions: [
    { id: "q-where", kind: "SHORT_TEXT", label: "Where do you live?" },
    { id: "q-move", kind: "YES_NO", label: "Would you relocate?" },
  ],
  formula: "Credit earned out of the weight that could be judged.",
  neverUsed: ["name", "photo", "institution names or rankings"],
  updatedAt: "2026-10-10T09:00:00.000Z",
  updatedBy: "Fatima Bello",
  ...over,
});

export const explanation = (over: Partial<Explanation> = {}): Explanation => ({
  status: "SCORED",
  score: 72,
  coverage: 80,
  formula: "Credit earned out of the weight that could be judged.",
  version: 3,
  currentVersion: 3,
  stale: false,
  groups: [
    { kind: "MUST_HAVE", weight: 50, value: 0.5, judged: true },
    { kind: "NICE_TO_HAVE", weight: 15, value: 0, judged: true },
    { kind: "YEARS", weight: 15, value: null, judged: false },
  ],
  items: [
    {
      id: "must:0",
      kind: "MUST_HAVE",
      label: "Payroll",
      verdict: "MATCHED",
      confidence: "HIGH",
      value: 1,
      evidence: [
        {
          source: "cv",
          text: "…ran monthly payroll for 400 staff…",
          marks: ["Payroll"],
        },
      ],
      note: null,
    },
    {
      id: "must:1",
      kind: "MUST_HAVE",
      label: "PAYE",
      verdict: "MISSING",
      confidence: "HIGH",
      value: 0,
      evidence: [],
      note: "The CV was read and does not mention it.",
    },
    {
      id: "nice:0",
      kind: "NICE_TO_HAVE",
      label: "Excel",
      verdict: "PARTIAL",
      confidence: "LOW",
      value: 0.5,
      evidence: [],
      note: null,
    },
    {
      id: "experience",
      kind: "YEARS",
      label: "At least 3 years",
      verdict: "UNKNOWN",
      confidence: null,
      value: null,
      evidence: [],
      note: "The CV gives no number of years.",
    },
  ],
  extraction: { state: "READY", reason: null, canRetry: false },
  standing: null,
  ...over,
});

export const belowRow = (
  n: number,
  over: Partial<BelowRow> = {},
): BelowRow => ({
  id: `a${String(n)}`,
  name: `Applicant ${String(n)}`,
  email: `applicant${String(n)}@example.test`,
  appliedAt: "2026-10-01T09:00:00.000Z",
  summary: summary({
    fit: fit({ score: 30 + n }),
    belowPassMark: true,
  }),
  reasons: [
    { kind: "FIT", text: `Fit ${String(30 + n)}, and the pass mark is 50` },
  ],
  flagged: [],
  ...over,
});

type Fn = (...args: never[]) => unknown;

/** The gateway with each method typed as the spy it is. */
export type FakeGateway = {
  [K in keyof ScreeningGateway]: ScreeningGateway[K] extends Fn
    ? Mock<Extract<ScreeningGateway[K], Fn>>
    : ScreeningGateway[K] extends object
      ? {
          [M in keyof ScreeningGateway[K]]: ScreeningGateway[K][M] extends Fn
            ? Mock<Extract<ScreeningGateway[K][M], Fn>>
            : ScreeningGateway[K][M];
        }
      : ScreeningGateway[K];
};

/** A gateway whose every method is a spy that answers with something sensible. */
export function fakeGateway(over: Partial<ScreeningGateway> = {}): FakeGateway {
  const gateway = {
    mode: "demo",
    supports: {
      passMark: true,
      assessment: true,
      below: true,
      board: true,
      sorts: [
        "newest",
        "fit-desc",
        "fit-asc",
        "assessment-desc",
        "knockouts-desc",
      ],
    },
    criteria: {
      get: vi.fn(async () => savedView()),
      save: vi.fn(
        async (_id: string, _criteria: unknown, base: number | null) =>
          savedView({ version: (base ?? 0) + 1 }),
      ),
      suggest: vi.fn(async () => ({
        mustHave: [sk("Payroll"), sk("PAYE")],
        niceToHave: [sk("Excel", "Excel is a plus.")],
        minYears: 5,
        minYearsFrom: "At least 5 years of experience.",
        education: "BACHELORS",
        educationFrom: "A degree is required.",
        places: ["Lagos"],
        placesFrom: "The advert's own location.",
        note: "Taken from the words in the advert.",
      })),
      preview: vi.fn(async () => ({
        available: 4210,
        sampled: 20,
        rows: [
          {
            id: "r1",
            name: "Ada Okafor",
            current: 60,
            next: 91,
            change: 31,
            reasons: "Matched: Payroll.",
          },
          {
            id: "r2",
            name: "Tunde Bello",
            current: null,
            next: null,
            change: null,
            reasons: null,
          },
        ],
        scored: 19,
        notScorable: 1,
        mean: 64.2,
        bands: [0, 1, 2, 3, 4, 3, 2, 2, 1, 1],
      })),
    },
    rescore: {
      start: null,
      progress: vi.fn(async () => ({
        running: false,
        done: 0,
        total: 0,
        cause: null,
      })),
    },
    passMark: {
      get: vi.fn(async () => ({
        fitMin: 50,
        assessmentMin: null,
        assessmentMax: 100,
        knockouts: [
          { id: "k1", question: "Right to work in Nigeria?", flagWhen: "No" },
        ],
        version: 1,
      })),
      count: vi.fn(async () => ({
        total: 4210,
        below: 412,
        byReason: { fit: 400, assessment: 0, knockout: 22 },
        notScored: 31,
      })),
      save: vi.fn(
        async (
          _id: string,
          input: { fitMin: number | null; assessmentMin: number | null },
        ) => ({
          ...input,
          assessmentMax: 100,
          knockouts: [],
          version: 2,
        }),
      ),
    },
    explanation: vi.fn(async () => explanation()),
    retryReading: null,
    assessment: {
      template: vi.fn(() => ({ filename: "t.csv", body: "Email,Score\n" })),
      check: vi.fn(),
      commit: vi.fn(),
      enter: vi.fn(async () => undefined),
      history: vi.fn(async () => []),
    },
    below: {
      count: vi.fn(async () => ({ below: 412, total: 4210 })),
      list: vi.fn(async () => ({
        rows: [belowRow(1), belowRow(2)],
        total: 2,
        next: null,
      })),
      reject: vi.fn(),
      keep: vi.fn(async () => undefined),
    },
    ...over,
  };
  return gateway as unknown as FakeGateway;
}
