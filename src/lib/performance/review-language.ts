/**
 * Language in a written review that a mark could not be defended on.
 *
 * ## Why this is not the assistant
 *
 * Every other drafting aid in this product is a model call. This one cannot be,
 * and the reason is a promise already published rather than a preference:
 * `/settings/ai` and the data processing agreement both state that **no written
 * appraisal comment leaves the platform**. A model-based coach would send a
 * manager's written judgement of a named colleague to a third party, which
 * would make that sentence false the day it shipped.
 *
 * Three things follow from doing it here instead, and all three are better:
 *
 * - It works with **no credential**, which is the state this product is in
 *   today and the state most companies will start in.
 * - It is instant, so it can run while somebody types rather than at the end.
 * - It can quote **the exact phrase it matched**. A model saying "this reads as
 *   judgemental" is an opinion; "you wrote *she is disorganised*" is a fact the
 *   reader can act on or dismiss in one glance.
 *
 * ## What this is for
 *
 * The product's whole argument against the incumbent is that a figure on a
 * screen has to be accountable. A mark is the figure a person's confirmation,
 * promotion or bonus turns on, and the written half is what has to justify it
 * when somebody disputes one — `disputed` is a real state on `Review`, with a
 * reason attached, and somebody reads it.
 *
 * "Chidera is quite disorganised" cannot be defended. "Three deadlines moved
 * without notice in October" can. The difference is not politeness; it is
 * whether there is anything to point at.
 *
 * ## This never blocks anything
 *
 * Every finding is advice. The API accepts the review either way and so does
 * the form — a control that refuses what the server allows teaches people the
 * product is broken, and a manager may have a reason this file cannot know.
 * `HANDOVER.md`'s rule about never refusing on the client's own initiative
 * applies exactly.
 *
 * ## Precision over recall, deliberately
 *
 * A checker that flags half a page is a checker people learn to scroll past, so
 * the character rules require a **person as the subject**: `difficult` alone is
 * not flagged, because "a difficult migration" is ordinary and correct English
 * about a piece of work. `he is difficult` is flagged, because that is a
 * sentence about a person.
 *
 * The exception is `SENSITIVE`, which needs no subject. Any mention of somebody's
 * pregnancy, faith, ethnicity or health in a performance review is worth a
 * second look whatever the grammar around it.
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
 * Who a sentence can be about.
 *
 * The pronoun catches one form and `the employee` / `this person` the formal
 * one. **The subject's own name is the third, and it is the commonest** — this
 * file's first draft left it out on the grounds that matching a name would mean
 * threading it in from the form, and the very first sentence tested in a
 * browser was *"Chidera is quite disorganised"*, which sailed through.
 *
 * That was the wrong trade. Threading the name in is one optional argument;
 * missing the way most people actually write is the whole feature.
 */
const PERSON = String.raw`(?:he|she|they|the employee|this person|the staff|the subordinate)`;

/**
 * The subject's name, as alternatives, or nothing.
 *
 * Full name and each part of it, because a manager writing about Tunde Bakare
 * writes "Tunde". Parts shorter than three characters are dropped: an initial
 * would match inside other words and turn the checker into noise.
 */
function nameAlternatives(subjectName: string | undefined): string[] {
  if (!subjectName) return [];
  const whole = subjectName.trim();
  if (whole === "") return [];
  const parts = whole.split(/\s+/).filter((part) => part.length >= 3);
  /* Longest first so the full name wins over a part of it and the quoted
     phrase reads as what was written. */
  return [...new Set([whole, ...parts])]
    .sort((a, b) => b.length - a.length)
    .map(escape);
}

/**
 * The same, already carrying its verb.
 *
 * Its own branch rather than a member of `PERSON`, because "she's arrogant" has
 * no room for a second copula and the pattern demanded one — so every
 * contraction slipped through, which is most of how people actually write.
 */
const PERSON_CONTRACTED = String.raw`(?:he's|she's|they're)`;

/**
 * The verb.
 *
 * `are` and `were` were missing on the first pass, which made every plural
 * invisible — "they are unprofessional" is the single most likely sentence this
 * whole file exists to catch, and it was the one form that could not match.
 */
const COPULA = String.raw`(?:is|are|was|were|isn't|aren't|wasn't|weren't|seems|seem|seemed|appears|appear|remains|remain|has been|have been|can be|tends to be|tend to be|comes across as|come across as|strikes me as)`;

/** An optional hedge. "quite lazy" is the same claim as "lazy". */
const HEDGE = String.raw`(?:\s+(?:very|quite|rather|somewhat|a bit|a little|too|generally|often|always|never|fairly|extremely))?`;

/**
 * Traits, not conduct.
 *
 * Every word here describes a person's disposition. None of them can be
 * evidenced by pointing at a thing that happened, which is the test — and it is
 * why "late" and "absent" are deliberately absent from this list. Those are
 * facts about attendance with rows behind them.
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
 * Protected characteristics.
 *
 * Nigerian law makes this more than a style note: section 42 of the
 * Constitution, the Labour Act, and the Discrimination Against Persons with
 * Disabilities (Prohibition) Act 2018 all bear on it, and the National
 * Industrial Court hears discrimination claims in which the written record is
 * the evidence. A review that mentions somebody's pregnancy is a document that
 * gets read out.
 *
 * Ethnicity is listed by name because Nigeria is where this product is sold and
 * a generic "do not mention ethnicity" catches nothing. The list is the largest
 * groups and is not exhaustive; it is a prompt to look, not a filter to trust.
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
 * Every match of `pattern`, as findings.
 *
 * The regex is rebuilt per call rather than kept at module scope. A `g` regex
 * carries `lastIndex` between calls, and a shared one would silently skip the
 * first half of the second text it was given — which on a checker that runs on
 * every keystroke means findings that appear and vanish as somebody types.
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
    /* A zero-width match would loop for ever. None of the patterns here can
       produce one, and the guard costs nothing next to finding out that it can. */
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
    match = pattern.exec(text);
  }
  return found;
}

/**
 * What is worth a second look in one piece of written review text.
 *
 * Returns them in the order they appear, deduplicated by position, capped —
 * see `MAX_FINDINGS`. Empty means nothing matched, which is the common case and
 * must render as nothing at all rather than as a green tick: this checker does
 * not know that a review is *good*, only that four specific things are absent.
 */
export function reviewLanguageFindings(
  text: string,
  /** The person the review is about, so "Chidera is..." is caught too. */
  subjectName?: string,
): Finding[] {
  if (text.trim().length === 0) return [];

  /* The name is an extra way of naming the subject, never a replacement — a
     review that says "Chidera is lazy" in one line and "she is lazy" in the
     next has written the same sentence twice and both should be flagged. */
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

  /* Two rules can match overlapping text — "she is always difficult" is both a
     character claim and an absolute. Keeping both would show one sentence
     twice, so the first rule to reach a position wins, and the order above is
     the order of usefulness. */
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

/**
 * How many to show at once.
 *
 * A list longer than this is not more helpful, it is a wall — and somebody
 * whose draft trips ten rules needs to rewrite a paragraph rather than patch
 * ten phrases. `moreThanShown` reports the shortfall so nothing is dropped
 * silently.
 */
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

/**
 * The one sentence that has to appear beside any list of these.
 *
 * It is a hint, not a verdict, and saying so is what keeps it useful: a checker
 * that presents itself as authority gets argued with, and one that presents
 * itself as a prompt gets read.
 */
export const FINDINGS_CAVEAT =
  "Nothing here stops you sending the review. This looks for four specific " +
  "things and cannot tell whether what you wrote is fair — you can.";
