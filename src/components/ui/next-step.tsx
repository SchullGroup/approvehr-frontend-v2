"use client";

import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Button, ButtonLink } from "./button";
import { Modal } from "./modal";
import { cn } from "@/lib/cn";

/**
 * Guided flows: one next step at a time, never a wall of warnings (owner
 * direction, 24 Nov 2026). `docs/guided-flows.md` has the rules these two
 * components keep.
 *
 * A screen that finds something missing says it once, in plain words, with ONE
 * button that goes straight to the step. Counts are shown and names are not; a
 * state is neutral text and never red. Red belongs to real failures and
 * destructive actions.
 */

export type StepAction = {
  label: string;
  /** A link, or a handler for something done here. One of the two. */
  href?: string;
  onClick?: () => void;
  loading?: boolean;
};

function ActionButton({
  action,
  variant = "accent",
}: {
  action: StepAction;
  variant?: "accent" | "secondary" | "ghost";
}) {
  return action.href !== undefined ? (
    <ButtonLink href={action.href} variant={variant} size="sm">
      {action.label}
    </ButtonLink>
  ) : (
    <Button
      type="button"
      variant={variant}
      size="sm"
      loading={action.loading ?? false}
      onClick={action.onClick}
    >
      {action.label}
    </Button>
  );
}

/**
 * The one next step, as a quiet card: what to do in plain words, an optional
 * line of why, ONE primary button, and an optional second button for a safe
 * "later". Say a title and nothing else when that is enough.
 */
export function NextStep({
  title,
  detail,
  action,
  later,
  className,
}: {
  title: string;
  detail?: string;
  action?: StepAction;
  /** "Do this later", where it is safe. Never the primary. */
  later?: StepAction;
  className?: string;
}) {
  return (
    <section
      aria-label="Next step"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-ink">{title}</p>
        {detail && <p className="mt-0.5 text-body-sm text-muted">{detail}</p>}
      </div>
      {(action || later) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {later && <ActionButton action={later} variant="ghost" />}
          {action && <ActionButton action={action} />}
        </div>
      )}
    </section>
  );
}

export type ReadyStep = {
  id: string;
  label: string;
  /** What it is set to, or why it can wait. One short phrase. */
  detail?: string;
  done: boolean;
  /** Not needed to start: it is an invitation, left out of the progress. */
  optional?: boolean;
  /** Where the step is done. */
  action: StepAction;
};

/** The first step still to do that is not optional, else null. */
export function currentStep(steps: readonly ReadyStep[]): ReadyStep | null {
  return steps.find((step) => !step.done && !step.optional) ?? null;
}

/**
 * "Get ready": the steps before something can start, as one thin line at the
 * top of the screen. A segment for each step that is needed (filled when done),
 * what is next in a few words, and how many are in. Pressing it opens a window
 * with the steps, what each is set to, and the buttons that go to them; the real
 * start sits at the bottom of that window once everything needed is done.
 *
 * Owner direction, 24 Nov 2026: any progress or checklist on a screen is a thin
 * horizontal line at the top that says what is next, and the detail is in a
 * window, so the page below it stays for what the page is for.
 */
export function GetReady({
  title = "Get ready",
  steps,
  final,
}: {
  title?: string;
  steps: readonly ReadyStep[];
  /** What the primary button says once every step is done: the real start. */
  final?: StepAction;
}) {
  const [open, setOpen] = useState(false);
  const counted = steps.filter((step) => !step.optional);
  const done = counted.filter((step) => step.done).length;
  const current = currentStep(steps);

  /* An action done here closes the window first, so what it opens is not behind it. */
  const run = (action: StepAction): StepAction =>
    action.onClick
      ? {
          ...action,
          onClick: () => {
            setOpen(false);
            action.onClick?.();
          },
        }
      : action;

  return (
    <section aria-label={title}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span
          role="progressbar"
          aria-label={`${String(done)} of ${String(counted.length)} ready`}
          aria-valuemin={0}
          aria-valuemax={counted.length}
          aria-valuenow={done}
          className="flex min-w-0 flex-1 gap-1"
        >
          {counted.map((step) => (
            <span
              key={step.id}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                step.done
                  ? "bg-accent"
                  : current?.id === step.id
                    ? "bg-accent/40"
                    : "bg-sunken",
              )}
            />
          ))}
        </span>
        <span className="shrink-0 text-body-sm font-medium text-ink">
          {current
            ? `Next: ${current.label}`
            : final
              ? "Ready to start"
              : "All done"}
        </span>
        <span className="shrink-0 text-meta text-muted">
          {done} of {counted.length}
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-faint"
        />
      </button>

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={title}
          size="md"
          footer={
            current === null && final ? (
              <ActionButton action={run(final)} />
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            )
          }
        >
          <ol className="flex flex-col divide-y divide-line">
            {steps.map((step) => {
              const isCurrent = current?.id === step.id;
              return (
                <li
                  key={step.id}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 py-2.5",
                    isCurrent && "-mx-2 rounded-md bg-accent-soft px-2",
                  )}
                >
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-body-sm",
                        isCurrent ? "font-medium text-ink" : "text-body",
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="text-meta text-muted">
                      {step.done
                        ? (step.detail ?? "Done")
                        : step.optional
                          ? (step.detail ?? "Optional")
                          : (step.detail ?? "To do")}
                    </p>
                  </div>
                  {isCurrent ? (
                    <ActionButton action={run(step.action)} />
                  ) : (
                    !step.done && (
                      <ActionButton action={run(step.action)} variant="ghost" />
                    )
                  )}
                </li>
              );
            })}
          </ol>
        </Modal>
      )}
    </section>
  );
}

/**
 * "Get ready", as small as it can be: a ring and "3 of 4" beside the button that
 * starts the thing, with a tick when everything needed is in. Pressing it opens a
 * window with each step, what it is set to and the button that goes to it. The
 * start button itself waits until every needed step is done; an optional step
 * never holds it back.
 */
export function ReadyChip({
  title = "Get ready",
  steps,
}: {
  title?: string;
  steps: readonly ReadyStep[];
}) {
  const [open, setOpen] = useState(false);
  const counted = steps.filter((step) => !step.optional);
  const done = counted.filter((step) => step.done).length;
  const current = currentStep(steps);
  const all = counted.length === 0 ? 1 : done / counted.length;
  const R = 8;
  const C = 2 * Math.PI * R;

  const run = (action: StepAction): StepAction =>
    action.onClick
      ? {
          ...action,
          onClick: () => {
            setOpen(false);
            action.onClick?.();
          },
        }
      : action;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${title}: ${String(done)} of ${String(counted.length)} ready`}
        className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-body-sm font-medium text-ink transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <svg
          viewBox="0 0 20 20"
          className="size-5 -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="10"
            cy="10"
            r={R}
            fill="none"
            strokeWidth="2.5"
            className="stroke-sunken"
          />
          <circle
            cx="10"
            cy="10"
            r={R}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="stroke-accent transition-[stroke-dashoffset] duration-300 motion-reduce:transition-none"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - all)}
          />
        </svg>
        <span className="tabular">
          {done} of {counted.length}
        </span>
        {current === null && (
          <Check aria-hidden="true" className="size-3.5 text-success-text" />
        )}
      </button>

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title={title}
          size="md"
          footer={
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          }
        >
          <ol className="flex flex-col divide-y divide-line">
            {steps.map((step) => {
              const isCurrent = current?.id === step.id;
              return (
                <li
                  key={step.id}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 py-2.5",
                    isCurrent && "-mx-2 rounded-md bg-accent-soft px-2",
                  )}
                >
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-body-sm",
                        isCurrent ? "font-medium text-ink" : "text-body",
                      )}
                    >
                      {step.label}
                    </p>
                    <p className="text-meta text-muted">
                      {step.done
                        ? (step.detail ?? "Done")
                        : step.optional
                          ? (step.detail ?? "Optional")
                          : (step.detail ?? "To do")}
                    </p>
                  </div>
                  {isCurrent ? (
                    <ActionButton action={run(step.action)} />
                  ) : (
                    !step.done && (
                      <ActionButton action={run(step.action)} variant="ghost" />
                    )
                  )}
                </li>
              );
            })}
          </ol>
        </Modal>
      )}
    </>
  );
}
