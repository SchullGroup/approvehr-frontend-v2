"use client";

import { ButtonLink, SuccessMoment, TextLink } from "@/components/ui";
import { ratingWordsFrom, type ApiReviewDetail } from "@/lib/api/performance";
import { useAppraisals, useRatingScale } from "@/lib/store/performance";

/**
 * The review has gone.
 *
 * This used to be a popup that simply closed, with a "Sent" badge appearing on a
 * list behind it — the one moment in the whole appraisal flow that is final, and
 * nothing said so. It states what was sent and for whom, says what can no longer
 * happen, and puts the next thing in front of the person if there is one: a
 * manager with six reports has six forms, and finishing one should lead to the
 * next rather than back to a list to find it.
 *
 * The buttons wait for that list. Showing "Back" first and swapping it for
 * "Next: …" a moment later moved the thing somebody was about to press.
 *
 * Every figure here is one the form already held — the number of answers and the
 * mark — and the count of what is left comes from the same list the performance
 * page reads, fetched when this appears.
 */
export function SentScreen({
  review,
  answered,
  mark,
}: {
  review: ApiReviewDetail;
  answered: number;
  /** The overall mark that went with it, as the level's number, or null. */
  mark: string | null;
}) {
  const { scale } = useRatingScale();
  const appraisals = useAppraisals();

  /* Not the one just sent, whatever the list says yet. */
  const remaining = appraisals.mine.toComplete.filter(
    (other) => other.id !== review.id && !other.submitted,
  );
  const next = remaining[0];

  const markWords = mark ? ratingWordsFrom(scale.levels)(Number(mark)) : null;
  const answers = `${String(answered)} ${answered === 1 ? "answer" : "answers"}`;

  const title =
    review.kind === "SELF"
      ? "Your self-review is sent"
      : review.anonymous
        ? `Your feedback for ${review.subjectName} is sent`
        : `Your review of ${review.subjectName} is sent`;

  const details: string[] = [
    review.anonymous
      ? "It is anonymous. Nobody is told who wrote it."
      : "You can read it again, but it cannot be changed now.",
  ];
  if (remaining.length > 0) {
    details.push(
      remaining.length === 1
        ? "You have 1 more review to write."
        : `You have ${String(remaining.length)} more reviews to write.`,
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 py-12">
      <SuccessMoment
        headingLevel={1}
        focusHeading
        markSize="lg"
        title={title}
        lead={`${answers}${markWords ? ` and an overall mark of ${markWords}` : ""}, for ${review.cycleName}.`}
        details={details}
        actions={
          appraisals.loading ? undefined : next ? (
            <>
              <ButtonLink
                href={`/performance/reviews/${next.id}/answer`}
                variant="accent"
                size="lg"
              >
                {next.kind === "SELF"
                  ? "Write your self-review"
                  : `Next: ${next.subjectName}`}
              </ButtonLink>
              <TextLink href="/performance">Back to performance</TextLink>
            </>
          ) : (
            <>
              <ButtonLink href="/performance" variant="accent" size="lg">
                Back to performance
              </ButtonLink>
              {!review.anonymous && (
                <TextLink href={`/performance/reviews/${review.id}`}>
                  See what you sent
                </TextLink>
              )}
            </>
          )
        }
      />
    </div>
  );
}
