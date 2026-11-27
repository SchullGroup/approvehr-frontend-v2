"use client";

import type { ReactNode } from "react";
import { Card, CardBody, Spinner } from "@/components/ui";
import {
  dayOf,
  showsOverallMark,
  type ApiFormQuestion,
  type ApiReviewDetail,
} from "@/lib/api/performance";
import { pinsOf } from "@/lib/api/work-pins";
import {
  MANAGER_REVIEW_LABEL,
  SELF_REVIEW_LABEL,
  closingNoteLabel,
  comparisonRows,
} from "@/lib/performance/review-comparison";
import { ReadAnswer, ReadAnswerBody, draftFrom } from "../../review-parts";

/**
 * Whether there is anything for the Answers tab to show: a question with an
 * answer to read, a closing note, or (beside a self review) the two overall
 * ratings. A form with none of it has no card, and so no tab, where it used to
 * have a card headed "Manager review" and an empty state telling an employee to
 * add questions to the period.
 */
export function hasAnswers(
  review: ApiReviewDetail,
  selfReview: ApiReviewDetail | null,
): boolean {
  const comparing = review.kind === "MANAGER" && selfReview !== null;
  if (!comparing) return review.questions.length > 0 || Boolean(review.summary);
  return (
    comparisonRows(review.questions, selfReview.questions).length > 0 ||
    showsOverallMark(review) ||
    showsOverallMark(selfReview) ||
    Boolean(review.summary) ||
    Boolean(selfReview.summary)
  );
}

/**
 * The questions and the answers of the review being read, and of the person's own
 * self review beside it when there is one: the Answers tab of the record.
 *
 * ## One card, no heading
 *
 * The tab is called Answers, so the card does not say so again, and it has no
 * description. It used to say how much of the form was still to do ("1 required
 * question still to answer") above a form that had already been sent, and to
 * repeat the period and the company's instructions above the answers. What is
 * left to do is the form's own business and is said where it is filled in; the
 * period is the page's small line under its title; the instructions are for
 * somebody answering. Nothing here is to do, so nothing here is a status.
 *
 * Where there is nothing to read the card is not drawn (`hasAnswers`).
 *
 * ## Two columns
 *
 * On a manager's review with the person's self review in, this is one card with a
 * column for each, question by question, so a difference is something you see on
 * one line. The columns are named for what they are, **Self review** and
 * **Manager review**, and say who wrote each and when.
 *
 * On a phone the two answers to a question stack, each under its own label.
 *
 * ## When the self review is not there
 *
 * `selfReview` is null for several different reasons (it has not been sent, the
 * reader may not read it, there is no API) and none of them is "they wrote
 * nothing". So the card says nothing about it and shows the one review it has.
 * While it is loading the card says so, in one line, and does not leave a column
 * empty that will fill.
 *
 * ## What is read from where
 *
 * Every answer is read from its own review's own question, through the same
 * `ReadAnswerBody` the single-review card uses, so an answer is worded one way
 * wherever it appears: the company's words for a level, a pick by its label, a
 * file as something to open (with the id of the review it belongs to, since the
 * evidence is that review's).
 *
 * ## The closing note has one word
 *
 * "Recommendations" where a manager wrote it, "Note" otherwise (`closingNoteLabel`).
 */
export function ReviewFormCard({
  review,
  selfReview,
  selfLoading,
  ratingWords,
}: {
  review: ApiReviewDetail;
  selfReview: ApiReviewDetail | null;
  selfLoading: boolean;
  ratingWords: (level: number | null | undefined) => string | null;
}) {
  const comparing = review.kind === "MANAGER" && selfReview !== null;

  if (!comparing) {
    const loadingSelf = review.kind === "MANAGER" && selfLoading;
    return (
      <Card>
        <CardBody className="flex flex-col gap-4">
          {loadingSelf && (
            <p className="inline-flex items-center gap-2 text-body-sm text-muted">
              <Spinner size="sm" />
              Loading their self review
            </p>
          )}
          {review.questions.map((question) => (
            <ReadAnswer
              key={question.id}
              question={question}
              held={draftFrom(question)}
              reviewId={review.id}
              {...(review.kind === "SELF"
                ? {
                    pins: pinsOf(question.pins),
                    pinnedBy: review.mine ? "you" : review.subjectName,
                  }
                : {})}
            />
          ))}
          {review.summary && (
            <div>
              <p className="text-meta font-medium text-muted">
                {closingNoteLabel(review.kind)}
              </p>
              <p className="mt-1 text-body-sm leading-relaxed whitespace-pre-line text-ink">
                {review.summary}
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  const rows = comparisonRows(review.questions, selfReview.questions);
  const showMark = showsOverallMark(review) || showsOverallMark(selfReview);
  const showNote = Boolean(review.summary || selfReview.summary);

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        {/* The column names, once, on a wide screen. On a phone each answer
            carries its own label instead, and a heading row over a single
            column would say nothing, so it is not drawn. Hidden from assistive
            technology because every answer below is labelled for it. */}
        <div
          aria-hidden="true"
          className="hidden gap-6 border-b border-line pb-3 sm:grid sm:grid-cols-2"
        >
          <ColumnHead
            label={SELF_REVIEW_LABEL}
            by={review.subjectName}
            sentAt={selfReview.submittedAt}
          />
          <ColumnHead
            label={MANAGER_REVIEW_LABEL}
            by={review.authorName ?? "Not recorded"}
            sentAt={review.submittedAt}
          />
        </div>

        {/* The overall mark and the closing note are the review's own and are
            there whether or not the period asked a question, so they do not
            wait on the list being non-empty. */}
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 py-4 first:pt-0">
              <p className="text-meta font-medium text-muted">{row.prompt}</p>
              <Pair
                self={
                  <Answer
                    question={row.self}
                    reviewId={selfReview.id}
                    pinnedBy={selfReview.mine ? "you" : selfReview.subjectName}
                  />
                }
                manager={<Answer question={row.manager} reviewId={review.id} />}
              />
            </li>
          ))}

          {showMark && (
            <li className="flex flex-col gap-2 py-4 first:pt-0">
              <p className="text-meta font-medium text-muted">Overall rating</p>
              <Pair
                self={<Mark rating={selfReview.rating} words={ratingWords} />}
                manager={<Mark rating={review.rating} words={ratingWords} />}
              />
            </li>
          )}

          {showNote && (
            <li className="flex flex-col gap-2 pt-4 first:pt-0">
              <p className="text-meta font-medium text-muted">
                {closingNoteLabel("BOTH")}
              </p>
              <Pair
                self={<Note text={selfReview.summary} />}
                manager={<Note text={review.summary} />}
              />
            </li>
          )}
        </ul>
      </CardBody>
    </Card>
  );
}

/** What a column is, who wrote it, and when it was sent. */
function ColumnHead({
  label,
  by,
  sentAt,
}: {
  label: string;
  by: string;
  sentAt: string | null;
}) {
  return (
    <div>
      <p className="text-body-sm font-semibold text-ink">{label}</p>
      <p className="text-meta text-muted">
        {sentAt ? `${by}, sent ${dayOf(sentAt)}` : `${by}, not sent yet`}
      </p>
    </div>
  );
}

/**
 * Two answers to one question: side by side on a wide screen, one under the
 * other on a phone. Each says which it is. On a wide screen the column heading
 * above says it already, so the label is for assistive technology alone; on a
 * phone it is what tells the two apart.
 */
function Pair({ self, manager }: { self: ReactNode; manager: ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-6">
      <div className="min-w-0">
        <p className="text-meta text-muted sm:sr-only">{SELF_REVIEW_LABEL}</p>
        {self}
      </div>
      <div className="min-w-0">
        <p className="text-meta text-muted sm:sr-only">
          {MANAGER_REVIEW_LABEL}
        </p>
        {manager}
      </div>
    </div>
  );
}

/**
 * One review's answer to a question, or the fact that it was not put to them.
 *
 * "Not asked" is not "Not answered": the first is a question their form did not
 * have and the second is one it had and they left, and a reader comparing two
 * columns needs to know which is which.
 */
function Answer({
  question,
  reviewId,
  pinnedBy,
}: {
  question: ApiFormQuestion | null;
  reviewId: string;
  /**
   * Set only for the person's own self-review column: its answers carry the work the person
   * pinned, and this is whose choice that was. A manager's column passes none, so it never draws
   * pins.
   */
  pinnedBy?: string;
}) {
  if (question === null) {
    return <p className="text-body-sm text-muted">Not asked</p>;
  }
  return (
    <ReadAnswerBody
      question={question}
      held={draftFrom(question)}
      reviewId={reviewId}
      {...(pinnedBy !== undefined
        ? { pins: pinsOf(question.pins), pinnedBy }
        : {})}
    />
  );
}

/** An overall mark in the company's own words. Absent is absent, never a zero. */
function Mark({
  rating,
  words,
}: {
  rating: number | null;
  words: (level: number | null | undefined) => string | null;
}) {
  return (
    <p
      className={
        rating === null
          ? "text-body-sm text-muted"
          : "text-body-sm leading-relaxed text-ink"
      }
    >
      {rating === null ? "Not recorded" : (words(rating) ?? "Not recorded")}
    </p>
  );
}

/** A closing note, or the plain fact that nothing was added. */
function Note({ text }: { text: string | null }) {
  return text ? (
    <p className="text-body-sm leading-relaxed whitespace-pre-line text-ink">
      {text}
    </p>
  ) : (
    <p className="text-body-sm text-muted">Nothing added</p>
  );
}
