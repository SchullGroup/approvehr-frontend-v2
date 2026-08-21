"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { BadgeTone } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  parseMeasure,
  performanceApi,
  type ApiAnswer,
  type ApiCompetency,
  type ApiCycle,
  type ApiEmployeeCompetencies,
  type ApiFormQuestion,
  type ApiGap,
  type ApiGoal,
  type ApiHeatmap,
  type ApiKeyResult,
  type ApiMyReviews,
  type ApiPeerFeedback,
  type ApiQuestion,
  type ApiAppraiserEntry,
  type ApiAppraiserMap,
  type ApiReview,
  type ApiReviewDetail,
  type AnswerBody,
  type CreateGoalBody,
  type CreateKeyResultBody,
  type CreateQuestionBody,
  type GoalStatus,
  type RateBody,
  type ReviewQuestionKind,
  type SubmitReviewBody,
} from "@/lib/api/performance";
import { EMPLOYEES, employeeById } from "@/lib/mock/people";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";

/**
 * Performance, in both modes: KPIs, appraisals and skills.
 *
 * The API when it answers, a seeded book in this browser when it does not —
 * the shape every store in here has. What is worth explaining is **where the
 * line falls in demo mode**, because the stores either side of this one draw it
 * in different places and both were right to.
 *
 * | | Connected | Demo |
 * |---|---|---|
 * | Read the cascade, the framework, the heatmap, what was said about me | yes | yes, from the seed |
 * | **Update progress on one key result** | yes | **yes, to this browser** |
 * | Answer and send my own review | yes | yes, to this browser |
 * | Write a goal, rate somebody, start or publish a cycle, chase people | yes | **refused, with the reason** |
 *
 * The two demo writes are the two everyday acts, and both are somebody
 * recording something about *their own* work. Nothing else in the frontend reads
 * them, so a locally-kept number has nothing to contradict — and a KPI screen
 * where the number cannot move demonstrates a picture rather than a product.
 *
 * The refusals are the acts with a blast radius outside this browser. Setting
 * somebody's goal, rating them against a scale, and starting a cycle that
 * creates a form for every employee are all *assessments of other people*, and a
 * demo that pretends to make one teaches the audience something false about
 * where those records live. `store/departments.ts` refuses for the same reason
 * and says so at the same length.
 *
 * ## `percent` is never computed on this side when connected
 *
 * `ApiKeyResult.percent` honours `lowerIsBetter`: a cost target progresses as
 * the number falls. `demoPercent` below is a **port** of the service's
 * `keyResultPercent`, needed only because the demo has no server to ask, and it
 * is the one place on this side that does that arithmetic. The connected path
 * never calls it. If the two ever disagree, the served one is right.
 *
 * ## Reminders are notifications in the app, not email
 *
 * `POST /cycles/:id/remind` writes to the notification inbox. Email delivery is
 * a registered seam with no provider behind it, so nothing here sends mail and
 * the screen says so in one line rather than implying an inbox was reached.
 */

/* ------------------------------------------------------------------- labels */

export const GOAL_STATUS_LABEL: Record<GoalStatus, string> = {
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  OFF_TRACK: "Off track",
  DONE: "Done",
};

export const GOAL_STATUS_TONE: Record<GoalStatus, BadgeTone> = {
  ON_TRACK: "info",
  AT_RISK: "warning",
  OFF_TRACK: "danger",
  /* Not `success`: green is the approval colour in this design system, and a
     finished goal is not an approval. */
  DONE: "neutral",
};

/** What a measure is asking of you, in three words. Direction included. */
export function measureDirection(measure: ApiKeyResult): string {
  return measure.lowerIsBetter ? "Lower is better" : "Higher is better";
}

/* ------------------------------------------------------------- the cascade */

/** A goal with the goals beneath it. `depth` is for indentation only. */
export type GoalNode = ApiGoal & { children: GoalNode[]; depth: number };

/**
 * Company goal, team goals beneath it, individual beneath those.
 *
 * A goal whose parent is **not in the set** becomes a root rather than being
 * dropped. That happens legitimately: my goal can ladder up to my manager's,
 * and their personal goal is not mine to read. `parentTitle` still arrives on
 * the row, so the interface can say what it sits under without holding the
 * parent — and a goal silently missing from a cascade is worse than one shown a
 * level too high.
 */
export function toCascade(goals: ApiGoal[]): GoalNode[] {
  const byId = new Map(goals.map((goal) => [goal.id, goal]));
  const children = new Map<string, ApiGoal[]>();
  const roots: ApiGoal[] = [];

  for (const goal of goals) {
    if (goal.parentId && byId.has(goal.parentId)) {
      const siblings = children.get(goal.parentId) ?? [];
      siblings.push(goal);
      children.set(goal.parentId, siblings);
    } else {
      roots.push(goal);
    }
  }

  const rank = (goal: ApiGoal) =>
    goal.companyWide ? 0 : goal.status === "DONE" ? 2 : 1;

  const build = (goal: ApiGoal, depth: number): GoalNode => ({
    ...goal,
    depth,
    children: (children.get(goal.id) ?? [])
      .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
      .map((child) => build(child, depth + 1)),
  });

  return roots
    .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
    .map((goal) => build(goal, 0));
}

/* ============================================================================
 * The demo book
 * ==========================================================================*/

/**
 * A port of `keyResultPercent` from the service, for demo mode only.
 *
 * The direction is the whole function: a reduction target travels from `start`
 * *down* to `target`, and progress is how much of that fall has happened.
 * Floats rather than Decimal because the seed values are small and this number
 * is never stored — the served version uses Decimal and is authoritative.
 */
function demoPercent(measure: {
  startValue: string;
  targetValue: string;
  currentValue: string;
  lowerIsBetter: boolean;
}): number {
  const start = parseMeasure(measure.startValue);
  const target = parseMeasure(measure.targetValue);
  const current = parseMeasure(measure.currentValue);

  const span = measure.lowerIsBetter ? start - target : target - start;
  const moved = measure.lowerIsBetter ? start - current : current - start;

  if (span === 0) return demoMet(measure) ? 100 : 0;
  if (span < 0) return 0;
  return Math.min(100, Math.max(0, Math.round((moved / span) * 100)));
}

function demoMet(measure: {
  targetValue: string;
  currentValue: string;
  lowerIsBetter: boolean;
}): boolean {
  const target = parseMeasure(measure.targetValue);
  const current = parseMeasure(measure.currentValue);
  return measure.lowerIsBetter ? current <= target : current >= target;
}

type SeedMeasure = {
  id: string;
  label: string;
  unit?: string;
  startValue: string;
  targetValue: string;
  currentValue: string;
  lowerIsBetter?: boolean;
};

type SeedGoal = {
  id: string;
  title: string;
  description?: string;
  ownerId: string | null;
  parentId: string | null;
  status: GoalStatus;
  dueQuarter: string;
  measures: SeedMeasure[];
};

/**
 * The seeded cascade.
 *
 * Two of these measures count **down** on purpose — a cost figure and a
 * time-to-interview figure. They are here so the direction-aware arithmetic is
 * visible in a demo rather than only in a test, and the hosting-spend numbers
 * are deliberately the worked example from the service's own doc comment
 * (₦500k → ₦300k, now ₦400k, which is 50%).
 */
const SEED_GOALS: readonly SeedGoal[] = [
  {
    id: "demo-goal-company",
    title: "Process ₦2bn in client payroll by year end",
    description: "Every team's goals ladder up to this one.",
    ownerId: null,
    parentId: null,
    status: "ON_TRACK",
    dueQuarter: "2026-Q4",
    measures: [
      {
        id: "demo-kr-payroll",
        label: "Payroll processed",
        unit: "₦",
        startValue: "0",
        targetValue: "2000000000",
        currentValue: "1240000000",
      },
      {
        id: "demo-kr-companies",
        label: "Companies live",
        startValue: "8",
        targetValue: "40",
        currentValue: "23",
      },
    ],
  },
  {
    id: "demo-goal-eng",
    title: "Ship multi-entity payroll",
    ownerId: "p-01",
    parentId: "demo-goal-company",
    status: "ON_TRACK",
    dueQuarter: "2026-Q3",
    measures: [
      {
        id: "demo-kr-entities",
        label: "Legal entities supported",
        startValue: "1",
        targetValue: "5",
        currentValue: "4",
      },
    ],
  },
  {
    id: "demo-goal-finance",
    title: "Close month-end within five working days",
    ownerId: "p-02",
    parentId: "demo-goal-company",
    status: "AT_RISK",
    dueQuarter: "2026-Q3",
    measures: [
      {
        id: "demo-kr-close",
        label: "Working days to close",
        unit: "days",
        startValue: "11",
        targetValue: "5",
        currentValue: "9",
        lowerIsBetter: true,
      },
      {
        id: "demo-kr-hosting",
        label: "Monthly hosting spend",
        unit: "₦",
        startValue: "500000",
        targetValue: "300000",
        currentValue: "400000",
        lowerIsBetter: true,
      },
    ],
  },
  {
    id: "demo-goal-people",
    title: "Fill 12 open roles",
    ownerId: "p-05",
    parentId: "demo-goal-company",
    status: "ON_TRACK",
    dueQuarter: "2026-Q3",
    measures: [
      {
        id: "demo-kr-roles",
        label: "Roles filled",
        startValue: "0",
        targetValue: "12",
        currentValue: "7",
      },
    ],
  },
  {
    id: "demo-goal-mine-offers",
    title: "Fill the two Lagos engineering roles",
    ownerId: "p-06",
    parentId: "demo-goal-people",
    status: "ON_TRACK",
    dueQuarter: "2026-Q3",
    measures: [
      {
        id: "demo-kr-offers",
        label: "Offers accepted",
        startValue: "0",
        targetValue: "2",
        currentValue: "1",
      },
    ],
  },
  {
    id: "demo-goal-mine-speed",
    title: "Get candidates to a first interview inside a week",
    ownerId: "p-06",
    parentId: "demo-goal-people",
    status: "AT_RISK",
    dueQuarter: "2026-Q3",
    measures: [
      {
        id: "demo-kr-first-interview",
        label: "Days to first interview",
        unit: "days",
        startValue: "14",
        targetValue: "5",
        currentValue: "9",
        lowerIsBetter: true,
      },
    ],
  },
  {
    id: "demo-goal-mine-handbook",
    title: "Publish the hiring handbook",
    ownerId: "p-06",
    parentId: "demo-goal-people",
    status: "DONE",
    dueQuarter: "2026-Q2",
    measures: [
      {
        id: "demo-kr-handbook",
        label: "Sections published",
        startValue: "0",
        targetValue: "6",
        currentValue: "6",
      },
    ],
  },
];

/**
 * The framework, mirrored for demonstrations with no database.
 *
 * The wording, the four categories and the `isCore` flags are the API's to
 * change — `modules/performance/framework.ts` is the file that makes the
 * marketing claim true, and this is a demo prop beside it, read only when
 * `useSession().isConnected` is false. Same arrangement as `DEMO_QUESTIONS` in
 * `store/features.ts`, for the same reason.
 */
const SEED_COMPETENCIES: readonly {
  name: string;
  category: string;
  description: string;
  isCore: boolean;
}[] = [
  {
    name: "Job knowledge",
    category: "Core competency",
    description: "Understands the work and keeps that understanding current.",
    isCore: true,
  },
  {
    name: "Quality of work",
    category: "Core competency",
    description: "Output is accurate and needs little rework.",
    isCore: true,
  },
  {
    name: "Dependability",
    category: "Core competency",
    description: "Commitments are met without being chased.",
    isCore: true,
  },
  {
    name: "Communication",
    category: "Behavioural competency",
    description: "Explains clearly, in writing and in person, and listens.",
    isCore: false,
  },
  {
    name: "Teamwork",
    category: "Behavioural competency",
    description: "Works with people outside their own function.",
    isCore: false,
  },
  {
    name: "Initiative",
    category: "Behavioural competency",
    description: "Acts without waiting to be told, within their remit.",
    isCore: false,
  },
  {
    name: "Adaptability",
    category: "Behavioural competency",
    description: "Handles a changed priority without losing the thread.",
    isCore: false,
  },
  {
    name: "Delivery against objectives",
    category: "Key result area",
    description: "Progress on the goals set for the period.",
    isCore: true,
  },
  {
    name: "Customer or stakeholder outcomes",
    category: "Key result area",
    description: "The effect of the work on whoever receives it.",
    isCore: false,
  },
  {
    name: "Process and compliance",
    category: "Key result area",
    description: "Work done the way the company requires it to be done.",
    isCore: false,
  },
  {
    name: "Developing people",
    category: "Leadership",
    description: "Grows the people who report to them, deliberately.",
    isCore: false,
  },
  {
    name: "Decision making",
    category: "Leadership",
    description: "Decides with incomplete information and owns the outcome.",
    isCore: false,
  },
  {
    name: "Accountability for a team",
    category: "Leadership",
    description: "Answers for the team's results rather than its individuals.",
    isCore: false,
  },
];

const SCALE_MAX = 5;

const competencyId = (name: string) =>
  `demo-comp-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;

const demoCompetencies: ApiCompetency[] = SEED_COMPETENCIES.map((seed) => ({
  id: competencyId(seed.name),
  name: seed.name,
  category: seed.category,
  description: seed.description,
  isCore: seed.isCore,
  scaleMax: SCALE_MAX,
  active: true,
  archived: false,
  ratingCount: 0,
}));

/**
 * Seeded assessments. Written out rather than generated.
 *
 * Most competencies for most people are deliberately **absent**, because "never
 * assessed" and "scored badly" are different facts and the interface has to show
 * the difference. A generator would have filled every cell and hidden the point.
 */
const SEED_RATINGS: readonly {
  employeeId: string;
  name: string;
  level: number;
  target: number | null;
}[] = [
  { employeeId: "p-06", name: "Job knowledge", level: 4, target: 4 },
  { employeeId: "p-06", name: "Quality of work", level: 3, target: 4 },
  { employeeId: "p-06", name: "Dependability", level: 4, target: 4 },
  { employeeId: "p-06", name: "Communication", level: 5, target: 4 },
  { employeeId: "p-06", name: "Teamwork", level: 4, target: 4 },
  { employeeId: "p-06", name: "Initiative", level: 2, target: 4 },
  { employeeId: "p-06", name: "Delivery against objectives", level: 3, target: 4 },

  { employeeId: "p-01", name: "Job knowledge", level: 5, target: 5 },
  { employeeId: "p-01", name: "Developing people", level: 3, target: 4 },
  { employeeId: "p-01", name: "Decision making", level: 4, target: 4 },
  { employeeId: "p-01", name: "Accountability for a team", level: 4, target: 4 },

  { employeeId: "p-03", name: "Job knowledge", level: 5, target: 4 },
  { employeeId: "p-03", name: "Quality of work", level: 4, target: 4 },
  { employeeId: "p-03", name: "Communication", level: 3, target: 4 },

  { employeeId: "p-09", name: "Job knowledge", level: 2, target: 3 },
  { employeeId: "p-09", name: "Quality of work", level: 3, target: 3 },
  { employeeId: "p-09", name: "Dependability", level: 3, target: 3 },

  { employeeId: "p-05", name: "Communication", level: 5, target: 4 },
  { employeeId: "p-05", name: "Developing people", level: 4, target: 4 },
  { employeeId: "p-05", name: "Process and compliance", level: 3, target: 4 },

  { employeeId: "p-02", name: "Decision making", level: 4, target: 5 },
  { employeeId: "p-02", name: "Process and compliance", level: 5, target: 5 },

  { employeeId: "p-07", name: "Job knowledge", level: 3, target: 4 },
  { employeeId: "p-07", name: "Process and compliance", level: 2, target: 4 },
];

const DEMO_CYCLE_OPEN = "demo-cycle-h2";
const DEMO_CYCLE_PUBLISHED = "demo-cycle-h1";

const demoCycles: ApiCycle[] = [
  {
    id: DEMO_CYCLE_OPEN,
    name: "H2 2026 review",
    stage: "MANAGER",
    stageLabel: "manager review",
    dueDate: "2026-08-31",
    questionCount: 5,
    reviewCount: 18,
    createdAt: "2026-07-01T09:00:00.000Z",
  },
  {
    id: DEMO_CYCLE_PUBLISHED,
    name: "H1 2026 review",
    stage: "PUBLISHED",
    stageLabel: "published",
    dueDate: "2026-06-30",
    questionCount: 5,
    reviewCount: 18,
    createdAt: "2026-01-08T09:00:00.000Z",
  },
];

type SeedQuestion = {
  id: string;
  prompt: string;
  kind: ReviewQuestionKind;
  required: boolean;
  audience: "SELF" | "MANAGER" | "PEER";
  options?: string[];
};

const SEED_QUESTIONS: readonly SeedQuestion[] = [
  {
    id: "demo-q-self-well",
    prompt: "What went well for you this period?",
    kind: "TEXT",
    required: true,
    audience: "SELF",
  },
  {
    id: "demo-q-self-short",
    prompt: "Where did you fall short, and what would you change?",
    kind: "TEXT",
    required: true,
    audience: "SELF",
  },
  {
    id: "demo-q-self-rate",
    prompt: "Rate your own delivery against your objectives.",
    kind: "RATING",
    required: true,
    audience: "SELF",
  },
  {
    id: "demo-q-mgr-rate",
    prompt: "Rate delivery against objectives.",
    kind: "RATING",
    required: true,
    audience: "MANAGER",
  },
  {
    id: "demo-q-mgr-more",
    prompt: "What should this person do more of?",
    kind: "TEXT",
    required: true,
    audience: "MANAGER",
  },
  {
    id: "demo-q-peer-work",
    prompt: "How easy is this person to work with?",
    kind: "RATING",
    required: true,
    audience: "PEER",
  },
  {
    id: "demo-q-peer-keep",
    prompt: "What should they keep doing?",
    kind: "TEXT",
    required: false,
    audience: "PEER",
  },
];

/* ----------------------------------------------------- the demo's local edits */

type DemoAnswers = Record<string, ApiAnswer>;

type DemoState = {
  /** New readings on a key result, by measure id. The everyday demo write. */
  readings: Record<string, string>;
  /** Answers on my own review, by review id then question id. */
  answers: Record<string, DemoAnswers>;
  /** Reviews sent from this browser, with the overall mark. */
  sent: Record<string, { rating: number | null; summary: string | null; at: string }>;
};

const EMPTY_DEMO: DemoState = { readings: {}, answers: {}, sent: {} };

const demoStore = createPersistedState<DemoState>({
  key: "approvehr.performance.store",
  empty: EMPTY_DEMO,
  version: 1,
});

function useDemoState(): DemoState {
  return useSyncExternalStore(
    demoStore.subscribe,
    demoStore.read,
    demoStore.getServerSnapshot,
  );
}

/* --------------------------------------------------- deriving the demo reads */

function demoKeyResult(
  goalId: string,
  seed: SeedMeasure,
  readings: Record<string, string>,
): ApiKeyResult {
  const currentValue = readings[seed.id] ?? seed.currentValue;
  const measure = {
    startValue: seed.startValue,
    targetValue: seed.targetValue,
    currentValue,
    lowerIsBetter: seed.lowerIsBetter ?? false,
  };
  return {
    id: seed.id,
    goalId,
    label: seed.label,
    unit: seed.unit ?? null,
    ...measure,
    percent: demoPercent(measure),
    met: demoMet(measure),
    updatedAt: "2026-08-18T10:00:00.000Z",
  };
}

function demoGoals(readings: Record<string, string>): ApiGoal[] {
  const titles = new Map(SEED_GOALS.map((goal) => [goal.id, goal.title]));
  const childCounts = new Map<string, number>();
  for (const goal of SEED_GOALS) {
    if (!goal.parentId) continue;
    childCounts.set(goal.parentId, (childCounts.get(goal.parentId) ?? 0) + 1);
  }

  return SEED_GOALS.map((goal) => {
    const keyResults = goal.measures.map((seed) =>
      demoKeyResult(goal.id, seed, readings),
    );
    const measured =
      keyResults.length === 0
        ? null
        : Math.round(
            keyResults.reduce((sum, kr) => sum + kr.percent, 0) / keyResults.length,
          );
    const owner = goal.ownerId ? employeeById(goal.ownerId) : undefined;

    return {
      id: goal.id,
      title: goal.title,
      description: goal.description ?? null,
      ownerId: goal.ownerId,
      ownerName: owner ? `${owner.firstName} ${owner.lastName}` : null,
      companyWide: goal.ownerId === null,
      parentId: goal.parentId,
      parentTitle: goal.parentId ? (titles.get(goal.parentId) ?? null) : null,
      status: goal.status,
      progress: measured ?? 0,
      measuredProgress: measured,
      dueQuarter: goal.dueQuarter,
      keyResults,
      childCount: childCounts.get(goal.id) ?? 0,
      createdAt: "2026-07-01T09:00:00.000Z",
      updatedAt: "2026-08-18T10:00:00.000Z",
    };
  });
}

/** Every rating for one person, as `GET /employees/:id/competencies` shapes it. */
function demoEmployeeCompetencies(employeeId: string): ApiEmployeeCompetencies {
  const person = employeeById(employeeId);
  const mine = new Map(
    SEED_RATINGS.filter((r) => r.employeeId === employeeId).map((r) => [r.name, r]),
  );

  const rows = demoCompetencies.map((competency) => {
    const rating = mine.get(competency.name);
    const target = rating?.target ?? null;
    const level = rating?.level ?? null;
    return {
      competencyId: competency.id,
      name: competency.name,
      category: competency.category,
      isCore: competency.isCore,
      scaleMax: competency.scaleMax,
      level,
      target,
      gap: level !== null && target !== null ? Math.max(0, target - level) : null,
      note: null,
      ratedAt: rating ? "2026-06-28T09:00:00.000Z" : null,
    };
  });

  return {
    employeeId,
    employeeName: person ? `${person.firstName} ${person.lastName}` : "You",
    rows,
    summary: {
      total: rows.length,
      rated: rows.filter((row) => row.level !== null).length,
      gaps: rows.filter((row) => (row.gap ?? 0) > 0).length,
    },
  };
}

function demoGaps(): ApiGap[] {
  const byName = new Map(demoCompetencies.map((c) => [c.name, c]));
  return SEED_RATINGS.filter((r) => r.target !== null && r.level < r.target)
    .map((r) => {
      const competency = byName.get(r.name);
      const person = employeeById(r.employeeId);
      return {
        employeeId: r.employeeId,
        employeeName: person ? `${person.firstName} ${person.lastName}` : r.employeeId,
        departmentId: person ? person.department : null,
        competencyId: competency?.id ?? competencyId(r.name),
        competencyName: r.name,
        category: competency?.category ?? null,
        isCore: competency?.isCore ?? false,
        level: r.level,
        target: r.target as number,
        scaleMax: SCALE_MAX,
        gap: (r.target as number) - r.level,
        ratedAt: "2026-06-28T09:00:00.000Z",
      };
    })
    .sort((a, b) => b.gap - a.gap || a.employeeName.localeCompare(b.employeeName));
}

/** Departments down the side, competencies across the top. Averages in the cells. */
function demoHeatmap(): ApiHeatmap {
  const departments = [...new Set(EMPLOYEES.map((e) => e.department))].sort();

  const rows = departments.map((department) => {
    const people = new Set(
      EMPLOYEES.filter((e) => e.department === department).map((e) => e.id),
    );
    const mine = SEED_RATINGS.filter((r) => people.has(r.employeeId));

    return {
      departmentId: department,
      departmentName: department,
      ratedPeople: new Set(mine.map((r) => r.employeeId)).size,
      cells: demoCompetencies.map((competency) => {
        const cell = mine.filter((r) => r.name === competency.name);
        const average =
          cell.length === 0
            ? null
            : Math.round(
                (cell.reduce((sum, r) => sum + r.level, 0) / cell.length) * 10,
              ) / 10;
        return {
          competencyId: competency.id,
          average,
          rated: cell.length,
          belowTarget: cell.filter((r) => r.target !== null && r.level < r.target)
            .length,
        };
      }),
    };
  });

  return {
    competencies: demoCompetencies.map((c) => ({
      id: c.id,
      name: c.name,
      scaleMax: c.scaleMax,
      isCore: c.isCore,
    })),
    rows: rows.filter((row) => row.ratedPeople > 0),
    ratedPeople: new Set(SEED_RATINGS.map((r) => r.employeeId)).size,
  };
}

const reviewId = (cycleId: string, kind: string) => `${cycleId}-${kind.toLowerCase()}`;

function demoReview(
  cycle: ApiCycle,
  kind: "SELF" | "MANAGER",
  subjectId: string,
  state: DemoState,
): ApiReview {
  const id = reviewId(cycle.id, kind);
  const subject = employeeById(subjectId);
  const manager = subject?.managerId ? employeeById(subject.managerId) : undefined;
  const sent = state.sent[id];
  const seededSubmitted = cycle.stage === "PUBLISHED";

  const submitted = sent !== undefined || seededSubmitted;
  const rating = sent ? sent.rating : seededSubmitted ? 4 : null;

  return {
    id,
    cycleId: cycle.id,
    cycleName: cycle.name,
    cycleStage: cycle.stage,
    dueDate: cycle.dueDate,
    kind,
    kindLabel: kind === "SELF" ? "Self-review" : "Manager review",
    anonymous: false,
    subjectId,
    subjectName: subject ? `${subject.firstName} ${subject.lastName}` : "You",
    authorId: kind === "SELF" ? subjectId : (manager?.id ?? null),
    authorName:
      kind === "SELF"
        ? subject
          ? `${subject.firstName} ${subject.lastName}`
          : "You"
        : manager
          ? `${manager.firstName} ${manager.lastName}`
          : null,
    rating,
    summary: sent
      ? sent.summary
      : seededSubmitted
        ? kind === "MANAGER"
          ? "A strong half. Hiring pace held up while the team was short-handed, and the handbook landed. Next: pick up the initiative on process before being asked."
          : "Kept the pipeline moving through a thin quarter. Slower than I wanted on first interviews."
        : null,
    submitted,
    submittedAt: submitted ? (sent?.at ?? "2026-06-29T16:20:00.000Z") : null,
    answerCount: Object.keys(state.answers[id] ?? {}).length,
  };
}

/** The peer aggregate. Three answers, which is exactly the floor. */
function demoPeerFeedback(): ApiPeerFeedback {
  const cycle = demoCycles.find((c) => c.id === DEMO_CYCLE_PUBLISHED);
  return {
    cycleId: DEMO_CYCLE_PUBLISHED,
    cycleName: cycle?.name ?? "H1 2026 review",
    responses: 3,
    withheld: false,
    note: null,
    answers: [
      {
        questionId: "demo-q-peer-work",
        prompt: "How easy is this person to work with?",
        kind: "RATING",
        averageRating: 4.3,
        texts: [],
        choices: [],
        yeses: 0,
        answered: 3,
      },
      {
        questionId: "demo-q-peer-keep",
        prompt: "What should they keep doing?",
        kind: "TEXT",
        averageRating: null,
        texts: [
          "Answers in the channel instead of a meeting. Saves everybody an hour.",
          "Tells you early when a role is going to slip.",
        ],
        choices: [],
        yeses: 0,
        answered: 2,
      },
    ],
  };
}

function demoMyReviews(state: DemoState, me: string): ApiMyReviews {
  const open = demoCycles.find((c) => c.id === DEMO_CYCLE_OPEN);
  const published = demoCycles.find((c) => c.id === DEMO_CYCLE_PUBLISHED);
  if (!open || !published) return { toComplete: [], aboutMe: [], peerFeedback: [] };

  const openSelf = demoReview(open, "SELF", me, state);
  const publishedSelf = demoReview(published, "SELF", me, state);
  const publishedManager = demoReview(published, "MANAGER", me, state);

  return {
    toComplete: openSelf.submitted ? [] : [openSelf],
    aboutMe: [publishedManager, publishedSelf, openSelf],
    peerFeedback: [demoPeerFeedback()],
  };
}

function demoReviewDetail(
  id: string,
  state: DemoState,
  me: string,
): ApiReviewDetail | null {
  const cycle = demoCycles.find((c) => id.startsWith(c.id));
  if (!cycle) return null;
  const kind = id.endsWith("self") ? "SELF" : "MANAGER";
  const base = demoReview(cycle, kind, me, state);
  const answers = state.answers[id] ?? {};

  const questions: ApiFormQuestion[] = SEED_QUESTIONS.filter(
    (q) => q.audience === kind,
  ).map((q, index) => ({
    id: q.id,
    prompt: q.prompt,
    kind: q.kind,
    required: q.required,
    options: q.options ?? [],
    order: index,
    answer: answers[q.id] ?? null,
  }));

  return {
    ...base,
    mine: base.authorId === me,
    questions,
    outstanding: questions
      .filter((q) => q.required && q.answer === null)
      .map((q) => q.prompt),
  };
}

/* ============================================================================
 * Hooks
 * ==========================================================================*/

export type Source = "api" | "demo";

/** Which cascade you are looking at. One route, three readings of it. */
export type KpiScope = "mine" | "team" | "company";

export const SCOPE_LABEL: Record<KpiScope, string> = {
  mine: "My KPIs",
  team: "My team",
  company: "Whole company",
};

const PAGE = 200;

/**
 * A keyed fetch. The shape every read hook here uses.
 *
 * State is keyed by the request it belongs to, and `loading` is **derived** from
 * whether the stored key still matches. Three things fall out of that: a slow
 * response for a scope you have already switched away from cannot be shown,
 * there is nothing to clear when the key changes, and no `setState` ever runs in
 * an effect body — which is a lint error in this repo and a cascading render
 * everywhere else.
 *
 * `load` **must be stable** — wrap it in `useCallback` at the call site. It is
 * in the effect's dependencies deliberately: a loader that closes over a
 * changing value has to re-run, and hiding it behind a ref is how a stale
 * closure survives a filter change.
 */
function useFetched<T>(
  key: string,
  active: boolean,
  load: (signal: AbortSignal) => Promise<T>,
): {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
} {
  const [tick, setTick] = useState(0);
  const [fetched, setFetched] = useState<{
    key: string;
    data: T | null;
    error: ApiError | null;
  } | null>(null);
  const latest = useRef(0);
  const full = `${key}|${tick}`;

  useEffect(() => {
    if (!active) return;
    const ticket = latest.current + 1;
    latest.current = ticket;
    const controller = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const data = await load(controller.signal);
        if (!cancelled && ticket === latest.current) {
          setFetched({ key: full, data, error: null });
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled && ticket === latest.current) {
          setFetched({
            key: full,
            data: null,
            error:
              error instanceof ApiError
                ? error
                : new ApiError(0, "unknown", "Something went wrong. Try again."),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, full, load]);

  const matched = fetched !== null && fetched.key === full;
  return {
    data: matched ? fetched.data : null,
    loading: active && !matched,
    error: matched ? fetched.error : null,
    reload: useCallback(() => setTick((n) => n + 1), []),
  };
}

/**
 * The cascade, for one scope.
 *
 * `mine` and `team` are fetched alongside the company ladder so the top of the
 * tree is present whichever reading you asked for — a personal goal shown with
 * no company goal above it loses the only thing a cascade is for.
 */
export function useKpis(scope: KpiScope): {
  goals: ApiGoal[];
  cascade: GoalNode[];
  loading: boolean;
  error: ApiError | null;
  source: Source;
  reload: () => void;
} {
  const { isConnected, actingId } = useSession();
  const demo = useDemoState();

  const load = useCallback(
    async (signal: AbortSignal): Promise<ApiGoal[]> => {
      if (scope === "company") {
        const page = await performanceApi.goals({ pageSize: PAGE }, signal);
        return page.data;
      }
      const [scoped, company] = await Promise.all([
        scope === "mine"
          ? performanceApi.myGoals({ pageSize: PAGE }, signal)
          : performanceApi.teamGoals({ pageSize: PAGE }, signal),
        performanceApi.goals({ companyOnly: true, pageSize: 50 }, signal),
      ]);
      const seen = new Set<string>();
      return [...company.data, ...scoped.data].filter((goal) => {
        if (seen.has(goal.id)) return false;
        seen.add(goal.id);
        return true;
      });
    },
    [scope],
  );

  const fetched = useFetched<ApiGoal[]>(scope, isConnected, load);

  const goals = useMemo(() => {
    if (isConnected) return fetched.data ?? [];

    const all = demoGoals(demo.readings);
    if (scope === "company") return all;
    /* The same narrowing the API does, so the demo cannot show a wider cascade
       than a real staff member would get. */
    const reports = new Set(
      EMPLOYEES.filter((person) => person.managerId === actingId).map((p) => p.id),
    );
    return all.filter(
      (goal) =>
        goal.companyWide ||
        (scope === "mine"
          ? goal.ownerId === actingId
          : goal.ownerId !== null && reports.has(goal.ownerId)),
    );
  }, [isConnected, demo.readings, scope, actingId, fetched.data]);

  const cascade = useMemo(() => toCascade(goals), [goals]);

  return {
    goals,
    cascade,
    loading: fetched.loading,
    error: fetched.error,
    source: isConnected ? "api" : "demo",
    reload: fetched.reload,
  };
}

/** Thrown by every demo refusal, so a screen shows one message shape. */
function offline(message: string): never {
  throw new ApiError(0, "offline", message);
}

/**
 * The KPI writes.
 *
 * `recordProgress` works in both modes. Everything else refuses in demo mode
 * and names the reason — see the table at the top of this file.
 */
export function useKpiMutations() {
  const { isConnected } = useSession();

  const guard = useCallback(
    (what: string) => {
      if (!isConnected) offline(what);
    },
    [isConnected],
  );

  return {
    editable: isConnected,

    /** One number. The everyday act, and the one demo mode keeps. */
    recordProgress: useCallback(
      async (measureId: string, currentValue: string, note?: string) => {
        if (!isConnected) {
          const state = demoStore.read();
          demoStore.commit({
            ...state,
            readings: { ...state.readings, [measureId]: currentValue },
          });
          return;
        }
        await performanceApi.recordProgress(measureId, currentValue, note);
      },
      [isConnected],
    ),

    createGoal: useCallback(
      async (body: CreateGoalBody) => {
        guard(
          "Writing a goal needs the API. A goal is what somebody is measured " +
            "against, and one kept in this browser would never reach their review.",
        );
        return performanceApi.createGoal(body);
      },
      [guard],
    ),

    addKeyResult: useCallback(
      async (goalId: string, body: CreateKeyResultBody) => {
        guard(
          "Adding a measure needs the API — the demo book's measures are fixed, " +
            "but you can move any of their numbers.",
        );
        return performanceApi.addKeyResult(goalId, body);
      },
      [guard],
    ),

    completeGoal: useCallback(
      async (id: string, note?: string) => {
        guard("Marking a goal done needs the API.");
        return performanceApi.completeGoal(id, note);
      },
      [guard],
    ),

    cancelGoal: useCallback(
      async (id: string, reason: string) => {
        guard("Stopping a goal needs the API. Everyone working towards it is told.");
        return performanceApi.cancelGoal(id, reason);
      },
      [guard],
    ),

    shareGoal: useCallback(
      async (id: string) => {
        guard("Sharing a goal tells the people it affects, which needs the API.");
        return performanceApi.shareGoal(id);
      },
      [guard],
    ),

    deleteGoal: useCallback(
      async (id: string) => {
        guard("Deleting a goal needs the API.");
        return performanceApi.deleteGoal(id);
      },
      [guard],
    ),
  };
}

/** What I owe and what was said about me, plus the cycles behind it. */
export function useAppraisals(): {
  mine: ApiMyReviews;
  cycles: ApiCycle[];
  loading: boolean;
  error: ApiError | null;
  source: Source;
  reload: () => void;
} {
  const { isConnected, actingId } = useSession();
  const demo = useDemoState();

  const load = useCallback(async (signal: AbortSignal) => {
    const [mine, cycles] = await Promise.all([
      performanceApi.myReviews(signal),
      performanceApi.cycles(
        { pageSize: 50, sort: "createdAt", order: "desc" },
        signal,
      ),
    ]);
    return { mine, cycles: cycles.data };
  }, []);

  const fetched = useFetched<{ mine: ApiMyReviews; cycles: ApiCycle[] }>(
    "appraisals",
    isConnected,
    load,
  );

  const derived = useMemo(
    () => (isConnected ? null : demoMyReviews(demo, actingId)),
    [isConnected, demo, actingId],
  );

  return {
    mine:
      derived ??
      fetched.data?.mine ?? { toComplete: [], aboutMe: [], peerFeedback: [] },
    cycles: isConnected ? (fetched.data?.cycles ?? []) : demoCycles,
    loading: fetched.loading,
    error: fetched.error,
    source: isConnected ? "api" : "demo",
    reload: fetched.reload,
  };
}

/** One review with its form. `null` id means nothing is open. */
export function useReview(id: string | null): {
  review: ApiReviewDetail | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
} {
  const { isConnected, actingId } = useSession();
  const demo = useDemoState();
  const active = id !== null && isConnected;

  const load = useCallback(
    async (signal: AbortSignal) => performanceApi.review(id ?? "", signal),
    [id],
  );

  const fetched = useFetched<ApiReviewDetail>(id ?? "none", active, load);

  const derived = useMemo(
    () => (isConnected || id === null ? null : demoReviewDetail(id, demo, actingId)),
    [isConnected, id, demo, actingId],
  );

  if (!isConnected) {
    return { review: derived, loading: false, error: null, reload: fetched.reload };
  }
  return {
    review: fetched.data,
    loading: fetched.loading,
    error: fetched.error,
    reload: fetched.reload,
  };
}

/**
 * Answering and sending a review.
 *
 * Both work in demo mode: this is a person writing about their own work, and
 * nothing else in the frontend reads it. Sending checks the required questions
 * on this side too, so the demo refuses for the same reason the API does rather
 * than accepting something the server would have turned down.
 */
export function useReviewMutations() {
  const { isConnected } = useSession();

  return {
    save: useCallback(
      async (id: string, answers: AnswerBody[]) => {
        if (!isConnected) {
          const state = demoStore.read();
          const existing = state.answers[id] ?? {};
          const next: DemoAnswers = { ...existing };
          for (const answer of answers) {
            next[answer.questionId] = {
              ratingValue: answer.ratingValue ?? null,
              textValue: answer.textValue ?? null,
              choiceValue: answer.choiceValue ?? null,
              boolValue: answer.boolValue ?? null,
              answeredAt: new Date().toISOString(),
            };
          }
          demoStore.commit({
            ...state,
            answers: { ...state.answers, [id]: next },
          });
          return;
        }
        await performanceApi.respond(id, answers);
      },
      [isConnected],
    ),

    send: useCallback(
      async (id: string, body: SubmitReviewBody, outstanding: string[]) => {
        if (!isConnected) {
          if (outstanding.length > 0) {
            offline(
              `Answer ${outstanding.length === 1 ? "this" : "these"} before you send it: ${outstanding
                .map((prompt) => `"${prompt}"`)
                .join(", ")}.`,
            );
          }
          const state = demoStore.read();
          demoStore.commit({
            ...state,
            sent: {
              ...state.sent,
              [id]: {
                rating: body.rating ?? null,
                summary: body.summary ?? null,
                at: new Date().toISOString(),
              },
            },
          });
          return;
        }
        await performanceApi.submitReview(id, body);
      },
      [isConnected],
    ),
  };
}

/** The four parts of an appraisal, in the order a form asks them. */
export const CATEGORY_ORDER: readonly string[] = [
  "Core competency",
  "Behavioural competency",
  "Key result area",
  "Leadership",
];

export type FrameworkGroup = {
  category: string;
  competencies: ApiCompetency[];
};

/** The competency framework, grouped by its four categories. */
export function useFramework(): {
  competencies: ApiCompetency[];
  groups: FrameworkGroup[];
  loading: boolean;
  error: ApiError | null;
  source: Source;
} {
  const { isConnected } = useSession();

  const load = useCallback(
    async (signal: AbortSignal) =>
      (await performanceApi.competencies({ pageSize: 100 }, signal)).data,
    [],
  );

  const fetched = useFetched<ApiCompetency[]>("framework", isConnected, load);

  const competencies = useMemo(
    () => (isConnected ? (fetched.data ?? []) : demoCompetencies),
    [isConnected, fetched.data],
  );

  const groups = useMemo(() => {
    const bucket = new Map<string, ApiCompetency[]>();
    for (const competency of competencies) {
      const category = competency.category ?? "Other";
      bucket.set(category, [...(bucket.get(category) ?? []), competency]);
    }
    const known = CATEGORY_ORDER.filter((category) => bucket.has(category));
    const rest = [...bucket.keys()]
      .filter((category) => !CATEGORY_ORDER.includes(category))
      .sort();
    return [...known, ...rest].map((category) => ({
      category,
      competencies: bucket.get(category) ?? [],
    }));
  }, [competencies]);

  return {
    competencies,
    groups,
    loading: fetched.loading,
    error: fetched.error,
    source: isConnected ? "api" : "demo",
  };
}

/** One person's levels against their targets. Defaults to the signed-in person. */
export function useSkills(employeeId: string | null): {
  skills: ApiEmployeeCompetencies | null;
  loading: boolean;
  error: ApiError | null;
  source: Source;
  reload: () => void;
} {
  const { isConnected } = useSession();
  const active = employeeId !== null && isConnected;

  const load = useCallback(
    async (signal: AbortSignal) =>
      performanceApi.employeeCompetencies(employeeId ?? "", signal),
    [employeeId],
  );

  const fetched = useFetched<ApiEmployeeCompetencies>(
    employeeId ?? "none",
    active,
    load,
  );

  const derived = useMemo(
    () =>
      isConnected || employeeId === null
        ? null
        : demoEmployeeCompetencies(employeeId),
    [isConnected, employeeId],
  );

  return {
    skills: isConnected ? fetched.data : derived,
    loading: isConnected ? fetched.loading : false,
    error: isConnected ? fetched.error : null,
    source: isConnected ? "api" : "demo",
    reload: fetched.reload,
  };
}

/** Where people sit below where the company wants them. Scoped by who asks. */
export function useGaps(enabled: boolean): {
  gaps: ApiGap[];
  loading: boolean;
  error: ApiError | null;
} {
  const { isConnected } = useSession();
  const load = useCallback(
    async (signal: AbortSignal) =>
      (await performanceApi.gaps({ pageSize: PAGE }, signal)).data,
    [],
  );
  const fetched = useFetched<ApiGap[]>("gaps", enabled && isConnected, load);

  return {
    gaps: isConnected ? (fetched.data ?? []) : enabled ? demoGaps() : [],
    loading: fetched.loading,
    error: fetched.error,
  };
}

/** The department grid. `EDIT_RECORDS` only — an aggregate over everybody. */
export function useHeatmap(enabled: boolean): {
  heatmap: ApiHeatmap | null;
  loading: boolean;
  error: ApiError | null;
} {
  const { isConnected } = useSession();
  const load = useCallback(
    async (signal: AbortSignal) => performanceApi.heatmap(signal),
    [],
  );
  const fetched = useFetched<ApiHeatmap>("heatmap", enabled && isConnected, load);

  return {
    heatmap: isConnected ? fetched.data : enabled ? demoHeatmap() : null,
    loading: fetched.loading,
    error: fetched.error,
  };
}

/** The questions on one cycle. `MANAGE_SETTINGS` only. */
export function useCycleQuestions(cycleId: string | null): {
  questions: ApiQuestion[];
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
} {
  const { isConnected } = useSession();
  const active = cycleId !== null && isConnected;

  const load = useCallback(
    async (signal: AbortSignal) => performanceApi.questions(cycleId ?? "", signal),
    [cycleId],
  );

  const fetched = useFetched<ApiQuestion[]>(cycleId ?? "none", active, load);

  const derived = useMemo<ApiQuestion[]>(
    () =>
      cycleId === null
        ? []
        : SEED_QUESTIONS.map((q, index) => ({
            id: q.id,
            reviewCycleId: cycleId,
            prompt: q.prompt,
            kind: q.kind,
            askedOf: [q.audience],
            required: q.required,
            options: q.options ?? [],
            order: index,
          })),
    [cycleId],
  );

  return {
    questions: isConnected ? (fetched.data ?? []) : derived,
    loading: isConnected ? fetched.loading : false,
    error: isConnected ? fetched.error : null,
    reload: fetched.reload,
  };
}

/**
 * Running a cycle. Every one of these refuses in demo mode.
 *
 * Starting a cycle writes a form for every employee and tells them all;
 * publishing makes every manager's words readable by their subject; chasing
 * writes to somebody's inbox. None of those are things a browser should be able
 * to pretend it did.
 */
export function useCycleMutations() {
  const { isConnected } = useSession();

  const guard = useCallback(
    (what: string) => {
      if (!isConnected) offline(what);
    },
    [isConnected],
  );

  return {
    editable: isConnected,

    createCycle: useCallback(
      async (name: string, dueDate?: string) => {
        guard("Creating a cycle needs the API.");
        return performanceApi.createCycle(
          dueDate === undefined ? { name } : { name, dueDate },
        );
      },
      [guard],
    ),

    addQuestion: useCallback(
      async (cycleId: string, body: CreateQuestionBody) => {
        guard("Adding a question needs the API.");
        return performanceApi.addQuestion(cycleId, body);
      },
      [guard],
    ),

    removeQuestion: useCallback(
      async (id: string) => {
        guard("Removing a question needs the API.");
        return performanceApi.removeQuestion(id);
      },
      [guard],
    ),

    activate: useCallback(
      async (id: string) => {
        guard(
          "Starting a cycle writes a form for every employee and tells them all, " +
            "so it needs the API.",
        );
        return performanceApi.activateCycle(id);
      },
      [guard],
    ),

    /** One-way. Every manager's review becomes readable by its subject. */
    publish: useCallback(
      async (id: string) => {
        guard("Publishing results needs the API. It cannot be undone.");
        return performanceApi.closeCycle(id);
      },
      [guard],
    ),

    /** Notifications in the app. Nothing here sends email. */
    remind: useCallback(
      async (id: string) => {
        guard("Chasing people writes to their inbox, so it needs the API.");
        return performanceApi.remindCycle(id);
      },
      [guard],
    ),
  };
}

/**
 * Recording somebody's level on one competency.
 *
 * Its own hook because it is its own act: a rating is the assessment of record
 * about a named person, and the API refuses a self-rating outright — so the
 * picker that feeds this must leave the signed-in person out rather than offer a
 * control that cannot work.
 */
export function useRating() {
  const { isConnected } = useSession();

  return {
    editable: isConnected,
    rate: useCallback(
      async (competencyId: string, body: RateBody) => {
        if (!isConnected) {
          offline(
            "Recording somebody's level needs the API — a rating is the " +
              "assessment of record, and it belongs where their reviews are.",
          );
        }
        return performanceApi.rate(competencyId, body);
      },
      [isConnected],
    ),
  };
}

/* ==========================================================================
 * The appraiser map — a power-user surface, and offline it does not exist
 * ======================================================================== */

const APPRAISER_OFFLINE =
  "Who appraises whom needs the API. A mapping is what a mark is defended " +
  "with months later, and one kept in this browser would never reach the " +
  "cycle it belongs to.";

export type AppraiserMapState = {
  map: ApiAppraiserMap | null;
  loading: boolean;
  error: ApiError | null;
  /** False in demo mode. `refusal` is the sentence to render. */
  editable: boolean;
  refusal: string;
  reload: () => void;
};

/**
 * Who appraises whom in one cycle.
 *
 * Read-only-and-absent in demo mode, for the same reason `store/teams.ts` has no
 * demo teams: the mapping decides who owes a form and how much their mark
 * counts, and a set of weights held in one browser would describe a cycle the
 * demo's own appraisal screens are not running.
 *
 * The `null` cycle id is a real state, not a guard against a bug — the screen
 * renders before a cycle has been chosen, and there is no map until one is.
 */
export function useAppraiserMap(
  cycleId: string | null,
  params: { departmentId?: string; exceptionsOnly?: boolean } = {},
): AppraiserMapState {
  const { isConnected } = useSession();
  const active = cycleId !== null && isConnected;
  const departmentId = params.departmentId;
  const exceptionsOnly = params.exceptionsOnly ?? false;

  const load = useCallback(
    async (signal: AbortSignal) =>
      performanceApi.appraiserMap(
        cycleId ?? "",
        {
          ...(departmentId ? { departmentId } : {}),
          exceptionsOnly,
        },
        signal,
      ),
    [cycleId, departmentId, exceptionsOnly],
  );

  const fetched = useFetched<ApiAppraiserMap>(
    `appraisers|${cycleId ?? "none"}|${departmentId ?? ""}|${String(exceptionsOnly)}`,
    active,
    load,
  );

  /* Never touches state. Nothing is derived offline — see the note above — so
     this is a stable constant rather than a computed value. */
  const offlineValue = useMemo<AppraiserMapState>(
    () => ({
      map: null,
      loading: false,
      error: null,
      editable: false,
      refusal: APPRAISER_OFFLINE,
      reload: fetched.reload,
    }),
    [fetched.reload],
  );

  if (!isConnected) return offlineValue;

  return {
    map: fetched.data,
    loading: fetched.loading,
    error: fetched.error,
    editable: true,
    refusal: APPRAISER_OFFLINE,
    reload: fetched.reload,
  };
}

/**
 * Writing the mapping.
 *
 * `setAppraisers` sends the **whole set** for one person, because that is the
 * shape in which the weight rule is enforceable — the API refuses anything that
 * does not sum to 100%, and an endpoint taking one appraiser at a time could not
 * check that. Nothing is validated here *instead*: `weightProblem` in
 * `lib/api/performance.ts` exists so the same refusal can be shown while
 * somebody is still editing the row, in the API's own words.
 */
export function useAppraiserMutations() {
  const { isConnected } = useSession();

  return {
    editable: isConnected,
    refusal: APPRAISER_OFFLINE,

    setAppraisers: useCallback(
      async (cycleId: string, employeeId: string, appraisers: ApiAppraiserEntry[]) => {
        if (!isConnected) offline(APPRAISER_OFFLINE);
        return performanceApi.setAppraisers(cycleId, employeeId, appraisers);
      },
      [isConnected],
    ),

    /** Give everybody unmapped their line manager at 100%. Idempotent. */
    autoAssign: useCallback(
      async (cycleId: string) => {
        if (!isConnected) offline(APPRAISER_OFFLINE);
        return performanceApi.autoAssignAppraisers(cycleId);
      },
      [isConnected],
    ),
  };
}
