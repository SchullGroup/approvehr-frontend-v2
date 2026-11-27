import { cn } from "@/lib/cn";
import type { ReviewCycleStage } from "@/lib/api/performance";

/**
 * How far along a period is, as one bar cut into its four stages.
 *
 * The same "Progress" and percentage the period card always had, with the line
 * cut into sections so the stage reads at a glance (owner, 27 Nov 2026). One
 * component for every place a period appears, so it looks the same on the
 * Periods list, the Overview and the period page.
 *
 * One word per stage: Self, Manager, Final, Acknowledged. The labels are the
 * visible text; the bar itself is a progressbar with the stage as its value text.
 *
 * A period that has not started is about to be at Self, so Self is the current
 * stage and is drawn as a soft tint, with no percentage: nothing claims progress.
 */

/** The stages a period walks, in order, after it starts. */
const STAGES: ReviewCycleStage[] = [
  "SELF",
  "MANAGER",
  "CALIBRATION",
  "PUBLISHED",
];

/** The one word for each, in the same order. Also the HR rail's labels. */
export const STAGE_WORDS = [
  "Self",
  "Manager",
  "Final",
  "Acknowledged",
] as const;

/** How many of the four stages a period has reached. A draft has reached none. */
export function stagesReached(stage: ReviewCycleStage): number {
  const index = STAGES.indexOf(stage);
  return index < 0 ? 0 : index + 1;
}

/** The share of the way through, as the period card has always shown it. */
export function stageShare(stage: ReviewCycleStage): number {
  return stagesReached(stage) / STAGES.length;
}

export function StageProgress({
  stage,
  tone,
  label = "Progress",
  className,
}: {
  stage: ReviewCycleStage;
  /** The fill colour. The period's own on its card; the accent where there is none. */
  tone?: string;
  /** The word on the left of the header. A period's name makes a better one for a screen reader. */
  label?: string;
  className?: string;
}) {
  const reached = stagesReached(stage);
  const started = reached > 0;
  /* Not started: Self is the stage to come, so it is the current one. */
  const current = started ? reached - 1 : 0;
  const fill = tone ?? "var(--color-accent)";
  const soft = `color-mix(in srgb, ${fill} 30%, var(--color-sunken))`;
  const word = STAGE_WORDS[current] ?? STAGE_WORDS[0];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-baseline justify-between">
        <span className="text-body-sm text-muted">Progress</span>
        {started && (
          <span className="tabular text-h3 font-semibold text-ink">
            {Math.round(stageShare(stage) * 100)}%
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div
          role="progressbar"
          aria-label={`${label} progress`}
          aria-valuemin={0}
          aria-valuemax={STAGES.length}
          aria-valuenow={reached}
          aria-valuetext={
            started
              ? `${word}, stage ${String(reached)} of ${String(STAGES.length)}`
              : "Not started"
          }
          className="grid grid-cols-4 gap-1.5"
        >
          {STAGE_WORDS.map((name, index) => (
            <span
              key={name}
              aria-hidden="true"
              className="h-2 rounded-full bg-sunken transition-colors duration-300 motion-reduce:transition-none"
              style={
                index < reached
                  ? { background: fill }
                  : !started && index === 0
                    ? { background: soft }
                    : undefined
              }
            />
          ))}
        </div>

        {/* The word under each section. On a phone only the current one fits, so
            only it is shown there. */}
        <ol className="grid grid-cols-4 gap-1.5" aria-hidden="true">
          {STAGE_WORDS.map((name, index) => (
            <li
              key={name}
              /* Pinned to its own column, so on a phone the one label that is
                 shown still sits under its section. */
              style={{ gridColumnStart: index + 1 }}
              className={cn(
                "min-w-0 truncate text-meta",
                index === current
                  ? "block font-semibold text-ink"
                  : cn(
                      "hidden sm:block",
                      index < reached ? "text-body" : "text-faint",
                    ),
              )}
            >
              {name}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
