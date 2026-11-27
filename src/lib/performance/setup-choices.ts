import {
  weightSetFromRows,
  type ApiScoringWeights,
  type ScoreComponent,
  type WeightSet,
} from "@/lib/api/performance";
import { splitEvenly } from "./setup-weights";

/**
 * What the set-up wizard offers, where it starts, and what it saves.
 *
 * All of it is read off the weights the API sent, so the wizard says what
 * Settings says: the same names, the same descriptions, and the numbers the
 * company is scored on today. Pure, so each rule is asserted rather than
 * believed (the wizard itself was tested against a mock that answered before
 * the first render, which is the one thing the real hook cannot do).
 */

type Row = ApiScoringWeights["rows"][number];

/** The order the choices are asked and listed in, whatever order the API sends. */
export const WIZARD_ORDER: readonly ScoreComponent[] = [
  "OBJECTIVES",
  "CORE_COMPETENCY",
  "BEHAVIOURAL_COMPETENCY",
  "LEADERSHIP",
  "MANAGER_APPRAISAL",
  "SELF_ASSESSMENT",
  "TASKS",
];

/** What a company that has chosen nothing is offered first. */
export const DEFAULT_TICKED: readonly ScoreComponent[] = [
  "OBJECTIVES",
  "CORE_COMPETENCY",
  "BEHAVIOURAL_COMPETENCY",
  "LEADERSHIP",
];

/**
 * The tasks part, in the words the product now uses for it.
 *
 * The API still names this source "Weekly tasks" and describes weekly grading,
 * which stopped existing when weekly tasks were retired: it counts the tasks done
 * in Projects. Until the API says so, a part the company never named reads
 * "Tasks done" here, and a company's own name or description is always kept.
 * Delete this when the API's built-in wording is corrected.
 */
const TASKS_NAME = "Tasks done";
const TASKS_WORDS =
  "The tasks finished in Projects that are linked to the period's objectives.";

export type WizardChoice = {
  source: ScoreComponent;
  /** The company's name for the part, as Settings shows it. */
  name: string;
  /** What the part is scored from, in the API's words. Null when there is none to say. */
  description: string | null;
};

const unsaid = (own: string | undefined, builtIn: string | undefined) =>
  builtIn === undefined || own === builtIn;

/**
 * The parts a company can choose from. A source the server sent no row for is
 * not offered: an absent part is not a part at 0%, and offering one the server
 * would drop is a choice that looks saved and changes nothing.
 */
export function choicesFrom(rows: readonly Row[]): WizardChoice[] {
  return WIZARD_ORDER.flatMap((source) => {
    const row = rows.find((one) => one.component === source);
    if (!row) return [];
    const tasks = source === "TASKS";
    const name =
      tasks && unsaid(row.label, row.defaultLabel) ? TASKS_NAME : row.label;
    const said =
      tasks && unsaid(row.description, row.defaultDescription)
        ? TASKS_WORDS
        : row.description?.trim();
    return [{ source, name, description: said ? said : null }];
  });
}

export type Start = {
  ticked: ScoreComponent[];
  /** Whole percents as typed, by source. */
  percents: Partial<Record<ScoreComponent, string>>;
  /**
   * Whether the numbers are the company's own. Ticking another part re-splits an
   * untouched default evenly, and never touches a set somebody chose: that would
   * be the wizard rewriting their weights before they have pressed anything.
   */
  touched: boolean;
};

/**
 * Where the wizard opens: on what the company is scored on today. A company on
 * the built-in weights sees those, and one that saved its own sees its own.
 *
 * `projectsOff` leaves Tasks done out whatever it is saved at: the server
 * refuses a weight on it while Projects is off, and what it counts for is
 * nothing.
 */
export function startingPoint(
  weights: ApiScoringWeights,
  projectsOff: boolean,
): Start {
  const counted = weights.rows.filter(
    (row) =>
      row.isPart !== false &&
      row.weightBp > 0 &&
      !(projectsOff && row.component === "TASKS"),
  );
  if (counted.length === 0) {
    return {
      ticked: [...DEFAULT_TICKED],
      percents: evenly(DEFAULT_TICKED),
      touched: false,
    };
  }
  return {
    ticked: WIZARD_ORDER.filter((source) =>
      counted.some((row) => row.component === source),
    ),
    percents: Object.fromEntries(
      counted.map((row) => [
        row.component,
        String(Math.round(row.weightBp / 100)),
      ]),
    ),
    touched: weights.source === "saved",
  };
}

/** 100 shared evenly over these, as typed text. */
export function evenly(
  sources: readonly ScoreComponent[],
): Partial<Record<ScoreComponent, string>> {
  return Object.fromEntries(
    Object.entries(splitEvenly(sources)).map(([source, percent]) => [
      source,
      String(percent),
    ]),
  );
}

/**
 * The whole weight set the wizard saves, in one write.
 *
 * A part that is not ticked is 0 and a part the server has no row for is left
 * out (`weightSetFromRows`), so the one request says exactly what the company is
 * scored on and the server refuses or accepts all of it.
 */
export function weightBody(
  rows: readonly Row[],
  ticked: readonly ScoreComponent[],
  percentOf: (source: ScoreComponent) => number,
): WeightSet {
  return weightSetFromRows(
    rows.map((row) => ({
      component: row.component,
      weightBp: ticked.includes(row.component)
        ? percentOf(row.component) * 100
        : 0,
    })),
  );
}

/** The first ticked part with nothing to count for, in the order they are listed. */
export function firstWithoutShare(
  ticked: readonly ScoreComponent[],
  percentOf: (source: ScoreComponent) => number,
): ScoreComponent | undefined {
  return WIZARD_ORDER.find(
    (source) => ticked.includes(source) && percentOf(source) < 1,
  );
}
