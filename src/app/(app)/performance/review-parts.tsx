"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import {
  Badge,
  Button,
  Field,
  FileField,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  performanceApi,
  ratingWordsFrom,
  weightLabel,
  type ApiAppraiserContext,
  type ApiFormQuestion,
  type ApiRatingScale,
} from "@/lib/api/performance";
import type { InlineFile } from "@/lib/api/uploads";
import { cn } from "@/lib/cn";
import { shortDate } from "@/lib/today";
import { useRatingScale } from "@/lib/store/performance";

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
 * The scale, in **this company's** words, ready for a picker.
 *
 * ## Three sets became one, and then the one became configurable
 *
 * This file used to define its own — "3: Did what was needed" — while two
 * other sets said "Meets Expectations" and had no importers between them.
 * `verify-rating-scale` closed that. Then #117 let a company choose its own
 * five words, which moves the authority again: the constant in
 * `lib/api/performance` is now the **fallback** the API serves when nobody has
 * chosen, and the words on screen come from `GET /performance/rating-scale`.
 *
 * So this is a hook rather than a constant. A module-level `Record` cannot
 * read a company's own scale, and a screen still importing one is quoting a
 * scale that company may not use — the same failure the verifier exists for,
 * one level up.
 *
 * `value` is the level as a **string** because the inputs are. `label` carries
 * the number as well as the word: the picker keeps its coordinates because
 * they are what people use to talk to each other while marking — "I gave her a
 * four" — and because five prose options with no ordering cue are hard to
 * scan. A record that is *read* drops the digit; see `ReadAnswer`.
 */
export function ratingOptionsFrom(
  scale: ApiRatingScale,
): { value: string; label: string; meaning: string }[] {
  return scale.levels.map((entry) => ({
    value: String(entry.level),
    label: `${String(entry.level)}: ${entry.label}`,
    meaning: entry.meaning,
  }));
}

/** What is in one answer box right now, before anything is saved. */
export type Draft = {
  text?: string;
  rating?: string;
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
    choice: answer.choiceValue ?? undefined,
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
  switch (question.kind) {
    case "RATING":
      return Boolean(held.rating);
    case "CHOICE":
      return Boolean(held.choice);
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
          <a
            href={guideUrl}
            target="_blank"
            /* `noreferrer` as well as `noopener`: the guide is a URL somebody
               at the company typed, and it has no business being told which
               appraisal screen the reader came from. */
            rel="noopener noreferrer"
            className="font-medium text-accent-text underline-offset-2 hover:underline"
          >
            Read the company&apos;s guide
          </a>
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
 * the whole mark." The badge beside it already says *Line manager*. The modal
 * header above it already says *About Chidera Anusiobi-Uzor*. So two thirds of
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

export function AnswerField({
  question,
  held,
  reviewId,
  onChange,
  onBusyChange,
}: {
  question: ApiFormQuestion;
  held: Draft;
  /** Needed by the `FILE` branch, to open what is already attached. */
  reviewId: string;
  onChange: (next: Draft) => void;
  /** So the form can hold its own save while a file is being read. */
  onBusyChange?: (busy: boolean) => void;
}) {
  const { scale, editable } = useRatingScale();

  if (question.kind === "RATING") {
    return (
      <Field label={question.prompt} required={question.required}>
        <Select
          value={held.rating ?? ""}
          placeholder="Pick a mark"
          onChange={(event) => onChange({ rating: event.target.value })}
        >
          {ratingOptionsFrom(scale).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  if (question.kind === "FILE") {
    const attached = question.answer?.attachment ?? null;
    return (
      <div className="flex flex-col gap-2">
        <FileField
          label={question.prompt}
          {...(question.required ? { required: true } : {})}
          help={
            attached
              ? "Choosing another file replaces the one on this answer."
              : "A report, a dashboard, a screenshot. PDFs, images and Office documents."
          }
          onAttached={(file) => onChange({ file: file ?? undefined })}
          {...(onBusyChange ? { onBusyChange } : {})}
        />
        {/* What is already on the record, and a way to read it. Shown
            **alongside** the picker rather than instead of it: somebody
            reopening a form wants to see what they attached before deciding
            whether to replace it, and a picker that hid the current answer
            would make replacing it the only way to find out. */}
        {attached && !held.file && (
          <AttachedEvidence
            reviewId={reviewId}
            questionId={question.id}
            attachment={attached}
            canOpen={editable}
          />
        )}
      </div>
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

  const answer =
    question.kind === "RATING"
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
