import { weightLabel } from "@/lib/api/performance";
import type { AnswerKind } from "@/lib/api/performance";
import { recordedWords } from "@/lib/performance/answer-kind";

/**
 * What the Questions dialog says about where a question is filed.
 *
 * ## What it used to say, and why it was wrong
 *
 * "Answers to this count towards Core competency, which is 40% of the mark."
 * Nothing makes that so. The mark's competency parts are built from what a
 * manager records on a subsection itself (`CompetencyRating`), and the score
 * register never reads the answer to a question, however the question is filed.
 * Filing a question groups it, in this list, under the subsection it is about.
 * `tests/performance-question-answers-not-scored.test.ts` in the API pins the
 * rule in both directions.
 *
 * So the sentence says the true thing first, that an answer does not count, and
 * then where the mark does come from, with the section's weight when it is known,
 * because HR choosing a section is often choosing a weight.
 *
 * ## What is recorded depends on how the subsection is answered
 *
 * A level on a scale is "the level recorded on" it. A yes or no and a pick have
 * no level, so for those the sentence says "the answer". `answerKind` is optional
 * and absent means a level, which is what the API means by it.
 *
 * Kept apart from the dialog so the six states can be read, and tested, in one
 * place rather than inside a render.
 */

export type FilingNote = {
  /** `warning` only for the one state that is a mistake somebody can save. */
  tone: "muted" | "warning";
  text: string;
};

export type Filing = {
  /** The section chosen above, `""` for none. */
  sectionId: string;
  /** The subsection chosen above, `""` for none. */
  competencyId: string;
  /**
   * The chosen section, as the list knows it. `weightBp` is `null` for a section
   * that is not weighted, never 0%, and `undefined` when the API has not said:
   * the framework groups a demo or an unloaded screen falls back to carry no
   * weights.
   */
  section?: { name: string; weightBp: number | null | undefined };
  /** The chosen subsection's name. */
  subsectionName?: string;
  /** How the chosen subsection is answered. Absent means a level. */
  answerKind?: AnswerKind;
};

const NOT_COUNTED = "Answers to a question do not count towards the mark.";

export function filingNote({
  sectionId,
  competencyId,
  section,
  subsectionName,
  answerKind,
}: Filing): FilingNote {
  if (competencyId !== "") {
    const sub = subsectionName ?? "the subsection";
    const words = recordedWords(answerKind);
    if (!section) {
      return {
        tone: "muted",
        text: `${NOT_COUNTED} ${sub} is not filed under a section, so ${words.a} recorded on it counts towards no part of the mark either.`,
      };
    }
    if (section.weightBp === null) {
      return {
        tone: "muted",
        text: `${NOT_COUNTED} ${section.name} is not weighted, so ${words.a} recorded on ${sub} counts towards no part of the mark either.`,
      };
    }
    if (section.weightBp === undefined) {
      return {
        tone: "muted",
        text: `${NOT_COUNTED} The mark comes from ${words.the} recorded on ${sub}, under Competency ratings.`,
      };
    }
    return {
      tone: "muted",
      text: `${NOT_COUNTED} ${section.name} is ${weightLabel(section.weightBp)} of the mark, and it comes from ${words.the} recorded on ${sub}, under Competency ratings.`,
    };
  }

  /* A section with no subsection is a real state while somebody is choosing, and
     a saveable one: it files the question under nothing. */
  if (sectionId !== "") {
    return {
      tone: "warning",
      text: "Pick a subsection to file this question under. A section on its own files it under nothing.",
    };
  }

  /* No subsection to name, so no kind to name either: "what is recorded" is true
     of a level, a yes or no and a pick alike. */
  return {
    tone: "muted",
    text: `${NOT_COUNTED} The mark comes from what is recorded on each subsection, under Competency ratings.`,
  };
}
