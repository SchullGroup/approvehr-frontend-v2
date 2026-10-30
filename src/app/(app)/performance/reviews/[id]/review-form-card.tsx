"use client";

import type { ReactNode } from "react";
import { FileQuestion } from "lucide-react";
import {
  Card,
  CardBody,
  CardHeader,
  ButtonLink,
  EmptyState,
  Spinner,
} from "@/components/ui";
import {
  dayOf,
  showsOverallMark,
  type ApiFormQuestion,
  type ApiReviewDetail,
} from "@/lib/api/performance";
import {
  CLOSING_NOTE_LABEL,
  MANAGER_REVIEW_LABEL,
  SELF_REVIEW_LABEL,
  comparisonRows,
} from "@/lib/performance/review-comparison";
import {
  PeriodFraming,
  ReadAnswer,
  ReadAnswerBody,
  draftFrom,
} from "../../review-parts";

/**
 * How much of this form is still to do, in a sentence whose noun is true.
 *
 * `outstanding` is **required** questions only — the API filters on
 * `question.required && answer === null`, which is the right thing for it to
 * carry, because required-and-unanswered is what refuses a submit. The
 * description read *"2 questions still unanswered"* above three questions
 * each showing "Not answered": the number was right and the noun was not.
 *
 * Naming the requirement also makes the number useful rather than merely
 * accurate — what a reader wants to know is what is standing between them and
 * sending the form. The optional ones are still counted, separately, because
 * silently dropping an unanswered question from a summary is how a form gets
 * sent with a blank nobody meant to leave.
 *
 * The same rule the payroll side keeps a helper pair for: a number under a
 * label has to be true of the thing the label names.
 */
export function unansweredLine(review: {
  outstanding: string[];
  questions: { required: boolean; answer: unknown }[];
}): string {
  const required = review.outstanding.length;
  const optional = review.questions.filter(
    (question) => !question.required && question.answer === null,
  ).length;

  const optionalPart =
    optional === 0
      ? ""
      : optional === 1
        ? " One optional question is also unanswered."
        : ` ${String(optional)} optional questions are also unanswered.`;

  if (required === 0) {
    return optional === 0
      ? "Every question on this form is answered."
      : `Every required question is answered.${optionalPart}`;
  }
  const requiredPart =
    required === 1
      ? "1 required question still to answer."
      : `${String(required)} required questions still to answer.`;
  return `${requiredPart}${optionalPart}`;
}

/**
 * The questions and the answers of the review being read, and of the person's own
 * self review beside it when there is one.
 *
 * ## One card, two columns
 *
 * It used to be two cards one above the other, "What was asked, and what was
 * answered" and "What they said about their own period", and the comparison that
 * was the point of having both was left to the reader to make by scrolling. On a
 * manager's review with the person's self review in, this is one card with a
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
 * nothing". So the card says nothing about it and shows the one review it has,
 * under the name of what it is. While it is loading the card says so in its
 * description and does not leave a column empty that will fill.
 *
 * ## What is read from where
 *
 * Every answer is read from its own review's own question, through the same
 * `ReadAnswerBody` the single-review card uses, so an answer is worded one way
 * wherever it appears: the company's words for a level, a pick by its label, a
 * file as something to open (with the id of the review it belongs to, since the
 * evidence is that review's).
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
  const filling = review.mine && !review.submitted;

  const action = filling ? (
    <ButtonLink
      href={`/performance/reviews/${review.id}/answer`}
      variant="accent"
      size="sm"
    >
      Fill it in
    </ButtonLink>
  ) : undefined;

  if (!comparing) {
    const title =
      review.kind === "MANAGER"
        ? MANAGER_REVIEW_LABEL
        : review.kind === "SELF"
          ? SELF_REVIEW_LABEL
          : review.kindLabel;
    const loadingSelf = review.kind === "MANAGER" && selfLoading;
    return (
      <Card>
        <CardHeader
          title={title}
          description={
            loadingSelf ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size="sm" />
                Loading their self review
              </span>
            ) : (
              unansweredLine(review)
            )
          }
          {...(action ? { action } : {})}
        />
        {review.questions.length === 0 ? (
          <EmptyState
            compact
            icon={<FileQuestion aria-hidden="true" />}
            title="No questions on this form"
            description="Add questions to the period and they will show up here."
          />
        ) : (
          <CardBody className="flex flex-col gap-4">
            {/* Above the answers, because this is the record of a mark and
                what period it covers is part of the record. Renders nothing
                when the period states nothing. */}
            <PeriodFraming
              periodStart={review.periodStart}
              periodEnd={review.periodEnd}
              instructions={review.instructions}
              guideUrl={review.guideUrl}
            />
            {review.questions.map((question) => (
              <ReadAnswer
                key={question.id}
                question={question}
                held={draftFrom(question)}
                reviewId={review.id}
              />
            ))}
            {review.summary && (
              <div>
                <p className="text-meta font-medium text-muted">
                  {CLOSING_NOTE_LABEL}
                </p>
                <p className="mt-1 text-body-sm leading-relaxed text-ink">
                  {review.summary}
                </p>
              </div>
            )}
          </CardBody>
        )}
      </Card>
    );
  }

  const rows = comparisonRows(review.questions, selfReview.questions);
  const showMark = showsOverallMark(review) || showsOverallMark(selfReview);

  return (
    <Card>
      <CardHeader
        title={`${SELF_REVIEW_LABEL} and ${MANAGER_REVIEW_LABEL.toLowerCase()}`}
        description={
          filling
            ? unansweredLine(review)
            : "Each question, with their answer beside their manager's."
        }
        {...(action ? { action } : {})}
      />
      <CardBody className="flex flex-col gap-4">
        <PeriodFraming
          periodStart={review.periodStart}
          periodEnd={review.periodEnd}
          instructions={review.instructions}
          guideUrl={review.guideUrl}
        />

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
        {rows.length === 0 && (
          <p className="text-body-sm text-muted">
            Neither form had any questions.
          </p>
        )}
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-2 py-4 first:pt-0">
              <p className="text-meta font-medium text-muted">{row.prompt}</p>
              <Pair
                self={<Answer question={row.self} reviewId={selfReview.id} />}
                manager={<Answer question={row.manager} reviewId={review.id} />}
              />
            </li>
          ))}

          {showMark && (
            <li className="flex flex-col gap-2 py-4 first:pt-0">
              <p className="text-meta font-medium text-muted">Overall mark</p>
              <Pair
                self={<Mark rating={selfReview.rating} words={ratingWords} />}
                manager={<Mark rating={review.rating} words={ratingWords} />}
              />
            </li>
          )}

          <li className="flex flex-col gap-2 pt-4 first:pt-0">
            <p className="text-meta font-medium text-muted">
              {CLOSING_NOTE_LABEL}
            </p>
            <Pair
              self={<Note text={selfReview.summary} />}
              manager={<Note text={review.summary} />}
            />
          </li>
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
}: {
  question: ApiFormQuestion | null;
  reviewId: string;
}) {
  if (question === null) {
    return <p className="text-body-sm text-muted">Not asked</p>;
  }
  return (
    <ReadAnswerBody
      question={question}
      held={draftFrom(question)}
      reviewId={reviewId}
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
      {rating === null ? "None given" : (words(rating) ?? "None given")}
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
