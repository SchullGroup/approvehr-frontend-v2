import { dayLabel } from "@/lib/api/performance";

/**
 * What is said when a rating is made final, and when its subject acknowledges it.
 *
 * These two are the evidential moments of an appraisal: a rating becomes what a
 * person was told, and the person says they saw it. Both are one-way, so what
 * the screen says afterwards is worth getting exactly right and worth testing
 * without rendering anything. Three things it is careful about:
 *
 * - **Told means the API said so.** `finalise` returns `subjectNotified`, false
 *   for somebody who could not be told in the app, and "has been told" is only
 *   ever said for true. `acknowledge` notifies whoever finalised the rating and
 *   does not report whether it reached them, so nothing here says that anyone
 *   was told about an acknowledgement.
 * - **Acknowledging is not agreeing.** An acknowledgement that reads as consent
 *   is worth less than nothing to a company defending a decision, so the
 *   sentence that says what it is says what it is not.
 * - **The mark in the company's own words.** `ratingLabel` is already read
 *   through the company's scale by the caller; a missing mark is `null`, and a
 *   form that gave none is said to have given none rather than being scored.
 */

export type SignOffCopy = {
  title: string;
  lead: string;
  details: string[];
};

/**
 * The appraiser's side: a rating was made the rating of record.
 *
 * `subjectNotified` is `undefined` only if an older API does not send it; then
 * nothing is said either way.
 *
 * `markShown` is false where the company does not ask for an overall mark and
 * this review carries none (`showsOverallMark`). Then there is nothing to say
 * about a mark that was not given: "has no overall mark" would read as a gap in
 * a form that never had a place for one. It defaults to true, which is the old
 * wording, so a caller that does not know says what it always said.
 */
export function finalisedCopy({
  subjectName,
  cycleName,
  ratingLabel,
  subjectNotified,
  markShown = true,
  recommended = false,
}: {
  subjectName: string;
  cycleName: string;
  ratingLabel: string | null;
  subjectNotified: boolean | undefined;
  markShown?: boolean;
  /** Whether HR's recommendation went with it. Defaults to no, the old wording. */
  recommended?: boolean;
}): SignOffCopy {
  const first = subjectName.split(" ")[0] ?? subjectName;

  const details: string[] = [];
  if (subjectNotified === true) {
    details.push(`${first} has been told, and is asked to acknowledge it.`);
  } else if (subjectNotified === false) {
    details.push(`${first} could not be told in the app. Tell them yourself.`);
  }
  if (recommended) details.push("Your recommendation is saved with it.");
  details.push("It cannot be changed.");
  /* Not for somebody who could not be told: with no sign-in there is nowhere
     for them to give one, and the line would promise an answer that cannot come. */
  if (subjectNotified !== false) {
    details.push("Their answer will show on this page once they give it.");
  }

  return {
    title: `${subjectName}'s rating is final`,
    lead: ratingLabel
      ? `The rating for ${cycleName} is "${ratingLabel}".`
      : markShown
        ? `${cycleName} has no overall mark, so ${first} will read the answers.`
        : `${first} will read the answers.`,
    details,
  };
}

/**
 * The subject's side: "I have seen this", recorded.
 *
 * `day` is the calendar day it was recorded, `YYYY-MM-DD`: the API's own
 * timestamp cut to its day when there is one, and today in the company's zone
 * in demo mode, where the answer is local and there is none. The caller decides
 * which, because the clock is read in `lib/time.ts` and nowhere else.
 */
export function acknowledgedCopy({
  cycleName,
  ratingLabel,
  day,
  commented,
}: {
  cycleName: string;
  ratingLabel: string | null;
  day: string;
  commented: boolean;
}): SignOffCopy {
  const date = dayLabel(day);

  const details = [
    "It is kept with the appraisal, with the date.",
    "It records that you saw your rating, not that you agree with it.",
  ];
  if (commented) details.push("Your comment is saved with it.");
  details.push("You can do this once, so it is final.");

  return {
    title: "Your acknowledgement is recorded",
    lead: ratingLabel
      ? `Your rating for ${cycleName} was "${ratingLabel}", and you saw it on ${date}.`
      : `You saw your appraisal for ${cycleName} on ${date}.`,
    details,
  };
}
