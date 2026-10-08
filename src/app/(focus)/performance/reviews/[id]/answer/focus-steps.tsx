"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { LanguageCheck } from "@/components/performance/language-check";
import {
  SuggestButton,
  SuggestionPanel,
} from "@/components/performance/suggestions";
import type { useDevelopmentSuggestions } from "@/lib/store/ai";
import {
  dayLabel,
  ratingWordsFrom,
  type ApiFormQuestion,
  type ApiRatingScale,
  type ApiReviewDetail,
} from "@/lib/api/performance";
import {
  AppraiserStrip,
  PeriodFraming,
  ReadAnswer,
  filled,
  type Draft,
} from "@/app/(app)/performance/review-parts";
import {
  FocusQuestion,
  PickList,
  WriteBox,
  ratingOptions,
} from "./focus-question";

/**
 * What each page of the review says.
 *
 * The engine — which page you are on, what is saved, what the keys do — is
 * `focus-form.tsx`. This file is only the pages, so a change to the wording of
 * one never has to be made inside the logic that moves between them.
 */

/** The heading every page opens with. Focus lands on it unless there is a box to type in. */
function Frame({
  eyebrow,
  title,
  headingId,
  focusHeading = true,
  lead,
  children,
}: {
  eyebrow?: ReactNode;
  title: string;
  headingId: string;
  /** Off for a page that puts the cursor in a box instead. */
  focusHeading?: boolean;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeading) heading.current?.focus();
  }, [focusHeading]);

  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      {eyebrow && (
        <p className="mb-3 flex items-center gap-1.5 text-body-sm font-medium text-accent-text">
          {eyebrow}
        </p>
      )}
      <h1
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className="text-h3 text-ink outline-none sm:text-h2"
      >
        {title}
      </h1>
      {lead && <p className="mt-3 text-lead text-body">{lead}</p>}
      {children && <div className="mt-8 flex flex-col gap-6">{children}</div>}
    </section>
  );
}

const HEADING = "focus-heading";

/** The shortcut for "go on", in the words of the machine somebody is using. */
function continueKeys(): string {
  if (typeof navigator === "undefined") return "Ctrl Enter";
  return /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ Enter" : "Ctrl Enter";
}

export function IntroStep({
  review,
  resumed,
  answered,
  onShowWork,
}: {
  review: ApiReviewDetail;
  resumed: boolean;
  answered: number;
  onShowWork: (() => void) | null;
}) {
  const total = review.questions.length;
  return (
    <Frame
      headingId={HEADING}
      eyebrow={`${review.kindLabel} · ${review.cycleName}`}
      title={
        review.kind === "SELF"
          ? "Your self-review"
          : `${review.kindLabel} for ${review.subjectName}`
      }
      lead={
        review.kind === "SELF"
          ? "Your own words about your own work."
          : `About ${review.subjectName}.`
      }
    >
      <PeriodFraming
        periodStart={review.periodStart}
        periodEnd={review.periodEnd}
        instructions={review.instructions}
        guideUrl={review.guideUrl}
      />

      {review.appraiser && (
        <AppraiserStrip appraiser={review.appraiser} mine={review.mine} />
      )}

      <div className="flex flex-col gap-1.5 text-body-sm text-body">
        {total === 0 ? (
          <p>This appraisal period has no questions for this form yet.</p>
        ) : (
          <p>
            {total === 1 ? "1 question" : `${String(total)} questions`}.
            {review.dueDate ? ` Due ${dayLabel(review.dueDate)}.` : ""}
          </p>
        )}
        <p className="text-muted">
          {resumed
            ? `You have answered ${String(answered)} of ${String(total)}. They are saved, so pick up where you left off.`
            : "Your answers save as you go. Close this at any point and come back to it."}
        </p>
        {onShowWork && (
          <p>
            <button
              type="button"
              onClick={onShowWork}
              className="cursor-pointer font-medium text-accent-text underline decoration-accent-line underline-offset-4 hover:decoration-accent"
            >
              See what you did this period
            </button>{" "}
            <span className="text-muted">
              (it stays one press away at the top.)
            </span>
          </p>
        )}
      </div>
    </Frame>
  );
}

export function QuestionStep({
  question,
  position,
  held,
  reviewId,
  nudged,
  onChange,
  onPick,
  onBusyChange,
}: {
  question: ApiFormQuestion;
  position: number;
  held: Draft;
  reviewId: string;
  /** They tried to go on without answering a required question. */
  nudged: boolean;
  onChange: (next: Draft) => void;
  onPick: (value: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const isWriting = question.kind === "TEXT";
  const pickKind =
    question.kind === "RATING" ||
    question.kind === "CHOICE" ||
    question.kind === "BOOLEAN";

  return (
    <Frame
      headingId={HEADING}
      focusHeading={!isWriting}
      eyebrow={
        <>
          {String(position)}
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </>
      }
      title={question.prompt}
    >
      <div className="flex flex-col gap-3">
        <FocusQuestion
          question={question}
          held={held}
          reviewId={reviewId}
          headingId={HEADING}
          onChange={onChange}
          onPick={onPick}
          onBusyChange={onBusyChange}
        />
        <p className="text-meta text-muted">
          {question.required ? "Needed. " : "Optional. "}
          {pickKind
            ? "Pick one, or press its key."
            : isWriting
              ? `Press ${continueKeys()} to go on.`
              : ""}
        </p>
        {nudged && question.required && !filled(question, held) && (
          <p role="alert" className="text-body-sm font-medium text-danger-text">
            This one needs an answer before you can go on.
          </p>
        )}
      </div>
    </Frame>
  );
}

export function MarkStep({
  scale,
  mark,
  onPick,
  onClear,
}: {
  scale: ApiRatingScale;
  mark: string;
  onPick: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <Frame
      headingId={HEADING}
      title="Is there an overall mark?"
      lead="Optional. Leave it if the answers say enough."
    >
      <div className="flex flex-col gap-3">
        <PickList
          name="overall-mark"
          options={ratingOptions(scale)}
          value={mark || undefined}
          onPick={onPick}
        />
        <p className="text-meta text-muted">
          Pick one, or press its number.{" "}
          {mark && (
            <button
              type="button"
              onClick={onClear}
              className="cursor-pointer font-medium text-accent-text underline underline-offset-4"
            >
              Leave it blank instead
            </button>
          )}
        </p>
      </div>
    </Frame>
  );
}

export function SummaryStep({
  review,
  summary,
  onChange,
  development,
}: {
  review: ApiReviewDetail;
  summary: string;
  onChange: (next: string) => void;
  development: ReturnType<typeof useDevelopmentSuggestions>;
}) {
  return (
    <Frame
      headingId={HEADING}
      focusHeading={false}
      title="Anything to add?"
      lead="Optional. A line or two in your own words."
    >
      <div className="flex flex-col gap-3">
        <WriteBox
          value={summary}
          onChange={onChange}
          labelledBy={HEADING}
          placeholder="Type here if there is more to say"
        />
        <p className="text-meta text-muted">Press {continueKeys()} to go on.</p>
      </div>

      {/* Development areas, on a form about somebody else. Not on a
          self-review: the suggestion is built from competency scores other
          people gave, and handing somebody their own gaps phrased as
          development areas is a conversation their appraiser should be having.
          Built only from competencies scored below their target, and a person
          meeting every target is refused rather than handed a weakness. */}
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
            onUse={(suggestion) =>
              onChange(
                [summary.trim(), `${suggestion.title}: ${suggestion.detail}`]
                  .filter(Boolean)
                  .join("\n\n"),
              )
            }
          />
        </div>
      )}
    </Frame>
  );
}

export function CheckStep({
  review,
  scale,
  value,
  mark,
  summary,
  outstanding,
  coaching,
  languageTexts,
  languageSeen,
  onEdit,
}: {
  review: ApiReviewDetail;
  scale: ApiRatingScale;
  value: (question: ApiFormQuestion) => Draft;
  mark: string;
  summary: string;
  outstanding: ApiFormQuestion[];
  /** A manager or peer form: the language check applies. */
  coaching: boolean;
  languageTexts: string[];
  languageSeen: boolean;
  /** Jump to the page where a question (or the mark, or the note) is answered. */
  onEdit: (where: ApiFormQuestion | "mark" | "summary") => void;
}) {
  const words = ratingWordsFrom(scale.levels);
  return (
    <Frame
      headingId={HEADING}
      title="Look it over"
      lead="Press anything to change it. Nothing goes until you send it."
    >
      {outstanding.length > 0 && (
        <p
          role="alert"
          className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink"
        >
          {outstanding.length === 1
            ? "1 question still needs an answer before this can go."
            : `${String(outstanding.length)} questions still need an answer before this can go.`}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {review.questions.map((question) => {
          const missing = outstanding.includes(question);
          return (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onEdit(question)}
                className="block w-full cursor-pointer rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-control-line hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
              >
                <ReadAnswer
                  question={question}
                  held={value(question)}
                  reviewId={review.id}
                />
                {missing && (
                  <span className="mt-1.5 block">
                    <Badge tone="danger" size="sm">
                      Needs an answer
                    </Badge>
                  </span>
                )}
              </button>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => onEdit("mark")}
            className="block w-full cursor-pointer rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-control-line hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
          >
            <p className="text-meta font-medium text-muted">Overall mark</p>
            <p className="mt-1 text-body-sm leading-relaxed text-ink">
              {mark ? (words(Number(mark)) ?? mark) : "No overall mark"}
            </p>
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => onEdit("summary")}
            className="block w-full cursor-pointer rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-control-line hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
          >
            <p className="text-meta font-medium text-muted">Anything to add</p>
            <p className="mt-1 whitespace-pre-line text-body-sm leading-relaxed text-ink">
              {summary.trim() || "Nothing added"}
            </p>
          </button>
        </li>
      </ul>

      {/* What a mark could not be defended on. Manager and peer forms only,
          and it never blocks: the first press of Send shows it, the second
          sends anyway. */}
      {coaching && (
        <LanguageCheck
          texts={languageTexts}
          subjectName={review.subjectName}
          acknowledged={languageSeen}
        />
      )}
    </Frame>
  );
}

/** Used by the form's footer, so the wording of the last button lives with the pages. */
export function sendLabel(languageSeen: boolean, hasFindings: boolean): string {
  return languageSeen && hasFindings ? "Send anyway" : "Send it";
}
