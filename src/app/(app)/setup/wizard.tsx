"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  ProgressMeter,
  Skeleton,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type {
  ApiSeeded,
  ApiWizardOption,
  ApiWizardQuestion,
  FeatureKey,
} from "@/lib/api/setup";
import { FEATURE_KEYS } from "@/lib/api/setup";
import {
  FEATURE_COPY,
  useFeatures,
  useWizard,
} from "@/lib/store/features";

/**
 * Setup.
 *
 * The second thing a customer sees, and the screen that decides how big the
 * rest of the product looks. Five questions, one per screen, each answerable
 * from memory by somebody who has never used HR software: how many people you
 * pay, whether anyone works nights, whether you lend money, whether staff claim
 * expenses, whether you run appraisals.
 *
 * ## Three rules it follows
 *
 * **One question per step.** Not a form of five fields. A form invites you to
 * study it; a question invites you to answer it. The answer is a button, never
 * a dropdown-plus-Save.
 *
 * **Skipping is free.** Skip writes nothing at all — the safe default is
 * already in place and the option carrying it is marked "Now", so what happens
 * if you skip is visible rather than promised, and no words are put in anybody's
 * mouth about whether they lend their staff money. (Progress on the server is a
 * single forward-only number, not a record per question, so a skipped question
 * is re-asked only if you stop at it. Answering a later one moves the counter
 * past it. Worth knowing; not worth a second column in the database.)
 *
 * **Progress is the truth.** The bar measures questions *answered on the
 * server*, so a resumed wizard opens where it stopped and the bar agrees with
 * it. It never rounds up to look encouraging.
 *
 * ## The questions are not in this file
 *
 * They come from `GET /setup/wizard` — wording, order, options and the exact
 * flags each answer writes. That is what lets the wording improve without a
 * frontend release, and it is why nothing below hardcodes a question or
 * recomputes what an answer does. (`lib/store/features.ts` keeps one mirrored
 * copy for demonstrations with no API, and says so.)
 */
export function SetupWizard() {
  const wizard = useWizard();
  const features = useFeatures();
  const toast = useToast();

  /**
   * Where the user has navigated to by hand. `null` means "wherever the server
   * says we got to".
   *
   * Position is **derived**, not synchronised in an effect. Copying the server's
   * step into state on arrival needs a `setState` inside `useEffect`, which is
   * a cascading render and is what `react-hooks/set-state-in-effect` exists to
   * stop. So `resumeAt` is computed every render and this override — only ever
   * written by a click — sits on top of it.
   */
  const [movedTo, setMovedTo] = useState<number | null>(null);
  /**
   * `null` until something happens: the wizard has not been finished *in this
   * visit*. That is a different fact from "setup is complete", which the server
   * owns, and the two produce different sentences on the last screen.
   */
  const [phase, setPhase] = useState<"done" | null>(null);
  const [seeded, setSeeded] = useState<ApiSeeded | null>(null);
  /** The option currently being saved, so only that button spins. */
  const [busy, setBusy] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const total = wizard.questions.length;
  /* `step` counts answers and is 1-based, so it is already the index of the
     first unanswered question. Clamped, because a completed wizard reports 5. */
  const resumeAt = total === 0 ? 0 : Math.min(wizard.step, total - 1);
  const index = movedTo ?? resumeAt;
  const done = phase === "done" || (!wizard.loading && wizard.setupCompletedAt !== null);

  const finish = useCallback(async () => {
    setFinishing(true);
    try {
      setSeeded(await wizard.complete());
      setPhase("done");
    } catch (error) {
      toast.push({
        title: "Could not finish setup",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setFinishing(false);
    }
  }, [wizard, toast]);

  const choose = async (question: ApiWizardQuestion, option: ApiWizardOption) => {
    setBusy(option.value);
    try {
      await wizard.answer(question.id, option.value);
      if (index + 1 < total) setMovedTo(index + 1);
      else await finish();
    } catch (error) {
      toast.push({
        title: "Could not save that answer",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(null);
    }
  };

  /**
   * Skip writes nothing — no request, no flag change, no step.
   *
   * The safe default is already stored and the option carrying it is marked
   * "Now" on screen, so skipping has a visible consequence rather than a
   * promised one. See the note at the top of this file for what that means for
   * resuming.
   */
  const skip = async () => {
    if (index + 1 < total) setMovedTo(index + 1);
    else await finish();
  };

  /* ------------------------------------------------------------ loading */

  if (wizard.loading) {
    return (
      <Frame>
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-4 h-2 w-full" />
        <Skeleton className="mt-10 h-9 w-4/5" />
        <Skeleton className="mt-3 h-4 w-3/5" />
        <div className="mt-9 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </Frame>
    );
  }

  if (wizard.error) {
    return (
      <Frame>
        <Callout tone="danger" title="Setup could not load">
          {wizard.error}
        </Callout>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="accent" onClick={wizard.reload}>
            Try again
          </Button>
          <ButtonLink href="/dashboard" variant="secondary">
            Go to the dashboard
          </ButtonLink>
        </div>
      </Frame>
    );
  }

  if (done) {
    return (
      <Done
        flags={FEATURE_KEYS.filter((key) => features[key])}
        seeded={seeded}
        returning={phase !== "done"}
      />
    );
  }

  const question = wizard.questions[index];
  if (!question) {
    return (
      <Frame>
        <Callout tone="warning" title="Nothing to ask">
          There are no setup questions right now.
        </Callout>
        <div className="mt-5">
          <ButtonLink href="/dashboard" variant="accent">
            Go to the dashboard
          </ButtonLink>
        </div>
      </Frame>
    );
  }

  /* Somebody without settings access can see the questions and not answer them.
     Saying so once, plainly, beats five failing buttons. */
  if (!wizard.canAnswer) {
    return (
      <Frame>
        <span className="flex size-10 items-center justify-center rounded-full bg-sunken text-muted">
          <Lock aria-hidden="true" className="size-5" />
        </span>
        <h1 className="mt-5 text-h3 text-ink">
          Whoever manages settings does this part
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-body">
          Ask them to finish setup. Everything you can use already works.
        </p>
        <div className="mt-6">
          <ButtonLink href="/dashboard" variant="accent">
            Go to the dashboard
          </ButtonLink>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="flex items-center justify-between gap-4">
        <p className="text-[0.875rem] font-medium text-muted">
          Question {index + 1} of {total}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void finish()}
          loading={finishing}
          disabled={busy !== null}
        >
          Skip setup
        </Button>
      </div>

      <ProgressMeter
        value={index}
        max={total}
        showValue={false}
        tone="accent"
        size="sm"
        className="mt-3"
      />

      <div className="mt-10">
        <h1 className="text-h3 text-ink sm:text-h2">{question.question}</h1>
        <p className="mt-3 text-lead text-body">{question.help}</p>
      </div>

      <div
        className={cn(
          "mt-9 grid gap-3",
          question.options.length > 1 && "sm:grid-cols-2",
        )}
      >
        {question.options.map((option) => (
          <OptionButton
            key={option.value}
            option={option}
            current={isCurrent(option, features)}
            busy={busy === option.value}
            disabled={busy !== null || finishing}
            onSelect={() => void choose(question, option)}
          />
        ))}
      </div>

      <div className="mt-7 flex items-center justify-between gap-4 border-t border-line pt-5">
        {index > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMovedTo(index - 1)}
            disabled={busy !== null || finishing}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back
          </Button>
        ) : (
          <span />
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => void skip()}
          disabled={busy !== null || finishing}
        >
          Skip this one
        </Button>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The calm container: one column, centred, nothing else on screen.
 *
 * No `PageHeader`. A page title above a question would be a second heading
 * competing with the only thing being asked.
 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xl px-5 py-12 sm:px-7 sm:py-16">
      {children}
    </div>
  );
}

/**
 * Whether this option describes the state the company is in right now.
 *
 * Computed from the option's own served `sets` rather than from a table of
 * question ids, so it keeps working when the API adds a sixth question. Marking
 * it is what makes "Skip this one" honest: the consequence of skipping is on
 * screen, next to the thing that would have changed it.
 */
function isCurrent(
  option: ApiWizardOption,
  features: ReturnType<typeof useFeatures>,
): boolean {
  const flagKeys = FEATURE_KEYS.filter((key) => option.sets[key] !== undefined);
  const bandMatches =
    option.sets.headcountBand === undefined ||
    option.sets.headcountBand === features.headcountBand;
  if (!bandMatches) return false;
  if (flagKeys.length === 0) return bandMatches;
  return flagKeys.every((key) => option.sets[key] === features[key]);
}

function OptionButton({
  option,
  current,
  busy,
  disabled,
  onSelect,
}: {
  option: ApiWizardOption;
  current: boolean;
  busy: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={cn(
        "flex min-h-16 items-center justify-between gap-3 rounded-lg border px-5 py-4 text-left",
        "transition-[border-color,background-color,box-shadow] duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
        "disabled:cursor-not-allowed disabled:opacity-60",
        current
          ? "border-accent-line bg-accent-soft"
          : "border-line bg-surface hover:border-control-line hover:bg-canvas",
      )}
    >
      <span
        className={cn(
          "text-sm font-medium",
          current ? "text-accent-text" : "text-ink",
        )}
      >
        {option.label}
      </span>
      {current && (
        <span className="shrink-0 text-[0.75rem] font-medium text-accent-text">
          Now
        </span>
      )}
      {busy && <span className="shrink-0 text-[0.75rem] text-muted">Saving…</span>}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The last step: what is on, and one way forward.
 *
 * Only what was turned **on** is listed. A list of what a company does not do is
 * a list of things to feel behind about, and the settings page exists for the
 * day one of them becomes true.
 */
function Done({
  flags,
  seeded,
  returning,
}: {
  flags: FeatureKey[];
  seeded: ApiSeeded | null;
  returning: boolean;
}) {
  return (
    <Frame>
      <span className="flex size-10 items-center justify-center rounded-full bg-success-soft text-success-text">
        <Check aria-hidden="true" strokeWidth={2.5} className="size-5" />
      </span>

      <h1 className="mt-5 text-h3 text-ink sm:text-h2">
        {returning ? "You are set up" : "That is it — you are set up"}
      </h1>
      <p className="mt-3 text-lead text-body">
        Paying people, payslips and leave are on for everybody. You also have:
      </p>

      <ul className="mt-6 flex flex-col gap-3.5">
        {flags.map((key) => (
          <li key={key} className="flex gap-3">
            <Check
              aria-hidden="true"
              strokeWidth={2.5}
              className="mt-0.5 size-4 shrink-0 text-success-text"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">
                {FEATURE_COPY[key].label}
              </span>
              <span className="mt-0.5 block text-[0.875rem] text-muted">
                {FEATURE_COPY[key].line}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {seeded && (seeded.leaveTypes > 0 || seeded.payrollSettings) && (
        <div className="mt-6">
          <Badge tone="success" dot>
            {seeded.leaveTypes > 0
              ? `${seeded.leaveTypes} leave types ready to use`
              : "Payroll settings ready to use"}
          </Badge>
        </div>
      )}

      <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
        <ButtonLink href="/dashboard" variant="accent" size="lg">
          Go to the dashboard
        </ButtonLink>
        <Link
          href="/settings/features"
          className="text-[0.875rem] font-medium text-accent-text underline decoration-accent-line underline-offset-4 hover:decoration-accent"
        >
          Turn on more features
        </Link>
      </div>
    </Frame>
  );
}
