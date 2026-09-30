/**
 * Language in a written review that a mark could not be defended on.
 *
 * Why not the assistant: `/settings/ai` and the DPA both promise no written
 * appraisal comment leaves the platform, so a model-based coach isn't an
 * option here — it would send a manager's judgement of a named colleague to a
 * third party. Being rule-based instead is a net win: it works with no
 * credential, runs instantly while someone types, and can quote the exact
 * phrase matched rather than offer an opinion ("you wrote *she is
 * disorganised*" is a fact; "this reads as judgemental" is an argument).
 *
 * What it's for: a mark has to be defensible — "she is disorganised" can't be
 * pointed at; "three deadlines moved without notice in October" can.
 *
 * Never blocks sending. Every finding is advice; the API and the form both
 * accept the review either way.
 *
 * Deliberately precision over recall: the character rules require a person as
 * the subject (`difficult` alone isn't flagged — "a difficult migration" is
 * ordinary English about work; `he is difficult` is a sentence about a
 * person), so the checker doesn't flag so much that people scroll past it.
 * `SENSITIVE` is the exception and needs no subject — any mention of
 * pregnancy, faith, ethnicity or health is worth a second look regardless of
 * grammar.
 */

export type FindingKind =
  /** A sentence about what somebody is, rather than what they did. */
  | "character"
  /** Unfalsifiable, and one counter-example destroys it in a dispute. */
  | "absolute"
  /** A protected characteristic, which has no place in a mark at all. */
  | "sensitive"
  /** Measured against a colleague rather than against what was agreed. */
  | "comparison";

export type Finding = {
  kind: FindingKind;
  /** The words actually written, quoted back. Never paraphrased. */
  phrase: string;
  /** Where it starts, so a caller could highlight it. */
  at: number;
  /** What is wrong with it. One sentence. */
  says: string;
  /** What to do instead. One sentence, concrete. */
  instead: string;
};

const escape = (word: string): string =>
  word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* -------------------------------------------------------------- the patterns */

/**
 * Who a sentence can be about: pronouns, the formal `the employee` / `this
 * person`, or the subject's own name (the commonest form in practice, e.g.
 * "Chidera is quite disorganised").
 */
const PERSON = String.raw`(?:he|she|they|the employee|this person|the staff|the subordinate)`;

/**
 * The subject's name, as alternatives, or nothing. Full name plus each part
 * of it (a manager writing about Tunde Bakare writes "Tunde"); parts shorter
 * than three characters are dropped since an initial would match inside other
 * words and turn the checker into noise.
 */
function nameAlternatives(subjectName: string | undefined): string[] {
  if (!subjectName) return [];
  const whole = subjectName.trim();
  if (whole === "") return [];
  const parts = whole.split(/\s+/).filter((part) => part.length >= 3);
  /* Longest first so the full name wins over a part of it. */
  return [...new Set([whole, ...parts])]
    .sort((a, b) => b.length - a.length)
    .map(escape);
}

/** The subject already carrying its verb — its own branch because "she's
 *  arrogant" has no room for a second copula. */
const PERSON_CONTRACTED = String.raw`(?:he's|she's|they're)`;

/** The verb linking subject to trait. */
const COPULA = String.raw`(?:is|are|was|were|isn't|aren't|wasn't|weren't|seems|seem|seemed|appears|appear|remains|remain|has been|have been|can be|tends to be|tend to be|comes across as|come across as|strikes me as)`;

/** An optional hedge. "quite lazy" is the same claim as "lazy". */
const HEDGE = String.raw`(?:\s+(?:very|quite|rather|somewhat|a bit|a little|too|generally|often|always|never|fairly|extremely))?`;

/**
 * Traits, not conduct. Each word describes a person's disposition rather than
 * something that can be evidenced by pointing at an event — which is why
 * "late" and "absent" are deliberately excluded: those are attendance facts
 * with records behind them.
 */
const TRAITS = [
  "lazy",
  "disorganised",
  "disorganized",
  "unmotivated",
  "unprofessional",
  "arrogant",
  "difficult",
  "negative",
  "aggressive",
  "emotional",
  "abrasive",
  "immature",
  "careless",
  "incompetent",
  "unreliable",
  "slow",
  "stubborn",
  "rude",
  "dishonest",
  "weak",
  "not a team player",
  "not a good fit",
  "a poor communicator",
  "bad attitude",
  "poor attitude",
  "attitude problem",
];

/**
 * Protected characteristics. More than a style note under Nigerian law —
 * section 42 of the Constitution, the Labour Act, and the Discrimination
 * Against Persons with Disabilities (Prohibition) Act 2018 all bear on this,
 * and the National Industrial Court hears discrimination claims where the
 * written record is the evidence.
 *
 * Ethnicity is listed by name (largest groups, not exhaustive) since a
 * generic "do not mention ethnicity" catches nothing — this is a prompt to
 * look, not a filter to trust.
 */
const SENSITIVE_WORDS = [
  // Pregnancy, family, marital status
  "pregnant",
  "pregnancy",
  "maternity",
  "paternity",
  "her husband",
  "his wife",
  "her children",
  "his children",
  "unmarried",
  "single mother",
  "newly married",
  // Age
  "too old",
  "too young",
  "at his age",
  "at her age",
  "elderly",
  "young man",
  "young lady",
  "young girl",
  // Health and disability
  "disability",
  "disabled",
  "handicapped",
  "mental health",
  "depressed",
  "depression",
  "chronic illness",
  "always sick",
  "sickly",
  // Faith
  "muslim",
  "christian",
  "church",
  "mosque",
  "ramadan",
  "prayer",
  // Ethnicity and origin
  "igbo",
  "yoruba",
  "hausa",
  "fulani",
  "ijaw",
  "kanuri",
  "tiv",
  "efik",
  "ibibio",
  "northerner",
  "southerner",
  "tribe",
  "tribal",
];

/** Measured against a colleague rather than against what was agreed. */
const COMPARISONS = [
  "better than",
  "worse than",
  "unlike his",
  "unlike her",
  "unlike their",
  "compared to his colleague",
  "compared to her colleague",
  "the weakest",
  "the worst",
  "bottom of the team",
];

/* ------------------------------------------------------------------ matching */

/**
 * Every match of `pattern`, as findings. Rebuilt per call rather than kept at
 * module scope — a shared `g` regex carries `lastIndex` between calls and
 * would silently skip part of the next text it's given.
 */
function findAll(
  text: string,
  source: string,
  kind: FindingKind,
  says: string,
  instead: string,
): Finding[] {
  const pattern = new RegExp(source, "gi");
  const found: Finding[] = [];
  let match: RegExpExecArray | null = pattern.exec(text);
  while (match !== null) {
    found.push({
      kind,
      phrase: match[0].trim(),
      at: match.index,
      says,
      instead,
    });
    /* Guards against an infinite loop on a zero-width match. */
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    match = pattern.exec(text);
  }
  return found;
}

/**
 * What is worth a second look in one piece of written review text. Returns
 * them in order of appearance, deduplicated by position, capped at
 * `MAX_FINDINGS`. Empty means nothing matched — this checker never confirms a
 * review is *good*, only that these specific things are absent.
 */
export function reviewLanguageFindings(
  text: string,
  /** The person the review is about, so "Chidera is..." is caught too. */
  subjectName?: string,
): Finding[] {
  if (text.trim().length === 0) return [];

  /* The name is an extra way of naming the subject, never a replacement —
     both "Chidera is lazy" and a later "she is lazy" should be flagged. */
  const subjects = [PERSON, ...nameAlternatives(subjectName)].join("|");
  const subjectsOrContracted = [PERSON_CONTRACTED, subjects].join("|");

  const findings = [
    ...findAll(
      text,
      `\\b(?:${PERSON_CONTRACTED}|(?:${subjects})\\s+${COPULA})${HEDGE}\\s+(?:${TRAITS.map(escape).join("|")})\\b`,
      "character",
      "This describes the person rather than their work.",
      "Name what happened, and when. A mark has to be defensible from something you can point at.",
    ),
    ...findAll(
      text,
      `\\b(?:${subjectsOrContracted})\\s+(?:${COPULA}\\s+)?(?:always|never)\\s+\\w+`,
      "absolute",
      "“Always” and “never” cannot be shown to be true.",
      "One counter-example is enough to lose this in a dispute. Say how often, or give the instance you mean.",
    ),
    ...findAll(
      text,
      `\\b(?:${SENSITIVE_WORDS.map(escape).join("|")})\\b`,
      "sensitive",
      "This is a personal characteristic, not performance.",
      "It has no bearing on a mark, and in a dispute this document is the evidence. Take it out.",
    ),
    ...findAll(
      text,
      `\\b(?:${COMPARISONS.map(escape).join("|")})\\b`,
      "comparison",
      "This measures them against a colleague.",
      "A mark is against what they agreed to deliver, not against somebody else's year.",
    ),
  ];

  /* Overlapping matches (e.g. "she is always difficult" is both a character
     claim and an absolute) are deduplicated by position — first rule wins. */
  const seen = new Set<number>();
  return findings
    .sort((a, b) => a.at - b.at)
    .filter((finding) => {
      if (seen.has(finding.at)) return false;
      seen.add(finding.at);
      return true;
    })
    .slice(0, MAX_FINDINGS);
}

/** How many findings to show at once — more reads as a wall, not help. */
export const MAX_FINDINGS = 6;

/** Every finding across several boxes, which is how a form holds its text. */
export function findingsAcross(
  texts: string[],
  subjectName?: string,
): Finding[] {
  return texts
    .flatMap((text) => reviewLanguageFindings(text, subjectName))
    .slice(0, MAX_FINDINGS);
}

/** The sentence that introduces a set of findings. Written once. */
export function findingsHeadline(count: number): string {
  return count === 1
    ? "One phrase here is worth a second look"
    : `${String(count)} phrases here are worth a second look`;
}

/** Must appear beside any list of findings: a hint, not a verdict — a checker
 *  that presents as authority gets argued with; one that reads as a prompt
 *  gets read. */
export const FINDINGS_CAVEAT =
  "Nothing here stops you sending the review. This looks for four specific " +
  "things and cannot tell whether what you wrote is fair, you can.";
