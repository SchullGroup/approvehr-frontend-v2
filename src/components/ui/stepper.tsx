"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { Modal, type ModalSize } from "./modal";
import { Button } from "./button";

/*
 * Every complex process in ENRICH is a stepper: campaign creation, personnel
 * onboarding, equipment booking, contract signing, dispute filing.
 *
 * The rail is an ordered list so assistive technology reads position and
 * count natively. The current step carries aria-current="step", and step
 * changes are announced through a polite live region rather than silently.
 */

export type Step = {
  id: string;
  label: string;
  /** Short summary shown under the label on wide screens. */
  hint?: string;
  /** Blocks forward navigation until satisfied. */
  isComplete?: boolean;
  optional?: boolean;
};

export function useStepper(steps: Step[], initial = 0) {
  const [index, setIndex] = useState(initial);
  const [furthest, setFurthest] = useState(initial);

  const clamp = useCallback(
    (n: number) => Math.max(0, Math.min(steps.length - 1, n)),
    [steps.length],
  );

  const goTo = useCallback(
    (n: number) => {
      const next = clamp(n);
      setIndex(next);
      setFurthest((f) => Math.max(f, next));
    },
    [clamp],
  );

  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const back = useCallback(() => goTo(index - 1), [goTo, index]);

  return useMemo(
    () => ({
      steps,
      index,
      furthest,
      current: steps[index],
      isFirst: index === 0,
      isLast: index === steps.length - 1,
      goTo,
      next,
      back,
      reset: () => {
        setIndex(initial);
        setFurthest(initial);
      },
    }),
    [steps, index, furthest, goTo, next, back, initial],
  );
}

export type StepperState = ReturnType<typeof useStepper>;

/* -------------------------------------------------------------------------- */

export function StepIndicator({
  steps,
  index,
  furthest,
  onStepSelect,
  className,
}: {
  steps: Step[];
  index: number;
  furthest: number;
  /** Only reached steps are navigable. Undefined makes the rail read only. */
  onStepSelect?: (n: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      {/* Compact rail. Shown below the medium breakpoint. */}
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-ink">
            {steps[index]?.label}
          </p>
          <p className="tabular shrink-0 text-[0.875rem] text-muted">
            Step {index + 1} of {steps.length}
          </p>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                i < index ? "bg-success" : i === index ? "bg-accent" : "bg-sunken",
              )}
            />
          ))}
        </div>
      </div>

      {/* Full rail. */}
      <ol className="hidden sm:flex sm:items-start">
        {steps.map((step, i) => {
          const isDone = i < index || (step.isComplete && i !== index);
          const isCurrent = i === index;
          const reachable = i <= furthest;
          const interactive = Boolean(onStepSelect) && reachable && !isCurrent;

          const marker = (
            <>
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-[0.75rem] font-semibold tabular transition-colors duration-200",
                  isCurrent &&
                    "border-accent bg-accent text-white ring-4 ring-accent/20",
                  isDone && !isCurrent && "border-success bg-success text-ink",
                  !isDone &&
                    !isCurrent &&
                    "border-line-strong bg-surface text-muted",
                )}
              >
                {isDone && !isCurrent ? (
                  <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                ) : (
                  i + 1
                )}
              </span>

              <span className="min-w-0 text-left">
                <span
                  className={cn(
                    "block text-[0.875rem] font-medium leading-tight",
                    isCurrent ? "text-ink" : isDone ? "text-body" : "text-muted",
                  )}
                >
                  {step.label}
                </span>
                {step.optional && (
                  <span className="block text-[0.75rem] text-faint">
                    Optional
                  </span>
                )}
              </span>
            </>
          );

          return (
            <li
              key={step.id}
              className="flex flex-1 items-start gap-2 last:flex-none"
              aria-current={isCurrent ? "step" : undefined}
            >
              {interactive ? (
                <button
                  type="button"
                  onClick={() => onStepSelect?.(i)}
                  className="flex items-center gap-2.5 rounded-md text-left transition-opacity hover:opacity-70"
                >
                  {marker}
                </button>
              ) : (
                <span className="flex items-center gap-2.5">{marker}</span>
              )}

              {i < steps.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-3.5 h-px min-w-6 flex-1 transition-colors duration-300",
                    i < index ? "bg-success" : "bg-line",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Announce movement without stealing focus. */}
      <p aria-live="polite" className="sr-only-focusable">
        Step {index + 1} of {steps.length}, {steps[index]?.label}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export function StepperModal({
  open,
  onClose,
  title,
  description,
  stepper,
  size = "xl",
  onFinish,
  finishLabel = "Submit",
  nextLabel = "Continue",
  canContinue = true,
  busy = false,
  secondaryAction,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  stepper: StepperState;
  size?: ModalSize;
  onFinish: () => void;
  finishLabel?: string;
  nextLabel?: string;
  /** Gate for the current step's validation. */
  canContinue?: boolean;
  busy?: boolean;
  secondaryAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { index, steps, furthest, isFirst, isLast, back, next, goTo } = stepper;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size={size}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button variant="ghost" onClick={back} disabled={busy}>
                <ChevronLeft aria-hidden="true" className="size-4" />
                Back
              </Button>
            )}
            {secondaryAction}
          </div>

          <div className="flex items-center gap-2">
            <span className="tabular hidden text-[0.875rem] text-muted sm:inline">
              Step {index + 1} of {steps.length}
            </span>
            {isLast ? (
              <Button
                variant="accent"
                onClick={onFinish}
                loading={busy}
                disabled={!canContinue}
              >
                {finishLabel}
              </Button>
            ) : (
              <Button
                variant="accent"
                onClick={next}
                disabled={!canContinue || busy}
              >
                {nextLabel}
                <ChevronRight aria-hidden="true" className="size-4" />
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <StepIndicator
          steps={steps}
          index={index}
          furthest={furthest}
          onStepSelect={busy ? undefined : goTo}
        />
        <div className="border-t border-line pt-6">{children}</div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/** Header for the content area of a single step. */
export function StepHeader({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-5", className)}>
      <h3 className="text-h4 text-ink">{title}</h3>
      {description && (
        <p className="mt-1.5 text-sm leading-relaxed text-body">
          {description}
        </p>
      )}
    </div>
  );
}
