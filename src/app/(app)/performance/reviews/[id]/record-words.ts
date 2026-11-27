import { dayLabel, dayOf, type ApiReviewDetail } from "@/lib/api/performance";
import {
  MANAGER_REVIEW_LABEL,
  SELF_REVIEW_LABEL,
} from "@/lib/performance/review-comparison";

/**
 * The words the record of one appraisal uses for itself, as pure functions so
 * what a record says is a decision about a review and not something to find by
 * reading JSX.
 */

type Titled = Pick<ApiReviewDetail, "kind" | "kindLabel" | "subjectName">;

/**
 * The page's title: whose, and what: "Femi Balogun's manager review", and "Your
 * manager review" for the person it is about. It used to be "Manager review" and
 * nothing else, so a manager or HR reader could not tell whose record they had
 * opened. The period is the page's small line beneath, not part of this.
 *
 * One spelling of each kind: "Self review", never "Self-review", whatever the
 * API's own label says.
 */
export function recordTitle(review: Titled, isSubject: boolean): string {
  const kind =
    review.kind === "MANAGER"
      ? MANAGER_REVIEW_LABEL
      : review.kind === "SELF"
        ? SELF_REVIEW_LABEL
        : review.kindLabel;
  const lower = kind.toLowerCase();
  return isSubject ? `Your ${lower}` : `${review.subjectName}'s ${lower}`;
}

/**
 * The one small line under the rating: who wrote it and when each thing happened,
 * "Chidinma Ipoola · sent 3 Sep 2026 · final 5 Sep 2026 · acknowledged 6 Sep 2026".
 *
 * Each fact once, in the order it happened. It is the only place a date is said:
 * the badges that used to repeat them are one status in the header.
 *
 * - **Who** is the author's name, left out for peer feedback, where the API
 *   withholds it and a line about a name that is not there would be a line about
 *   nothing. With several appraisers it carries their role, because who wrote it
 *   is the question then.
 * - **A rating the author gave** is said here when it is not the headline: the
 *   headline is the score of record once there is one, and the appraiser's own
 *   overall rating is what they gave, said beside their name.
 * - **Not sent** is the header's status and is not said again here; what this
 *   adds is the date it is due. The line is empty when there is nothing to say.
 */
export function recordLine(
  review: Pick<
    ApiReviewDetail,
    | "anonymous"
    | "authorName"
    | "submitted"
    | "submittedAt"
    | "dueDate"
    | "finalisedAt"
    | "acknowledged"
    | "acknowledgedAt"
    | "disputed"
    | "disputedAt"
    | "appraiser"
  >,
  options: { rated?: string | null } = {},
): string {
  const role =
    review.appraiser && review.appraiser.appraiserCount > 1
      ? ` (${review.appraiser.roleLabel})`
      : "";
  const author =
    review.anonymous || !review.authorName
      ? null
      : `${review.authorName}${role}`;

  const parts = [
    author,
    options.rated ? `rated ${options.rated}` : null,
    review.submittedAt
      ? `sent ${dayOf(review.submittedAt)}`
      : !review.submitted && review.dueDate
        ? `due ${dayLabel(review.dueDate)}`
        : null,
    review.finalisedAt ? `final ${dayOf(review.finalisedAt)}` : null,
    review.disputed && review.disputedAt
      ? `disputed ${dayOf(review.disputedAt)}`
      : review.acknowledged && review.acknowledgedAt
        ? `acknowledged ${dayOf(review.acknowledgedAt)}`
        : null,
  ].filter((part): part is string => part !== null);

  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** The status the header says, once: the furthest the record has got. */
export type RecordStatus = {
  label: "Not sent yet" | "Sent" | "Final" | "Acknowledged" | "Disputed";
  tone: "warning" | "neutral" | "accent" | "success" | "danger";
};

export function recordStatus(
  review: Pick<
    ApiReviewDetail,
    "submitted" | "finalised" | "acknowledged" | "disputed"
  >,
): RecordStatus {
  if (review.disputed) return { label: "Disputed", tone: "danger" };
  if (review.acknowledged) return { label: "Acknowledged", tone: "success" };
  if (review.finalised) return { label: "Final", tone: "accent" };
  if (review.submitted) return { label: "Sent", tone: "neutral" };
  return { label: "Not sent yet", tone: "warning" };
}
