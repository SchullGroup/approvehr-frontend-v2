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
  FULL_WEIGHT_BP,
  parseMeasure,
  performanceApi,
  type ApiAnswer,
  type ApiCompetency,
  type ApiCycle,
  type ApiCycleParticipants,
  type ApiEmployeeScore,
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
  type ApiAppraiserMapRow,
  type ApiReview,
  type ApiReviewDetail,
  type ApiCycleReport,
  type ApiScoreHistory,
  type ApiScoreRegister,
  type ApiScoringWeights,
  type ApiScoringWeightsSaved,
  type ApiTaskForGrading,
  type ScoreBand,
  type ScoreComponent,
  type AnswerBody,
  type CreateGoalBody,
  type CreateKeyResultBody,
  type CreateQuestionBody,
  type ReviewCycleStage,
  type UpdateQuestionBody,
  type GoalStatus,
  type ObjectiveApproval,
  type RateBody,
  type ReviewQuestionKind,
  type SubmitReviewBody,
} from "@/lib/api/performance";
import { EMPLOYEES, employeeById } from "@/lib/mock/people";
import { createPersistedState } from "./persisted";
import { useSession } from "./session";
import { useRevalidation } from "@/lib/revalidate";

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
 * | **Send an objective for approval, agree it, send it back, refuse it, reopen it** | yes | **yes, to this browser** |
 * | **Acknowledge or dispute my own rating** | yes | **yes, to this browser** |
 * | Write a goal, rate somebody, start or publish a cycle, chase people | yes | **refused, with the reason** |
 * | Finalise somebody's rating, or read a cycle's register | yes | **refused, with the reason** |
 *
 * The demo writes are the everyday acts, and each one is somebody recording
 * something about *their own* work or answering something addressed to them.
 * Nothing else in the frontend reads them, so a locally-kept value has nothing
 * to contradict — and a KPI screen where the number cannot move demonstrates a
 * picture rather than a product.
 *
 * The refusals are the acts with a blast radius outside this browser. Setting
 * somebody's goal, rating them against a scale, and starting a cycle that
 * creates a form for every employee are all *assessments of other people*, and a
 * demo that pretends to make one teaches the audience something false about
 * where those records live. `store/departments.ts` refuses for the same reason
 * and says so at the same length.
 *
 * ## The approval loop is a demo write, and that is a deliberate reversal
 *
 * The list above used to refuse every write about somebody else, and agreeing
 * another person's objective is plainly one. It is allowed anyway, because the
 * approval loop **is the product**: three fields, one manager agrees, rate once,
 * the employee acknowledges. A demo that can show every screen of that path and
 * not the click in the middle of it demonstrates a form, not a workflow — the
 * same argument that put the payroll exclusion loop into demo mode.
 *
 * Both halves of the local loop enforce what the API enforces, in the API's own
 * words: nobody agrees their own objective, a send-back and a refusal carry a
 * reason, a refusal is terminal, and reopening an agreed target counts the
 * revision. A demo refusal that is laxer than the server teaches the wrong rule,
 * which is worse than no demo at all.
 *
 * ## What stays refused, and why those two
 *
 * **Finalising somebody's rating** is the one-way door that decides what a
 * person is told their mark is; it belongs where their record is, not in a
 * browser. **A cycle's register** — participants, scores, who has nobody
 * appraising them — is an aggregate over everybody, the same read
 * `useAppraiserMap` already refuses offline and for the same written reason: a
 * mark is defended with it months later, and a register assembled in one browser
 * would describe a cycle nothing else in the demo is running.
 *
 * ## Acknowledging is not agreeing, and the copy has to keep them apart
 *
 * `acknowledge` records "I have seen this". It is not consent, and a screen that
 * lets it read as consent is worth less than nothing to a company defending a
 * decision. `dispute` records "I do not accept this" and **changes no mark** —
 * the rating stands with the dispute beside it, because rewriting it would
 * destroy the evidence of what was originally decided.
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

/**
 * The tone of each rung of the agreement lifecycle. **No label map beside it.**
 *
 * `ApiGoal.approvalLabel` carries the wording, so a second copy here would be a
 * second answer to the same question. A tone is a design decision this side owns
 * and the API has no business sending.
 *
 * `AGREED` is `success` — green, which this design system reserves for the
 * approval act, and agreeing an objective is exactly that. Waiting is `warning`
 * rather than `info`: somebody owes an answer, and it is the one state on this
 * axis that is a job rather than a fact.
 */
export const APPROVAL_TONE: Record<ObjectiveApproval, BadgeTone> = {
  DRAFT: "neutral",
  AWAITING_APPROVAL: "warning",
  AGREED: "success",
  NEEDS_REVISION: "info",
  REJECTED: "danger",
};

/**
 * Whether this objective can be sent for agreement at all.
 *
 * Mirrors `submitObjective`: a draft or a sent-back objective may go, an agreed
 * one needs a revision instead, a refused one is terminal, and one already
 * waiting is already waiting. It also needs a period — the API refuses an
 * objective with neither a cycle nor a quarter, because an objective agreed for
 * no period cannot be agreed *before* it, which is the whole point of the
 * lifecycle.
 */
export function mayBeSubmitted(goal: ApiGoal): boolean {
  if (goal.approval !== "DRAFT" && goal.approval !== "NEEDS_REVISION")
    return false;
  return goal.reviewCycleId !== null || goal.dueQuarter !== null;
}

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
  /**
   * The period it is scored in. `null` is a standing operational objective that
   * belongs to no cycle and is never scored — a real state, seeded so the
   * interface has to render it.
   */
  reviewCycleId: string | null;
  /**
   * Where it starts on the agreement axis, before anything in this browser
   * moves it. Separate from `status` on purpose: an objective can be agreed and
   * off track at once, and one field carrying both would make the two facts
   * indistinguishable.
   */
  approval: ObjectiveApproval;
  /** The reason on a sent-back objective. Required by the API; seeded here too. */
  approvalNote?: string;
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
 *
 * The **agreement states are chosen, not decoration.** The demo signs in as
 * Amara (`p-06`), and in demo mode there is no account, so `session.can` answers
 * yes to everything — which puts the whole company's waiting objectives in her
 * approval queue, exactly as `EDIT_RECORDS` would connected. So the seed carries
 * two objectives waiting to be agreed that are **not hers** (there is a row to
 * act on), one of her own that was **sent back with a reason** (the reason is
 * visible and she can send it again), and one **agreed** company objective with
 * no cycle at all. Every rung of the lifecycle is on screen on first load, and
 * her own waiting objective is deliberately absent from her own queue because
 * nobody may agree their own.
 */
/* Declared above `SEED_GOALS` because the objectives reference them. A `const`
   is in its temporal dead zone until the line that initialises it, so the order
   here is not style — the other way round throws on import. */
const DEMO_CYCLE_OPEN = "demo-cycle-h2";
const DEMO_CYCLE_PUBLISHED = "demo-cycle-h1";

const SEED_GOALS: readonly SeedGoal[] = DEMO_ENABLED
  ? [
      {
        id: "demo-goal-company",
        title: "Process ₦2bn in client payroll by year end",
        description: "Every team's goals ladder up to this one.",
        ownerId: null,
        parentId: null,
        status: "ON_TRACK",
        dueQuarter: "2026-Q4",
        /* A standing company objective: no cycle, so it is never scored against
       anybody. The nullable case, on screen rather than only in a type. */
        reviewCycleId: null,
        approval: "AGREED",
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
        reviewCycleId: DEMO_CYCLE_OPEN,
        approval: "AWAITING_APPROVAL",
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
        reviewCycleId: DEMO_CYCLE_OPEN,
        /* At risk *and* waiting to be agreed. The two axes disagreeing is the
       ordinary case, not an edge one. */
        approval: "AWAITING_APPROVAL",
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
        reviewCycleId: DEMO_CYCLE_OPEN,
        approval: "AGREED",
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
        reviewCycleId: DEMO_CYCLE_OPEN,
        approval: "AGREED",
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
        reviewCycleId: DEMO_CYCLE_OPEN,
        /* Sent back, with the reason on it. A refusal with no reason is not
       feedback, so the seed cannot show one without a reason either. */
        approval: "NEEDS_REVISION",
        approvalNote:
          "Five days is the right target, but say which stage you are measuring from. Screening or the recruiter call?",
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
        /* Last half's, so it hangs off the published cycle rather than the open one. */
        reviewCycleId: DEMO_CYCLE_PUBLISHED,
        approval: "AGREED",
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
    ]
  : [];

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
  sectionName: string;
  description: string;
  isCore: boolean;
}[] = [
  {
    name: "Job knowledge",
    sectionName: "Core competency",
    description: "Understands the work and keeps that understanding current.",
    isCore: true,
  },
  {
    name: "Quality of work",
    sectionName: "Core competency",
    description: "Output is accurate and needs little rework.",
    isCore: true,
  },
  {
    name: "Dependability",
    sectionName: "Core competency",
    description: "Commitments are met without being chased.",
    isCore: true,
  },
  {
    name: "Communication",
    sectionName: "Behavioural competency",
    description: "Explains clearly, in writing and in person, and listens.",
    isCore: false,
  },
  {
    name: "Teamwork",
    sectionName: "Behavioural competency",
    description: "Works with people outside their own function.",
    isCore: false,
  },
  {
    name: "Initiative",
    sectionName: "Behavioural competency",
    description: "Acts without waiting to be told, within their remit.",
    isCore: false,
  },
  {
    name: "Adaptability",
    sectionName: "Behavioural competency",
    description: "Handles a changed priority without losing the thread.",
    isCore: false,
  },
  {
    name: "Delivery against objectives",
    sectionName: "Key result area",
    description: "Progress on the goals set for the period.",
    isCore: true,
  },
  {
    name: "Customer or stakeholder outcomes",
    sectionName: "Key result area",
    description: "The effect of the work on whoever receives it.",
    isCore: false,
  },
  {
    name: "Process and compliance",
    sectionName: "Key result area",
    description: "Work done the way the company requires it to be done.",
    isCore: false,
  },
  {
    name: "Developing people",
    sectionName: "Leadership",
    description: "Grows the people who report to them, deliberately.",
    isCore: false,
  },
  {
    name: "Decision making",
    sectionName: "Leadership",
    description: "Decides with incomplete information and owns the outcome.",
    isCore: false,
  },
  {
    name: "Accountability for a team",
    sectionName: "Leadership",
    description: "Answers for the team's results rather than its individuals.",
    isCore: false,
  },
];

const SCALE_MAX = 5;

const competencyId = (name: string) =>
  `demo-comp-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;

const sectionId = (name: string) =>
  `demo-section-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`;

const demoCompetencies: ApiCompetency[] = SEED_COMPETENCIES.map((seed) => ({
  id: competencyId(seed.name),
  name: seed.name,
  sectionId: sectionId(seed.sectionName),
  sectionName: seed.sectionName,
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
  {
    employeeId: "p-06",
    name: "Delivery against objectives",
    level: 3,
    target: 4,
  },

  { employeeId: "p-01", name: "Job knowledge", level: 5, target: 5 },
  { employeeId: "p-01", name: "Developing people", level: 3, target: 4 },
  { employeeId: "p-01", name: "Decision making", level: 4, target: 4 },
  {
    employeeId: "p-01",
    name: "Accountability for a team",
    level: 4,
    target: 4,
  },

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

const demoCycles: ApiCycle[] = [
  {
    id: DEMO_CYCLE_OPEN,
    name: "H2 2026 review",
    stage: "MANAGER",
    stageLabel: "manager review",
    dueDate: "2026-08-31",
    questionCount: 5,
    reviewCount: 18,
    /* Both demo cycles have started, and a cycle that has started has its
       weights frozen onto it. Seeding this false would say the marks in it can
       still be rewritten by a settings change, which is the property the
       snapshot exists to remove. */
    scoringFrozen: true,
    departmentIds: [],
    remindDaysBefore: null,
    managersCanAddQuestions: false,
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
    scoringFrozen: true,
    departmentIds: [],
    remindDaysBefore: null,
    managersCanAddQuestions: false,
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

const SEED_QUESTIONS: readonly SeedQuestion[] = DEMO_ENABLED
  ? [
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
    ]
  : [];

/* ----------------------------------------------------- the demo's local edits */

type DemoAnswers = Record<string, ApiAnswer>;

/**
 * Where an objective got to in this browser.
 *
 * A sparse patch over `SEED_GOALS`, not a copy of it — the same shape as the
 * employee store's `overrides`, and for the same reason: it is what a `POST
 * /goals/:id/agree` body looks like, and changing the seed does not strand an
 * unrelated local decision.
 *
 * `note` holds the reason on a send-back, a refusal or a revision, because the
 * reason is the record. `revisions` counts how often an agreed target was
 * reopened, which is the figure that says a target has been moved a lot.
 */
type DemoApproval = {
  approval: ObjectiveApproval;
  note: string | null;
  at: string;
  revisions: number;
};

/**
 * What the employee said about their own rating, in this browser.
 *
 * Acknowledged and disputed are **separate timestamps** rather than one field
 * with a kind, because they are separate facts on the record and the API stores
 * them that way. Exactly one is ever set: the API refuses a second answer, and so
 * does the demo.
 */
type DemoSignOff = {
  acknowledgedAt: string | null;
  disputedAt: string | null;
  comment: string | null;
};

type DemoState = {
  /** New readings on a key result, by measure id. The everyday demo write. */
  readings: Record<string, string>;
  /** Answers on my own review, by review id then question id. */
  answers: Record<string, DemoAnswers>;
  /** Reviews sent from this browser, with the overall mark. */
  sent: Record<
    string,
    { rating: number | null; summary: string | null; at: string }
  >;
  /** Where the agreement lifecycle got to, by goal id. Sparse. */
  approvals: Record<string, DemoApproval>;
  /** Acknowledgements and disputes, by review id. Sparse. */
  signOff: Record<string, DemoSignOff>;
};

const EMPTY_DEMO: DemoState = {
  readings: {},
  answers: {},
  sent: {},
  approvals: {},
  signOff: {},
};

const demoStore = createPersistedState<DemoState>({
  key: "approvehr.performance.store",
  empty: EMPTY_DEMO,
  /* Version 2: `approvals` and `signOff` arrived with the objective lifecycle
     and sign-off. A version 1 payload has neither key, and the factory drops a
     stale payload rather than leaving a screen reading `undefined.approval`. */
  version: 2,
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

/**
 * The API's own five words for each rung, so the demo and the server agree.
 *
 * The one place on this side that holds them, and it exists because
 * `ApiGoal.approvalLabel` comes *from* the API — offline there is nobody to ask.
 * Copied verbatim from `APPROVAL_LABELS` in `modules/performance/service.ts`; if
 * the two ever disagree, the served one is right.
 */
const DEMO_APPROVAL_LABEL: Record<ObjectiveApproval, string> = {
  DRAFT: "Draft",
  AWAITING_APPROVAL: "Waiting to be agreed",
  AGREED: "Agreed",
  NEEDS_REVISION: "Sent back",
  REJECTED: "Not agreed",
};

const SEEDED_AT = "2026-07-01T09:00:00.000Z";

function demoGoals(
  readings: Record<string, string>,
  approvals: Record<string, DemoApproval>,
): ApiGoal[] {
  const titles = new Map(SEED_GOALS.map((goal) => [goal.id, goal.title]));
  const cycleNames = new Map(demoCycles.map((cycle) => [cycle.id, cycle.name]));
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
            keyResults.reduce((sum, kr) => sum + kr.percent, 0) /
              keyResults.length,
          );
    const owner = goal.ownerId ? employeeById(goal.ownerId) : undefined;

    /* The local decision wins over the seed, and only over the seed. */
    const local = approvals[goal.id];
    const approval = local?.approval ?? goal.approval;
    const note = local ? local.note : (goal.approvalNote ?? null);
    const revisions = local?.revisions ?? 0;

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
      reviewCycleId: goal.reviewCycleId,
      reviewCycleName: goal.reviewCycleId
        ? (cycleNames.get(goal.reviewCycleId) ?? null)
        : null,
      approval,
      approvalLabel: DEMO_APPROVAL_LABEL[approval],
      /* Derived from `approval`, exactly as the API derives it. A second stored
         field saying the same thing is a second field that can disagree. */
      targetFrozen: approval === "AGREED",
      submittedAt:
        approval === "AWAITING_APPROVAL" ? (local?.at ?? SEEDED_AT) : null,
      agreedAt: approval === "AGREED" ? (local?.at ?? SEEDED_AT) : null,
      approvalNote: note,
      revisionCount: revisions,
      revisedAt: revisions > 0 ? (local?.at ?? null) : null,
      keyResults,
      childCount: childCounts.get(goal.id) ?? 0,
      createdAt: SEEDED_AT,
      updatedAt: local?.at ?? "2026-08-18T10:00:00.000Z",
    };
  });
}

/** Every rating for one person, as `GET /employees/:id/competencies` shapes it. */
function demoEmployeeCompetencies(employeeId: string): ApiEmployeeCompetencies {
  const person = employeeById(employeeId);
  const mine = new Map(
    SEED_RATINGS.filter((r) => r.employeeId === employeeId).map((r) => [
      r.name,
      r,
    ]),
  );

  const rows = demoCompetencies.map((competency) => {
    const rating = mine.get(competency.name);
    const target = rating?.target ?? null;
    const level = rating?.level ?? null;
    return {
      competencyId: competency.id,
      name: competency.name,
      sectionId: competency.sectionId,
      sectionName: competency.sectionName,
      isCore: competency.isCore,
      scaleMax: competency.scaleMax,
      level,
      target,
      gap:
        level !== null && target !== null ? Math.max(0, target - level) : null,
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
        employeeName: person
          ? `${person.firstName} ${person.lastName}`
          : r.employeeId,
        departmentId: person ? person.department : null,
        competencyId: competency?.id ?? competencyId(r.name),
        competencyName: r.name,
        sectionId: competency?.sectionId ?? null,
        sectionName: competency?.sectionName ?? null,
        isCore: competency?.isCore ?? false,
        level: r.level,
        target: r.target as number,
        scaleMax: SCALE_MAX,
        gap: (r.target as number) - r.level,
        ratedAt: "2026-06-28T09:00:00.000Z",
      };
    })
    .sort(
      (a, b) => b.gap - a.gap || a.employeeName.localeCompare(b.employeeName),
    );
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
          belowTarget: cell.filter(
            (r) => r.target !== null && r.level < r.target,
          ).length,
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

const reviewId = (cycleId: string, kind: string) =>
  `${cycleId}-${kind.toLowerCase()}`;

function demoReview(
  cycle: ApiCycle,
  kind: "SELF" | "MANAGER",
  subjectId: string,
  state: DemoState,
): ApiReview {
  const id = reviewId(cycle.id, kind);
  const subject = employeeById(subjectId);
  const manager = subject?.managerId
    ? employeeById(subject.managerId)
    : undefined;
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
    ...demoSignOff(id, kind, submitted, seededSubmitted, state),
  };
}

/**
 * The three sign-off facts for one demo review.
 *
 * Only a **manager** review is ever finalised: a self-review is not a rating of
 * record and peer feedback is an aggregate nobody signs, so finalising either
 * would invent a rating out of something that never was one. The API refuses
 * both, and so does this.
 *
 * The seeded manager review in the published cycle arrives **finalised and
 * unanswered**, which is the state the acknowledge step exists for. That is not
 * decoration: without it the demo would open on a rating nobody can act on, and
 * the last click of the simple path — the employee's own answer — would be
 * unreachable. Anything answered in this browser wins over the seed.
 */
function demoSignOff(
  id: string,
  kind: "SELF" | "MANAGER",
  submitted: boolean,
  seededSubmitted: boolean,
  state: DemoState,
): Pick<
  ApiReview,
  | "finalised"
  | "finalisedAt"
  | "acknowledged"
  | "acknowledgedAt"
  | "disputed"
  | "disputedAt"
  | "employeeComment"
> {
  const finalised = kind === "MANAGER" && submitted && seededSubmitted;
  const answer = state.signOff[id];

  return {
    finalised,
    finalisedAt: finalised ? "2026-07-02T09:15:00.000Z" : null,
    /* Presence, never a falsy stand-in. All three start false and "not
       acknowledged" here means nobody has been asked yet, which is a third state
       and the common one — not a disagreement. */
    acknowledged: answer?.acknowledgedAt != null,
    acknowledgedAt: answer?.acknowledgedAt ?? null,
    disputed: answer?.disputedAt != null,
    disputedAt: answer?.disputedAt ?? null,
    employeeComment: answer?.comment ?? null,
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

/**
 * Whether this person could have a manager review at all.
 *
 * `Review.authorId` is not nullable, so a manager review always has somebody's
 * name on it — and a person with nobody above them has nobody to write one.
 * Fabricating one for them would have the demo contradict the rule this whole
 * module is built around: an employee with no appraiser finishes a cycle with no
 * mark, and that is an exception to surface rather than a form to invent.
 */
function demoHasAppraiser(employeeId: string): boolean {
  return employeeById(employeeId)?.managerId != null;
}

function demoMyReviews(state: DemoState, me: string): ApiMyReviews {
  const open = demoCycles.find((c) => c.id === DEMO_CYCLE_OPEN);
  const published = demoCycles.find((c) => c.id === DEMO_CYCLE_PUBLISHED);
  if (!open || !published)
    return { toComplete: [], aboutMe: [], peerFeedback: [] };

  const openSelf = demoReview(open, "SELF", me, state);
  const publishedSelf = demoReview(published, "SELF", me, state);
  const publishedManager = demoHasAppraiser(me)
    ? demoReview(published, "MANAGER", me, state)
    : null;

  return {
    toComplete: openSelf.submitted ? [] : [openSelf],
    aboutMe: [
      ...(publishedManager ? [publishedManager] : []),
      publishedSelf,
      openSelf,
    ],
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
  /* The same rule as `demoMyReviews`: no appraiser, no manager review. Returning
     one here and not in the list would let a link reach a form the screen that
     linked to it says does not exist. */
  if (kind === "MANAGER" && !demoHasAppraiser(me)) return null;
  const base = demoReview(cycle, kind, me, state);
  const answers = state.answers[id] ?? {};

  const questions: ApiFormQuestion[] = SEED_QUESTIONS.filter(
    (q) => q.audience === kind,
  ).map((q, index) => ({
    id: q.id,
    competencyId: null,
    prompt: q.prompt,
    kind: q.kind,
    required: q.required,
    options: q.options ?? [],
    allowCustom: false,
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

  /* Re-ask when somebody comes back to the window. Not in the key below,
     so the answer is replaced without the screen flashing a skeleton. */
  const revalidation = useRevalidation();
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
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (!cancelled && ticket === latest.current) {
          setFetched({
            key: full,
            data: null,
            error:
              error instanceof ApiError
                ? error
                : new ApiError(
                    0,
                    "unknown",
                    "Something went wrong. Try again.",
                  ),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, full, load, revalidation]);

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
      /* `allSettled`, for the reason `useAppraisals` records at length: the
         scoped read refuses for a sign-in with no linked staff record, and a
         rejected `Promise.all` would throw away the company goals that
         answered — emptying a screen that has plenty to show. Same latent bug,
         one hook along. */
      const [scoped, company] = await Promise.allSettled([
        scope === "mine"
          ? performanceApi.myGoals({ pageSize: PAGE }, signal)
          : performanceApi.teamGoals({ pageSize: PAGE }, signal),
        performanceApi.goals({ companyOnly: true, pageSize: 50 }, signal),
      ]);

      /* The company read failing leaves nothing worth rendering, so it throws.
         The scoped one failing leaves the company goals, which is a partial
         answer and a much better one than none. */
      if (company.status === "rejected") throw company.reason;

      const mine = scoped.status === "fulfilled" ? scoped.value.data : [];
      const seen = new Set<string>();
      return [...company.value.data, ...mine].filter((goal) => {
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

    const all = demoGoals(demo.readings, demo.approvals);
    if (scope === "company") return all;
    /* The same narrowing the API does, so the demo cannot show a wider cascade
       than a real staff member would get. */
    const reports = new Set(
      EMPLOYEES.filter((person) => person.managerId === actingId).map(
        (p) => p.id,
      ),
    );
    return all.filter(
      (goal) =>
        goal.companyWide ||
        (scope === "mine"
          ? goal.ownerId === actingId
          : goal.ownerId !== null && reports.has(goal.ownerId)),
    );
  }, [
    isConnected,
    demo.readings,
    demo.approvals,
    scope,
    actingId,
    fetched.data,
  ]);

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
          const state = demoStore.current();
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
        guard(
          "Stopping a goal needs the API. Everyone working towards it is told.",
        );
        return performanceApi.cancelGoal(id, reason);
      },
      [guard],
    ),

    shareGoal: useCallback(
      async (id: string) => {
        guard(
          "Sharing a goal tells the people it affects, which needs the API.",
        );
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

/* ==========================================================================
 * The objective approval queue, and the five moves that feed it
 * ======================================================================== */

/**
 * Objectives waiting for **this** caller to agree.
 *
 * Narrowed by who asks, exactly as `objectiveApprovalQueue` narrows it: somebody
 * with `EDIT_RECORDS` sees the company's, everybody else sees their direct
 * reports'. **Nobody sees their own**, because nobody may agree their own — a
 * queue that showed them would carry a row that can never leave it.
 *
 * That last rule is why an empty queue is not an error. Somebody who manages
 * nobody gets nothing here and is not being refused anything; the screen has to
 * say which of the two it is.
 */
export function useObjectiveApprovals(): {
  queue: ApiGoal[];
  loading: boolean;
  error: ApiError | null;
  source: Source;
  /** True when this caller could have something to agree at all. */
  couldHaveQueue: boolean;
  reload: () => void;
} {
  const { isConnected, actingId, can } = useSession();
  const demo = useDemoState();
  const wide = can("EDIT_RECORDS");

  /* Reports are read from the seed rather than the API even when connected:
     `couldHaveQueue` only decides which empty-state sentence to show, and the
     API's own answer to "is this queue empty because you manage nobody" is the
     empty queue itself. */
  const managesSomebody = useMemo(
    () => EMPLOYEES.some((person) => person.managerId === actingId),
    [actingId],
  );

  const load = useCallback(
    async (signal: AbortSignal) =>
      (
        await performanceApi.objectiveApprovals(
          { pageSize: PAGE, sort: "createdAt", order: "asc" },
          signal,
        )
      ).data,
    [],
  );

  const fetched = useFetched<ApiGoal[]>(
    "objective-approvals",
    isConnected,
    load,
  );

  const derived = useMemo(() => {
    if (isConnected) return [];
    const reports = new Set(
      EMPLOYEES.filter((person) => person.managerId === actingId).map(
        (p) => p.id,
      ),
    );
    return demoGoals(demo.readings, demo.approvals).filter((goal) => {
      if (goal.approval !== "AWAITING_APPROVAL") return false;
      /* Never your own, whatever you are allowed to do. */
      if (goal.ownerId === actingId) return false;
      if (wide) return true;
      return goal.ownerId !== null && reports.has(goal.ownerId);
    });
  }, [isConnected, actingId, wide, demo.readings, demo.approvals]);

  return {
    queue: isConnected ? (fetched.data ?? []) : derived,
    loading: isConnected ? fetched.loading : false,
    error: isConnected ? fetched.error : null,
    source: isConnected ? "api" : "demo",
    couldHaveQueue: wide || managesSomebody,
    reload: fetched.reload,
  };
}

/**
 * The five moves on the agreement axis, in both modes.
 *
 * Five functions rather than one `setApproval(state, reason?)`, matching the API
 * for the same reason it is five endpoints: three of them **require** a reason,
 * and one function cannot make an argument mandatory for three of five values
 * without the requirement becoming a comment.
 *
 * The demo enforces every refusal the API enforces, in the API's own words. A
 * demo that is laxer than the server teaches the audience a rule that does not
 * exist, and the first time they hit the real one it looks like a bug.
 */
export function useObjectiveMutations() {
  const { isConnected, actingId } = useSession();

  /** Move one goal along the axis locally, and record why. */
  const local = useCallback((id: string, next: DemoApproval) => {
    const state = demoStore.current();
    demoStore.commit({
      ...state,
      approvals: { ...state.approvals, [id]: next },
    });
  }, []);

  const seed = useCallback((id: string): ApiGoal | undefined => {
    const state = demoStore.current();
    return demoGoals(state.readings, state.approvals).find(
      (goal) => goal.id === id,
    );
  }, []);

  const revisionsOf = useCallback((id: string): number => {
    return demoStore.current().approvals[id]?.revisions ?? 0;
  }, []);

  /**
   * Refuses the owner, in demo mode too.
   *
   * There is no carve-out for the person at the top of the org chart and there
   * is none here either: a self-agreed target carries no more evidence than one
   * somebody simply wrote down, which is the whole reason the lifecycle exists.
   */
  const assertNotOwn = useCallback(
    (goal: ApiGoal) => {
      if (goal.ownerId !== null && goal.ownerId === actingId) {
        offline("Nobody agrees their own objective. Somebody else has to.");
      }
    },
    [actingId],
  );

  return {
    submit: useCallback(
      async (id: string) => {
        if (isConnected) return performanceApi.submitObjective(id);
        const goal = seed(id);
        if (!goal) offline("That objective is not in the demo book.");
        if (goal.approval === "AGREED") {
          offline(
            `"${goal.title}" is already agreed. To change it, reopen it for revision.`,
          );
        }
        if (goal.approval === "AWAITING_APPROVAL") {
          offline(`"${goal.title}" is already waiting to be agreed.`);
        }
        if (goal.approval === "REJECTED") {
          offline(
            `"${goal.title}" was not agreed. Write the objective you can agree ` +
              "on instead of re-sending this one — the refusal is part of the record.",
          );
        }
        if (goal.reviewCycleId === null && goal.dueQuarter === null) {
          offline(
            "Say which period this objective covers before sending it to be " +
              "agreed. An objective agreed for no period cannot be agreed before it.",
          );
        }
        /* The old objection is cleared: it described a version of the objective
           that no longer exists, and leaving it beside the new one reads as a
           fresh objection nobody made. */
        local(id, {
          approval: "AWAITING_APPROVAL",
          note: null,
          at: new Date().toISOString(),
          revisions: revisionsOf(id),
        });
      },
      [isConnected, seed, local, revisionsOf],
    ),

    /** The one-way door. After this the target is frozen; progress still moves. */
    agree: useCallback(
      async (id: string) => {
        if (isConnected) return performanceApi.agreeObjective(id);
        const goal = seed(id);
        if (!goal) offline("That objective is not in the demo book.");
        assertNotOwn(goal);
        if (goal.approval !== "AWAITING_APPROVAL") {
          offline(
            goal.approval === "AGREED"
              ? `"${goal.title}" is already agreed.`
              : `"${goal.title}" has not been sent for agreement yet — it is ` +
                  `${goal.approvalLabel.toLowerCase()}.`,
          );
        }
        local(id, {
          approval: "AGREED",
          note: null,
          at: new Date().toISOString(),
          revisions: revisionsOf(id),
        });
      },
      [isConnected, seed, local, assertNotOwn, revisionsOf],
    ),

    sendBack: useCallback(
      async (id: string, reason: string) => {
        if (isConnected) return performanceApi.sendBackObjective(id, reason);
        const goal = seed(id);
        if (!goal) offline("That objective is not in the demo book.");
        assertNotOwn(goal);
        if (goal.approval !== "AWAITING_APPROVAL") {
          offline(
            `"${goal.title}" is not waiting to be agreed — it is ` +
              `${goal.approvalLabel.toLowerCase()}.`,
          );
        }
        local(id, {
          approval: "NEEDS_REVISION",
          note: reason,
          at: new Date().toISOString(),
          revisions: revisionsOf(id),
        });
      },
      [isConnected, seed, local, assertNotOwn, revisionsOf],
    ),

    /** Terminal. There is no route out of refused, here or on the server. */
    reject: useCallback(
      async (id: string, reason: string) => {
        if (isConnected) return performanceApi.rejectObjective(id, reason);
        const goal = seed(id);
        if (!goal) offline("That objective is not in the demo book.");
        assertNotOwn(goal);
        if (goal.approval === "REJECTED") {
          offline(`"${goal.title}" has already been refused.`);
        }
        if (goal.approval === "AGREED") {
          offline(
            `"${goal.title}" was agreed. Stop it or reopen it for revision — ` +
              "refusing it now would erase the fact that it was ever agreed.",
          );
        }
        local(id, {
          approval: "REJECTED",
          note: reason,
          at: new Date().toISOString(),
          revisions: revisionsOf(id),
        });
      },
      [isConnected, seed, local, assertNotOwn, revisionsOf],
    ),

    /**
     * Reopen an agreed target. Either side may, and the re-agreement is where
     * the other side gets its say — which is why this is not gated on being the
     * approver the way `agree` is.
     */
    revise: useCallback(
      async (id: string, reason: string) => {
        if (isConnected) return performanceApi.reviseObjective(id, reason);
        const goal = seed(id);
        if (!goal) offline("That objective is not in the demo book.");
        if (goal.approval !== "AGREED") {
          offline(
            `"${goal.title}" is not agreed, so there is nothing frozen to ` +
              `reopen — it is ${goal.approvalLabel.toLowerCase()}.`,
          );
        }
        local(id, {
          approval: "AWAITING_APPROVAL",
          note: reason,
          at: new Date().toISOString(),
          revisions: revisionsOf(id) + 1,
        });
      },
      [isConnected, seed, local, revisionsOf],
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

  /**
   * Two independent reads, and one must not be able to erase the other.
   *
   * ## The bug this fixes
   *
   * These were a `Promise.all`. `myReviews` throws for a sign-in with **no
   * linked staff record** — `ownEmployeeId` refuses, correctly, because an
   * account with no personnel file has no reviews of its own — and a rejected
   * `Promise.all` discards *every* result, including the company's list of
   * appraisal periods, which had answered perfectly well.
   *
   * The reported symptom was "I started an appraisal period, went back, and it
   * had completely cleared". The period was in the database the whole time. An
   * unrelated personal read was taking the whole screen down with it, and the
   * only account it happened to was one whose owner had never been linked to an
   * employee — which is exactly the account a founder signs up with.
   *
   * ## Why `allSettled` rather than catching one
   *
   * The two answer different questions — "what does this company have open" and
   * "what do I personally owe" — and either can fail for reasons that say
   * nothing about the other. Whichever arrives is rendered.
   *
   * The personal failure is still reported: its error becomes the screen's
   * `error`, which is what puts the "not linked to a staff record" banner above
   * the list. Silently swallowing it would trade one wrong screen for another.
   */
  const load = useCallback(async (signal: AbortSignal) => {
    const [mine, cycles] = await Promise.allSettled([
      performanceApi.myReviews(signal),
      performanceApi.cycles(
        { pageSize: 50, sort: "createdAt", order: "desc" },
        signal,
      ),
    ]);

    /* The company list failing is a real failure of this screen — there is
       nothing left to show — so it still throws. */
    if (cycles.status === "rejected") throw cycles.reason;

    return {
      mine: mine.status === "fulfilled" ? mine.value : null,
      /* Kept so the screen can say why the personal half is missing, without
         that reason emptying the list beside it. */
      mineError: mine.status === "rejected" ? mine.reason : null,
      cycles: cycles.value.data,
    };
  }, []);

  const fetched = useFetched<{
    mine: ApiMyReviews | null;
    mineError: ApiError | null;
    cycles: ApiCycle[];
  }>("appraisals", isConnected, load);

  const derived = useMemo(
    () => (isConnected ? null : demoMyReviews(demo, actingId)),
    [isConnected, demo, actingId],
  );

  return {
    mine: derived ??
      fetched.data?.mine ?? { toComplete: [], aboutMe: [], peerFeedback: [] },
    cycles: isConnected ? (fetched.data?.cycles ?? []) : demoCycles,
    loading: fetched.loading,
    /* The personal read's failure where the whole load did not fail — that is
       what puts the "not linked to a staff record" banner above a list that is
       now, correctly, still there. */
    error: fetched.error ?? fetched.data?.mineError ?? null,
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
    () =>
      isConnected || id === null ? null : demoReviewDetail(id, demo, actingId),
    [isConnected, id, demo, actingId],
  );

  if (!isConnected) {
    return {
      review: derived,
      loading: false,
      error: null,
      reload: fetched.reload,
    };
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
          const state = demoStore.current();
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
          const state = demoStore.current();
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

/* ==========================================================================
 * Sign-off: the record that the employee was told
 * ======================================================================== */

const FINALISE_OFFLINE =
  "Finalising somebody's rating needs the API. It is the one-way door that " +
  "decides what a person is told their mark is, and it belongs with their " +
  "record rather than in a browser.";

/**
 * Finalise, then acknowledge **or** dispute. In that order, once each.
 *
 * Nobody in this market records the employee's answer, and the exposure is real:
 * without a stored acknowledgement there is no evidence the employee was ever
 * shown their rating, and a rating nobody can prove was communicated is a
 * liability rather than a record.
 *
 * Three things this hook keeps straight, all of which a screen can get wrong:
 *
 * - **Finalising is somebody else's act.** The author, the person's manager, or
 *   `EDIT_RECORDS`. It refuses offline, because a mark of record written in one
 *   browser is not a mark of record.
 * - **Acknowledging and disputing are the subject's own act**, so they work in
 *   both modes — the same line `useReviewMutations` sits on. Only the person a
 *   rating is about may send either, and the demo refuses anybody else in the
 *   API's own words.
 * - **One answer, not both.** Whichever arrives first is the record; the second
 *   is refused rather than overwriting the first.
 */
export function useSignOff() {
  const { isConnected, actingId } = useSession();

  const answer = useCallback((id: string, next: DemoSignOff) => {
    const state = demoStore.current();
    demoStore.commit({
      ...state,
      signOff: { ...state.signOff, [id]: next },
    });
  }, []);

  /** The guard both employee answers share, in the API's words. */
  const assertMayAnswer = useCallback(
    (review: ApiReview) => {
      if (review.subjectId !== actingId) {
        offline(
          "Only the person a rating is about can acknowledge or dispute it.",
        );
      }
      if (!review.finalised) {
        offline(
          "That rating is not final yet, so there is nothing to answer. You will " +
            "be told when it is.",
        );
      }
      if (review.acknowledged) {
        offline("You have already acknowledged this rating.");
      }
      if (review.disputed) {
        offline(
          "You have already disputed this rating. It is on the record and " +
            "somebody has to answer it.",
        );
      }
    },
    [actingId],
  );

  return {
    /** False in demo mode. `finaliseRefusal` is the sentence to render. */
    canFinalise: isConnected,
    finaliseRefusal: FINALISE_OFFLINE,

    finalise: useCallback(
      async (id: string) => {
        if (!isConnected) offline(FINALISE_OFFLINE);
        return performanceApi.finaliseReview(id);
      },
      [isConnected],
    ),

    /**
     * "I have seen this." **Not "I agree with it."**
     *
     * The comment is optional: somebody with nothing to add should not have to
     * invent something to get past a form.
     */
    acknowledge: useCallback(
      async (review: ApiReview, comment?: string) => {
        if (isConnected)
          return performanceApi.acknowledgeReview(review.id, comment);
        assertMayAnswer(review);
        answer(review.id, {
          acknowledgedAt: new Date().toISOString(),
          disputedAt: null,
          comment: comment ?? null,
        });
      },
      [isConnected, assertMayAnswer, answer],
    ),

    /**
     * "I do not accept this." The rating **does not move**.
     *
     * Rewriting the mark on a dispute would leave no evidence of what was
     * originally decided, which makes the trail worse rather than better. The
     * comment is required — HR cannot answer grounds nobody gave.
     */
    dispute: useCallback(
      async (review: ApiReview, comment: string) => {
        if (isConnected)
          return performanceApi.disputeReview(review.id, comment);
        assertMayAnswer(review);
        answer(review.id, {
          acknowledgedAt: null,
          disputedAt: new Date().toISOString(),
          comment,
        });
      },
      [isConnected, assertMayAnswer, answer],
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
  sectionId: string | null;
  sectionName: string;
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
    const idOf = new Map<string, string | null>();
    for (const competency of competencies) {
      const name = competency.sectionName ?? "Other";
      bucket.set(name, [...(bucket.get(name) ?? []), competency]);
      idOf.set(name, competency.sectionId);
    }
    const known = CATEGORY_ORDER.filter((name) => bucket.has(name));
    const rest = [...bucket.keys()]
      .filter((name) => !CATEGORY_ORDER.includes(name))
      .sort();
    return [...known, ...rest].map((name) => ({
      sectionId: idOf.get(name) ?? null,
      sectionName: name,
      competencies: bucket.get(name) ?? [],
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

/**
 * Building the framework: sections and the competencies filed under them.
 *
 * Framework-level, not cycle-level — a section or a subsection is shared
 * across every appraisal period, seeded once and then a company's own. No
 * demo simulation, the same reasoning as `useKpiMutations`'s writes: this is
 * a company's standing framework, not a figure this browser can hold for it.
 */
export function useFrameworkActions() {
  const { isConnected } = useSession();

  const guard = useCallback(
    (what: string) => {
      if (!isConnected) offline(what);
    },
    [isConnected],
  );

  return {
    editable: isConnected,

    createSection: useCallback(
      async (body: { name: string; order?: number }) => {
        guard(
          "Adding a section needs the API — sections are shared across every " +
            "appraisal period, and one kept in this browser would vanish the " +
            "moment you closed it.",
        );
        return performanceApi.createSection(body);
      },
      [guard],
    ),

    createCompetency: useCallback(
      async (body: {
        name: string;
        sectionId?: string;
        description?: string;
        isCore?: boolean;
        scaleMax: number;
      }) => {
        guard(
          "Adding a competency needs the API — the demo framework is fixed, " +
            "but you can still rate anybody against it.",
        );
        return performanceApi.createCompetency(body);
      },
      [guard],
    ),
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
  const fetched = useFetched<ApiHeatmap>(
    "heatmap",
    enabled && isConnected,
    load,
  );

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
    async (signal: AbortSignal) =>
      performanceApi.questions(cycleId ?? "", signal),
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
            competencyId: null,
            prompt: q.prompt,
            kind: q.kind,
            askedOf: [q.audience],
            required: q.required,
            options: q.options ?? [],
            allowCustom: false,
            order: index,
            source: "HR" as const,
            departmentIds: [],
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
      async (
        name: string,
        dueDate?: string,
        /** Scope and reminder. Both optional, both read at activation. */
        options?: { departmentIds?: string[]; remindDaysBefore?: number },
      ) => {
        guard("Creating an appraisal period needs the API.");
        return performanceApi.createCycle({
          name,
          ...(dueDate === undefined ? {} : { dueDate }),
          ...(options?.departmentIds?.length
            ? { departmentIds: options.departmentIds }
            : {}),
          ...(options?.remindDaysBefore
            ? { remindDaysBefore: options.remindDaysBefore }
            : {}),
        });
      },
      [guard],
    ),

    /**
     * Start a draft period's form from another period's.
     *
     * The reason periods stall: somebody writes eight questions from nothing,
     * every half, and they barely change. Refused once a period has started and
     * once it already has questions — both the API's own sentences.
     */
    copyQuestions: useCallback(
      async (cycleId: string, sourceCycleId: string) => {
        guard("Copying questions needs the API.");
        return performanceApi.copyQuestions(cycleId, sourceCycleId);
      },
      [guard],
    ),

    /**
     * Move one person's mark, with a reason.
     *
     * A row, not an edit — the computed figure survives beside it, which is the
     * only reason "why is this different" has an answer later.
     */
    calibrate: useCallback(
      async (
        cycleId: string,
        employeeId: string,
        body: { calibratedBp: number; reason: string },
      ) => {
        guard("Moving a mark needs the API.");
        return performanceApi.calibrate(cycleId, employeeId, body);
      },
      [guard],
    ),

    clearCalibration: useCallback(
      async (cycleId: string, employeeId: string) => {
        guard("Putting a mark back needs the API.");
        return performanceApi.clearCalibration(cycleId, employeeId);
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

    updateQuestion: useCallback(
      async (id: string, body: UpdateQuestionBody) => {
        guard("Editing a question needs the API.");
        return performanceApi.updateQuestion(id, body);
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
          "Starting a period writes a form for every employee and tells them all, " +
            "so it needs the API.",
        );
        return performanceApi.activateCycle(id);
      },
      [guard],
    ),

    /**
     * Move a running period on to the next stage.
     *
     * Refused offline for the same reason starting one is: it changes what
     * everybody in the company is being asked for next, and a stage advanced
     * in a browser would move nobody's form.
     */
    advance: useCallback(
      async (id: string, stage: ReviewCycleStage) => {
        guard("Moving a period on to its next stage needs the API.");
        return performanceApi.advanceCycle(id, stage);
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
 * The weekly task log
 *
 * Grading writes state a manager and their report both then read, so — the
 * same reasoning as `useRating` — there is no demo-mode simulation of it.
 * `useTasksForGrading` reads an empty queue offline rather than a seeded
 * one: a queue that claims something is waiting on you and can never
 * actually be cleared is worse than an honest "needs the API".
 * ======================================================================== */

export function useTasksForGrading(): {
  tasks: ApiTaskForGrading[];
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
} {
  const { isConnected } = useSession();

  const load = useCallback(
    async (signal: AbortSignal) => performanceApi.tasksForGrading(signal),
    [],
  );

  const fetched = useFetched<ApiTaskForGrading[]>(
    "tasks-for-grading",
    isConnected,
    load,
  );

  return {
    tasks: isConnected ? (fetched.data ?? []) : [],
    loading: isConnected ? fetched.loading : false,
    error: isConnected ? fetched.error : null,
    reload: fetched.reload,
  };
}

const TASK_OFFLINE =
  "The task log needs the API — a manager grading a report's task is " +
  "state they both then read, and this browser cannot hold it for them.";

export function useTaskActions() {
  const { isConnected } = useSession();

  return {
    editable: isConnected,
    submitTask: useCallback(
      async (
        goalId: string,
        body: { keyResultId?: string; description: string },
      ) => {
        if (!isConnected) offline(TASK_OFFLINE);
        return performanceApi.submitTask(goalId, body);
      },
      [isConnected],
    ),
    gradeTask: useCallback(
      async (
        id: string,
        grade: "COMPLETED" | "PARTIALLY_COMPLETED" | "NOT_COMPLETED",
      ) => {
        if (!isConnected) offline(TASK_OFFLINE);
        return performanceApi.gradeTask(id, grade);
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
  "appraisal period it belongs to.";

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
      async (
        cycleId: string,
        employeeId: string,
        appraisers: ApiAppraiserEntry[],
      ) => {
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

/* ==========================================================================
 * Running one cycle: who is outstanding, and what is wrong with it
 * ======================================================================== */

const REGISTER_OFFLINE =
  "A period's register needs the API. It is an aggregate over everybody — who " +
  "owes a form, who has nobody appraising them, and what each person's mark is " +
  "made of — and one assembled in this browser would describe a period nothing " +
  "else here is running.";

export type CycleRegister = {
  /** Open to everybody, so this arrives even when the rest is refused. */
  cycle: ApiCycle | null;
  /** Who owes which form. Peer rows are counted, never named. */
  participants: ApiCycleParticipants | null;
  /** Everybody's composite score, component by component, with its exceptions. */
  register: ApiScoreRegister | null;
  /**
   * The appraiser map, **narrowed to the rows something is wrong with**.
   *
   * This is where "nobody is appraising Grace" comes from, and it is the reason
   * this read is here at all rather than only on the mapping tab. The mapping
   * *interface* is gated on the `multiAppraiser` flag; the exception is not, and
   * must not be — a company that never opens the mapping screen is exactly the
   * company that will finish a cycle with somebody unmarked.
   */
  exceptions: ApiAppraiserMap | null;
  loading: boolean;
  error: ApiError | null;
  /** False in demo mode, and false without `EDIT_RECORDS`. */
  available: boolean;
  refusal: string;
  reload: () => void;
};

/**
 * One cycle, from the point of view of whoever is running it.
 *
 * Four reads in one hook because they are one screen and they fail together:
 * three of them need `EDIT_RECORDS`, so a caller without it gets three 403s and
 * one useful sentence. `enabled` is that permission, asked by the screen — the
 * store does not reach for `useCan` itself, which would make every consumer pay
 * for the permissions fetch whether or not it renders this.
 *
 * Offline it refuses, for the reason `useAppraiserMap` already refuses: this is
 * the record a mark is defended with months later.
 */
export function useCycleRegister(
  cycleId: string | null,
  enabled: boolean,
): CycleRegister {
  const { isConnected } = useSession();
  const active = cycleId !== null && enabled && isConnected;

  const load = useCallback(
    async (signal: AbortSignal) => {
      const id = cycleId ?? "";
      const [cycle, participants, register, exceptions] = await Promise.all([
        performanceApi.cycle(id, signal),
        performanceApi.participants(id, signal),
        performanceApi.cycleScores(id, {}, signal),
        performanceApi.appraiserMap(id, { exceptionsOnly: true }, signal),
      ]);
      return { cycle, participants, register, exceptions };
    },
    [cycleId],
  );

  const fetched = useFetched<{
    cycle: ApiCycle;
    participants: ApiCycleParticipants;
    register: ApiScoreRegister;
    exceptions: ApiAppraiserMap;
  }>(`cycle-register|${cycleId ?? "none"}`, active, load);

  /* Nothing is derived offline — see the refusal above — so this is a stable
     constant rather than a computed value, and it never touches state. */
  const offlineValue = useMemo<CycleRegister>(
    () => ({
      cycle: demoCycles.find((cycle) => cycle.id === cycleId) ?? null,
      participants: null,
      register: null,
      exceptions: null,
      loading: false,
      error: null,
      available: false,
      refusal: REGISTER_OFFLINE,
      reload: fetched.reload,
    }),
    [cycleId, fetched.reload],
  );

  if (!isConnected) return offlineValue;

  return {
    cycle: fetched.data?.cycle ?? null,
    participants: fetched.data?.participants ?? null,
    register: fetched.data?.register ?? null,
    exceptions: fetched.data?.exceptions ?? null,
    loading: fetched.loading,
    error: fetched.error,
    available: enabled,
    refusal: REGISTER_OFFLINE,
    reload: fetched.reload,
  };
}

/* ==========================================================================
 * Who is appraising me
 * ======================================================================== */

/**
 * Who marks this person in one cycle, asked by the person themselves.
 *
 * `GET /cycles/:id/appraisers/:employeeId` is open to the subject on purpose —
 * knowing *who* judges you is not the same as reading what they wrote, and a
 * company that will not tell you who judges you has a worse problem than a
 * rounding one. That openness is what makes this hook possible, and it is the
 * only honest way an employee's own screen can learn that **nobody** is
 * appraising them.
 *
 * It cannot be inferred from `myReviews` and must not be tried: a manager review
 * is absent from `aboutMe` until it is finalised or the cycle is published, so
 * an absence there is the ordinary mid-cycle state. Reading it as "nobody is
 * appraising you" would be a wrong claim in the common case, which is the exact
 * failure this module keeps being written against.
 *
 * Offline the answer comes from the seed's own reporting line, because that is
 * where a demo appraiser would come from: `activateCycle` fills the mapping in
 * from `managerId`, so somebody with no manager has nobody, and the demo says so
 * in the API's words rather than staying quiet about it.
 */
export function useMyAppraisers(
  cycleId: string | null,
  employeeId: string | null,
): {
  row: (ApiAppraiserMapRow & { cycleName: string }) | null;
  loading: boolean;
  error: ApiError | null;
} {
  const { isConnected } = useSession();
  const active = cycleId !== null && employeeId !== null && isConnected;

  const load = useCallback(
    async (signal: AbortSignal) =>
      performanceApi.appraisersOf(cycleId ?? "", employeeId ?? "", signal),
    [cycleId, employeeId],
  );

  const fetched = useFetched<ApiAppraiserMapRow & { cycleName: string }>(
    `appraisers-of|${cycleId ?? "none"}|${employeeId ?? "none"}`,
    active,
    load,
  );

  const derived = useMemo(() => {
    if (isConnected || cycleId === null || employeeId === null) return null;
    const cycle = demoCycles.find((one) => one.id === cycleId);
    const person = employeeById(employeeId);
    if (!cycle || !person) return null;

    const manager = person.managerId
      ? employeeById(person.managerId)
      : undefined;
    const started = cycle.stage !== "DRAFT";
    const name = `${person.firstName} ${person.lastName}`;

    return {
      employeeId,
      employeeName: name,
      jobTitle: person.jobTitle,
      departmentId: person.department,
      departmentName: person.department,
      lineManagerId: person.managerId,
      lineManagerName: manager
        ? `${manager.firstName} ${manager.lastName}`
        : null,
      cycleName: cycle.name,
      appraisers: manager
        ? [
            {
              assignmentId: `demo-assignment-${employeeId}`,
              appraiserId: manager.id,
              appraiserName: `${manager.firstName} ${manager.lastName}`,
              jobTitle: manager.jobTitle,
              role: "LINE_MANAGER" as const,
              roleLabel: "Line manager",
              weightBp: FULL_WEIGHT_BP,
              note: null,
              reviewId: null,
              submitted: false,
              rating: null,
              unavailable: false,
            },
          ]
        : [],
      totalWeightBp: manager ? FULL_WEIGHT_BP : 0,
      submittedWeightBp: 0,
      weightedRating: null,
      /* The API's own sentences, both halves. A demo refusal or warning that is
         worded differently from the served one teaches the wrong rule. */
      exceptions: manager
        ? []
        : [
            {
              severity: (started ? "BLOCKER" : "WARNING") as
                "BLOCKER" | "WARNING",
              code: "NO_APPRAISER" as const,
              message: started
                ? `Nobody is appraising ${name}. They will finish this period with no mark.`
                : `${name} has no appraiser yet. Starting the period will use their line manager, and they have none.`,
            },
          ],
    };
  }, [isConnected, cycleId, employeeId]);

  return {
    row: isConnected ? fetched.data : derived,
    loading: isConnected ? fetched.loading : false,
    error: isConnected ? fetched.error : null,
  };
}

/**
 * One person's composite score in one cycle.
 *
 * Two refusals a screen has to render rather than paper over:
 *
 * - **Before the rating is finalised the subject is refused**, with the API's own
 *   sentence. A working figure moves every time somebody records a rating, and
 *   showing an employee a provisional mark starts a conversation about a number
 *   nobody meant to publish. Show the message; do not show a blank panel and do
 *   not show a zero.
 * - Offline there is no register at all, for the reason `useCycleRegister`
 *   gives. `available` is false and `refusal` is the line.
 *
 * `enabled` lets a screen hold the request back until it knows there is a cycle
 * and a person worth asking about.
 */
export function useEmployeeScore(
  cycleId: string | null,
  employeeId: string | null,
  enabled: boolean,
): {
  score: ApiEmployeeScore | null;
  loading: boolean;
  error: ApiError | null;
  available: boolean;
  refusal: string;
  reload: () => void;
} {
  const { isConnected } = useSession();
  const active =
    cycleId !== null && employeeId !== null && enabled && isConnected;

  const load = useCallback(
    async (signal: AbortSignal) =>
      performanceApi.employeeScore(cycleId ?? "", employeeId ?? "", signal),
    [cycleId, employeeId],
  );

  const fetched = useFetched<ApiEmployeeScore>(
    `score|${cycleId ?? "none"}|${employeeId ?? "none"}`,
    active,
    load,
  );

  return {
    score: isConnected ? fetched.data : null,
    loading: isConnected ? fetched.loading : false,
    error: isConnected ? fetched.error : null,
    available: isConnected,
    refusal: REGISTER_OFFLINE,
    reload: fetched.reload,
  };
}

/**
 * Who still owes a form in this cycle, as one list.
 *
 * `ApiCycleParticipants` answers it per person per form; this collapses it into
 * the sentence a cycle owner actually needs — "Grace has not sent her
 * self-review", "Tunde has not written Musa's". A row appears **only** when
 * something is genuinely missing, so an empty list means everybody is in rather
 * than that the read failed.
 *
 * An absent manager form is deliberately **not** reported here as outstanding. A
 * missing form and a missing appraiser look the same on this data and are
 * opposite problems: one is somebody who has not got round to it, the other is
 * somebody nobody was ever asked to mark. The second is an exception on the
 * appraiser map, with a name and a severity, and reporting it twice in different
 * words would let a reader clear the wrong one.
 */
export type Outstanding = {
  employeeId: string;
  employeeName: string;
  /** What is missing, in words. Already includes the name. */
  what: string;
  reviewId: string;
};

export function outstandingIn(
  participants: ApiCycleParticipants | null,
): Outstanding[] {
  if (!participants) return [];
  const rows: Outstanding[] = [];

  for (const person of participants.rows) {
    if (person.self && !person.self.submitted) {
      rows.push({
        employeeId: person.employeeId,
        employeeName: person.employeeName,
        what: `${person.employeeName} has not sent their self-review`,
        reviewId: person.self.reviewId,
      });
    }
    /* One row per appraiser who has not written, not one per person — a person
       with two appraisers and one answer still owes the second one. */
    for (const manager of person.managers) {
      if (manager.submitted) continue;
      rows.push({
        employeeId: person.employeeId,
        employeeName: person.employeeName,
        what: `${manager.managerName} has not written ${person.employeeName}'s review`,
        reviewId: manager.reviewId,
      });
    }
  }

  return rows;
}

/* ==========================================================================
 * How much each part counts: the scoring weights
 * ======================================================================== */

/**
 * Which tone a band carries. **A frontend-only mapping, on purpose.**
 *
 * The band itself, its label, its meaning and its edges all come from the API —
 * a screen must never decide where "meets expectations" starts. What the API
 * cannot send is a colour, so this is the one thing about a band that lives here,
 * and it is keyed by the union so `tsc` refuses to build if a sixth band appears.
 *
 * Neutral for the middle band deliberately. Delivering what was agreed is the
 * ordinary outcome and colouring most of a company amber or green teaches people
 * to read the colour as the verdict rather than the words beside it.
 */
export const BAND_TONE: Record<ScoreBand, BadgeTone> = {
  OUTSTANDING: "success",
  EXCEEDS: "accent",
  MEETS: "neutral",
  PARTIALLY_MEETS: "warning",
  BELOW: "danger",
};

const WEIGHTS_SAVE_OFFLINE =
  "Saving the weights needs the API. They decide how everybody's mark is put " +
  "together, and a set kept in this browser would change no score anywhere — a " +
  "settings screen that looks saved and moves nothing is worse than one that " +
  "says it cannot.";

/**
 * The shipped defaults, so the form has something honest to render offline.
 *
 * A copy of `DEFAULT_WEIGHTS` in `modules/performance/scoring.ts`, and the only
 * duplicated figures in this file. It is here because the argument the settings
 * screen exists to make — objectives lead, competencies are most of the rest,
 * self-assessment is zero — is the argument, and a blank panel in demo mode makes
 * it to nobody. `source: "default"` says they are ours rather than a decision the
 * company made, and the write still refuses, so nothing can look saved.
 *
 * If the server's defaults move, this moves with them. Nothing computes from it.
 */
const DEMO_WEIGHTS: ApiScoringWeights = {
  source: "default",
  rows: [
    {
      component: "OBJECTIVES",
      label: "Delivery against objectives",
      weightBp: 4_000,
    },
    {
      component: "CORE_COMPETENCY",
      label: "Core competencies",
      weightBp: 2_500,
    },
    {
      component: "BEHAVIOURAL_COMPETENCY",
      label: "Behavioural competencies",
      weightBp: 2_000,
    },
    { component: "LEADERSHIP", label: "Leadership", weightBp: 1_500 },
    { component: "SELF_ASSESSMENT", label: "Self-assessment", weightBp: 0 },
  ],
  totalBp: FULL_WEIGHT_BP,
  selfAssessmentNote:
    "Self-assessment is weighted at 0%. It is collected and shown beside the " +
    "manager's rating, and it does not change the score.",
};

/**
 * The company's scoring weights, and the one write that replaces the whole set.
 *
 * `save` takes every component because the API does, and the API does because
 * that is the only shape in which "they sum to 100%" is a rule it can enforce.
 * There is deliberately no `saveOne`.
 *
 * The read works offline against the shipped defaults; the write refuses. The
 * split is not arbitrary: reading is how somebody learns what turning
 * self-assessment on would do to a mark, which is the whole reason the screen
 * exists, and it needs no server. Writing changes how everybody in a real company
 * is scored, and a locally stored set would move no mark on any screen in this
 * product — the same failure as a green "Paid" that transferred nothing.
 */
export function useScoringWeights(): {
  weights: ApiScoringWeights | null;
  loading: boolean;
  error: ApiError | null;
  source: Source;
  /** False offline. The form renders read-only and says why. */
  editable: boolean;
  refusal: string;
  /**
   * Replaces the whole set and **returns what the API said about it**.
   *
   * The response names the running cycles the change will not touch, and naming
   * them is the point — "cycles already running keep their own weights" is a rule
   * somebody has to take on trust, while "H2 2026 appraisal keeps its own" is a
   * fact they can check. Same discipline as the payroll run naming the person it
   * excluded rather than counting them.
   */
  save: (
    weights: Record<ScoreComponent, number>,
  ) => Promise<ApiScoringWeightsSaved>;
  reload: () => void;
} {
  const { isConnected } = useSession();

  const load = useCallback(
    async (signal: AbortSignal) => performanceApi.scoringWeights(signal),
    [],
  );
  const fetched = useFetched<ApiScoringWeights>(
    "scoring-weights",
    isConnected,
    load,
  );

  /* Demo value in a memo, never in state. The defaults are a constant, so this
     is stable and there is nothing to synchronise. Named `demoValue` rather than
     `offline`, which is the module's refusal helper — shadowing it here made the
     save path uncallable, and `tsc` said only "not callable". */
  const demoValue = useMemo(() => DEMO_WEIGHTS, []);
  const { reload } = fetched;

  return {
    weights: isConnected ? fetched.data : demoValue,
    loading: isConnected ? fetched.loading : false,
    error: isConnected ? fetched.error : null,
    source: isConnected ? "api" : "demo",
    editable: isConnected,
    refusal: WEIGHTS_SAVE_OFFLINE,
    save: useCallback(
      async (weights: Record<ScoreComponent, number>) => {
        if (!isConnected) offline(WEIGHTS_SAVE_OFFLINE);
        const saved = await performanceApi.setScoringWeights(weights);
        reload();
        return saved;
      },
      [isConnected, reload],
    ),
    reload,
  };
}

/* ==========================================================================
 * The outcome of a cycle, and the trend across cycles
 * ======================================================================== */

const REPORT_OFFLINE =
  "A period report needs the API. A distribution is an aggregate over " +
  "everybody's mark, and one assembled in this browser would describe a period " +
  "nothing else here is running.";

const HISTORY_OFFLINE =
  "A trend across periods needs the API. Every point on it is the same score " +
  "the period screen shows, read from the weights that period was frozen " +
  "against — there is nothing in this browser to read it from.";

/**
 * The outcome of one cycle: the distribution, what came in, and who is left out.
 *
 * A separate hook and a separate request from `useCycleRegister`, because they
 * are separate screens answering separate questions. The register is "who is not
 * finished" and belongs to whoever is running the cycle; this is "how did it come
 * out" and belongs to whoever has to explain it afterwards.
 *
 * `enabled` is the `EDIT_RECORDS` permission, asked by the screen. The store does
 * not reach for `useCan` itself — that would make every consumer pay for the
 * permissions fetch whether or not it renders this.
 */
export function useCycleReport(
  cycleId: string | null,
  enabled: boolean,
): {
  report: ApiCycleReport | null;
  cycle: ApiCycle | null;
  loading: boolean;
  error: ApiError | null;
  available: boolean;
  refusal: string;
  reload: () => void;
} {
  const { isConnected } = useSession();
  const active = cycleId !== null && enabled && isConnected;

  const load = useCallback(
    async (signal: AbortSignal) => {
      const id = cycleId ?? "";
      /* The cycle read is open to everybody, so a reader who is refused the
         report still gets the cycle's name for the heading. */
      const [cycle, report] = await Promise.all([
        performanceApi.cycle(id, signal),
        performanceApi.cycleReport(id, signal),
      ]);
      return { cycle, report };
    },
    [cycleId],
  );

  const fetched = useFetched<{ cycle: ApiCycle; report: ApiCycleReport }>(
    `cycle-report|${cycleId ?? "none"}`,
    active,
    load,
  );

  /* Nothing is derived offline — see the refusal — so this is a stable value
     computed in a memo and never written to state. */
  const offlineValue = useMemo(
    () => demoCycles.find((cycle) => cycle.id === cycleId) ?? null,
    [cycleId],
  );

  return {
    report: isConnected ? (fetched.data?.report ?? null) : null,
    cycle: isConnected ? (fetched.data?.cycle ?? null) : offlineValue,
    loading: isConnected ? fetched.loading : false,
    error: isConnected ? fetched.error : null,
    available: isConnected && enabled,
    refusal: REPORT_OFFLINE,
    reload: fetched.reload,
  };
}

/**
 * One person's mark across cycles.
 *
 * Three refusals a screen has to render rather than paper over:
 *
 * - **A colleague is refused outright**, and so is an appraiser assigned to one
 *   cycle who is not the person's manager. `assertSeesEmployee` on the server is
 *   self, direct report, or `EDIT_RECORDS`; the 403 message names the rule and is
 *   worth showing verbatim.
 * - **The subject's own reading is narrowed to final marks.** Cycles still in
 *   progress arrive as `withheldCycles` with a sentence, and the sentence has to
 *   be rendered — a period missing with no explanation reads as a period the
 *   person was not in.
 * - **Offline there is nothing**, for the reason `useCycleRegister` gives. Every
 *   point is a register row.
 */
export function useScoreHistory(
  employeeId: string | null,
  enabled: boolean,
): {
  history: ApiScoreHistory | null;
  loading: boolean;
  error: ApiError | null;
  available: boolean;
  refusal: string;
  reload: () => void;
} {
  const { isConnected } = useSession();
  const active = employeeId !== null && enabled && isConnected;

  const load = useCallback(
    async (signal: AbortSignal) =>
      performanceApi.scoreHistory(employeeId ?? "", signal),
    [employeeId],
  );

  const fetched = useFetched<ApiScoreHistory>(
    `score-history|${employeeId ?? "none"}`,
    active,
    load,
  );

  return {
    history: isConnected ? fetched.data : null,
    loading: isConnected ? fetched.loading : false,
    error: isConnected ? fetched.error : null,
    available: isConnected,
    refusal: HISTORY_OFFLINE,
    reload: fetched.reload,
  };
}
