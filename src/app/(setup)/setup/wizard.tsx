"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Button,
  ButtonLink,
  Callout,
  Field,
  ProgressMeter,
  Select,
  Skeleton,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type {
  ApiWizardOption,
  ApiWizardQuestion,
  FeatureKey,
} from "@/lib/api/setup";
import { MODULE_FEATURE_KEYS } from "@/lib/api/setup";
import { NIGERIAN_STATES } from "@/lib/reference/lists";
import { useOrgTaxState } from "@/lib/store/company";
import {
  FEATURE_COPY,
  useFeatures,
  useWizard,
} from "@/lib/store/features";

/**
 * Setup.
 *
 * The second thing a customer sees, and the screen that decides how big the
 * rest of the product looks. Seven questions, one per screen, each answerable
 * from memory by somebody who has never used HR software: how many people you
 * pay, whether anyone works nights, whether you lend money, whether staff claim
 * expenses, whether you run appraisals, whether you deduct PAYE, and whether you
 * run a pension scheme.
 *
 * The last two are different in kind and worth knowing about. Five decide which
 * **modules** exist and cost nothing to get wrong, because Settings turns them
 * back on. Two decide what the **payroll engine computes**, and getting those
 * wrong is a wrong payslip — a company with no pension scheme, asked nothing,
 * has 8% taken off every salary it runs. So their "No" carries the API's own
 * sentence about what it means, on screen, before the click.
 *
 * ## Three rules it follows
 *
 * **One question per step.** Not a form of five fields. A form invites you to
 * study it; a question invites you to answer it. The answer is a button, never
 * a dropdown-plus-Save.
 *
 * **There is no skip.** Every question gets an answer before the next one
 * shows, and no option is pre-marked as the current or default state — this
 * used to be skippable with a "Now" badge showing what skipping would leave
 * in place, and both let somebody get through setup without deciding anything.
 *
 * **A "yes" that needs a fact gets asked for the fact.** Turning PAYE on is not
 * enough to compute it: `Organization.taxState` decides which state every
 * employee files to, and it used to be possible to answer "Yes" here and land
 * on the dashboard with no state set at all — a blocker that surfaced only
 * when somebody tried to run payroll for real. Answering "Yes" to the PAYE
 * question now asks which state, on the same screen, before letting the
 * wizard move on, so the gap closes at setup time rather than at payroll time.
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
  const orgTax = useOrgTaxState();
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
  /** The option currently being saved, so only that button spins. */
  const [busy, setBusy] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  /**
   * Set the moment an option that turns PAYE on is chosen and the
   * organisation has no tax state on file yet. While this holds a value, the
   * wizard does not advance — the state prompt below is the only next step,
   * not an extra screen to click past.
   */
  const [awaitingTaxState, setAwaitingTaxState] = useState(false);
  const [taxStateChoice, setTaxStateChoice] = useState("");
  const [savingTaxState, setSavingTaxState] = useState(false);
  const [taxStateError, setTaxStateError] = useState<string | null>(null);

  const total = wizard.questions.length;
  /* `step` counts answers and is 1-based, so it is already the index of the
     first unanswered question. Clamped, because a completed wizard reports the
     total. */
  const resumeAt = total === 0 ? 0 : Math.min(wizard.step, total - 1);
  const index = movedTo ?? resumeAt;
  const done = phase === "done" || (!wizard.loading && wizard.setupCompletedAt !== null);

  const finish = useCallback(async () => {
    setFinishing(true);
    try {
      await wizard.complete();
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

  /** What "answer accepted" does next — the shared tail of both paths below. */
  const advance = useCallback(async () => {
    if (index + 1 < total) setMovedTo(index + 1);
    else await finish();
  }, [index, total, finish]);

  const choose = async (question: ApiWizardQuestion, option: ApiWizardOption) => {
    setBusy(option.value);
    try {
      await wizard.answer(question.id, option.value);
      if (option.payroll?.payeEnabled && !orgTax.taxState) {
        setTaxStateChoice("");
        setTaxStateError(null);
        setAwaitingTaxState(true);
      } else {
        await advance();
      }
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

  const confirmTaxState = async () => {
    if (!taxStateChoice) return;
    setSavingTaxState(true);
    setTaxStateError(null);
    const ok = await orgTax.setTaxState(taxStateChoice);
    setSavingTaxState(false);
    if (!ok) {
      setTaxStateError("That could not be saved. Try again.");
      return;
    }
    setAwaitingTaxState(false);
    await advance();
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
        /* Modules only. The three employee-record field groups are switchable
           in Settings and default on, so listing them here would report
           "you turned on Bank accounts" to somebody who answered five
           questions about shifts and loans. */
        flags={MODULE_FEATURE_KEYS.filter((key) => features[key])}
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
        <p className="mt-2.5 text-body-sm leading-relaxed text-body">
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
      <p className="text-body-sm font-medium text-muted">
        Question {index + 1} of {total}
      </p>

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
          /* An option carrying a consequence is a paragraph, not a chip, and two
             paragraphs side by side in a 36rem column read as a wall. One
             column whenever any option has one. */
          question.options.length > 1 &&
            !question.options.some((option) => option.consequence) &&
            "sm:grid-cols-2",
        )}
      >
        {question.options.map((option) => (
          <OptionButton
            key={option.value}
            option={option}
            busy={busy === option.value}
            disabled={busy !== null || finishing || awaitingTaxState}
            onSelect={() => void choose(question, option)}
          />
        ))}
      </div>

      {awaitingTaxState && (
        <div className="mt-6 rounded-lg border border-accent-line bg-accent-soft p-5">
          <Field
            label="Which state do you file PAYE to?"
            help="The state every employee falls back to when their own record does not say."
            {...(taxStateError ? { error: taxStateError } : {})}
          >
            <Select
              value={taxStateChoice}
              disabled={savingTaxState}
              onChange={(e) => setTaxStateChoice(e.target.value)}
            >
              <option value="" disabled>
                Choose a state
              </option>
              {NIGERIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            variant="accent"
            size="sm"
            className="mt-4"
            loading={savingTaxState}
            disabled={!taxStateChoice}
            onClick={() => void confirmTaxState()}
          >
            Continue
          </Button>
        </div>
      )}

      {index > 0 && !awaitingTaxState && (
        <div className="mt-7 border-t border-line pt-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMovedTo(index - 1)}
            disabled={busy !== null || finishing}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back
          </Button>
        </div>
      )}
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
 * One answer.
 *
 * `option.consequence` is the API's own sentence about what switching a
 * statutory deduction off means, rendered **verbatim and before the click**.
 * PAYE deduction is an employer obligation under the Personal Income Tax Act and
 * a pension scheme is compulsory at fifteen employees, so "No" here is a real
 * choice with a real consequence — a configurable product is fine, one that
 * quietly helps somebody be non-compliant is not. It is not paraphrased locally:
 * two wordings for one legal fact is how they stop agreeing.
 *
 * No option is pre-marked as the current or default state: setup is meant to
 * be answered, not glanced at and left, and a "Now" badge on one option reads
 * as permission to do exactly that.
 */
function OptionButton({
  option,
  busy,
  disabled,
  onSelect,
}: {
  option: ApiWizardOption;
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
        "flex min-h-16 flex-col gap-1.5 rounded-lg border px-5 py-4 text-left",
        "transition-[border-color,background-color,box-shadow] duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "border-line bg-surface hover:border-control-line hover:bg-canvas",
        !option.consequence && "justify-center",
      )}
    >
      <span className="flex w-full items-center justify-between gap-3">
        <span className="text-body-sm font-medium text-ink">{option.label}</span>
        {busy && <span className="shrink-0 text-meta text-muted">Saving…</span>}
      </span>
      {option.consequence && (
        <span className="text-body-sm leading-relaxed text-body">
          {option.consequence}
        </span>
      )}
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
 *
 * The primary action is adding a first employee, not the dashboard. A
 * dashboard with nobody on it is an empty room — the concrete next step is
 * putting somebody real into the system, and the getting-started checklist
 * there picks up from here for whatever comes after that.
 */
function Done({
  flags,
  returning,
}: {
  flags: FeatureKey[];
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
              <span className="block text-body-sm font-medium text-ink">
                {FEATURE_COPY[key].label}
              </span>
              <span className="mt-0.5 block text-body-sm text-muted">
                {FEATURE_COPY[key].line}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
        <ButtonLink href="/people/new" variant="accent" size="lg">
          Add your first employee
        </ButtonLink>
        <Link
          href="/dashboard"
          className="text-body-sm font-medium text-accent-text underline decoration-accent-line underline-offset-4 hover:decoration-accent"
        >
          Go to the dashboard
        </Link>
        <Link
          href="/settings/features"
          className="text-body-sm font-medium text-accent-text underline decoration-accent-line underline-offset-4 hover:decoration-accent"
        >
          Turn on more features
        </Link>
      </div>
    </Frame>
  );
}
