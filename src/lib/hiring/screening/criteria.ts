import {
  WEIGHT_KEYS,
  type Criteria,
  type EducationLevel,
  type Keyword,
  type Weights,
} from "./model";

/**
 * Editing a job's criteria: the rules, with no React and no state.
 *
 * What a person types in the editor is a **draft**. These functions say what a
 * draft is allowed to be and when two of them are the same, so the editor, the
 * "unsaved changes" guard and the demo's own storage cannot disagree. Every
 * refusal is a sentence a person can act on, and each is attached to the part of
 * the form it is about.
 *
 * The limits are the API's own, so a draft that passes here is one the API accepts;
 * the API still checks, and its refusals land on the same boxes.
 */

export const LIMITS = {
  /** Skills or keywords in each of the two lists. */
  keywords: 40,
  /** Other ways of writing one skill. */
  aliases: 8,
  /** Characters in a skill, an alias or a place. */
  label: 60,
  /** Terms and spellings together, across both lists. */
  patterns: 300,
  /** The fewest and most years anybody is asked to have, in half-year steps. */
  minYears: 0.5,
  maxYears: 40,
  places: 10,
  /** How much one skill counts within its list. */
  skillWeight: { min: 1, max: 5 },
} as const;

/** The default size of each part, used when the API does not say. */
export const FALLBACK_WEIGHTS: Weights = {
  mustHave: 50,
  niceToHave: 15,
  experience: 15,
  education: 10,
  location: 10,
};

export const WEIGHT_LABEL: Record<keyof Weights, string> = {
  mustHave: "Must-have skills",
  niceToHave: "Nice-to-have skills",
  experience: "Years of experience",
  education: "Education level",
  location: "Location",
};

/**
 * The ordered education scale, lowest first, used only when the API does not send
 * its own. A level, never a school, a grade or a course: the score cannot be
 * moved by where somebody studied.
 */
export const DEFAULT_SCALE: EducationLevel[] = [
  {
    value: "SECONDARY",
    label: "Secondary school",
    examples: "SSCE, WAEC, NECO",
  },
  {
    value: "DIPLOMA",
    label: "Diploma or certificate",
    examples: "ND, OND, NCE",
  },
  { value: "HND", label: "Higher National Diploma", examples: "HND" },
  { value: "BACHELORS", label: "Bachelor's degree", examples: "BSc, BA, BEng" },
  {
    value: "POSTGRAD_DIPLOMA",
    label: "Postgraduate diploma",
    examples: "PGD, PGDE",
  },
  { value: "MASTERS", label: "Master's degree", examples: "MSc, MBA, MA" },
  { value: "DOCTORATE", label: "Doctorate", examples: "PhD" },
];

/* ----------------------------------------------------------------------- keys */

let counter = 0;

/** A key for a chip that has not been saved. Never sent to the API. */
export function newKeywordId(): string {
  counter += 1;
  return `new-${String(counter)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The comparison form of a word: case, spaces and stray punctuation ignored. */
export const compareForm = (text: string): string =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();

/** One line of whitespace, no control characters. */
export const tidy = (text: string): string =>
  text
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "Excel", " excel ", "EXCEL" are one chip. */
export const sameWord = (a: string, b: string): boolean =>
  compareForm(a) === compareForm(b) && compareForm(a) !== "";

/**
 * Chips from what was typed or pasted: split on commas, semicolons, new lines.
 * Anything already in `existing` is left out, so pasting a list twice adds it once.
 */
export function chipsFromText(
  text: string,
  existing: readonly Keyword[] = [],
): Keyword[] {
  const out: Keyword[] = [];
  for (const piece of text.split(/[,;\n]+/)) {
    const label = tidy(piece).slice(0, LIMITS.label);
    if (label === "") continue;
    if ([...existing, ...out].some((chip) => sameWord(chip.label, label)))
      continue;
    out.push({ id: newKeywordId(), label, aliases: [], weight: 1 });
  }
  return out;
}

/** "payroll processing, PAYE" to a clean list: no repeats, none equal to the label. */
export function aliasesFromText(text: string, label: string): string[] {
  const out: string[] = [];
  for (const piece of text.split(/[,;\n]+/)) {
    const alias = tidy(piece).slice(0, LIMITS.label);
    if (alias === "" || sameWord(alias, label)) continue;
    if (out.some((existing) => sameWord(existing, alias))) continue;
    out.push(alias);
  }
  return out.slice(0, LIMITS.aliases);
}

/** Places from what was typed: the same splitting, whole words, no repeats. */
export function placesFromText(
  text: string,
  existing: readonly string[],
): string[] {
  const out = [...existing];
  for (const piece of text.split(/[,;\n]+/)) {
    const place = tidy(piece).slice(0, LIMITS.label);
    if (place.length < 2) continue;
    if (out.some((have) => sameWord(have, place))) continue;
    out.push(place);
  }
  return out;
}

/* --------------------------------------------------------------- weights */

/** Weights as they apply: the ones chosen, else the defaults. */
export function effectiveWeights(
  criteria: Pick<Criteria, "weights">,
  defaults: Weights,
): Weights {
  return criteria.weights ?? defaults;
}

/** "Must-have skills 50, nice-to-have skills 15 …" for the line under the inputs. */
export function weightsLine(weights: Weights): string {
  return WEIGHT_KEYS.map(
    (key) => `${WEIGHT_LABEL[key].toLowerCase()} ${String(weights[key])}`,
  ).join(", ");
}

export const sameWeights = (a: Weights | null, b: Weights | null): boolean => {
  if (a === null || b === null) return a === b;
  return WEIGHT_KEYS.every((key) => a[key] === b[key]);
};

/** Whole numbers only, 0 to 100, from what was typed; `null` for a blank. */
export function parseWeight(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value <= 100 ? value : null;
}

/** A number of years from what was typed: whole or half, or `null` blank, or `"bad"`. */
export function parseYears(text: string): number | null | "bad" {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  if (!/^\d{1,2}(\.\d)?$/.test(trimmed)) return "bad";
  return Number(trimmed);
}

/* ------------------------------------------------------------------ same-ness */

const keywordKey = (chip: Keyword): string =>
  JSON.stringify([
    compareForm(chip.label),
    chip.aliases.map(compareForm).filter(Boolean).sort(),
    chip.weight,
  ]);

/** Whether two sets of criteria say the same thing, ignoring the chips' own keys. */
export function sameCriteria(a: Criteria, b: Criteria): boolean {
  const list = (chips: Keyword[]) => chips.map(keywordKey);
  const places = (criteria: Criteria) =>
    JSON.stringify(criteria.places.map(compareForm));
  return (
    JSON.stringify(list(a.mustHave)) === JSON.stringify(list(b.mustHave)) &&
    JSON.stringify(list(a.niceToHave)) === JSON.stringify(list(b.niceToHave)) &&
    a.minYears === b.minYears &&
    a.education === b.education &&
    places(a) === places(b) &&
    a.locationQuestionId === b.locationQuestionId &&
    a.relocateQuestionId === b.relocateQuestionId &&
    sameWeights(a.weights, b.weights)
  );
}

/**
 * A key that changes exactly when the criteria say something different: what a
 * preview was asked about, so it can say when the draft has moved on since.
 */
export function criteriaKey(criteria: Criteria): string {
  const chips = (list: Keyword[]) =>
    list.map((chip) => [
      compareForm(chip.label),
      chip.aliases.map(compareForm).sort(),
      chip.weight,
    ]);
  return JSON.stringify([
    chips(criteria.mustHave),
    chips(criteria.niceToHave),
    criteria.minYears,
    criteria.education,
    criteria.places.map(compareForm),
    criteria.locationQuestionId,
    criteria.relocateQuestionId,
    criteria.weights,
  ]);
}

/** Nothing asked at all. */
export const isEmptyCriteria = (criteria: Criteria): boolean =>
  criteria.mustHave.length === 0 &&
  criteria.niceToHave.length === 0 &&
  criteria.minYears === null &&
  criteria.education === null &&
  criteria.places.length === 0;

/* ----------------------------------------------------------------- validation */

export type CriteriaProblems = {
  mustHave?: string;
  niceToHave?: string;
  minYears?: string;
  places?: string;
  weights?: string;
  /** Not tied to one part: "Add at least one thing to look for." */
  form?: string;
};

export function validateCriteria(criteria: Criteria): CriteriaProblems {
  const problems: CriteriaProblems = {};

  const listProblem = (chips: Keyword[]): string | undefined => {
    if (chips.length > LIMITS.keywords)
      return `A list holds ${String(LIMITS.keywords)} at most. Take some out.`;
    for (const chip of chips) {
      if (tidy(chip.label) === "")
        return "A skill has no name. Fill it in or remove it.";
      if (chip.label.length > LIMITS.label)
        return `"${chip.label.slice(0, 20)}…" is longer than ${String(LIMITS.label)} characters.`;
      if (chip.aliases.length > LIMITS.aliases)
        return `"${chip.label}" has more than ${String(LIMITS.aliases)} other spellings. Keep the ones that matter.`;
      if (
        !Number.isInteger(chip.weight) ||
        chip.weight < LIMITS.skillWeight.min ||
        chip.weight > LIMITS.skillWeight.max
      )
        return `"${chip.label}" needs a count of 1 to 5.`;
    }
    const seen = new Set<string>();
    for (const chip of chips) {
      const key = compareForm(chip.label);
      if (seen.has(key)) return `"${chip.label}" is in this list twice.`;
      seen.add(key);
    }
    return undefined;
  };

  const must = listProblem(criteria.mustHave);
  if (must) problems.mustHave = must;
  const nice = listProblem(criteria.niceToHave);
  if (nice) problems.niceToHave = nice;

  if (!problems.mustHave && !problems.niceToHave) {
    const inMust = new Set(criteria.mustHave.map((c) => compareForm(c.label)));
    const both = criteria.niceToHave.find((chip) =>
      inMust.has(compareForm(chip.label)),
    );
    if (both) {
      problems.niceToHave = `"${both.label}" is in both lists. Keep it in the one that is true.`;
    }
    const patterns = [...criteria.mustHave, ...criteria.niceToHave].reduce(
      (sum, chip) => sum + 1 + chip.aliases.length,
      0,
    );
    if (!problems.niceToHave && patterns > LIMITS.patterns) {
      problems.niceToHave = `That is ${String(patterns)} words and spellings in all. Keep it to ${String(LIMITS.patterns)} or fewer.`;
    }
  }

  if (criteria.minYears !== null) {
    if (
      !Number.isFinite(criteria.minYears) ||
      criteria.minYears < LIMITS.minYears ||
      criteria.minYears > LIMITS.maxYears ||
      Math.round(criteria.minYears * 2) !== criteria.minYears * 2
    ) {
      problems.minYears = `Use whole or half years, from ${String(LIMITS.minYears)} to ${String(LIMITS.maxYears)}.`;
    }
  }

  if (criteria.places.length > LIMITS.places) {
    problems.places = `Name at most ${String(LIMITS.places)} places.`;
  } else if (criteria.places.some((place) => place.length > LIMITS.label)) {
    problems.places = `Keep each place to ${String(LIMITS.label)} characters.`;
  } else if (
    criteria.places.length === 0 &&
    (criteria.locationQuestionId || criteria.relocateQuestionId)
  ) {
    problems.places = "Name at least one place, or leave location out.";
  }

  if (criteria.weights) {
    const values = WEIGHT_KEYS.map((key) => criteria.weights?.[key]);
    if (
      values.some(
        (value) =>
          value === undefined ||
          !Number.isInteger(value) ||
          value < 0 ||
          value > 100,
      )
    ) {
      problems.weights = "Each weight is a whole number from 0 to 100.";
    } else if (values.every((value) => value === 0)) {
      problems.weights =
        "At least one weight has to be more than 0, or nothing can count.";
    }
  }

  if (isEmptyCriteria(criteria)) {
    problems.form =
      "Add at least one thing to look for: a skill, years, an education level or a place.";
  }

  return problems;
}

export const hasProblems = (problems: CriteriaProblems): boolean =>
  Object.keys(problems).length > 0;

/* ------------------------------------------------------------------- building */

/** A copy of the criteria with every chip given a key, for editing. */
export function draftFrom(criteria: Criteria): Criteria {
  const keep = (chips: Keyword[]) =>
    chips.map((chip) => ({
      id: chip.id || newKeywordId(),
      label: chip.label,
      aliases: [...chip.aliases],
      weight: chip.weight,
    }));
  return {
    ...criteria,
    mustHave: keep(criteria.mustHave),
    niceToHave: keep(criteria.niceToHave),
    places: [...criteria.places],
    weights: criteria.weights ? { ...criteria.weights } : null,
  };
}

/** What would be sent: labels and aliases tidied, empty things dropped. */
export function cleaned(criteria: Criteria): Criteria {
  const chips = (list: Keyword[]) =>
    list
      .map((chip) => ({
        id: chip.id,
        label: tidy(chip.label),
        aliases: aliasesFromText(chip.aliases.join(","), chip.label),
        weight: chip.weight,
      }))
      .filter((chip) => chip.label !== "");
  const places = criteria.places.map(tidy).filter((place) => place !== "");
  return {
    mustHave: chips(criteria.mustHave),
    niceToHave: chips(criteria.niceToHave),
    minYears: criteria.minYears,
    education: criteria.education,
    places,
    /* Location questions mean nothing without a place to look for. */
    locationQuestionId: places.length > 0 ? criteria.locationQuestionId : null,
    relocateQuestionId: places.length > 0 ? criteria.relocateQuestionId : null,
    weights: criteria.weights,
  };
}

/** Add chips to a list, leaving out any already in either list. */
export function withChips(
  criteria: Criteria,
  list: "mustHave" | "niceToHave",
  chips: Keyword[],
): Criteria {
  const other = list === "mustHave" ? criteria.niceToHave : criteria.mustHave;
  const fresh = chips.filter(
    (chip) =>
      ![...criteria[list], ...other].some((have) =>
        sameWord(have.label, chip.label),
      ),
  );
  if (fresh.length === 0) return criteria;
  return { ...criteria, [list]: [...criteria[list], ...fresh] };
}

/** How many things are being looked for, for a heading. */
export function criteriaCount(criteria: Criteria): number {
  return (
    criteria.mustHave.length +
    criteria.niceToHave.length +
    (criteria.minYears !== null ? 1 : 0) +
    (criteria.education !== null ? 1 : 0) +
    (criteria.places.length > 0 ? 1 : 0)
  );
}
