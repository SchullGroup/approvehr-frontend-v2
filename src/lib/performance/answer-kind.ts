import type { AnswerKind, ApiChoiceOption } from "@/lib/api/performance";
import { weightLabel } from "@/lib/api/performance";

/**
 * How a subsection is answered, and what a screen has to do differently for
 * each way.
 *
 * Everything here is a decision about a value, kept apart from the components
 * that render it for the reason `lib/performance/review-language.ts` is: the
 * rules can be read, and tested, without mounting anything.
 *
 * ## One place decides what a missing kind means
 *
 * A server that predates answer kinds sends no `answerKind`, and the API's own
 * rule is that a subsection that does not say is `RATING`. `answerKindOf` is
 * where that is decided, so no screen guesses it for itself and the day the
 * field becomes required there is one line to change.
 *
 * ## Nothing here scores anybody
 *
 * A yes is 100% and a no is 0%, a pick is worth the score its choice carries,
 * and all of it is worked out on the API. What lives here is the *conversion at
 * the edge*: a score typed as a percentage becomes whole basis points on its
 * way out and back, and nothing downstream ever sees a float. A second
 * implementation of a score is how two screens end up disagreeing about the
 * same person.
 */

type KindCarrier = { answerKind?: AnswerKind | undefined };

/** The three kinds, in the order a picker offers them. */
export const ANSWER_KINDS: readonly AnswerKind[] = [
  "RATING",
  "BOOLEAN",
  "CHOICE",
];

/** What the API means by a subsection that does not say how it is answered. */
export function answerKindOf(source: KindCarrier): AnswerKind {
  return source.answerKind ?? "RATING";
}

/** The word on a row, beside the subsection's name. */
export const KIND_BADGE: Record<AnswerKind, string> = {
  RATING: "Rated",
  BOOLEAN: "Yes or no",
  CHOICE: "Pick one",
};

/**
 * A subsection as a picker lists it: its name, and how it is rated when that is not
 * a level.
 *
 * "Teamwork, yes or no" and "Customer feedback, pick one", in the same comma form the
 * Section picker beside it uses ("Core competency, 40% of the mark"). A subsection
 * rated by a level stays its bare name: that is what almost every subsection is, and
 * a tag on every option would say the same thing down the whole list. The Subsection
 * picker said nothing for any of them, so somebody filing a question under "Teamwork"
 * could not tell from the list that a manager answers it yes or no and not on the
 * scale. The words are the row badge's ("Yes or no", "Pick one") in lower case.
 */
export function subsectionOptionLabel(name: string, kind: AnswerKind): string {
  if (kind === "RATING") return name;
  return `${name}, ${kind === "BOOLEAN" ? "yes or no" : "pick one"}`;
}

/** The option in the "How it is answered" picker. */
export function kindOptionLabel(kind: AnswerKind, scaleMax: number): string {
  if (kind === "RATING") return `A level on a scale, 1 to ${String(scaleMax)}`;
  return kind === "BOOLEAN" ? "Yes or no" : "Pick one from a list";
}

/**
 * What picking a kind means, in one sentence each.
 *
 * Every non-level kind says it has no target and is left out of the gap list
 * and the heatmap, because both are about levels and the API filters them to
 * `RATING`. Said here so HR is not left wondering where a yes-or-no subsection
 * went, which is the question that sentence exists to answer.
 */
export function kindLine(kind: AnswerKind, scaleMax: number): string {
  switch (kind) {
    case "RATING":
      return `A level from 1 to ${String(scaleMax)}, with a target if one is set. It shows in the gap list and the heatmap.`;
    case "BOOLEAN":
      return "A yes or a no. Yes scores 100% and no scores 0%, with nothing to set. It has no target, so it is left out of the gap list and the heatmap.";
    case "CHOICE":
      return "One pick from the list below, and each pick scores what you set for it. It has no target, so it is left out of the gap list and the heatmap.";
  }
}

/**
 * What is recorded on a subsection, in the words that are true of its kind.
 *
 * A level is a level. A yes or no and a pick have none, so calling what a
 * manager records on them "the level" would be a wrong claim in the sentence
 * that is meant to say where the mark comes from.
 */
export function recordedWords(kind: AnswerKind | undefined): {
  a: string;
  the: string;
} {
  return kind === undefined || kind === "RATING"
    ? { a: "a level", the: "the level" }
    : { a: "an answer", the: "the answer" };
}

/**
 * Why a kind cannot be changed, said before anybody tries.
 *
 * The API refuses it too, in its own words, and that sentence is shown as it
 * comes when a refusal arrives (a job role that targets the subsection is one
 * the screen cannot know about). This is the part the screen does know: a
 * rating exists, and `ratingCount` says so.
 */
export const KIND_FROZEN =
  "This subsection already has ratings recorded, so its answer kind is fixed. Archive it and start a new one to change how it's answered.";

/**
 * The live choices of a `CHOICE` subsection, in the order they are offered.
 *
 * Empty for any other kind, however many choices the list carries: a
 * subsection switched away from `CHOICE` before its first rating keeps its old
 * choices, and they are still listed, so reading them without asking the kind
 * would offer a pick-list on a yes-or-no subsection.
 */
export function choicesOf(
  source: KindCarrier & { choiceOptions?: readonly ApiChoiceOption[] },
): ApiChoiceOption[] {
  if (answerKindOf(source) !== "CHOICE") return [];
  return [...(source.choiceOptions ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
}

/* -------------------------------------------------------------------------- */
/* Scores, as a person types them                                              */
/* -------------------------------------------------------------------------- */

/** A score as the text a field shows: `6000` as `"60"`, `3333` as `"33.33"`. */
export function scoreText(bp: number): string {
  return String(bp / 100);
}

/**
 * Text a person typed, as whole basis points, or `null` when it is not a score.
 *
 * A percentage from 0 to 100 with up to two decimals, which is exactly the
 * resolution of a basis point, so nothing a field can produce is a figure the
 * payload has to lose. **Null, not a clamp**: typing 150 and being quietly
 * saved as 100 would be a wrong number nobody chose, and the weights form's
 * clamp is right for a weight that must total 100 and wrong for a score.
 */
export function scoreBp(text: string): number | null {
  const typed = text.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(typed)) return null;
  const value = Number(typed);
  if (value > 100) return null;
  return Math.round(value * 100);
}

/* -------------------------------------------------------------------------- */
/* The list of choices, as an editor holds it                                  */
/* -------------------------------------------------------------------------- */

/**
 * One row of the editor.
 *
 * `score` is the text as typed, because `"3"` is a score on the way to
 * `"33.33"` and a number field would have to throw the half-typed one away.
 */
export type ChoiceDraft = {
  /** A stable React key: the choice's id, or a counter for a row not saved yet. */
  key: string;
  /** Present when the API already has this choice. Absent makes a new one. */
  id?: string;
  label: string;
  score: string;
  /**
   * How many ratings picked this choice, as the API counted them. Carried only for
   * a saved choice from a server that says; absent means no claim, and the choice
   * is not treated as fixed.
   */
  picks?: number;
};

export function draftsFrom(options: readonly ApiChoiceOption[]): ChoiceDraft[] {
  return options.map((option) => ({
    key: option.id,
    id: option.id,
    label: option.label,
    score: scoreText(option.scoreBp),
    ...(option.ratingCount !== undefined ? { picks: option.ratingCount } : {}),
  }));
}

/**
 * Whether a row's score can no longer be changed.
 *
 * The API refuses to change the score of a choice that any rating has picked,
 * because it would change marks people were already given. A row is fixed only
 * where the API said so: a choice added in this editor has not been saved and so
 * has no ratings, and one from a server that sends no count is not claimed to be.
 * The label and the place in the list are free either way.
 */
export function scoreIsFixed(draft: ChoiceDraft): boolean {
  return draft.id !== undefined && (draft.picks ?? 0) > 0;
}

/**
 * Why a score is fixed, and what to do instead, before a save is refused.
 *
 * The refusal itself, if it ever comes, is the API's own sentence and is shown as
 * it is. This is the same fact said earlier, in the place the field is.
 */
export function fixedScoreReason(picks: number): string {
  return `Picked ${String(picks)} ${picks === 1 ? "time" : "times"}, so its score is fixed. Add a new choice to score it differently.`;
}

/** The body `PUT .../choice-options` takes, or `null` if any row is not a score. */
export function payloadFrom(
  drafts: readonly ChoiceDraft[],
): { id?: string; label: string; scoreBp: number; sortOrder: number }[] | null {
  const rows: {
    id?: string;
    label: string;
    scoreBp: number;
    sortOrder: number;
  }[] = [];
  for (const [index, draft] of drafts.entries()) {
    const bp = scoreBp(draft.score);
    if (bp === null) return null;
    rows.push({
      ...(draft.id ? { id: draft.id } : {}),
      label: draft.label.trim(),
      scoreBp: bp,
      sortOrder: index,
    });
  }
  return rows;
}

/**
 * Whether the editor holds what the API already has, so Save has nothing to do.
 *
 * Compared in order, because the order *is* part of the list, and ignoring the
 * stored `sortOrder` values themselves: the API renumbers on every save, and a
 * list that already reads in the right order needs no write.
 */
export function sameChoices(
  drafts: readonly ChoiceDraft[],
  saved: readonly ApiChoiceOption[],
): boolean {
  const rows = payloadFrom(drafts);
  if (rows === null || rows.length !== saved.length) return false;
  return rows.every((row, index) => {
    const was = saved[index];
    return (
      was !== undefined &&
      row.id === was.id &&
      row.label === was.label &&
      row.scoreBp === was.scoreBp
    );
  });
}

/**
 * The API's own sentences for the two body refusals, written out so the editor
 * can say them while somebody is still typing, in the same words, and never
 * instead of the server's check. Fewer than two and an empty label come back
 * from the API as a 400 with the sentence on the field.
 */
export const TOO_FEW_CHOICES =
  "A pick-a-list subsection needs at least two choices.";
export const GIVE_A_LABEL = "Give it a label.";
/** Ours alone: the API checks the range with a validation message of its own. */
export const SCORE_RANGE =
  "Give it a score from 0% to 100%, with up to two decimals.";

export type ChoiceProblem =
  | { field: "count"; message: string }
  | { field: "label" | "score"; key: string; message: string };

export function choiceProblems(
  drafts: readonly ChoiceDraft[],
): ChoiceProblem[] {
  const problems: ChoiceProblem[] = [];
  if (drafts.length < 2) {
    problems.push({ field: "count", message: TOO_FEW_CHOICES });
  }
  for (const draft of drafts) {
    if (draft.label.trim() === "") {
      problems.push({
        field: "label",
        key: draft.key,
        message: GIVE_A_LABEL,
      });
    }
    if (scoreBp(draft.score) === null) {
      problems.push({
        field: "score",
        key: draft.key,
        message: SCORE_RANGE,
      });
    }
  }
  return problems;
}

/**
 * Labels used by more than one choice.
 *
 * The API does not refuse a repeated label, and a person's skills list shows
 * the label of the pick and not its id, so two choices called "Meets" with
 * different scores are indistinguishable on the one screen that reports them.
 * A warning rather than a refusal, because refusing what the server allows is
 * the screen inventing a rule.
 */
export function repeatedLabels(drafts: readonly ChoiceDraft[]): string[] {
  const seen = new Map<string, { label: string; count: number }>();
  for (const draft of drafts) {
    const label = draft.label.trim();
    if (label === "") continue;
    const key = label.toLowerCase();
    const was = seen.get(key);
    seen.set(key, { label: was?.label ?? label, count: (was?.count ?? 0) + 1 });
  }
  return [...seen.values()]
    .filter((entry) => entry.count > 1)
    .map((entry) => entry.label);
}

/* -------------------------------------------------------------------------- */
/* What an answer on this subsection counts towards                            */
/* -------------------------------------------------------------------------- */

/**
 * Whether an answer recorded on a subsection reaches the mark, and where.
 *
 * Every kind counts towards the component its section is mapped to, and a
 * subsection in no component is recorded and not scored. That second half is
 * the trap this exists for: a company can create a section, add a yes-or-no
 * subsection to it, have managers answer it for a year, and move no mark,
 * because nobody chose what the section counts towards. Said at the point of
 * configuring it rather than discovered when a mark comes out lower than
 * anybody expected.
 *
 * `section` is `null` for a subsection filed under none, and its `weightBp` is
 * `null` for a section that is not weighted (never 0%) and `undefined` when the
 * API has not said, in which case there is nothing true to add.
 */
export function directCounts(input: {
  kind: AnswerKind;
  section: { name: string; weightBp: number | null | undefined } | null;
}): { tone: "muted" | "warning"; text: string } | null {
  const words = recordedWords(input.kind);
  if (input.section === null) {
    return {
      tone: "warning",
      text: `This subsection is not filed under a section, so ${words.a} recorded on it counts towards no part of the mark.`,
    };
  }
  if (input.section.weightBp === undefined) return null;
  if (input.section.weightBp === null) {
    return {
      tone: "warning",
      text: `${input.section.name} is not weighted, so ${words.a} recorded on this counts towards no part of the mark.`,
    };
  }
  return {
    tone: "muted",
    text: `${input.section.name} is ${weightLabel(input.section.weightBp)} of the mark, and ${words.a} recorded here counts towards it.`,
  };
}
