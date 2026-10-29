"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Badge, Button, TextLink, useToast } from "@/components/ui";
import {
  performanceApi,
  ratingWordsFrom,
  weightLabel,
  type ApiAppraiserContext,
  type AnswerBody,
  type ApiFormQuestion,
} from "@/lib/api/performance";
import type { InlineFile } from "@/lib/api/uploads";
import { cn } from "@/lib/cn";
import {
  answerWords,
  isLivePick,
  isSubsectionQuestion,
  questionKind,
} from "@/lib/performance/subsection-answer";
import { shortDate } from "@/lib/today";
import { useRatingScale } from "@/lib/store/performance";

/**
 * The pieces a review is made of, shared by the page-by-page flow and the full
 * record.
 *
 * There are two places a review is opened — `/performance/reviews/[id]/answer`
 * as the flow that fills a form in, and `/performance/reviews/[id]` as the record
 * of a rating — and they are different acts on the same document: one fills a
 * form in, the other reads a mark and answers it. What they must **not** differ
 * about is what a question looks like, because a read-only copy that drifts
 * eventually renders a question the form has stopped asking, or renders an
 * unanswered one as blank rather than as unanswered.
 *
 * So the question, the answer, the scale and the appraiser strip live here once.
 * Neither surface owns them.
 */

/** What is in one answer box right now, before anything is saved. */
export type Draft = {
  text?: string;
  rating?: string;
  /**
   * The pick. **The text of the option for an ordinary pick-from-a-list
   * question, and the id of the choice for a subsection question.** A subsection's
   * choices can share a label and can be archived after somebody picked one, so
   * what is held, compared and sent for them is the id, and the label is only ever
   * read for display (`lib/performance/subsection-answer.ts`).
   */
  choice?: string;
  bool?: string;
  /**
   * A file picked in this session, not yet sent.
   *
   * Absent is not the same as "no file": a question answered on an earlier
   * visit has its attachment on `question.answer.attachment` and nothing in
   * the draft, because a `File` cannot be reconstructed from metadata. So
   * `filled` reads both, and re-picking is how you replace one.
   */
  file?: InlineFile;
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
    /* A subsection's pick is its choice's id, never the label saved beside it. */
    choice:
      (isSubsectionQuestion(question)
        ? answer.choiceOptionId
        : answer.choiceValue) ?? undefined,
    bool:
      answer.boolValue === null ? undefined : answer.boolValue ? "yes" : "no",
    /* No `file`, and it is not an omission. The saved answer carries the
       attachment's *metadata*; the bytes are behind a download route and a
       `File` cannot be rebuilt from a filename. An already-attached question
       renders what is on the record and offers to replace it. */
  };
}

/** Whether this question has an answer of the kind it asked for. */
export function filled(question: ApiFormQuestion, held: Draft): boolean {
  switch (questionKind(question)) {
    case "RATING":
      return Boolean(held.rating);
    case "CHOICE":
      /* A subsection's pick counts only while it is still on the list: one taken
         off since is a pick the API will refuse at send, and a form that called
         it answered would say a required question is done when it cannot go. */
      return isSubsectionQuestion(question)
        ? isLivePick(question, held.choice)
        : Boolean(held.choice);
    case "BOOLEAN":
      return Boolean(held.bool);
    case "FILE":
      /* The draft **or** the record. Every other kind round-trips through
         `draftFrom`, so the draft alone is the whole answer; a file cannot,
         and reading only the draft would tell somebody who attached their
         evidence last week that a required question is still outstanding. */
      return Boolean(held.file ?? question.answer?.attachment);
    default:
      return Boolean(held.text && held.text.trim());
  }
}

/**
 * What to send for one question, or null when there is nothing to send.
 *
 * Only what has actually been typed. Re-answering replaces on the API side, and
 * an empty box is not an instruction to clear an answer, so it sends nothing.
 */
export function answerBodyFor(
  question: ApiFormQuestion,
  held: Draft,
): AnswerBody | null {
  const body: AnswerBody = { questionId: question.id };
  const kind = questionKind(question);
  if (kind === "RATING" && held.rating) {
    body.ratingValue = Number(held.rating);
  } else if (kind === "CHOICE" && held.choice) {
    /* The id for a subsection's choice and the text for an ordinary one, and
       never the other way round: the API matches each on its own. */
    if (isSubsectionQuestion(question)) body.choiceOptionId = held.choice;
    else body.choiceValue = held.choice;
  } else if (kind === "BOOLEAN" && held.bool) {
    body.boolValue = held.bool === "yes";
  } else if (kind === "FILE" && held.file) {
    /* Only when a file was picked **in this session**. A question whose
       evidence is already on the record has no `file` in the draft, and
       re-sending it is not possible — the bytes are behind a download
       route, not in the browser. So this saves a replacement and leaves
       an unchanged answer alone, which is what `respond` expects. */
    body.file = {
      filename: held.file.filename,
      contentType: held.file.mimeType,
      contentBase64: held.file.contentBase64,
    };
  } else if (held.text && held.text.trim()) {
    body.textValue = held.text.trim();
  } else {
    return null;
  }
  return body;
}

/** A size somebody can read, for a file they are about to open. */
function sizeWords(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} bytes`;
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The evidence already on an answer: what it is, and a way to open it.
 *
 * The download is **absent** rather than disabled when there is no API. The
 * demo records what somebody attached and deliberately does not keep the
 * bytes — 10MB of base64 in `localStorage` would exceed the quota and take
 * the whole demo state with it — so a button there would be a button that
 * cannot work. Saying what is attached is still worth doing.
 */
export function AttachedEvidence({
  reviewId,
  questionId,
  attachment,
  canOpen,
}: {
  reviewId: string;
  questionId: string;
  attachment: NonNullable<ApiFormQuestion["answer"]>["attachment"];
  /** False offline. See the note above. */
  canOpen: boolean;
}) {
  const toast = useToast();
  const [opening, setOpening] = useState(false);

  if (!attachment) return null;

  const open = async () => {
    setOpening(true);
    try {
      await performanceApi.saveEvidence(
        reviewId,
        questionId,
        attachment.filename,
      );
    } catch {
      /* The API's own refusal is not reachable here — `fetchBinary` throws an
         `ApiError` whose message is already a sentence — so this says what
         happened rather than inventing a cause. */
      toast.push({
        title: "That file did not open",
        tone: "danger",
        detail: "It is still on the answer. Try again.",
      });
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2">
      <span className="text-body-sm text-ink">{attachment.filename}</span>
      <span className="text-meta text-muted">
        {sizeWords(attachment.sizeBytes)}
      </span>
      {canOpen && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={opening}
          onClick={() => void open()}
        >
          <Download aria-hidden="true" className="size-3.5" />
          Open
        </Button>
      )}
    </div>
  );
}

/**
 * A period as a range somebody reads, or null when the cycle states none.
 *
 * The year is on the end always and on the start **only when they differ**,
 * because "1 Jan 2026 – 31 Jul 2026" makes a reader check two years that are
 * the same one. A half that crosses December gets both.
 *
 * Null in, null out. A cycle with no stated period renders nothing rather than
 * a range invented from its name — see `ApiCycle.periodStart`.
 */
export function periodWords(
  start: string | null,
  end: string | null,
): string | null {
  if (!start || !end) return null;
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const from = sameYear
    ? shortDate(start)
    : `${shortDate(start)} ${start.slice(0, 4)}`;
  return `${from} – ${shortDate(end)} ${end.slice(0, 4)}`;
}

/**
 * What this form is about, and why it exists — above question 1.
 *
 * ## Why this is on the form and not only in a settings screen
 *
 * Schulltech's own appraisal form opens with four sentences: that it is
 * mandatory, what it is for, the deadline in words, and where the guide is.
 * `ReviewCycle` can hold all of that now, and holding it without showing it to
 * the person answering question 1 would make those columns decoration.
 *
 * ## Plain text, rendered with its line breaks
 *
 * `whitespace-pre-line` rather than a markdown parser. A parser here is a
 * second rendering path for HR-authored content on a screen every employee
 * opens, and the one thing anybody actually needs a link for has its own
 * field. `guideUrl` is `http(s)`-only on the API — zod's `.url()` accepts
 * `javascript:`, which on this screen would be stored XSS.
 *
 * Renders **nothing at all** when a cycle states none of it. Most existing
 * periods do, because nothing was back-filled, and an empty bordered box above
 * question 1 is worse than no box.
 */
export function PeriodFraming({
  periodStart,
  periodEnd,
  instructions,
  guideUrl,
}: {
  periodStart: string | null;
  periodEnd: string | null;
  instructions?: string | null;
  guideUrl?: string | null;
}) {
  const period = periodWords(periodStart, periodEnd);
  if (!period && !instructions && !guideUrl) return null;

  return (
    <div className="rounded-md border border-line bg-canvas px-3.5 py-3">
      {period && (
        <p className="text-body-sm font-medium text-ink">
          For the period {period}
        </p>
      )}
      {instructions && (
        <p
          className={cn(
            "whitespace-pre-line text-body-sm leading-relaxed text-body",
            period && "mt-2",
          )}
        >
          {instructions}
        </p>
      )}
      {guideUrl && (
        <p className={cn("text-body-sm", (period || instructions) && "mt-2")}>
          <TextLink
            href={guideUrl}
            target="_blank"
            /* `noreferrer` as well as `noopener`: the guide is a URL somebody
               at the company typed, and it has no business being told which
               appraisal screen the reader came from. */
            rel="noopener noreferrer"
          >
            Read the company&apos;s guide
          </TextLink>
        </p>
      )}
    </div>
  );
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
 * ## It used to say the same thing three times
 *
 * "You are appraising Chidera Anusiobi-Uzor as their line manager, and yours is
 * the whole mark." The badge beside it already says *Line manager*. The header
 * above it already says *About Chidera Anusiobi-Uzor*. So two thirds of
 * that sentence was restating what was on screen, and the third — "yours is the
 * whole mark" — made a reader work out that it meant 100%.
 *
 * One fact belongs here and it is the share, said as a number.
 */
export function AppraiserStrip({
  appraiser,
  mine,
}: {
  appraiser: ApiAppraiserContext;
  /** Whether the reader wrote it. Only changes "Your" to "This". */
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
          {mine ? "Your review" : "This review"} counts for{" "}
          {weightLabel(appraiser.weightBp)} of the mark
          {shared
            ? `, alongside ${String(appraiser.appraiserCount - 1)} ${appraiser.appraiserCount === 2 ? "other" : "others"}.`
            : "."}
        </span>
      </p>
      {appraiser.note && (
        <p className="mt-1.5 text-body-sm text-body">{appraiser.note}</p>
      )}
      {shared && (
        <p className="mt-1.5 text-body-sm text-muted">
          {/* The instruction, without the arithmetic lesson that used to precede
              it. How a weighted average works is not something somebody needs
              in order to answer the question in front of them. */}
          Answer for the part of the work you actually saw.
        </p>
      )}
    </div>
  );
}

/**
 * The line beside a manager's control: what the person said of themselves.
 *
 * Absent for a form that is not a manager's, and absent until the person has
 * sent their self-review, and then nothing is drawn at all: not "No answer",
 * which would read as a gap somebody left, and never a nought.
 */
export function SelfAnswerLine({ words }: { words: string | null }) {
  if (words === null) return null;
  return <p className="text-meta text-muted">Their own answer: {words}</p>;
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
  reviewId,
}: {
  question: ApiFormQuestion;
  held: Draft;
  /**
   * Needed only to open evidence. Optional so the two read-only screens that
   * predate `FILE` questions did not have to change, and a `FILE` answer
   * without it renders its filename and no download rather than crashing.
   */
  reviewId?: string;
}) {
  const { scale, editable } = useRatingScale();
  const attached = question.answer?.attachment ?? null;

  const answer = isSubsectionQuestion(question)
    ? /* A directly rated subsection, read back from its own scale and choices:
         a level in words where the company's scale is this one and `4 of 10`
         where it is not, a pick by its label. Read from what is held, so the
         preview says what is about to be sent and not only what was saved. */
      answerWords(
        question,
        {
          ratingValue: held.rating ? Number(held.rating) : null,
          boolValue: held.bool ? held.bool === "yes" : null,
          choiceOptionId: held.choice,
          /* The label the API saved with the pick, for the very choice it was
             saved with and no other: the record says what was chosen when it was
             chosen, even if the choice has been renamed or taken off since. A pick
             made in this visit has none yet and is found by its id. */
          choiceLabel:
            question.answer?.choiceOptionId === held.choice
              ? question.answer?.choiceValue
              : null,
        },
        scale,
      )
    : question.kind === "RATING"
      ? /* The words, not the digit, and **this company's** words. The scale
           the standup asked for was on the picker and nowhere a mark was read
           back; then it became configurable, and a read-back still quoting
           the constant would misquote every company that renamed a level. */
        ratingWordsFrom(scale.levels)(held.rating ? Number(held.rating) : null)
      : question.kind === "BOOLEAN"
        ? held.bool
          ? held.bool === "yes"
            ? "Yes"
            : "No"
          : null
        : question.kind === "CHOICE"
          ? (held.choice ?? null)
          : question.kind === "FILE"
            ? /* Rendered below rather than as a sentence: a filename is
                 something you open, not something you read. */
              null
            : (held.text ?? null);

  return (
    <div>
      <p className="text-meta font-medium text-muted">{question.prompt}</p>
      {question.kind === "FILE" ? (
        attached ? (
          <div className="mt-1">
            <AttachedEvidence
              reviewId={reviewId ?? ""}
              questionId={question.id}
              attachment={attached}
              canOpen={editable && Boolean(reviewId)}
            />
          </div>
        ) : (
          <p className="mt-1 text-body-sm leading-relaxed text-ink">
            Nothing attached
          </p>
        )
      ) : (
        <p className="mt-1 text-body-sm leading-relaxed text-ink">
          {answer ?? "Not answered"}
        </p>
      )}
    </div>
  );
}
