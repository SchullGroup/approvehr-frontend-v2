import {
  DEFAULT_SCALE,
  FALLBACK_WEIGHTS,
  compareForm,
  newKeywordId,
} from "./criteria";
import type {
  Confidence,
  Criteria,
  CriterionKind,
  EducationLevel,
  Evidence,
  Explanation,
  ExplanationGroup,
  ExplanationItem,
  Extraction,
  FitSummary,
  Keyword,
  Suggestion,
  Verdict,
  Weights,
} from "./model";
import { FORMULA_LINE } from "./score";

/**
 * The demo's scorer: plain rules over invented CVs.
 *
 * It exists so the screens can be tried on a laptop with no server, and it works
 * the way the real thing is described to work: it looks for the words somebody
 * wrote on the criteria in the text of the CV, reads a number of years and an
 * education level out of the text, and adds up what it found. Nothing here is
 * clever, and nothing leaves the browser.
 *
 * Every CV in this file is made up, from a formula, so the demo reads the same
 * every time. The names on them come from the demo's own seeded applicants.
 */

/* ------------------------------------------------------------------- the text */

type CvState = "TEXT" | "NO_TEXT" | "WAITING" | "COULD_NOT_READ";

export type CvProfile = {
  state: CvState;
  /** Why the file could not be read, when it could not. */
  reason: string | null;
  text: string | null;
};

type Family = {
  /** Words the role's title or text carries, to pick the family. */
  match: RegExp;
  skills: { label: string; sentence: string }[];
  place: string[];
};

const FAMILIES: Family[] = !DEMO_ENABLED
  ? []
  : [
      {
        match: /engineer|developer|backend|software/i,
        skills: [
          {
            label: "Node.js",
            sentence:
              "Built and ran services in Node.js for a payments company.",
          },
          {
            label: "PostgreSQL",
            sentence: "Designed PostgreSQL schemas and tuned slow queries.",
          },
          {
            label: "REST APIs",
            sentence: "Shipped REST APIs used by mobile apps and partners.",
          },
          { label: "Go", sentence: "Wrote high-throughput workers in Go." },
          {
            label: "TypeScript",
            sentence: "Moved a large codebase to TypeScript.",
          },
          {
            label: "AWS",
            sentence: "Deployed to AWS with containers and managed databases.",
          },
          {
            label: "Terraform",
            sentence: "Kept the infrastructure in Terraform.",
          },
          { label: "Docker", sentence: "Packaged services in Docker." },
          {
            label: "Payroll",
            sentence: "Worked on a payroll product, including PAYE rules.",
          },
        ],
        place: ["Lagos", "Abuja", "Ibadan", "Port Harcourt", "Accra"],
      },
      {
        match: /payroll|finance|account/i,
        skills: [
          { label: "Payroll", sentence: "Ran monthly payroll for 400 staff." },
          {
            label: "PAYE",
            sentence: "Prepared PAYE returns and reconciled them.",
          },
          {
            label: "Pension",
            sentence: "Handled pension remittances for three schemes.",
          },
          {
            label: "Excel",
            sentence: "Built reconciliation workbooks in Excel.",
          },
          { label: "ICAN", sentence: "Part-qualified with ICAN." },
          { label: "ACCA", sentence: "Studying for ACCA." },
          {
            label: "Reconciliation",
            sentence: "Reconciled payroll to the ledger each month.",
          },
        ],
        place: ["Lagos", "Abuja", "Ibadan", "Kano"],
      },
      {
        match: /design|product/i,
        skills: [
          {
            label: "Figma",
            sentence: "Designed screens and prototypes in Figma.",
          },
          {
            label: "Design systems",
            sentence: "Maintained a design system used by six teams.",
          },
          {
            label: "Prototyping",
            sentence: "Prototyped flows and tested them with users.",
          },
          { label: "User research", sentence: "Ran user research interviews." },
          {
            label: "Accessibility",
            sentence: "Checked designs for accessibility.",
          },
        ],
        place: ["Lagos", "Abuja", "Enugu"],
      },
      {
        match: /./,
        skills: [
          { label: "Excel", sentence: "Kept records and reports in Excel." },
          {
            label: "Customer service",
            sentence: "Handled customer queries by phone and email.",
          },
          {
            label: "Scheduling",
            sentence: "Planned schedules for a team of ten.",
          },
          {
            label: "Reporting",
            sentence: "Wrote weekly reports for management.",
          },
        ],
        place: ["Lagos", "Abuja", "Port Harcourt"],
      },
    ];

const DEGREES: { level: string; text: string }[] = !DEMO_ENABLED
  ? []
  : [
      { level: "SECONDARY", text: "SSCE, Government College" },
      { level: "DIPLOMA", text: "OND in Business Administration" },
      { level: "HND", text: "HND, Computer Science" },
      { level: "BACHELORS", text: "BSc, University of Lagos" },
      { level: "MASTERS", text: "MSc, University of Ibadan" },
      { level: "DOCTORATE", text: "PhD, Covenant University" },
    ];

/** A small, stable number from a string. */
export function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** A stable number in [0, 1) for a string and a salt. */
const unit = (text: string, salt: number): number =>
  hash(`${text}#${String(salt)}`) / 4294967296;

export type DemoApplicant = {
  id: string;
  email: string;
  name: string;
  postingId: string;
  /** The advert's title, which decides what the CV is about. */
  role: string;
};

/**
 * Somebody's CV. Which of the demo's kinds of file it is comes from `special`,
 * which the caller chooses for a few people so every state is on screen; the rest
 * are ordinary, readable CVs written from the person's email.
 */
export function profileFor(
  applicant: DemoApplicant,
  special: CvState | null,
): CvProfile {
  if (special === "NO_TEXT") {
    return {
      state: "NO_TEXT",
      reason:
        "This CV is a scan of paper. There are no words in the file to read.",
      text: null,
    };
  }
  if (special === "WAITING") {
    return { state: "WAITING", reason: null, text: null };
  }
  if (special === "COULD_NOT_READ") {
    return {
      state: "COULD_NOT_READ",
      reason:
        "The file is protected with a password, so it could not be opened.",
      text: null,
    };
  }

  const family =
    FAMILIES.find((candidate) => candidate.match.test(applicant.role)) ??
    FAMILIES[FAMILIES.length - 1];
  if (!family) return { state: "NO_TEXT", reason: null, text: null };
  const key = applicant.email.toLowerCase();

  const skills = family.skills.filter((_, index) => unit(key, index) < 0.55);
  const years =
    unit(key, 40) < 0.15 ? null : 1 + Math.floor(unit(key, 41) * 11);
  const degree =
    unit(key, 42) < 0.1
      ? null
      : (DEGREES[Math.floor(unit(key, 43) * DEGREES.length)] ?? null);
  const place =
    unit(key, 44) < 0.08
      ? null
      : (family.place[Math.floor(unit(key, 45) * family.place.length)] ?? null);
  const relocating = unit(key, 46) < 0.3;

  /* No name, no email: the scorer is never given who somebody is, which is also
     how the real one is built. */
  const lines: string[] = ["Curriculum vitae", ""];
  if (place) {
    lines.push(
      `Based in ${place}.${relocating ? " Willing to relocate for the right role." : ""}`,
    );
  }
  lines.push(
    years === null
      ? "Hard-working professional looking for a new challenge."
      : `${String(years)} years of experience across ${skills.length > 0 ? "several roles" : "general work"}.`,
  );
  lines.push("", "Experience");
  for (const skill of skills) lines.push(skill.sentence);
  if (skills.length === 0)
    lines.push("Worked in a small team and learned quickly.");
  lines.push("", "Education", degree ? degree.text : "Available on request.");
  return { state: "TEXT", reason: null, text: lines.join("\n") };
}

/* -------------------------------------------------------------------- reading */

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A whole-word finder for one term, tolerant of "Node.js" and "C#". Case does not
 * matter, except for a term of one or two letters ("Go", "R"), where it has to:
 * otherwise the verb in "go to market" would be a skill.
 */
function finder(term: string): RegExp {
  const trimmed = term.trim();
  const body = escapeRegExp(trimmed).replace(/\s+/g, "\\s+");
  return new RegExp(
    `(?<![A-Za-z0-9])${body}(?![A-Za-z0-9])`,
    trimmed.length <= 2 ? "" : "i",
  );
}

const SNIPPET_SIDE = 36;

/** A stretch of the text around a match, on one line, with the words to mark. */
function snippet(
  text: string,
  index: number,
  length: number,
  marks: string[],
): Evidence {
  const clip = (value: string) => value.replace(/\s+/g, " ");
  const from = Math.max(0, index - SNIPPET_SIDE);
  const to = Math.min(text.length, index + length + SNIPPET_SIDE);
  return {
    source: "cv",
    text:
      (from > 0 ? "…" : "") +
      clip(text.slice(from, to)).trim() +
      (to < text.length ? "…" : ""),
    marks,
  };
}

/** The first place any of the terms appears, with which term it was. */
function findAny(
  text: string,
  terms: string[],
): { term: string; index: number; length: number } | null {
  let best: { term: string; index: number; length: number } | null = null;
  for (const term of terms) {
    const found = finder(term).exec(text);
    if (found && (best === null || found.index < best.index)) {
      best = { term, index: found.index, length: found[0].length };
    }
  }
  return best;
}

/** The highest level a CV names, as an index into the scale. */
const LEVEL_WORDS: { value: string; pattern: RegExp }[] = [
  { value: "DOCTORATE", pattern: /\b(ph\.?d|doctorate|doctoral)\b/i },
  { value: "MASTERS", pattern: /\b(m\.?sc|m\.?b\.?a|master'?s|m\.?eng)\b/i },
  {
    value: "POSTGRAD_DIPLOMA",
    pattern: /\b(pgde?|postgraduate diploma)\b/i,
  },
  {
    value: "BACHELORS",
    pattern: /\b(b\.?sc|b\.?eng|b\.?tech|bachelor'?s?|llb)\b/i,
  },
  { value: "HND", pattern: /\b(hnd|higher national diploma)\b/i },
  { value: "DIPLOMA", pattern: /\b(ond|nce|diploma)\b/i },
  { value: "SECONDARY", pattern: /\b(ssce|waec|neco|secondary school)\b/i },
];

function highestLevel(
  text: string,
  scale: EducationLevel[],
): { rank: number; index: number; length: number } | null {
  let best: { rank: number; index: number; length: number } | null = null;
  for (const word of LEVEL_WORDS) {
    const rank = scale.findIndex((level) => level.value === word.value);
    if (rank === -1) continue;
    const found = word.pattern.exec(text);
    if (found && (best === null || rank > best.rank)) {
      best = { rank, index: found.index, length: found[0].length };
    }
  }
  return best;
}

/* -------------------------------------------------------------------- scoring */

/** What one thing asked for came to: how it reads, and how much credit it earned. */
type Credit = {
  verdict: Verdict;
  /** 0 to 1, or `null` when it could not be judged. */
  value: number | null;
  confidence: Confidence | null;
  evidence: Evidence[];
  note: string | null;
};

const unknown = (note: string): Credit => ({
  verdict: "UNKNOWN",
  value: null,
  confidence: null,
  evidence: [],
  note,
});

function keywordCredit(text: string, chip: Keyword): Credit {
  const labelHit = findAny(text, [chip.label]);
  if (labelHit) {
    return {
      verdict: "MATCHED",
      value: 1,
      confidence: "HIGH",
      evidence: [
        snippet(text, labelHit.index, labelHit.length, [
          chip.label,
          ...chip.aliases,
        ]),
      ],
      note: null,
    };
  }
  const aliasHit = findAny(text, chip.aliases);
  if (aliasHit) {
    return {
      verdict: "MATCHED",
      value: 1,
      confidence: "MEDIUM",
      evidence: [
        snippet(text, aliasHit.index, aliasHit.length, [
          chip.label,
          ...chip.aliases,
        ]),
      ],
      note: `Found as "${aliasHit.term}", another way of writing it.`,
    };
  }
  return {
    verdict: "MISSING",
    value: 0,
    confidence: "HIGH",
    evidence: [],
    note: "The CV was read and does not mention it.",
  };
}

function yearsCredit(text: string, minYears: number): Credit {
  const found = [...text.matchAll(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/gi)];
  let best = found[0];
  for (const match of found) {
    if (best === undefined || Number(match[1]) > Number(best[1])) best = match;
  }
  if (!best) return unknown("The CV gives no number of years.");
  const years = Number(best[1]);
  const evidence = [snippet(text, best.index ?? 0, best[0].length, [best[0]])];
  if (years >= minYears) {
    return {
      verdict: "MATCHED",
      value: 1,
      confidence: "HIGH",
      evidence,
      note: null,
    };
  }
  if (years * 2 >= minYears) {
    return {
      verdict: "PARTIAL",
      value: years / minYears,
      confidence: "MEDIUM",
      evidence,
      note: `The CV says ${String(years)}, and the ask is ${String(minYears)}.`,
    };
  }
  return {
    verdict: "MISSING",
    value: 0,
    confidence: "MEDIUM",
    evidence,
    note: `The CV says ${String(years)}, and the ask is ${String(minYears)}.`,
  };
}

function educationCredit(
  text: string,
  required: string,
  scale: EducationLevel[],
): Credit {
  const need = scale.findIndex((level) => level.value === required);
  const have = highestLevel(text, scale);
  if (!have) return unknown("The CV does not name a qualification.");
  const evidence = [
    snippet(text, have.index, have.length, [
      text.slice(have.index, have.index + have.length),
    ]),
  ];
  if (need === -1 || have.rank >= need) {
    return {
      verdict: "MATCHED",
      value: 1,
      confidence: "HIGH",
      evidence,
      note: null,
    };
  }
  if (have.rank === need - 1) {
    return {
      verdict: "PARTIAL",
      value: 0.5,
      confidence: "MEDIUM",
      evidence,
      note: "One level below what was asked.",
    };
  }
  return {
    verdict: "MISSING",
    value: 0,
    confidence: "MEDIUM",
    evidence,
    note: "Below the level asked.",
  };
}

function placeCredit(
  text: string,
  places: string[],
  relocating: boolean,
): Credit {
  const here = findAny(text, places);
  if (here) {
    return {
      verdict: "MATCHED",
      value: 1,
      confidence: "HIGH",
      evidence: [snippet(text, here.index, here.length, [here.term])],
      note: null,
    };
  }
  const based = /based in ([A-Za-z][A-Za-z ]+)/i.exec(text);
  if (!based) return unknown("The CV does not say where the person is.");
  const moving = relocating ? /relocat\w*/i.exec(text) : null;
  if (moving) {
    return {
      verdict: "PARTIAL",
      value: 0.5,
      confidence: "MEDIUM",
      evidence: [snippet(text, moving.index, moving[0].length, [moving[0]])],
      note: "Based elsewhere and willing to relocate.",
    };
  }
  return {
    verdict: "MISSING",
    value: 0,
    confidence: "MEDIUM",
    evidence: [snippet(text, based.index, based[0].length, [based[0]])],
    note: "Based somewhere else, and does not say they would move.",
  };
}

export function noExplanation(
  status: Explanation["status"],
  extraction: Extraction,
  version: number | null,
  currentVersion: number | null,
): Explanation {
  return {
    status,
    score: null,
    coverage: null,
    formula: null,
    version,
    currentVersion,
    stale: false,
    groups: [],
    items: [],
    extraction,
  };
}

const GROUP_OF: Record<CriterionKind, keyof Weights> = {
  MUST_HAVE: "mustHave",
  NICE_TO_HAVE: "niceToHave",
  YEARS: "experience",
  EDUCATION: "education",
  LOCATION: "location",
};

/**
 * Score one CV against one set of criteria.
 *
 * The same sum the real thing does: each part of the criteria is worth a weight,
 * a part's value is the weighted mean of what in it could be judged, and the score
 * is the weighted value out of the weight that could be judged at all. What a CV
 * does not say is left out of both sides, so nobody is marked down for it.
 *
 * `version` is the version these criteria were saved as and `currentVersion` the
 * job's latest: when they differ the explanation says it is stale.
 */
export function explain(
  profile: CvProfile,
  criteria: Criteria | null,
  options: {
    version: number | null;
    currentVersion: number | null;
    defaults?: Weights;
    scale?: EducationLevel[];
  },
): Explanation {
  const { version, currentVersion } = options;
  const defaults = options.defaults ?? FALLBACK_WEIGHTS;
  const scale = options.scale ?? DEFAULT_SCALE;

  if (profile.state === "WAITING") {
    return noExplanation(
      "WAITING_FOR_TEXT",
      { state: "PENDING", reason: null, canRetry: false },
      version,
      currentVersion,
    );
  }
  if (profile.state === "NO_TEXT") {
    return noExplanation(
      "NO_TEXT",
      { state: "NO_TEXT", reason: profile.reason, canRetry: false },
      version,
      currentVersion,
    );
  }
  if (profile.state === "COULD_NOT_READ") {
    return noExplanation(
      "COULD_NOT_READ",
      { state: "COULD_NOT_READ", reason: profile.reason, canRetry: false },
      version,
      currentVersion,
    );
  }
  const ready: Extraction = { state: "READY", reason: null, canRetry: false };
  if (!criteria || version === null || profile.text === null) {
    return noExplanation("NO_CRITERIA", ready, null, currentVersion);
  }

  const text = profile.text;
  const weights = criteria.weights ?? defaults;

  type Draft = { item: ExplanationItem; weight: number };
  const drafts: Draft[] = [];
  const skills = (list: Keyword[], kind: "MUST_HAVE" | "NICE_TO_HAVE") => {
    list.forEach((chip, index) => {
      const credit = keywordCredit(text, chip);
      drafts.push({
        weight: chip.weight,
        item: {
          id: `${kind === "MUST_HAVE" ? "must" : "nice"}:${String(index)}`,
          kind,
          label: chip.label,
          verdict: credit.verdict,
          confidence: credit.confidence,
          value: credit.value,
          evidence: credit.evidence,
          note: credit.note,
        },
      });
    });
  };
  skills(criteria.mustHave, "MUST_HAVE");
  skills(criteria.niceToHave, "NICE_TO_HAVE");
  const single = (
    id: string,
    kind: CriterionKind,
    label: string,
    credit: Credit,
  ) =>
    drafts.push({
      weight: 1,
      item: {
        id,
        kind,
        label,
        verdict: credit.verdict,
        confidence: credit.confidence,
        value: credit.value,
        evidence: credit.evidence,
        note: credit.note,
      },
    });
  if (criteria.minYears !== null) {
    single(
      "experience",
      "YEARS",
      `At least ${String(criteria.minYears)} ${criteria.minYears === 1 ? "year" : "years"}`,
      yearsCredit(text, criteria.minYears),
    );
  }
  if (criteria.education !== null) {
    const level = scale.find((entry) => entry.value === criteria.education);
    single(
      "education",
      "EDUCATION",
      level?.label ?? "An education level",
      educationCredit(text, criteria.education, scale),
    );
  }
  if (criteria.places.length > 0) {
    single(
      "location",
      "LOCATION",
      criteria.places.join(" or "),
      placeCredit(text, criteria.places, criteria.relocateQuestionId !== null),
    );
  }

  const kinds: CriterionKind[] = [
    "MUST_HAVE",
    "NICE_TO_HAVE",
    "YEARS",
    "EDUCATION",
    "LOCATION",
  ];
  const groups: ExplanationGroup[] = kinds
    .filter((kind) => drafts.some((draft) => draft.item.kind === kind))
    .map((kind) => {
      const judged = drafts.filter(
        (draft) => draft.item.kind === kind && draft.item.value !== null,
      );
      const total = judged.reduce((sum, draft) => sum + draft.weight, 0);
      const value =
        total === 0
          ? null
          : judged.reduce(
              (sum, draft) => sum + draft.weight * (draft.item.value ?? 0),
              0,
            ) / total;
      return {
        kind,
        weight: weights[GROUP_OF[kind]],
        value,
        judged: value !== null && weights[GROUP_OF[kind]] > 0,
      };
    });

  const counted = groups.filter((group) => group.judged);
  const allWeight = groups.reduce((sum, group) => sum + group.weight, 0);
  const countedWeight = counted.reduce((sum, group) => sum + group.weight, 0);
  if (countedWeight === 0) {
    /* Nothing asked could be checked: not a zero, a person has to read it. */
    return noExplanation(
      "NO_TEXT",
      {
        state: "NO_TEXT",
        reason: "Nothing in this CV could be checked against the criteria.",
        canRetry: false,
      },
      version,
      currentVersion,
    );
  }
  const earned = counted.reduce(
    (sum, group) => sum + group.weight * (group.value ?? 0),
    0,
  );

  return {
    status: "SCORED",
    score: Math.max(
      0,
      Math.min(100, Math.round((100 * earned) / countedWeight)),
    ),
    coverage:
      allWeight === 0 ? 0 : Math.round((100 * countedWeight) / allWeight),
    formula: FORMULA_LINE,
    version,
    currentVersion,
    stale: currentVersion !== null && version < currentVersion,
    groups,
    items: drafts.map((draft) => draft.item),
    extraction: ready,
  };
}

export function fitOf(explanation: Explanation): FitSummary {
  return {
    status: explanation.status,
    score: explanation.status === "SCORED" ? explanation.score : null,
    version: explanation.version,
    stale: explanation.stale,
  };
}

/* ------------------------------------------------------------------ suggesting */

const SUGGEST_VOCABULARY: Keyword[] = !DEMO_ENABLED
  ? []
  : [
      { id: "", label: "Node.js", aliases: ["NodeJS", "Node"], weight: 1 },
      { id: "", label: "Go", aliases: ["Golang"], weight: 1 },
      { id: "", label: "PostgreSQL", aliases: ["Postgres"], weight: 1 },
      {
        id: "",
        label: "REST APIs",
        aliases: ["REST API", "RESTful"],
        weight: 1,
      },
      { id: "", label: "TypeScript", aliases: [], weight: 1 },
      { id: "", label: "AWS", aliases: ["Amazon Web Services"], weight: 1 },
      { id: "", label: "Terraform", aliases: [], weight: 1 },
      { id: "", label: "Docker", aliases: [], weight: 1 },
      { id: "", label: "Payroll", aliases: ["PAYE"], weight: 1 },
      { id: "", label: "PAYE", aliases: [], weight: 1 },
      { id: "", label: "Pension", aliases: ["pensions"], weight: 1 },
      { id: "", label: "Excel", aliases: ["spreadsheets"], weight: 1 },
      { id: "", label: "ICAN", aliases: [], weight: 1 },
      { id: "", label: "ACCA", aliases: [], weight: 1 },
      { id: "", label: "Figma", aliases: [], weight: 1 },
      {
        id: "",
        label: "Design systems",
        aliases: ["design system"],
        weight: 1,
      },
      { id: "", label: "Prototyping", aliases: ["prototypes"], weight: 1 },
    ];

/**
 * Chips from an advert's own words. Looks for a list of known skills, a number of
 * years and a qualification, and puts what it finds under "must have" when the
 * text near it says "need", "must" or "required", and under "nice to have" when it
 * says "nice", "plus" or "bonus". The person accepts or edits every chip.
 */
export function suggestFrom(description: string): Suggestion {
  const text = description;
  const niceAt = text.search(/nice to have|a plus|bonus|preferred/i);
  const mustPart = niceAt === -1 ? text : text.slice(0, niceAt);
  const nicePart = niceAt === -1 ? "" : text.slice(niceAt);

  const pick = (part: string, skip: Set<string>): Keyword[] =>
    SUGGEST_VOCABULARY.filter(
      (entry) =>
        !skip.has(compareForm(entry.label)) &&
        findAny(part, [entry.label, ...entry.aliases]) !== null,
    ).map((entry) => ({
      id: newKeywordId(),
      label: entry.label,
      aliases: [...entry.aliases],
      weight: 1,
    }));

  const mustHave = pick(mustPart, new Set());
  const have = new Set(mustHave.map((chip) => compareForm(chip.label)));
  const niceToHave = pick(nicePart, have);

  const years = /(\d{1,2})\s*\+?\s*years?/i.exec(text);
  let education: string | null = null;
  if (/degree|b\.?sc|bachelor/i.test(text)) education = "BACHELORS";
  else if (/\bhnd\b/i.test(text)) education = "HND";

  return {
    mustHave,
    niceToHave,
    minYears: years ? Number(years[1]) : null,
    education,
    note: "Taken from the words in the advert. Check every one before you keep it.",
  };
}
