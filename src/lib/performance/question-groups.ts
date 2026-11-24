import type {
  ApiQuestion,
  CreateQuestionBody,
  ReviewAudience,
  ReviewQuestionKind,
  ScoreComponent,
} from "@/lib/api/performance";

/**
 * The groups of a period's review form, in the order the review flow asks them
 * (owner request, 24 Nov 2026): the employee's own questions, the manager's,
 * then one screen each for the Core, Behavioural and Leadership competencies.
 * Pure: which question sits in which group, and what a new one sends.
 */
export type QuestionGroup =
  "self" | "manager" | "core" | "behavioural" | "leadership";

export const GROUP_TITLE: Record<QuestionGroup, string> = {
  self: "Self review questions",
  manager: "Manager review questions",
  core: "Core competency questions",
  behavioural: "Behavioural competency questions",
  leadership: "Leadership questions",
};

const COMPONENT_GROUP: Partial<Record<ScoreComponent, QuestionGroup>> = {
  CORE_COMPETENCY: "core",
  BEHAVIOURAL_COMPETENCY: "behavioural",
  LEADERSHIP: "leadership",
};

export function groupForComponent(
  component: ScoreComponent | null,
): QuestionGroup | null {
  return component ? (COMPONENT_GROUP[component] ?? null) : null;
}

/**
 * Which groups a question belongs in. One filed under a subsection is in its
 * section's group; one that is not is in Self review, Manager review, or both
 * (asked of both, or of everybody).
 */
export function groupsOf(
  question: Pick<ApiQuestion, "competencyId" | "askedOf">,
  groupOfCompetency: ReadonlyMap<string, QuestionGroup | null>,
): QuestionGroup[] {
  if (question.competencyId) {
    const group = groupOfCompetency.get(question.competencyId);
    return group ? [group] : [];
  }
  const asked = question.askedOf;
  const everybody = asked.length === 0;
  const out: QuestionGroup[] = [];
  if (everybody || asked.includes("SELF")) out.push("self");
  if (everybody || asked.includes("MANAGER")) out.push("manager");
  return out;
}

export type Who = "EMPLOYEE" | "MANAGER" | "BOTH";
export type Answer = "RATING" | "BOOLEAN" | "TEXT";

export const WHO_LABEL: Record<Who, string> = {
  EMPLOYEE: "The employee",
  MANAGER: "The manager",
  BOTH: "Both",
};
export const ANSWER_LABEL: Record<Answer, string> = {
  RATING: "A rating from 1 to 5",
  BOOLEAN: "Yes or no",
  TEXT: "Written answer",
};

export function audienceOf(who: Who): ReviewAudience[] {
  return who === "EMPLOYEE"
    ? ["SELF"]
    : who === "MANAGER"
      ? ["MANAGER"]
      : ["SELF", "MANAGER"];
}

export function whoOf(asked: readonly ReviewAudience[]): Who {
  const self = asked.includes("SELF");
  const manager = asked.includes("MANAGER");
  return self && !manager ? "EMPLOYEE" : manager && !self ? "MANAGER" : "BOTH";
}

/** Who answers a new question to begin with, on each screen. */
export const DEFAULT_WHO: Record<QuestionGroup, Who> = {
  self: "EMPLOYEE",
  manager: "MANAGER",
  core: "BOTH",
  behavioural: "BOTH",
  leadership: "BOTH",
};

export function answerOf(kind: ReviewQuestionKind): Answer {
  return kind === "RATING" || kind === "BOOLEAN" ? kind : "TEXT";
}

export function createBody(input: {
  prompt: string;
  answer: Answer;
  who: Who;
  required: boolean;
  competencyId?: string | null;
}): CreateQuestionBody {
  return {
    prompt: input.prompt.trim(),
    kind: input.answer,
    askedOf: audienceOf(input.who),
    required: input.required,
    ...(input.competencyId ? { competencyId: input.competencyId } : {}),
  };
}

/** "3 questions", "1 question". */
export function countWords(count: number): string {
  return `${String(count)} ${count === 1 ? "question" : "questions"}`;
}
