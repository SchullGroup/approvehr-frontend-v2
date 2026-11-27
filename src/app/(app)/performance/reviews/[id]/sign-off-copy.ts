/**
 * What is said when a rating is made final.
 *
 * One of the two evidential moments of an appraisal: a rating becomes what a
 * person was told. It is one-way, so what the screen says afterwards is worth
 * getting exactly right and worth testing without rendering anything. Two things
 * it is careful about:
 *
 * - **Told means the API said so.** `finalise` returns `subjectNotified`, false
 *   for somebody who could not be told in the app, and a line about it is said
 *   only for false. A rating made final and delivered says its title and
 *   nothing more (owner, 27 Nov 2026): the dialog above it already said it
 *   cannot be changed, and a screen that repeats it after the act is a screen
 *   that says it five times.
 * - **Nothing is said about a person who was told.** `undefined` is an older API
 *   that does not send the field, which is not the same as "could not be told".
 *
 * Acknowledging has no copy of its own any more: it closes the dialog and the
 * screen says "Acknowledged" in a toast.
 */

export type SignOffCopy = {
  title: string;
  /** Empty unless something needs doing. */
  details: string[];
};

/**
 * The appraiser's side: a rating was made the rating of record.
 *
 * `subjectNotified` is `undefined` only if an older API does not send it; then
 * nothing is said either way.
 */
export function finalisedCopy({
  subjectName,
  subjectNotified,
}: {
  subjectName: string;
  subjectNotified: boolean | undefined;
}): SignOffCopy {
  const first = subjectName.split(" ")[0] ?? subjectName;
  return {
    title: `${subjectName}'s rating is final`,
    details:
      subjectNotified === false
        ? [`${first} could not be told in the app. Tell them yourself.`]
        : [],
  };
}
