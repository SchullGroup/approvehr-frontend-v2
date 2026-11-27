"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import { AnswerPins, type Pinning } from "@/components/performance/answer-pins";
import { PinsRead } from "@/components/performance/pins-read";
import { LanguageNote } from "@/components/performance/language-check";
import {
  SuggestButton,
  SuggestionPanel,
} from "@/components/performance/suggestions";
import type { useDevelopmentSuggestions } from "@/lib/store/ai";
import type { ApiPin } from "@/lib/api/work-pins";
import {
  ratingWordsFrom,
  type ApiFormQuestion,
  type ApiRatingScale,
  type ApiReviewDetail,
} from "@/lib/api/performance";
import {
  PeriodFraming,
  ReadAnswer,
  SelfAnswerLine,
  type Draft,
} from "@/app/(app)/performance/review-parts";
import { shortDate } from "@/lib/today";
import {
  isSubsectionQuestion,
  questionKind,
  selfAnswerWords,
} from "@/lib/performance/subsection-answer";
import {
  FocusQuestion,
  PickList,
  WriteBox,
  ratingOptions,
} from "./focus-question";
import { closingNoteWords, markPageWords } from "./focus-logic";

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

/**
 * Why Send is shut, said where somebody is about to start and again where Send
 * would be.
 *
 * The reason is the API's own sentence, shown as it comes: it names the person
 * and, when there is one, the date that would release it. A manager used to find
 * this out only when Send was refused, after the whole form was filled in, and
 * reported it as being unable to do the appraisal at all. They can answer now;
 * what waits is Send. It is plain text, not a warning: nothing is wrong.
 */
export function SendClosed({ reason }: { reason: string }) {
  return (
    <p className="text-body-sm text-muted">
      <span className="font-medium text-ink">Sending is not open yet.</span>{" "}
      {reason}
    </p>
  );
}

/** A plain link in the middle of a page: the extra actions are links, never buttons. */
const LINK =
  "cursor-pointer font-medium text-accent-text underline decoration-accent-line underline-offset-4 hover:decoration-accent";

/**
 * The first screen: the title, one small line and the start button in the footer.
 *
 * The company's instructions and guide (and the period they are for, and any note
 * the appraiser was given) are behind one plain link, and the link is only there
 * when there is something behind it.
 */
export function IntroStep({
  review,
  onShowWork,
}: {
  review: ApiReviewDetail;
  onShowWork: (() => void) | null;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const total = review.questions.length;
  const facts = [
    total === 0
      ? "No questions yet"
      : total === 1
        ? "1 question"
        : `${String(total)} questions`,
    review.dueDate ? `due ${shortDate(review.dueDate)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const appraiserNote = review.appraiser?.note ?? null;
  /* The period's message is addressed to the people being appraised, so it is
     theirs and nobody else's: `PeriodFraming` draws it for a self-review only,
     and a link to it is not offered where it would open on nothing. */
  const hasNotes = Boolean(
    (review.kind === "SELF" && review.instructions) ||
    review.guideUrl ||
    appraiserNote,
  );

  return (
    <Frame
      headingId={HEADING}
      title={
        review.kind === "SELF"
          ? "Your self-review"
          : `${review.kindLabel} for ${review.subjectName}`
      }
    >
      <div className="flex flex-col gap-2 text-body-sm text-muted">
        <p>{facts}</p>
        {review.anonymous && (
          <p>This is anonymous. Nobody is told who wrote it.</p>
        )}
        {review.sendBlockedBy && <SendClosed reason={review.sendBlockedBy} />}
        {(hasNotes || onShowWork) && (
          <p className="flex flex-wrap gap-x-4 gap-y-1">
            {hasNotes && (
              <button
                type="button"
                aria-expanded={notesOpen}
                onClick={() => setNotesOpen((open) => !open)}
                className={LINK}
              >
                {notesOpen ? "Hide the instructions" : "Read the instructions"}
              </button>
            )}
            {onShowWork && (
              <button type="button" onClick={onShowWork} className={LINK}>
                {review.kind === "SELF"
                  ? "Your work"
                  : `${review.subjectName.split(" ")[0] ?? review.subjectName}'s work`}
              </button>
            )}
          </p>
        )}
      </div>

      {notesOpen && (
        <div className="flex flex-col gap-3">
          <PeriodFraming
            periodStart={review.periodStart}
            periodEnd={review.periodEnd}
            instructions={review.instructions}
            guideUrl={review.guideUrl}
            kind={review.kind}
          />
          {appraiserNote && (
            <p className="whitespace-pre-line text-body-sm text-body">
              {appraiserNote}
            </p>
          )}
        </div>
      )}
    </Frame>
  );
}

export function QuestionStep({
  question,
  position,
  held,
  reviewId,
  scale,
  editable,
  savedStays,
  pinning = null,
  onPinDialogChange,
  onChange,
  onPick,
  onBusyChange,
}: {
  question: ApiFormQuestion;
  position: number;
  held: Draft;
  reviewId: string;
  scale: ApiRatingScale;
  editable: boolean;
  /** The box is empty, but an answer saved earlier will stand. */
  savedStays: boolean;
  /**
   * The finished work pinned to this answer and what can be done to it, or nothing to draw. Only
   * on a person's own self-review, and only where the company has switched the setting on or a
   * pin was already written.
   */
  pinning?: Pinning | null;
  /** The picker for work to pin opened or closed, so the form can leave its keys alone. */
  onPinDialogChange?: (open: boolean) => void;
  onChange: (next: Draft) => void;
  onPick: (value: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  /* A directly rated subsection is drawn and answered as the subsection is, and
     an ordinary question as its own kind: `questionKind` is the one place that
     says which. */
  const kind = questionKind(question);
  const isWriting = kind === "TEXT";
  /* What the person said of themselves, on their manager's form, once they have
     sent it. Nothing at all otherwise: not "No answer", and never a zero. */
  const own = isSubsectionQuestion(question)
    ? selfAnswerWords(question, scale)
    : null;

  return (
    <Frame
      headingId={HEADING}
      focusHeading={!isWriting}
      eyebrow={
        <>
          {String(position)}
          <ArrowRight aria-hidden="true" className="size-3.5" />
          {question.required && (
            <Badge size="sm" className="font-normal">
              Needed
            </Badge>
          )}
        </>
      }
      title={question.prompt}
    >
      <div className="flex flex-col gap-3">
        <SelfAnswerLine words={own} />
        <FocusQuestion
          question={question}
          held={held}
          reviewId={reviewId}
          headingId={HEADING}
          scale={scale}
          editable={editable}
          onChange={onChange}
          onPick={onPick}
          onBusyChange={onBusyChange}
        />
        {savedStays && (
          <p className="text-meta text-muted">
            Your saved answer stands until you write a new one.
          </p>
        )}
        {pinning && (
          <AnswerPins
            pinning={pinning}
            {...(onPinDialogChange
              ? { onDialogOpenChange: onPinDialogChange }
              : {})}
          />
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
  required = false,
  appraiser,
  held = false,
}: {
  scale: ApiRatingScale;
  mark: string;
  onPick: (value: string) => void;
  onClear: () => void;
  /** This period needs it: there is no "leave it blank". See `needsOverallMark`. */
  required?: boolean;
  /**
   * What the author is to the subject, for the tooltip that says what a mark
   * counts for: the strip's own figures, so the two screens agree.
   */
  appraiser?: ApiReviewDetail["appraiser"];
  /**
   * The record already holds a mark, and a given mark can be replaced but not
   * taken back, so there is no "Leave it blank instead" for it: pressing that
   * would empty the box and leave the record's mark standing under a preview that
   * said there was none.
   */
  held?: boolean;
}) {
  const words = markPageWords(required, appraiser);
  const canClear = Boolean(mark) && !required && !held;
  return (
    <Frame
      headingId={HEADING}
      title={words.title}
      eyebrow={
        required || words.tip ? (
          <>
            {required && (
              <Badge size="sm" className="font-normal">
                Needed
              </Badge>
            )}
            {words.tip && (
              <InfoTooltip label="What this counts for" text={words.tip} />
            )}
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3">
        <PickList
          name="overall-mark"
          options={ratingOptions(scale)}
          value={mark || undefined}
          onPick={onPick}
        />
        {canClear && (
          <p className="text-meta text-muted">
            <button
              type="button"
              onClick={onClear}
              className="cursor-pointer font-medium text-accent-text underline underline-offset-4"
            >
              Leave it blank instead
            </button>
          </p>
        )}
      </div>
    </Frame>
  );
}

export function SummaryStep({
  review,
  summary,
  onChange,
  development,
  languageTexts,
}: {
  review: ApiReviewDetail;
  summary: string;
  onChange: (next: string) => void;
  development: ReturnType<typeof useDevelopmentSuggestions>;
  /**
   * Every box on a manager's or peer's form that carries prose, for the quiet note
   * beside this one. Left out on a self-review: the check is about whether a
   * judgement of somebody else would survive a dispute.
   */
  languageTexts?: string[];
}) {
  const words = closingNoteWords(review.kind);
  return (
    <Frame
      headingId={HEADING}
      focusHeading={false}
      title={words.title}
      lead={words.lead}
    >
      <div className="flex flex-col gap-3">
        <WriteBox
          value={summary}
          onChange={onChange}
          labelledBy={HEADING}
          placeholder={words.placeholder}
        />
        {languageTexts && (
          <LanguageNote
            texts={languageTexts}
            subjectName={review.subjectName}
          />
        )}
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
  onRecord,
  pinsFor,
  withMark,
  markRequired = false,
  mark,
  withPotential = false,
  potential = "",
  potentialReason = "",
  summary,
  outstanding,
  onEdit,
}: {
  review: ApiReviewDetail;
  scale: ApiRatingScale;
  /** What will be on the record for a question — see `onRecordOf`. */
  onRecord: (question: ApiFormQuestion) => Draft;
  /**
   * The work pinned to a question in this visit and before it, for the row to read back. Left out,
   * no row says anything about pins, which is every form that is not a self-review with some.
   */
  pinsFor?: (questionId: string) => ApiPin[];
  /** Whether the company asks for an overall mark, so whether it has a row here. */
  withMark: boolean;
  /** This period needs one, so a missing mark is something to answer, like a required question. */
  markRequired?: boolean;
  mark: string;
  /** A manager's form in a period that asks how far they could go, so it has a row here. */
  withPotential?: boolean;
  potential?: string;
  potentialReason?: string;
  summary: string;
  outstanding: ApiFormQuestion[];
  /** Jump to the page where a question (or the mark, the potential or the note) is answered. */
  onEdit: (where: ApiFormQuestion | "mark" | "potential" | "summary") => void;
}) {
  const words = ratingWordsFrom(scale.levels);
  const markMissing = withMark && markRequired && !mark;
  return (
    <Frame headingId={HEADING} title="Preview">
      {review.sendBlockedBy && <SendClosed reason={review.sendBlockedBy} />}

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
                {/* No `reviewId`: with one, an attached file brings its own
                    "Open" button, and a button inside the row's button is
                    invalid and jumps the page back to the question when it is
                    pressed. A file picked in this visit is not on the record
                    yet, so its name is shown from the draft. */}
                {question.kind === "FILE" && onRecord(question).file ? (
                  <div>
                    <p className="text-meta font-medium text-muted">
                      {question.prompt}
                    </p>
                    <p className="mt-1 text-body-sm leading-relaxed text-ink">
                      {onRecord(question).file?.filename}
                    </p>
                  </div>
                ) : (
                  <ReadAnswer question={question} held={onRecord(question)} />
                )}
                {/* Plain text, no links: this row is itself a button. */}
                {pinsFor && <PinsRead pins={pinsFor(question.id)} linkless />}
                {missing && (
                  <span className="mt-1.5 block">
                    <Badge size="sm">Needed</Badge>
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {withMark && (
          <li>
            <button
              type="button"
              onClick={() => onEdit("mark")}
              className="block w-full cursor-pointer rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-control-line hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
            >
              <p className="text-meta font-medium text-muted">Overall rating</p>
              <p className="mt-1 text-body-sm leading-relaxed text-ink">
                {mark
                  ? (words(Number(mark)) ?? mark)
                  : markRequired
                    ? "Not given yet"
                    : "No overall rating"}
              </p>
              {markMissing && (
                <span className="mt-1.5 block">
                  <Badge size="sm">Needed</Badge>
                </span>
              )}
            </button>
          </li>
        )}
        {withPotential && (
          <li>
            <button
              type="button"
              onClick={() => onEdit("potential")}
              className="block w-full cursor-pointer rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-control-line hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
            >
              <p className="text-meta font-medium text-muted">
                How far could{" "}
                {review.subjectName.split(" ")[0] ?? review.subjectName} go?
              </p>
              <p className="mt-1 text-body-sm leading-relaxed text-ink">
                {potential
                  ? (POTENTIAL_WORDS[potential] ?? potential)
                  : "Not answered"}
              </p>
              {potential === "HIGH" && potentialReason.trim() && (
                <p className="mt-1 whitespace-pre-line text-body-sm leading-relaxed text-body">
                  {potentialReason.trim()}
                </p>
              )}
              {potentialNeedsReason(potential, potentialReason) && (
                <span className="mt-1.5 block">
                  <Badge size="sm">Needed</Badge>
                </span>
              )}
            </button>
          </li>
        )}
        <li>
          <button
            type="button"
            onClick={() => onEdit("summary")}
            className="block w-full cursor-pointer rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-control-line hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
          >
            <p className="text-meta font-medium text-muted">
              {closingNoteWords(review.kind).row}
            </p>
            <p className="mt-1 whitespace-pre-line text-body-sm leading-relaxed text-ink">
              {summary.trim() || "Nothing added"}
            </p>
          </button>
        </li>
      </ul>
    </Frame>
  );
}

/** How far could they go: the three answers a manager can give. */
export const POTENTIAL_OPTIONS = [
  { value: "HIGH", label: "Ready for a bigger role", key: "1" },
  { value: "MEDIUM", label: "Could grow in this role", key: "2" },
  { value: "LOW", label: "Happy where they are", key: "3" },
] as const;

export const POTENTIAL_WORDS: Record<string, string> = Object.fromEntries(
  POTENTIAL_OPTIONS.map((option) => [option.value, option.label]),
);

/** Why "Ready for a bigger role" needs a sentence behind it. */
export const POTENTIAL_REASON_MIN = 10;

/**
 * "Ready for a bigger role" is read by whoever decides a promotion, so it has to
 * say why; the other two answers need nothing more. Said once, for the page that
 * holds Next away, the preview row and the send, which must all agree.
 */
export function potentialNeedsReason(
  potential: string,
  reason: string,
): boolean {
  return potential === "HIGH" && reason.trim().length < POTENTIAL_REASON_MIN;
}

const REASON_LABEL = "potential-reason-label";

export function PotentialStep({
  firstName,
  potential,
  reason,
  onPick,
  onClear,
  onReason,
}: {
  firstName: string;
  potential: string;
  reason: string;
  onPick: (value: string) => void;
  onClear: () => void;
  onReason: (next: string) => void;
}) {
  return (
    <Frame headingId={HEADING} title={`How far could ${firstName} go?`}>
      <div className="flex flex-col gap-3">
        <PickList
          name="potential"
          options={[...POTENTIAL_OPTIONS]}
          value={potential || undefined}
          onPick={onPick}
        />
        {potential === "HIGH" && (
          <div className="flex flex-col gap-2">
            {/* The box was named by the page's heading, so what was typed in it
                was nobody's answer to anything once the placeholder had gone. */}
            <span id={REASON_LABEL} className="sr-only">
              Your reason
            </span>
            <WriteBox
              labelledBy={REASON_LABEL}
              value={reason}
              onChange={onReason}
              placeholder="What you have seen that puts them here."
            />
            {potentialNeedsReason(potential, reason) && (
              <span>
                <Badge size="sm">Needed</Badge>
              </span>
            )}
          </div>
        )}
        {potential && (
          <p className="text-meta text-muted">
            <button
              type="button"
              onClick={onClear}
              className="cursor-pointer font-medium text-accent-text underline underline-offset-4"
            >
              Leave it blank instead
            </button>
          </p>
        )}
      </div>
    </Frame>
  );
}
