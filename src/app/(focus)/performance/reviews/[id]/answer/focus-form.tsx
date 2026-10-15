"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ListChecks, X } from "lucide-react";
import { Button, Drawer, IconButton, Spinner } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { findingsAcross } from "@/lib/performance/review-language";
import type {
  AnswerBody,
  ApiFormQuestion,
  ApiReviewDetail,
} from "@/lib/api/performance";
import { useDevelopmentSuggestions } from "@/lib/store/ai";
import { useRatingScale, useReviewMutations } from "@/lib/store/performance";
import {
  answerBodyFor,
  draftFrom,
  filled,
  type Draft,
} from "@/app/(app)/performance/review-parts";
import { SelfEvidence } from "@/app/(app)/performance/self-evidence";
import {
  clearLocalDraft,
  readLocalDraft,
  writeLocalDraft,
} from "./draft-storage";
import { draftForPick, pickOptions, ratingOptions } from "./focus-question";
import {
  onRecordOf,
  savedAnswerStands,
  sigOf,
  startIndex,
} from "./focus-logic";
import {
  CheckStep,
  IntroStep,
  MarkStep,
  QuestionStep,
  SummaryStep,
  sendLabel,
} from "./focus-steps";

/**
 * A review, one question to a page.
 *
 * ## What it keeps from the popup form, and why
 *
 * Everything that decides what a review *is* is unchanged and shared: the
 * questions and their kinds, what counts as answered, how a draft becomes a
 * request (`answerBodyFor`), the language check, the development suggestions,
 * the rule that sending is refused while a required question is blank. Only the
 * presentation and the saving changed.
 *
 * ## Saved as you go
 *
 * The popup saved when somebody pressed "Save and finish later", and lost
 * everything if they closed it any other way. A page that says it saves as you
 * go has to mean it: answers are sent to the API shortly after they stop
 * changing, on every move between pages, when the tab is hidden, when the page
 * is left, and on close. The overall mark and the closing note have no endpoint
 * of their own — they travel with the send — so those are kept in this browser
 * until it goes (`draft-storage.ts`).
 *
 * ## What is on the record is not always what is in the box
 *
 * A saved answer cannot be taken back, only replaced (see `onRecordOf`). So
 * everything that says "this is what you are sending" reads the record, and a
 * box somebody has emptied says that the saved answer stands.
 *
 * ## Sending is deliberate
 *
 * It is the one thing here that cannot be undone, so it is never reached by a
 * keystroke: Enter and Ctrl/⌘ Enter go *to* the look-over page, and only a press
 * on the Send button goes past it. Key repeat is ignored everywhere, because a
 * held key walked straight through that page and sent.
 */

type Step =
  | { kind: "intro" }
  | { kind: "question"; question: ApiFormQuestion; position: number }
  | { kind: "mark" }
  | { kind: "summary" }
  | { kind: "check" };

type SaveState = "idle" | "saving" | "saved" | "failed";

/** What the page needs to say about a review that has just gone. */
export type SentInfo = { answered: number; mark: string | null };

export function FocusForm({
  review,
  onSent,
  onSending,
}: {
  review: ApiReviewDetail;
  /** Called once the review has gone; the page swaps this form for the confirmation. */
  onSent: (info: SentInfo) => void;
  /**
   * Called with true just before the request that sends the review, and with
   * false if it did not go. The store reports a review as sent the moment it is,
   * which is *before* this form hears back, and the page must not read that as
   * "this is somebody else's now" and walk the person away from their own send.
   */
  onSending: (sending: boolean) => void;
}) {
  const router = useRouter();
  const { save, send } = useReviewMutations();
  const { scale, editable } = useRatingScale();
  const development = useDevelopmentSuggestions();

  const steps = useMemo<Step[]>(
    () => [
      { kind: "intro" },
      ...review.questions.map((question, at): Step => ({
        kind: "question",
        question,
        position: at + 1,
      })),
      { kind: "mark" },
      { kind: "summary" },
      { kind: "check" },
    ],
    [review.questions],
  );

  const [local] = useState(() => readLocalDraft(review.id));
  const [start] = useState(() => startIndex(review, local));
  const [index, setIndex] = useState(start);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  /** What has been saved during this visit, which the review itself does not show until it is read again. */
  const [savedHeld, setSavedHeld] = useState<Record<string, Draft>>({});
  const [mark, setMark] = useState(local.mark);
  const [summary, setSummary] = useState(local.summary);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [failed, setFailed] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);
  const [nudged, setNudged] = useState(false);
  /** The findings the person has been shown, as a signature — see `languageSeen`. */
  const [seenFindings, setSeenFindings] = useState<string | null>(null);
  const [workOpen, setWorkOpen] = useState(false);

  /** What the server holds for each question, as signatures. */
  const savedSig = useRef<Record<string, string>>({});
  /** Saves run one after another, so a slow one never lands after a newer one. */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  /** The pending move on after picking an option. */
  const autoMove = useRef<number | null>(null);
  /** Taken the instant a send starts. State would not do: three clicks in one tick all read it as free. */
  const sendLock = useRef(false);

  /** What is in the box now. */
  const value = (question: ApiFormQuestion): Draft =>
    draft[question.id] ?? draftFrom(question);
  /** What was last saved. */
  const saved = (question: ApiFormQuestion): Draft =>
    savedHeld[question.id] ?? draftFrom(question);
  /** What will be on the record. */
  const onRecord = (question: ApiFormQuestion): Draft =>
    onRecordOf(question, draft[question.id], saved(question));

  const outstanding = review.questions.filter(
    (question) => question.required && !filled(question, onRecord(question)),
  );
  const answered = review.questions.filter((question) =>
    filled(question, onRecord(question)),
  ).length;

  /** Manager and peer forms get the language check; a self-review does not. */
  const coaching = review.kind !== "SELF";
  const languageTexts = coaching
    ? [
        ...review.questions.map((question) => onRecord(question).text ?? ""),
        summary,
      ]
    : [];
  const languageFindings = coaching
    ? findingsAcross(languageTexts, review.subjectName)
    : [];
  /* Seen means *these* findings. Edit the text and a new one may appear, and
     "Send anyway" must not wave it through unread. */
  const findingsSignature = JSON.stringify(languageFindings);
  const languageSeen =
    languageFindings.length > 0 && seenFindings === findingsSignature;

  const patch = (question: ApiFormQuestion, next: Draft) => {
    setNudged(false);
    setDraft((current) => ({
      ...current,
      [question.id]: { ...current[question.id], ...next },
    }));
  };

  /**
   * Send whatever has changed since the last save.
   *
   * Takes the draft as an argument rather than reading state, because it is
   * called from timers and key handlers that were made a render ago. Resolves
   * false when the save failed, so a caller that is about to leave can say so.
   */
  const flush = useCallback(
    (snapshot: Record<string, Draft>): Promise<boolean> => {
      const run = async (): Promise<boolean> => {
        const changed: {
          id: string;
          sig: string;
          held: Draft;
          body: AnswerBody;
        }[] = [];
        for (const question of review.questions) {
          const held = snapshot[question.id];
          if (!held) continue;
          const sig = sigOf(held);
          const known =
            savedSig.current[question.id] ?? sigOf(draftFrom(question));
          if (sig === known) continue;
          const body = answerBodyFor(question, held);
          if (body) {
            changed.push({ id: question.id, sig, held, body });
          } else {
            /* Nothing to send for an emptied box: the API takes no empty
               answer, so what was saved stands. Remembered, or it would be
               looked at again on every save for ever. */
            savedSig.current[question.id] = sig;
          }
        }
        if (changed.length === 0) return true;
        setSaveState("saving");
        try {
          await save(
            review.id,
            changed.map((entry) => entry.body),
          );
          for (const entry of changed) savedSig.current[entry.id] = entry.sig;
          setSavedHeld((current) => ({
            ...current,
            ...Object.fromEntries(changed.map((e) => [e.id, e.held])),
          }));
          setSaveState("saved");
          setFailed(null);
          return true;
        } catch (caught) {
          setSaveState("failed");
          setFailed(
            caught instanceof ApiError
              ? caught.message
              : "Your last answers did not save.",
          );
          return false;
        }
      };
      const next = queue.current.then(run);
      queue.current = next;
      return next;
    },
    [review.id, review.questions, save],
  );

  /* The newest draft and saver, for the two places that cannot wait for a
     render: leaving the page, and the tab going away. */
  const latest = useRef({ draft, flush });
  useEffect(() => {
    latest.current = { draft, flush };
  });

  /* Shortly after typing stops. */
  useEffect(() => {
    const timer = window.setTimeout(() => void flush(draft), 1200);
    return () => window.clearTimeout(timer);
  }, [draft, flush]);

  /* When the tab is hidden, which is how most people leave; when the page is
     left, by Back or a link, which unmounts this; and when it is closed. */
  useEffect(() => {
    const now = () => void latest.current.flush(latest.current.draft);
    const onHide = () => {
      if (document.visibilityState === "hidden") now();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", now);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", now);
      now();
    };
  }, []);

  /* The two boxes with nowhere to go before the send, and the page. */
  useEffect(() => {
    writeLocalDraft(review.id, { mark, summary, step: index });
  }, [review.id, mark, summary, index]);

  /* A move queued by picking an option is for the page it was picked on. */
  useEffect(
    () => () => {
      if (autoMove.current !== null) window.clearTimeout(autoMove.current);
    },
    [index],
  );

  const current: Step = steps[index] ?? { kind: "intro" };

  const go = (to: number, snapshot: Record<string, Draft> = draft) => {
    const target = Math.min(Math.max(to, 0), steps.length - 1);
    setDirection(target >= index ? "forward" : "back");
    setNudged(false);
    void flush(snapshot);
    setIndex(target);
  };

  /** Pick an option, then move on after a beat — long enough to see it land. */
  const moveOnSoon = (next: Record<string, Draft>) => {
    if (autoMove.current !== null) window.clearTimeout(autoMove.current);
    autoMove.current = window.setTimeout(() => go(index + 1, next), 380);
  };

  const pick = (question: ApiFormQuestion, optionValue: string) => {
    const next = {
      ...draft,
      [question.id]: draftForPick(question, optionValue),
    };
    setNudged(false);
    setDraft(next);
    moveOnSoon(next);
  };

  const pickMark = (optionValue: string) => {
    setMark(optionValue);
    moveOnSoon(draft);
  };

  const sendIt = async () => {
    if (sendLock.current || reading) return;
    if (outstanding.length > 0) {
      /* Walk them to the first one rather than telling them where it is. */
      const first = review.questions.indexOf(outstanding[0] as ApiFormQuestion);
      go(1 + first);
      setNudged(true);
      return;
    }
    if (coaching && languageFindings.length > 0 && !languageSeen) {
      setSeenFindings(findingsSignature);
      return;
    }
    sendLock.current = true;
    setFailed(null);
    setSending(true);
    try {
      if (!(await flush(draft))) return;
      const body: { rating?: number; summary?: string } = {};
      if (mark) body.rating = Number(mark);
      if (summary.trim()) body.summary = summary.trim();
      onSending(true);
      await send(review.id, body, []);
      clearLocalDraft(review.id);
      onSent({ answered, mark: mark || null });
    } catch (caught) {
      onSending(false);
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Try again.",
      );
    } finally {
      sendLock.current = false;
      setSending(false);
    }
  };

  /**
   * Go on to the next page. From the look-over page it sends — but only when
   * asked by the button, never by a key (`byKey`).
   */
  const advance = (byKey = false) => {
    if (current.kind === "check") {
      if (!byKey) void sendIt();
      return;
    }
    if (reading) return;
    if (
      current.kind === "question" &&
      current.question.required &&
      !filled(current.question, onRecord(current.question))
    ) {
      setNudged(true);
      return;
    }
    go(index + 1);
  };

  const close = async () => {
    if (await flush(draft)) router.push("/performance");
  };

  /* The keys. Re-registered every render because it reads the current page, the
     current draft and the current handlers — and costs one listener. Typing in
     a box is left alone, except for Escape and Ctrl/⌘ Enter. A held key does
     nothing after its first press. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (event.key === "Escape") {
        if (workOpen) return;
        event.preventDefault();
        void close();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        advance(true);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (tag === "INPUT" && (target as HTMLInputElement).type !== "radio") ||
        Boolean(target?.isContentEditable);
      if (typing || workOpen) return;

      const options =
        current.kind === "question"
          ? pickOptions(current.question, scale)
          : current.kind === "mark"
            ? ratingOptions(scale)
            : null;
      if (options) {
        const pressed = event.key.length === 1 ? event.key.toUpperCase() : "";
        const hit = options.find((option) => option.key === pressed);
        if (hit) {
          event.preventDefault();
          if (current.kind === "question") pick(current.question, hit.value);
          else pickMark(hit.value);
          return;
        }
      }

      if (event.key === "Enter") {
        /* A focused button or link acts on Enter by itself. */
        if (tag === "BUTTON" || tag === "A") return;
        event.preventDefault();
        advance(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const lastIndex = steps.length - 1;
  const label =
    current.kind === "question"
      ? `Question ${String(current.position)} of ${String(review.questions.length)}`
      : current.kind === "intro"
        ? "Before you start"
        : current.kind === "mark"
          ? "Overall mark"
          : current.kind === "summary"
            ? "Anything to add"
            : "Look it over";

  const optionalAndEmpty =
    (current.kind === "question" &&
      !current.question.required &&
      !filled(current.question, onRecord(current.question))) ||
    (current.kind === "mark" && !mark) ||
    (current.kind === "summary" && !summary.trim());

  const nextLabel =
    current.kind === "intro"
      ? start > 0
        ? "Continue"
        : "Start"
      : current.kind === "check"
        ? sendLabel(languageSeen, languageFindings.length > 0)
        : optionalAndEmpty
          ? "Skip"
          : "Next";

  const showWork = review.kind === "SELF";

  /* A fixed frame: the bar, the progress line and the buttons stay where they
     are, and only the middle scrolls. On a phone a tall page — a five-option
     scale — would otherwise push Next off the screen. */
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 sm:px-4">
        <IconButton label="Save and close" onClick={() => void close()}>
          <X aria-hidden="true" className="size-5" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body-sm font-medium text-ink">
            {review.kindLabel} · {review.cycleName}
          </p>
          <p className="truncate text-meta text-muted">{label}</p>
        </div>

        {/* Quiet, and only once there is something to say. */}
        <p
          aria-live="polite"
          className="flex shrink-0 items-center gap-1.5 text-meta text-muted"
        >
          {saveState === "saving" && (
            <>
              <Spinner size="sm" /> Saving
            </>
          )}
          {saveState === "saved" && (
            <>
              <Check
                aria-hidden="true"
                className="size-3.5 text-success-text"
              />{" "}
              Saved
            </>
          )}
          {saveState === "failed" && (
            <span className="font-medium text-danger-text">Not saved</span>
          )}
        </p>

        {showWork && (
          <Button
            size="sm"
            aria-label="What you did this period"
            onClick={() => setWorkOpen(true)}
          >
            <ListChecks aria-hidden="true" className="size-4" />
            <span className="hidden sm:inline">Your work</span>
          </Button>
        )}
      </header>

      <div
        role="progressbar"
        aria-label="How far through"
        aria-valuemin={0}
        aria-valuemax={lastIndex}
        aria-valuenow={index}
        className="h-0.5 shrink-0 bg-line"
      >
        <div
          className="h-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${String((index / lastIndex) * 100)}%` }}
        />
      </div>

      {/* Outside the scrolling middle, so it is on screen however far down the
          page somebody is. Inside it, a failed send on a long page was
          invisible: the button just stopped spinning. */}
      {failed && (
        <p
          role="alert"
          className="mx-auto mt-3 w-full max-w-2xl shrink-0 rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink"
        >
          {failed}
          {saveState === "failed" && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => void flush(draft)}
                className="cursor-pointer font-medium underline underline-offset-4"
              >
                Try again
              </button>{" "}
              <button
                type="button"
                onClick={() => router.push("/performance")}
                className="cursor-pointer font-medium underline underline-offset-4"
              >
                Leave anyway
              </button>
            </>
          )}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {/* Keyed so each page arrives fresh: up from below going on, a plain
            fade coming back. Reduced motion collapses both. */}
        <div
          key={current.kind === "question" ? current.question.id : current.kind}
          className={`mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 py-10 ${direction === "forward" ? "animate-rise" : "animate-fade"}`}
        >
          {current.kind === "intro" && (
            <IntroStep
              review={review}
              resumed={start > 0}
              answered={answered}
              onShowWork={showWork ? () => setWorkOpen(true) : null}
            />
          )}
          {current.kind === "question" && (
            <QuestionStep
              question={current.question}
              position={current.position}
              held={value(current.question)}
              reviewId={review.id}
              scale={scale}
              editable={editable}
              savedStays={savedAnswerStands(
                current.question,
                draft[current.question.id],
                saved(current.question),
              )}
              nudged={nudged}
              onChange={(next) => patch(current.question, next)}
              onPick={(optionValue) => pick(current.question, optionValue)}
              onBusyChange={setReading}
            />
          )}
          {current.kind === "mark" && (
            <MarkStep
              scale={scale}
              mark={mark}
              onPick={pickMark}
              onClear={() => setMark("")}
            />
          )}
          {current.kind === "summary" && (
            <SummaryStep
              review={review}
              summary={summary}
              onChange={setSummary}
              development={development}
            />
          )}
          {current.kind === "check" && (
            <CheckStep
              review={review}
              scale={scale}
              onRecord={onRecord}
              mark={mark}
              summary={summary}
              outstanding={outstanding}
              coaching={coaching}
              languageTexts={languageTexts}
              languageSeen={languageSeen}
              onEdit={(where) =>
                go(
                  where === "mark"
                    ? 1 + review.questions.length
                    : where === "summary"
                      ? 2 + review.questions.length
                      : 1 + review.questions.indexOf(where),
                )
              }
            />
          )}
        </div>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-surface px-3 py-3 sm:px-4">
        <Button
          variant="ghost"
          onClick={() => go(index - 1)}
          disabled={index === 0}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back
        </Button>
        <Button
          variant="accent"
          size="lg"
          loading={sending}
          disabled={reading}
          onClick={() => advance()}
        >
          {nextLabel}
        </Button>
      </footer>

      {showWork && (
        <Drawer
          open={workOpen}
          onClose={() => setWorkOpen(false)}
          title="What you did this period"
          description="For reference while you answer."
        >
          <SelfEvidence
            periodStart={review.periodStart}
            periodEnd={review.periodEnd}
            whenNothing={
              <p className="text-body-sm text-muted">
                Nothing is logged for this period yet.
              </p>
            }
          />
        </Drawer>
      )}
    </div>
  );
}
