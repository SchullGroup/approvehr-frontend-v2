"use client";

import { Badge, Field, Select, Textarea } from "@/components/ui";
import {
  weightLabel,
  type ApiAppraiserContext,
  type ApiFormQuestion,
} from "@/lib/api/performance";

/**
 * The pieces a review is made of, shared by the modal and the full record.
 *
 * There are two places a review is opened — `review-form.tsx` as a modal from a
 * task list, and `/performance/reviews/[id]` as the record of a rating — and
 * they are different acts on the same document: one fills a form in, the other
 * reads a mark and answers it. What they must **not** differ about is what a
 * question looks like, because a read-only copy that drifts eventually renders a
 * question the form has stopped asking, or renders an unanswered one as blank
 * rather than as unanswered.
 *
 * So the question, the answer, the scale and the appraiser strip live here once.
 * Neither surface owns them.
 */

/**
 * 1–5, in words.
 *
 * A bare number is not a scale anybody agrees on: two managers picking "3" for
 * different reasons is the whole problem an appraisal exists to avoid. The
 * ceiling is five because that is the documented range of `Review.rating` and of
 * `submitReviewSchema`, which refuses anything outside it.
 */
export const RATING_LABELS: Record<string, string> = {
  "1": "1 — Well below what was needed",
  "2": "2 — Below what was needed",
  "3": "3 — Did what was needed",
  "4": "4 — Above what was needed",
  "5": "5 — Far above what was needed",
};

export const RATING_OPTIONS = ["1", "2", "3", "4", "5"] as const;

/** What is in one answer box right now, before anything is saved. */
export type Draft = {
  text?: string;
  rating?: string;
  choice?: string;
  bool?: string;
};

/**
 * The saved answer as a draft, or an empty draft when there is none.
 *
 * `{}` and "answered with an empty string" are different facts, and this returns
 * the first as `{}` so `filled` below can tell them apart.
 */
export function draftFrom(question: ApiFormQuestion): Draft {
  const answer = question.answer;
  if (!answer) return {};
  return {
    text: answer.textValue ?? undefined,
    rating:
      answer.ratingValue === null ? undefined : String(answer.ratingValue),
    choice: answer.choiceValue ?? undefined,
    bool:
      answer.boolValue === null ? undefined : answer.boolValue ? "yes" : "no",
  };
}

/** Whether this question has an answer of the kind it asked for. */
export function filled(question: ApiFormQuestion, held: Draft): boolean {
  switch (question.kind) {
    case "RATING":
      return Boolean(held.rating);
    case "CHOICE":
      return Boolean(held.choice);
    case "BOOLEAN":
      return Boolean(held.bool);
    default:
      return Boolean(held.text && held.text.trim());
  }
}

/* -------------------------------------------------------------------------- */

/**
 * What this author is to this subject, and how much of the mark it is.
 *
 * Only rendered when the API returned an assignment — `ApiReviewDetail.appraiser`
 * is **absent** on a self-review and on a manager form written before the
 * mapping existed. Absent means the question has no answer, so a role of "line
 * manager" or a weight of "0%" would be a claim rather than a blank.
 *
 * `appraiserCount` is what turns "40%" from a fraction into a sentence: a share
 * means nothing without knowing what it is a share of, and one appraiser at 100%
 * needs no sentence at all, so it does not get one.
 */
export function AppraiserStrip({
  appraiser,
  subjectName,
  mine,
}: {
  appraiser: ApiAppraiserContext;
  subjectName: string;
  mine: boolean;
}) {
  const shared = appraiser.appraiserCount > 1;

  return (
    <div className="rounded-md border border-line bg-canvas px-3.5 py-3">
      <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink">
        <Badge tone="accent" size="sm">
          {appraiser.roleLabel}
        </Badge>
        <span>
          {mine ? "You are appraising" : "Appraising"} {subjectName} as their{" "}
          {appraiser.roleLabel.toLowerCase()}
          {shared
            ? `, for ${weightLabel(appraiser.weightBp)} of the mark — one of ${appraiser.appraiserCount} appraisers.`
            : ", and yours is the whole mark."}
        </span>
      </p>
      {appraiser.note && (
        <p className="mt-1.5 text-body-sm text-body">{appraiser.note}</p>
      )}
      {shared && (
        <p className="mt-1.5 text-body-sm text-muted">
          The final mark is the weighted average of everybody who answers.
          Answer for the part of the work you actually saw.
        </p>
      )}
    </div>
  );
}

export function AnswerField({
  question,
  held,
  onChange,
}: {
  question: ApiFormQuestion;
  held: Draft;
  onChange: (next: Draft) => void;
}) {
  if (question.kind === "RATING") {
    return (
      <Field label={question.prompt} required={question.required}>
        <Select
          value={held.rating ?? ""}
          placeholder="Pick a mark"
          onChange={(event) => onChange({ rating: event.target.value })}
        >
          {RATING_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {RATING_LABELS[option]}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (question.kind === "CHOICE") {
    return (
      <Field label={question.prompt} required={question.required}>
        <Select
          value={held.choice ?? ""}
          placeholder="Pick one"
          onChange={(event) => onChange({ choice: event.target.value })}
        >
          {question.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (question.kind === "BOOLEAN") {
    return (
      <Field label={question.prompt} required={question.required}>
        <Select
          value={held.bool ?? ""}
          placeholder="Yes or no"
          onChange={(event) => onChange({ bool: event.target.value })}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      </Field>
    );
  }

  return (
    <Field label={question.prompt} required={question.required}>
      <Textarea
        rows={4}
        value={held.text ?? ""}
        onChange={(event) => onChange({ text: event.target.value })}
      />
    </Field>
  );
}

/**
 * One answered question, read back.
 *
 * An unanswered question renders as "Not answered" rather than as an empty line.
 * A blank there reads as an answer somebody gave and cannot be told apart from a
 * question nobody reached, which on a rating somebody is disputing is the
 * difference between evidence and a gap.
 */
export function ReadAnswer({
  question,
  held,
}: {
  question: ApiFormQuestion;
  held: Draft;
}) {
  const answer =
    question.kind === "RATING"
      ? held.rating
        ? `${held.rating} out of 5`
        : null
      : question.kind === "BOOLEAN"
        ? held.bool
          ? held.bool === "yes"
            ? "Yes"
            : "No"
          : null
        : question.kind === "CHOICE"
          ? (held.choice ?? null)
          : (held.text ?? null);

  return (
    <div>
      <p className="text-meta font-medium text-muted">{question.prompt}</p>
      <p className="mt-1 text-body-sm leading-relaxed text-ink">
        {answer ?? "Not answered"}
      </p>
    </div>
  );
}
