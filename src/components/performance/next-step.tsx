import { Button, ButtonLink } from "@/components/ui";
import { ProgressMeter } from "@/components/ui/progress";
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
 * "Get ready": the steps before something can start, with a progress bar. The
 * current step is highlighted and the one primary button goes straight to it;
 * the others are quiet text links.
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
  const counted = steps.filter((step) => !step.optional);
  const done = counted.filter((step) => step.done).length;
  const current = currentStep(steps);
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4"
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-body-md font-semibold text-ink">{title}</h2>
        <ProgressMeter
          value={done}
          max={Math.max(counted.length, 1)}
          label={`${String(done)} of ${String(counted.length)} ready`}
          showValue={false}
          size="sm"
        />
      </div>
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
                <ActionButton action={step.action} />
              ) : (
                !step.done && (
                  <ActionButton action={step.action} variant="ghost" />
                )
              )}
            </li>
          );
        })}
      </ol>
      {current === null && final && (
        <div className="flex justify-end">
          <ActionButton action={final} />
        </div>
      )}
    </section>
  );
}
