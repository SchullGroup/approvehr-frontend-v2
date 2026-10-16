import {
  DEFAULT_SCALE,
  FALLBACK_WEIGHTS,
  compareForm,
  newKeywordId,
} from "./criteria";
import type {
  Confidence,
  Criteria,
  EducationLevel,
  Evidence,
  Explanation,
  ExplanationItem,
  Extraction,
  FitSummary,
  Keyword,
  Suggestion,
  Verdict,
  Weights,
} from "./model";

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
      { level: "secondary", text: "SSCE, Government College" },
      { level: "diploma", text: "OND in Business Administration" },
      { level: "hnd", text: "HND, Computer Science" },
      { level: "bachelors", text: "BSc, University of Lagos" },
      { level: "masters", text: "MSc, University of Ibadan" },
      { level: "doctorate", text: "PhD, Covenant University" },
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

  const lines: string[] = [applicant.name, ""];
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

function snippet(text: string, index: number, length: number): Evidence {
  const clip = (value: string) => value.replace(/\s+/g, " ");
  const beforeRaw = text.slice(Math.max(0, index - SNIPPET_SIDE), index);
  const afterRaw = text.slice(index + length, index + length + SNIPPET_SIDE);
  return {
    before: (index - SNIPPET_SIDE > 0 ? "…" : "") + clip(beforeRaw),
    match: clip(text.slice(index, index + length)),
    after:
      clip(afterRaw) + (index + length + SNIPPET_SIDE < text.length ? "…" : ""),
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
  { value: "doctorate", pattern: /\b(ph\.?d|doctorate|doctoral)\b/i },
  { value: "masters", pattern: /\b(m\.?sc|m\.?b\.?a|master'?s|m\.?eng)\b/i },
  {
    value: "bachelors",
    pattern: /\b(b\.?sc|b\.?eng|b\.?tech|bachelor'?s?|llb)\b/i,
  },
  { value: "hnd", pattern: /\b(hnd|higher national diploma)\b/i },
  { value: "diploma", pattern: /\b(ond|nce|diploma)\b/i },
  { value: "secondary", pattern: /\b(ssce|waec|neco|secondary school)\b/i },
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

type Credit = {
  verdict: Verdict;
  confidence: Confidence | null;
  evidence: Evidence[];
  note: string | null;
};

const unknown = (note: string): Credit => ({
  verdict: "UNKNOWN",
  confidence: null,
  evidence: [],
  note,
});

function keywordCredit(text: string, chip: Keyword): Credit {
  const labelHit = findAny(text, [chip.label]);
  if (labelHit) {
    return {
      verdict: "MATCHED",
      confidence: "HIGH",
      evidence: [snippet(text, labelHit.index, labelHit.length)],
      note: null,
    };
  }
  const aliasHit = findAny(text, chip.aliases);
  if (aliasHit) {
    return {
      verdict: "MATCHED",
      confidence: "MEDIUM",
      evidence: [snippet(text, aliasHit.index, aliasHit.length)],
      note: `Found as "${aliasHit.term}", another way of writing it.`,
    };
  }
  /* More than one word and only some of them: partly, and not very sure. */
  const words = chip.label.split(/\s+/).filter((word) => word.length > 2);
  if (words.length > 1) {
    const hits = words
      .map((word) => ({ word, hit: findAny(text, [word]) }))
      .filter((entry) => entry.hit !== null);
    const first = hits[0]?.hit;
    if (hits.length > 0 && hits.length < words.length && first) {
      return {
        verdict: "PARTIAL",
        confidence: "LOW",
        evidence: [snippet(text, first.index, first.length)],
        note: `Only "${hits.map((entry) => entry.word).join('", "')}" of it appears.`,
      };
    }
  }
  return {
    verdict: "MISSING",
    confidence: null,
    evidence: [],
    note: "The CV was read and does not mention it.",
  };
}

function yearsCredit(text: string, minYears: number): Credit {
  const found = [...text.matchAll(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/gi)];
  if (found.length === 0) return unknown("The CV gives no number of years.");
  let best = found[0];
  for (const match of found) {
    if (best === undefined || Number(match[1]) > Number(best[1])) best = match;
  }
  if (!best) return unknown("The CV gives no number of years.");
  const years = Number(best[1]);
  const evidence = [snippet(text, best.index ?? 0, best[0].length)];
  if (years >= minYears) {
    return { verdict: "MATCHED", confidence: "HIGH", evidence, note: null };
  }
  if (years * 2 >= minYears) {
    return {
      verdict: "PARTIAL",
      confidence: "MEDIUM",
      evidence,
      note: `The CV says ${String(years)}, and the ask is ${String(minYears)}.`,
    };
  }
  return {
    verdict: "MISSING",
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
  const evidence = [snippet(text, have.index, have.length)];
  if (need === -1 || have.rank >= need) {
    return { verdict: "MATCHED", confidence: "HIGH", evidence, note: null };
  }
  if (have.rank === need - 1) {
    return {
      verdict: "PARTIAL",
      confidence: "MEDIUM",
      evidence,
      note: "One level below what was asked.",
    };
  }
  return {
    verdict: "MISSING",
    confidence: "MEDIUM",
    evidence,
    note: "Below the level asked.",
  };
}

function placeCredit(text: string, place: string, relocation: boolean): Credit {
  const here = findAny(text, [place]);
  if (here) {
    return {
      verdict: "MATCHED",
      confidence: "HIGH",
      evidence: [snippet(text, here.index, here.length)],
      note: null,
    };
  }
  const moving = relocation ? /relocat/i.exec(text) : null;
  if (moving) {
    return {
      verdict: "PARTIAL",
      confidence: "MEDIUM",
      evidence: [snippet(text, moving.index, moving[0].length)],
      note: "Based elsewhere and willing to relocate.",
    };
  }
  const based = /based in ([A-Z][A-Za-z ]+)/.exec(text);
  if (based) {
    return {
      verdict: "MISSING",
      confidence: "MEDIUM",
      evidence: [snippet(text, based.index, based[0].length)],
      note: "Based somewhere else, and does not say they would move.",
    };
  }
  return unknown("The CV does not say where the person is.");
}

export const DEMO_FORMULA =
  "Points earned out of the points that could be checked, scaled to 100. A full match earns a part's points, a partial match half, a miss none, and anything the CV does not say is left out.";

export function noExplanation(
  status: Explanation["status"],
  extraction: Extraction,
  version: number | null,
  currentVersion: number | null,
): Explanation {
  return {
    status,
    score: null,
    formula: null,
    version,
    currentVersion,
    stale: false,
    items: [],
    extraction,
  };
}

/**
 * Score one CV against one set of criteria.
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
      { state: "COULD_NOT_READ", reason: profile.reason, canRetry: true },
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

  type Draft = {
    id: string;
    kind: ExplanationItem["kind"];
    label: string;
    weight: number;
    credit: Credit;
  };
  const drafts: Draft[] = [];
  const chips = (list: Keyword[], kind: "MUST_HAVE" | "NICE_TO_HAVE") => {
    const each =
      list.length === 0
        ? 0
        : weights[kind === "MUST_HAVE" ? "mustHave" : "niceToHave"] /
          list.length;
    for (const chip of list) {
      drafts.push({
        id: `${kind}:${compareForm(chip.label)}`,
        kind,
        label: chip.label,
        weight: each,
        credit: keywordCredit(text, chip),
      });
    }
  };
  chips(criteria.mustHave, "MUST_HAVE");
  chips(criteria.niceToHave, "NICE_TO_HAVE");
  if (criteria.minYears !== null) {
    drafts.push({
      id: "YEARS",
      kind: "YEARS",
      label: `At least ${String(criteria.minYears)} ${criteria.minYears === 1 ? "year" : "years"}`,
      weight: weights.years,
      credit: yearsCredit(text, criteria.minYears),
    });
  }
  if (criteria.education !== null) {
    const level = scale.find((entry) => entry.value === criteria.education);
    drafts.push({
      id: "EDUCATION",
      kind: "EDUCATION",
      label: level?.label ?? "An education level",
      weight: weights.education,
      credit: educationCredit(text, criteria.education, scale),
    });
  }
  if (criteria.place) {
    drafts.push({
      id: "LOCATION",
      kind: "LOCATION",
      label: criteria.relocation
        ? `${criteria.place}, or willing to relocate`
        : criteria.place,
      weight: weights.location,
      credit: placeCredit(text, criteria.place, criteria.relocation),
    });
  }

  const checkable = drafts
    .filter((draft) => draft.credit.verdict !== "UNKNOWN")
    .reduce((sum, draft) => sum + draft.weight, 0);

  if (checkable === 0) {
    /* Nothing asked could be checked: not a zero, a person has to read it. */
    return {
      ...noExplanation(
        "NO_TEXT",
        {
          state: "NO_TEXT",
          reason: "Nothing in this CV could be checked against the criteria.",
          canRetry: false,
        },
        version,
        currentVersion,
      ),
    };
  }

  const scale100 = 100 / checkable;
  const round1 = (value: number) => Math.round(value * 10) / 10;
  const items: ExplanationItem[] = drafts.map((draft) => {
    const counted = draft.credit.verdict !== "UNKNOWN";
    const outOf = counted ? draft.weight * scale100 : 0;
    const share =
      draft.credit.verdict === "MATCHED"
        ? 1
        : draft.credit.verdict === "PARTIAL"
          ? 0.5
          : 0;
    return {
      id: draft.id,
      kind: draft.kind,
      label: draft.label,
      verdict: draft.credit.verdict,
      confidence: draft.credit.confidence,
      points: round1(outOf * share),
      outOf: round1(outOf),
      evidence: draft.credit.evidence,
      note: draft.credit.note,
    };
  });
  const earned = drafts.reduce((sum, draft, index) => {
    const share =
      draft.credit.verdict === "MATCHED"
        ? 1
        : draft.credit.verdict === "PARTIAL"
          ? 0.5
          : 0;
    return sum + (items[index] ? draft.weight * scale100 * share : 0);
  }, 0);

  return {
    status: "SCORED",
    score: Math.max(0, Math.min(100, Math.round(earned))),
    formula: DEMO_FORMULA,
    version,
    currentVersion,
    stale: currentVersion !== null && version < currentVersion,
    items,
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
      { id: "", label: "Node.js", aliases: ["NodeJS", "Node"] },
      { id: "", label: "Go", aliases: ["Golang"] },
      { id: "", label: "PostgreSQL", aliases: ["Postgres"] },
      { id: "", label: "REST APIs", aliases: ["REST API", "RESTful"] },
      { id: "", label: "TypeScript", aliases: [] },
      { id: "", label: "AWS", aliases: ["Amazon Web Services"] },
      { id: "", label: "Terraform", aliases: [] },
      { id: "", label: "Docker", aliases: [] },
      { id: "", label: "Payroll", aliases: ["PAYE"] },
      { id: "", label: "PAYE", aliases: [] },
      { id: "", label: "Pension", aliases: ["pensions"] },
      { id: "", label: "Excel", aliases: ["spreadsheets"] },
      { id: "", label: "ICAN", aliases: [] },
      { id: "", label: "ACCA", aliases: [] },
      { id: "", label: "Figma", aliases: [] },
      { id: "", label: "Design systems", aliases: ["design system"] },
      { id: "", label: "Prototyping", aliases: ["prototypes"] },
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
    }));

  const mustHave = pick(mustPart, new Set());
  const have = new Set(mustHave.map((chip) => compareForm(chip.label)));
  const niceToHave = pick(nicePart, have);

  const years = /(\d{1,2})\s*\+?\s*years?/i.exec(text);
  let education: string | null = null;
  if (/degree|b\.?sc|bachelor/i.test(text)) education = "bachelors";
  else if (/\bhnd\b/i.test(text)) education = "hnd";

  return {
    mustHave,
    niceToHave,
    minYears: years ? Number(years[1]) : null,
    education,
    note: "Taken from the words in the advert. Check every one before you keep it.",
  };
}
