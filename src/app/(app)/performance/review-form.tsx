"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Field,
  Modal,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { dayLabel, type AnswerBody, type ApiFormQuestion } from "@/lib/api/performance";
import { useReview, useReviewMutations } from "@/lib/store/performance";

/**
 * One review, opened.
 *
 * ## The same component fills one in and reads one back
 *
 * `review.mine` says whether this caller is the person who has to answer, and
 * `review.submitted` says whether it has gone. Between them they decide whether
 * this is a form or a record. Two components would drift: the read-only one
 * would eventually show a question the form had stopped asking.
 *
 * ## The draft is layered over the saved answers, not copied into state
 *
 * `value(question)` reads the local draft first and the saved answer second.
 * Copying the answers into state on open would need a `setState` in an effect —
 * a lint error here — and would silently discard anything saved from another
 * tab. This way a reopened form shows what the server holds.
 *
 * ## Sending is refused while a required question is blank, and it names them
 *
 * Same rule as the API, checked here too so the refusal arrives before the
 * request. A form that says "some required fields are missing" on a
 * twelve-question form costs somebody ten minutes of scrolling.
 */

/** 1–5, in words. A bare number is not a scale anybody agrees on. */
const RATING_LABELS: Record<string, string> = {
  "1": "1 — Well below what was needed",
  "2": "2 — Below what was needed",
  "3": "3 — Did what was needed",
  "4": "4 — Above what was needed",
  "5": "5 — Far above what was needed",
};

type Draft = { text?: string; rating?: string; choice?: string; bool?: string };

export function ReviewFormModal({
  reviewId,
  onClose,
  onDone,
}: {
  reviewId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { review, loading, error } = useReview(reviewId);
  const { save, send } = useReviewMutations();

  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [mark, setMark] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "send" | null>(null);

  const patch = (id: string, next: Draft) =>
    setDraft((current) => ({ ...current, [id]: { ...current[id], ...next } }));

  if (loading) {
    return (
      <Modal open onClose={onClose} title="Review" size="md">
        <span className="flex items-center gap-2 text-[0.875rem] text-muted">
          <Spinner size="sm" />
          Loading the form
        </span>
      </Modal>
    );
  }

  if (!review) {
    return (
      <Modal open onClose={onClose} title="Review" size="md">
        <p className="text-[0.875rem] text-body">
          {error?.message ?? "That review is not available to you."}
        </p>
      </Modal>
    );
  }

  const editable = review.mine && !review.submitted;

  /** What is in the box right now: the local draft, else what is stored. */
  const value = (question: ApiFormQuestion): Draft => {
    const local = draft[question.id];
    if (local) return local;
    const answer = question.answer;
    if (!answer) return {};
    return {
      text: answer.textValue ?? undefined,
      rating: answer.ratingValue === null ? undefined : String(answer.ratingValue),
      choice: answer.choiceValue ?? undefined,
      bool:
        answer.boolValue === null ? undefined : answer.boolValue ? "yes" : "no",
    };
  };

  const filled = (question: ApiFormQuestion): boolean => {
    const held = value(question);
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
  };

  const outstanding = review.questions
    .filter((question) => question.required && !filled(question))
    .map((question) => question.prompt);

  /** Only what has actually been typed. Re-answering replaces on the API side. */
  const answers = (): AnswerBody[] =>
    review.questions.flatMap((question) => {
      const held = draft[question.id];
      if (!held) return [];
      const body: AnswerBody = { questionId: question.id };
      if (question.kind === "RATING" && held.rating) {
        body.ratingValue = Number(held.rating);
      } else if (question.kind === "CHOICE" && held.choice) {
        body.choiceValue = held.choice;
      } else if (question.kind === "BOOLEAN" && held.bool) {
        body.boolValue = held.bool === "yes";
      } else if (held.text && held.text.trim()) {
        body.textValue = held.text.trim();
      } else {
        return [];
      }
      return [body];
    });

  const act = async (kind: "save" | "send") => {
    setFailed(null);
    setBusy(kind);
    try {
      const pending = answers();
      if (pending.length > 0) await save(review.id, pending);
      if (kind === "send") {
        const body: { rating?: number; summary?: string } = {};
        if (mark) body.rating = Number(mark);
        if (summary.trim()) body.summary = summary.trim();
        await send(review.id, body, outstanding);
      }
      onDone();
      if (kind === "send") onClose();
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`${review.kindLabel} · ${review.cycleName}`}
      description={
        review.kind === "SELF"
          ? "Your own words about your own work."
          : `About ${review.subjectName}.`
      }
      size="lg"
      footer={
        editable ? (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button loading={busy === "save"} onClick={() => void act("save")}>
              Save and finish later
            </Button>
            <Button
              variant="accent"
              loading={busy === "send"}
              onClick={() => void act("send")}
            >
              Send it
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={review.submitted ? "neutral" : "warning"} size="sm" dot>
            {review.submitted ? "Sent" : "Not sent yet"}
          </Badge>
          {review.dueDate && (
            <span className="text-[0.875rem] text-muted">
              Due {dayLabel(review.dueDate)}
            </span>
          )}
          {review.rating !== null && (
            <span className="text-[0.875rem] text-body">
              Overall mark {review.rating} out of 5
            </span>
          )}
        </div>

        {failed && (
          <p
            role="status"
            className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-[0.875rem] text-ink"
          >
            {failed}
          </p>
        )}

        {review.questions.length === 0 ? (
          <p className="text-[0.875rem] text-body">
            This cycle has no questions for this form yet.
          </p>
        ) : (
          review.questions.map((question) =>
            editable ? (
              <AnswerField
                key={question.id}
                question={question}
                held={value(question)}
                onChange={(next) => patch(question.id, next)}
              />
            ) : (
              <ReadAnswer
                key={question.id}
                question={question}
                held={value(question)}
              />
            ),
          )
        )}

        {editable && review.questions.length > 0 && (
          <div className="flex flex-col gap-4 border-t border-line pt-5">
            <Field
              label="Overall mark"
              help="Optional. Leave it blank if the answers say enough."
            >
              <Select
                value={mark}
                placeholder="No overall mark"
                onChange={(event) => setMark(event.target.value)}
              >
                {["1", "2", "3", "4", "5"].map((option) => (
                  <option key={option} value={option}>
                    {RATING_LABELS[option]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Anything to add" help="Optional.">
              <Textarea
                rows={3}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </Field>
          </div>
        )}

        {!editable && review.summary && (
          <div className="border-t border-line pt-5">
            <p className="text-[0.75rem] font-medium text-muted">In summary</p>
            <p className="mt-1 text-[0.875rem] leading-relaxed text-ink">
              {review.summary}
            </p>
          </div>
        )}

        {editable && outstanding.length > 0 && (
          <p className="text-[0.875rem] text-body">
            {outstanding.length === 1
              ? "1 question still to answer before you can send it."
              : `${outstanding.length} questions still to answer before you can send it.`}
          </p>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function AnswerField({
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
          {["1", "2", "3", "4", "5"].map((option) => (
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

function ReadAnswer({
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
      <p className="text-[0.75rem] font-medium text-muted">{question.prompt}</p>
      <p className="mt-1 text-[0.875rem] leading-relaxed text-ink">
        {answer ?? "Not answered"}
      </p>
    </div>
  );
}
