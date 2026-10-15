import {
  canRequireScorecards,
  isTerminalType,
  STAGE_TYPE_LABEL,
  type StageType,
} from "./stage-types";

/**
 * The rules a pipeline template has to keep, checked on this side so the Save
 * button is not offered for a template the API will refuse.
 *
 * The API states the same rules in its own words and has the last word; these are
 * here so the person sees the problem next to the stage that causes it, before
 * pressing anything.
 *
 * - **One Applied stage, and it comes first.** It is where everybody who is
 *   screened in lands, so a pipeline has exactly one.
 * - **A pipeline ends somewhere:** at least one Hired or Rejected stage, at most
 *   one of each, and they go last.
 * - Names are for people, so each is written and none repeats.
 *
 * No React, no state.
 */

export type TemplateStage = {
  /** Stable while editing; the API's id once saved, a local key before. */
  id: string;
  name: string;
  type: StageType;
  requiresScorecards: boolean;
};

export type TemplateProblems = {
  name: string | null;
  /** Keyed by stage id. */
  stages: Record<string, string>;
  /** About the list as a whole: no ending, a stage out of place. */
  list: string | null;
};

export const NAME_MAX = 80;
export const STAGES_MAX = 30;

export function validateTemplate(
  name: string,
  stages: readonly TemplateStage[],
): TemplateProblems {
  const problems: TemplateProblems = { name: null, stages: {}, list: null };

  const title = name.trim();
  if (title.length < 2) problems.name = "Give the template a name.";
  else if (title.length > NAME_MAX)
    problems.name = `Keep the name to ${String(NAME_MAX)} characters.`;

  if (stages.length === 0) {
    problems.list = "Add at least one stage.";
    return problems;
  }
  if (stages.length > STAGES_MAX) {
    problems.list = `Keep it to ${String(STAGES_MAX)} stages.`;
    return problems;
  }

  const seen = new Set<string>();
  for (const stage of stages) {
    const label = stage.name.trim();
    if (label === "") {
      problems.stages[stage.id] = "Name this stage.";
      continue;
    }
    if (label.length > NAME_MAX) {
      problems.stages[stage.id] =
        `Keep the name to ${String(NAME_MAX)} characters.`;
      continue;
    }
    const key = label.toLowerCase();
    if (seen.has(key)) {
      problems.stages[stage.id] =
        "Another stage already has this name. Names have to differ.";
      continue;
    }
    seen.add(key);
  }

  const entries = stages.filter((stage) => stage.type === "APPLIED");
  if (entries.length === 0) {
    problems.list =
      "There is no Applied stage. New applicants need one place to land.";
  }
  for (const extra of entries.slice(1)) {
    problems.stages[extra.id] ??=
      "A pipeline has exactly one Applied stage. Make this one Screening, or change the other.";
  }
  const first = stages[0];
  if (first && entries.length >= 1 && first.type !== "APPLIED") {
    problems.stages[first.id] ??=
      "The Applied stage has to come first: it is where people arrive.";
  }

  const ends = stages.filter((stage) => isTerminalType(stage.type));
  if (ends.length === 0) {
    problems.list ??=
      "A pipeline needs somewhere to end. Add a Hired or a Rejected stage.";
  }
  for (const type of ["HIRED", "REJECTED"] as const) {
    const of = stages.filter((stage) => stage.type === type);
    for (const stage of of.slice(1)) {
      problems.stages[stage.id] ??=
        `A pipeline has at most one ${STAGE_TYPE_LABEL[type]} stage.`;
    }
  }

  const firstEnd = stages.findIndex((stage) => isTerminalType(stage.type));
  if (firstEnd >= 0) {
    const stray = stages
      .slice(firstEnd)
      .find((stage) => !isTerminalType(stage.type));
    if (stray) {
      problems.stages[stray.id] ??=
        "This comes after a Hired or Rejected stage. Those end the journey, so they go last.";
    }
  }

  return problems;
}

export const isValid = (problems: TemplateProblems): boolean =>
  problems.name === null &&
  problems.list === null &&
  Object.keys(problems.stages).length === 0;

/** The first thing wrong, in words, for a banner. `null` when it is right. */
export function firstProblem(problems: TemplateProblems): string | null {
  return (
    problems.name ?? problems.list ?? Object.values(problems.stages)[0] ?? null
  );
}

/**
 * Why a stage cannot be taken out, or `null` when it can.
 *
 * Not "would the result be valid": a list that is already wrong may need a stage
 * removed to be put right. This only refuses the removals that leave a template
 * with nowhere to start or nowhere to end.
 */
export function removalRefusal(
  stages: readonly TemplateStage[],
  id: string,
): string | null {
  const stage = stages.find((s) => s.id === id);
  if (!stage) return null;
  if (stages.length <= 1) return "A template needs at least one stage.";

  if (stage.type === "APPLIED") {
    return "This is the Applied stage, where new applicants land. A pipeline always has one.";
  }
  if (isTerminalType(stage.type)) {
    const others = stages.filter((s) => s.id !== id && isTerminalType(s.type));
    if (others.length === 0) {
      return "This is the only place the pipeline ends. Add another ending first, or keep this one.";
    }
  }
  return null;
}

/** Whether a stage can swap places with its neighbour without breaking the order. */
export function moveRefusal(
  stages: readonly TemplateStage[],
  id: string,
  delta: -1 | 1,
): string | null {
  const from = stages.findIndex((s) => s.id === id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= stages.length)
    return "Already at the end.";
  const stage = stages[from] as TemplateStage;
  const neighbour = stages[to] as TemplateStage;
  if (stage.type === "APPLIED" || neighbour.type === "APPLIED") {
    return "The Applied stage stays first: it is where people arrive.";
  }
  if (isTerminalType(neighbour.type) !== isTerminalType(stage.type)) {
    return isTerminalType(stage.type)
      ? "Endings stay after the stages people pass through."
      : "Stages people pass through stay before the endings.";
  }
  return null;
}

export function moveStage<T extends { id: string }>(
  list: readonly T[],
  id: string,
  delta: -1 | 1,
): T[] {
  const from = list.findIndex((s) => s.id === id);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [row] = next.splice(from, 1);
  if (row) next.splice(to, 0, row);
  return next;
}

/** What a type change does to the flags around it. */
export function withType(stage: TemplateStage, type: StageType): TemplateStage {
  return {
    ...stage,
    type,
    requiresScorecards: canRequireScorecards(type)
      ? stage.requiresScorecards
      : false,
  };
}

/** A name for the next added stage that is not already taken. */
export function freshStageName(
  stages: readonly TemplateStage[],
  base = "New stage",
): string {
  const taken = new Set(stages.map((s) => s.name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base} ${String(n)}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

/**
 * Where a newly added stage goes: after the last stage people pass through,
 * before the endings, so a stage added in a hurry cannot land after Hired.
 */
export function insertionIndex(stages: readonly TemplateStage[]): number {
  const lastPassing = stages.reduce(
    (found, stage, index) => (isTerminalType(stage.type) ? found : index),
    -1,
  );
  return lastPassing + 1;
}

/** Which types may still be added without breaking "one of each": for the picker. */
export function typesStillAvailable(
  stages: readonly TemplateStage[],
  except?: string,
): StageType[] {
  const others = stages.filter((s) => s.id !== except);
  const has = (type: StageType) => others.some((s) => s.type === type);
  return (
    [
      "APPLIED",
      "SCREENING",
      "TEST",
      "INTERVIEW",
      "OFFER",
      "HIRED",
      "REJECTED",
    ] as const
  ).filter((type) => {
    if (type === "APPLIED" || type === "HIRED" || type === "REJECTED")
      return !has(type);
    return true;
  });
}
