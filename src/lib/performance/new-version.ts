import type { AnswerKind, NewVersionResult } from "@/lib/api/performance";
import { ANSWER_KINDS } from "./answer-kind";

/**
 * Starting a new version of a subsection: what the screens say about it.
 *
 * ## Why it exists
 *
 * How a subsection is answered (a level, a yes or no, a pick) belongs to the
 * subsection and not to a period, so it is shared by every appraisal period and is
 * fixed by the first rating, in any period. A company that rated "Teamwork" as a
 * yes or no for a year and now wants it as a level cannot change it without making
 * last period's answers mean something else. The way through is a *new version*:
 * the old subsection keeps its ratings and every mark made from them under a
 * retired name, and a new one with the original name, answered the new way,
 * starts empty and is used from now on. A changed mind is a new record.
 *
 * ## Nothing here works anything out
 *
 * What moves, what is left behind and which periods or job roles are affected is
 * decided on the API, which sends its own sentences (`notes`) for them. This file
 * only words what the screen already knows before the press (how many ratings
 * there are, which kind was chosen) and what the answer means after it. A second
 * list of which draft periods move would be a second implementation of a rule that
 * has one owner.
 *
 * Everything is a decision about a value, kept apart from the components that
 * render it for the reason `answer-kind.ts` is: the words can be read and tested
 * without mounting anything.
 */

/** "1 rating", "12 ratings". */
export function ratingsWords(count: number): string {
  return count === 1 ? "1 rating" : `${String(count)} ratings`;
}

/** "it" for one rating and "them" for more, so "1 rating ... made from it" agrees. */
function aboutRatings(count: number): string {
  return count === 1 ? "it" : "them";
}

/**
 * Why how a subsection is answered cannot be changed, said above the control.
 *
 * Above and not under it: it is the answer to "why is this greyed out", which is
 * asked the moment somebody sees the control. It carries the two facts that make it
 * true: there are ratings, in any period, and the setting is shared by every
 * period. The second is the one that is not obvious, and it is what answers the
 * natural question of whether another period could answer the same subsection
 * differently.
 */
export function lockedReason(ratingCount: number): string {
  const verb = ratingCount === 1 ? "is" : "are";
  return `Fixed: ${ratingsWords(ratingCount)} ${verb} recorded on this subsection, in any period, and how it is answered applies to every period.`;
}

/**
 * The same fact for the small lock after a subsection's name in a list: short,
 * because it is a hover and a screen reader's word for the lock, and the whole
 * reason is on the tab it points at.
 */
export function lockedMark(ratingCount: number): string {
  const verb = ratingCount === 1 ? "is" : "are";
  return `Fixed: ${ratingsWords(ratingCount)} ${verb} recorded, in any period.`;
}

/** The button beside the locked control. */
export const NEW_VERSION_BUTTON = "Start a new version";

/** The confirm button in the dialog. */
export const NEW_VERSION_CONFIRM = "Start new version";

export function newVersionTitle(name: string): string {
  return `Start a new version of ${name}`;
}

/** The two kinds a new version can be answered as: every kind but the current one. */
export function otherKinds(current: AnswerKind): AnswerKind[] {
  return ANSWER_KINDS.filter((kind) => kind !== current);
}

/**
 * What starting a new version does, before it is pressed, as short lines.
 *
 * On the page and not behind an icon: they are the consequences somebody is about
 * to agree to, and a consequence somebody has to hover for is one that gets agreed
 * to unread. What the API did *specifically* (which periods, which roles) arrives
 * afterwards as its own sentences.
 *
 * The third line depends on the kind chosen, because the two are genuinely
 * different: a pick-one subsection starts with no choices, and a required question
 * with nothing to pick cannot be answered, so a period that asked the old one stops
 * asking until the choices are in. `to` is `null` before one is chosen, and then the
 * line says only what is true of both.
 */
export function newVersionEffects(input: {
  name: string;
  ratingCount: number;
  to: AnswerKind | null;
}): string[] {
  const published =
    "Published periods keep the old one, so their forms read as they did.";
  return [
    input.ratingCount > 0
      ? `${input.name} keeps its ${ratingsWords(input.ratingCount)}, and every mark made from ${aboutRatings(input.ratingCount)} stays as it is. It is marked retired and leaves this list.`
      : `${input.name} is marked retired and leaves this list.`,
    "The new version has the same name and section and starts with no ratings. It is the one used from now on.",
    input.to === "CHOICE"
      ? `Periods that have not started stop asking it until you add its choices, and questions filed under it there move to the new version. ${published}`
      : input.to === null
        ? `Periods that have not started move over to the new version. ${published}`
        : `Periods that have not started ask the new version in its place, and questions filed under it there move to it. ${published}`,
  ];
}

/** How a kind reads in "answered as ...". */
export function answeredAsWords(kind: AnswerKind): string {
  switch (kind) {
    case "RATING":
      return "a level on a scale";
    case "BOOLEAN":
      return "a yes or no";
    case "CHOICE":
      return "one pick from a list";
  }
}

/**
 * What happened, as the dialog's result line. The API's `notes` follow it, as they
 * came, because they are the part that says what to do next.
 */
export function startedLine(
  result: NewVersionResult,
  kind: AnswerKind,
): string {
  const kept =
    result.retired.ratingsKept > 0
      ? `keeps its ${ratingsWords(result.retired.ratingsKept)} and every mark made from ${aboutRatings(result.retired.ratingsKept)}`
      : "is kept, retired";
  return `${result.competency.name} is now answered as ${answeredAsWords(kind)}. ${result.retired.name} ${kept}.`;
}

/**
 * The toast, when there are no notes and so nothing to stay on screen for. Short:
 * a toast clamps its detail to two lines and is gone in six seconds.
 */
export function startedToast(result: NewVersionResult): {
  title: string;
  detail: string;
} {
  return {
    title: `Started a new version of ${result.competency.name}`,
    detail:
      result.retired.ratingsKept > 0
        ? `${result.retired.name} keeps its ${ratingsWords(result.retired.ratingsKept)}.`
        : `${result.retired.name} is kept, retired.`,
  };
}
