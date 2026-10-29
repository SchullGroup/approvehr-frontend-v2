import type {
  ApiFormQuestion,
  ApiRatingScale,
  ApiSelfAnswer,
  ApiSubsectionOnForm,
  ReviewQuestionKind,
} from "@/lib/api/performance";

/**
 * A directly rated subsection, asked on a review form.
 *
 * A period can put a subsection on the form (`lib/performance/subsection-ask.ts`
 * is the period's side of it). The form then carries a question that **is** the
 * subsection's own answer: its prompt is the subsection's name, and what is
 * picked becomes the person's rating of it when the review is sent. This file is
 * the form's side of that, and every decision in it is a decision about a value.
 *
 * ## Which questions these are
 *
 * `answersSubsection` is optional on the wire and **absent means an ordinary
 * question**, which is what a server that predates it sends for all of them. It
 * is also read together with `subsection`, because a form cannot be drawn from a
 * flag alone: without the subsection's scale and choices a level has no ceiling
 * and a pick has nothing to pick from. A flag with no subsection behind it falls
 * back to the ordinary question it would have been, rather than drawing a scale
 * somebody never set.
 *
 * ## It is drawn from the subsection, not from the question's `kind`
 *
 * `kind` is derived from the subsection's kind on the API and so agrees with it.
 * `questionKind` reads the subsection's own, which is the one the contract names,
 * so the day the two could disagree there is one place that settles it.
 *
 * ## A level is the subsection's, not the company's
 *
 * A subsection has its own scale (2 to 10 levels) and a form offers exactly that
 * many, whatever the company's own five words run to. The company's *words* are
 * used only where its scale is this scale (five levels, each with a word): then a
 * rating reads as every other rating in the product does, in words and never as a
 * bare digit. Where it is not, saying "Meets Expectations" for a 4 of 10 would be
 * the screen inventing a claim, so the level is said as `4 of 10`.
 *
 * ## A pick is matched by its id
 *
 * Two choices can share a label and a choice can be archived after somebody picked
 * it, so a pick is held, sent and compared as the choice's **id** and its label is
 * only ever read for display. Scores are never on the wire to a form: a person
 * answering decides which description fits, not which number they want.
 *
 * ## Absent is not zero
 *
 * Nothing here ever turns a missing answer into a figure. The subject's own answer
 * is `null` until they have sent their self-review, and a level below 1, which
 * the API cannot produce, is read as no answer rather than as a rating of nought.
 */

/** A subsection question with everything a form needs to draw it. */
export type SubsectionQuestion = ApiFormQuestion & {
  answersSubsection: true;
  subsection: ApiSubsectionOnForm;
};

export function isSubsectionQuestion(
  question: ApiFormQuestion,
): question is SubsectionQuestion {
  return (
    question.answersSubsection === true && question.subsection !== undefined
  );
}

/**
 * The kind a question is drawn and answered as. An ordinary question's own, and
 * for a subsection question the subsection's.
 */
export function questionKind(question: ApiFormQuestion): ReviewQuestionKind {
  return isSubsectionQuestion(question)
    ? question.subsection.answerKind
    : question.kind;
}

/** A level is 1 or more. Nought is not a rating anybody was given. */
const isLevel = (value: number | null | undefined): value is number =>
  typeof value === "number" && value >= 1;

/* -------------------------------------------------------------------------- */
/* Levels                                                                      */
/* -------------------------------------------------------------------------- */

export type SubsectionLevel = {
  level: number;
  /**
   * The company's word for it, only where its scale is this subsection's scale.
   * `null` otherwise, and the level is then said by its number.
   */
  words: string | null;
  /** What the word means, where the company wrote one. Empty when it did not. */
  meaning: string;
};

/**
 * The company's words by level, or `null` when its scale is not this one: the
 * same length, and a word for every level from 1 to the ceiling.
 */
function companyWordsFor(
  scaleMax: number,
  scale: ApiRatingScale,
): Map<number, { label: string; meaning: string }> | null {
  if (scale.levels.length !== scaleMax) return null;
  const byLevel = new Map(
    scale.levels.map((entry) => [
      entry.level,
      { label: entry.label, meaning: entry.meaning },
    ]),
  );
  for (let level = 1; level <= scaleMax; level += 1) {
    if (!byLevel.has(level)) return null;
  }
  return byLevel;
}

/** Every level a subsection offers, 1 to its own ceiling and no further. */
export function subsectionLevels(
  scaleMax: number,
  scale: ApiRatingScale,
): SubsectionLevel[] {
  const words = companyWordsFor(scaleMax, scale);
  return Array.from({ length: Math.max(scaleMax, 0) }, (_, index) => {
    const level = index + 1;
    const word = words?.get(level);
    return {
      level,
      words: word ? word.label : null,
      meaning: word ? word.meaning : "",
    };
  });
}

/** A level as a person reads it: the company's word, or `4 of 10`. */
export function levelWords(
  level: number,
  scaleMax: number,
  scale: ApiRatingScale,
): string {
  const word = companyWordsFor(scaleMax, scale)?.get(level);
  return word ? word.label : `${String(level)} of ${String(scaleMax)}`;
}

/* -------------------------------------------------------------------------- */
/* Picks                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Whether a pick is still one of the choices the form offers.
 *
 * A pick that has been taken off the list since it was made is a pick the API
 * will refuse at send ("That is not one of ... choices"), so a form that treated
 * it as an answer would be telling somebody a required question is done when it
 * cannot go. It is read as no answer instead, and the person is walked to the
 * question and offered the choices as they stand.
 */
export function isLivePick(
  question: SubsectionQuestion,
  choiceOptionId: string | null | undefined,
): boolean {
  return (
    !!choiceOptionId &&
    question.subsection.choices.some((choice) => choice.id === choiceOptionId)
  );
}

/* -------------------------------------------------------------------------- */
/* An answer, in words                                                         */
/* -------------------------------------------------------------------------- */

/** What an answer holds, whatever it came from: the record, a box or the subject. */
export type AnswerParts = {
  ratingValue?: number | null | undefined;
  boolValue?: boolean | null | undefined;
  choiceOptionId?: string | null | undefined;
  /**
   * The label the API saved with the pick. It belongs to the pick whose id is
   * alongside it and to no other, so a caller whose id is not the saved one must
   * not pass it.
   */
  choiceLabel?: string | null | undefined;
};

/**
 * What a subsection answer says, in words, or `null` for no answer.
 *
 * One function for the preview, the record, the popup's read-back and the line
 * beside a manager's control, so a level cannot be a word in one and a digit in
 * another.
 *
 * A pick is read by the **label saved with the answer** where there is one, which
 * is what the API sends for exactly this, and the record must say what was chosen
 * when it was chosen. A choice's label can be renamed afterwards and its answers
 * stay on it. Where there is none (a pick made in this visit and not saved yet) it
 * is found by its id among the choices the form was given, and a pick that is
 * neither saved nor on the list has no words to say.
 */
export function answerWords(
  question: SubsectionQuestion,
  answer: AnswerParts,
  scale: ApiRatingScale,
): string | null {
  switch (question.subsection.answerKind) {
    case "RATING":
      return isLevel(answer.ratingValue)
        ? levelWords(answer.ratingValue, question.subsection.scaleMax, scale)
        : null;
    case "BOOLEAN":
      return typeof answer.boolValue === "boolean"
        ? answer.boolValue
          ? "Yes"
          : "No"
        : null;
    case "CHOICE": {
      if (!answer.choiceOptionId) return null;
      if (answer.choiceLabel) return answer.choiceLabel;
      const live = question.subsection.choices.find(
        (choice) => choice.id === answer.choiceOptionId,
      );
      return live ? live.label : null;
    }
  }
}

/**
 * The subject's own answer, in words, for the line beside their manager's
 * control. `null` for none, which a form shows as nothing: not "No answer", and
 * never a zero.
 */
export function selfAnswerWords(
  question: SubsectionQuestion,
  scale: ApiRatingScale,
): string | null {
  const own: ApiSelfAnswer | null | undefined = question.selfAnswer;
  if (!own) return null;
  return answerWords(
    question,
    {
      ratingValue: own.ratingValue,
      boolValue: own.boolValue,
      choiceOptionId: own.choiceOptionId,
      choiceLabel: own.choiceValue,
    },
    scale,
  );
}
