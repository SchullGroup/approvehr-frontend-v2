"use client";

import { useState } from "react";
import Link from "next/link";
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
import { LanguageCheck } from "@/components/performance/language-check";
import {
  SuggestButton,
  SuggestionPanel,
} from "@/components/performance/suggestions";
import { useDevelopmentSuggestions } from "@/lib/store/ai";
import { findingsAcross } from "@/lib/performance/review-language";
import {
  dayLabel,
  type AnswerBody,
  type ApiFormQuestion,
} from "@/lib/api/performance";
import { useReview, useReviewMutations } from "@/lib/store/performance";
import {
  AnswerField,
  AppraiserStrip,
  RATING_LABELS,
  RATING_OPTIONS,
  ReadAnswer,
  draftFrom,
  filled,
  type Draft,
} from "./review-parts";

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
 *
 * ## What the author is to the subject, when there is an answer to that
 *
 * `review.appraiser` is **absent** on a form written before the appraiser
 * mapping existed, and on every self-review. Absent means the question has no
 * answer, so the strip is not rendered at all — a role of "line manager" or a
 * weight of "0%" would be a claim rather than a blank. Presence is what is
 * checked, never a value; see convention 3 in the handover.
 *
 * When it is present and there is more than one appraiser, it says so. Somebody
 * marking a third of a mark should know that is what they are doing: a 2 written
 * as the whole judgement and a 2 written as one of three opinions are different
 * acts, and only one of them ends a career.
 *
 * ## The question, the scale and the strip live in `review-parts.tsx`
 *
 * `/performance/reviews/[id]` opens the same review as the record of a rating,
 * with the sign-off step on it. A second copy of "what a question looks like"
 * would eventually render one this form had stopped asking, so both surfaces
 * import the same pieces. This file owns the *modal* and the draft; it does not
 * own a question.
 */

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
  /**
   * Whether the language check has been put in front of them once.
   *
   * A speed bump, not a gate. The first press of Send with findings on screen
   * shows them and does not send; the second sends. The API accepts the review
   * either way and so must this — refusing what the server allows is the thing
   * this codebase keeps saying not to do.
   */
  const [languageSeen, setLanguageSeen] = useState(false);
  const development = useDevelopmentSuggestions();

  const patch = (id: string, next: Draft) =>
    setDraft((current) => ({ ...current, [id]: { ...current[id], ...next } }));

  if (loading) {
    return (
      <Modal open onClose={onClose} title="Review" size="md">
        <span className="flex items-center gap-2 text-body-sm text-muted">
          <Spinner size="sm" />
          Loading the form
        </span>
      </Modal>
    );
  }

  if (!review) {
    return (
      <Modal open onClose={onClose} title="Review" size="md">
        <p className="text-body-sm text-body">
          {error?.message ?? "That review is not available to you."}
        </p>
      </Modal>
    );
  }

  const editable = review.mine && !review.submitted;

  /**
   * Whether the language check applies at all.
   *
   * Manager reviews only. A self-review is not the rating of record, and
   * "I am disorganised" is somebody's own account of their own work — checking
   * it would be patronising, and an employee mentioning their own maternity
   * leave is a disclosure they are entitled to make. See `language-check.tsx`.
   */
  const coaching = editable && review.kind !== "SELF";

  /** What is in the box right now: the local draft, else what is stored. */
  const value = (question: ApiFormQuestion): Draft =>
    draft[question.id] ?? draftFrom(question);

  const outstanding = review.questions
    .filter(
      (question) => question.required && !filled(question, value(question)),
    )
    .map((question) => question.prompt);

  /**
   * Every box on this form that carries prose, for the language check.
   *
   * The written answers and the summary — never the ratings, which have nothing
   * to read. Recomputed per keystroke, which is affordable because there is no
   * request behind it: this check is deterministic and on-device, and the
   * reason it has to be is in `lib/performance/review-language.ts`. A model
   * would mean sending a manager's written judgement of a named colleague to a
   * third party, which `/settings/ai` and the DPA both say does not happen.
   */
  const languageTexts = coaching
    ? [...review.questions.map((question) => value(question).text ?? ""), summary]
    : [];
  const languageFindings = coaching
    ? findingsAcross(languageTexts, review.subjectName)
    : [];

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
    /* One press to read it, one to send anyway. Never on a self-review — see
       `language-check.tsx` on why somebody's own words about their own work are
       not this checker's business. */
    if (kind === "send" && coaching && languageFindings.length > 0 && !languageSeen) {
      setLanguageSeen(true);
      return;
    }
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
              {languageSeen && languageFindings.length > 0
                ? "Send anyway"
                : "Send it"}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      {/* The way to the record — but only once there is a record.
          "Open the full record for the mark, its components and the sign-off"
          is three nouns a person filling in a form has no use for, and before
          they send it there is nothing behind the link at all: no mark, no
          components, no sign-off. Somebody opening this has one job, and the
          screen should be about that job. */}
      {review.submitted && (
        <p className="mb-4 text-body-sm text-muted">
          <Link
            href={`/performance/reviews/${review.id}`}
            className="font-medium text-accent-text underline-offset-2 hover:underline"
          >
            See what came of this
          </Link>{" "}, the mark, and whether it has been signed off.
        </p>
      )}
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Only once it is sent. "Not sent yet" on an open, half-typed form
              tells the person a thing they can see — they are looking at the
              empty boxes — and the footer already says how many answers are
              outstanding before it can go. A badge that restates the obvious is
              the noise this screen had too much of. */}
          {review.submitted && (
            <Badge tone="neutral" size="sm" dot>
              Sent
            </Badge>
          )}
          {/* The sign-off state belongs here too, or the modal reads as the whole
              story about a rating that has since become the one of record. Each
              is its own fact: not finalised does not mean disputed. */}
          {review.finalised && (
            <Badge tone="accent" size="sm">
              Final
            </Badge>
          )}
          {review.acknowledged && (
            <Badge tone="success" size="sm">
              Acknowledged
            </Badge>
          )}
          {review.disputed && (
            <Badge tone="danger" size="sm">
              Disputed
            </Badge>
          )}
          {review.dueDate && (
            <span className="text-body-sm text-muted">
              Due {dayLabel(review.dueDate)}
            </span>
          )}
          {review.rating !== null && (
            <span className="text-body-sm text-body">
              Overall mark {review.rating} out of 5
            </span>
          )}
        </div>

        {/* Presence, not a value. Absent is a form the mapping never covered. */}
        {review.appraiser && (
          <AppraiserStrip
            appraiser={review.appraiser}
            mine={review.mine}
          />
        )}

        {failed && (
          <p
            role="status"
            className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink"
          >
            {failed}
          </p>
        )}

        {review.questions.length === 0 ? (
          <p className="text-body-sm text-body">
            This appraisal period has no questions for this form yet.
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
              optional
              label="Overall mark"
              help="Leave it blank if the answers say enough."
            >
              <Select
                value={mark}
                placeholder="No overall mark"
                onChange={(event) => setMark(event.target.value)}
              >
                {RATING_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {RATING_LABELS[option]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field optional label="Anything to add">
              <Textarea
                rows={3}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </Field>

            {/* Development areas, on a form about somebody else.

                Not on a self-review: the suggestion is built from competency
                scores other people gave, and handing somebody their own gaps
                phrased as development areas is a conversation their appraiser
                should be having, not a panel.

                Built only from competencies scored **below their target** — see
                `modules/ai/service.ts#suggestDevelopment`. Somebody meeting
                every target is refused rather than handed a weakness invented
                to fill the space, and the refusal is the API's own sentence. */}
            {/* What a mark could not be defended on. Manager reviews only, and
                it never blocks — the first press of Send shows it, the second
                sends anyway. */}
            <LanguageCheck
              texts={languageTexts}
              subjectName={review.subjectName}
              acknowledged={languageSeen}
            />

            {review.kind !== "SELF" && (
              <div className="flex flex-col gap-3">
                <SuggestButton
                  loading={development.loading}
                  label="Suggest development areas"
                  onClick={() =>
                    void development.ask({
                      employeeId: review.subjectId,
                      cycleId: review.cycleId,
                    })
                  }
                />
                <SuggestionPanel
                  state={development}
                  onDismiss={development.clear}
                  useLabel="Add to my notes"
                  emptyHint={`${review.subjectName} never sees this: it is a note for you.`}
                  /* Appended rather than replacing: an appraiser has usually
                     already written something, and a suggestion that wiped it
                     would lose the only part of this form nobody can regenerate. */
                  onUse={(suggestion) =>
                    setSummary((current) =>
                      [current.trim(), `${suggestion.title}: ${suggestion.detail}`]
                        .filter(Boolean)
                        .join("\n\n"),
                    )
                  }
                />
              </div>
            )}
          </div>
        )}

        {!editable && review.summary && (
          <div className="border-t border-line pt-5">
            <p className="text-meta font-medium text-muted">In summary</p>
            <p className="mt-1 text-body-sm leading-relaxed text-ink">
              {review.summary}
            </p>
          </div>
        )}

        {editable && outstanding.length > 0 && (
          <p className="text-body-sm text-body">
            {outstanding.length === 1
              ? "1 question still to answer before you can send it."
              : `${outstanding.length} questions still to answer before you can send it.`}
          </p>
        )}
      </div>
    </Modal>
  );
}
