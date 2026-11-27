"use client";

import { AttentionMark } from "@/components/ui";
import { ProgressMeter } from "@/components/ui/progress";
import {
  outOf5FromBp,
  outOf5Label,
  visibleComponents,
  weightLabel,
  type ApiComponentScore,
} from "@/lib/api/performance";
import {
  leftOutLabels,
  leftOutNote,
  setAtNote,
} from "@/lib/performance/score-wording";
import { useProjectsGate } from "@/lib/store/project-session";
import { cn } from "@/lib/cn";

/**
 * What a score is made of: one list, drawn the same on the record of an
 * appraisal and in the history drawer.
 *
 * Each part is its name, one thin bar, the score in the words the headline uses
 * (out of 5, not a percentage, so there is one unit on the screen) and its
 * weight, small. That is all the list says. Every sentence that used to sit
 * under a part, above the list or in a reveal below it (a part left out, a
 * weight set at something else, why a part has nothing) is one tooltip beside
 * it.
 *
 * ## A part with nothing recorded is not in the list
 *
 * It was a row reading "Nothing recorded" beside a badge reading "not counted".
 * A part that gave up its weight is named in the tooltip with the API's own
 * reason, which is different every time, and it never appears as a bar at
 * nothing: an empty bar reads as a mark somebody was given.
 *
 * A score with no part that has anything recorded draws nothing at all.
 *
 * ## Where the figures come from
 *
 * Every figure is the API's. This changes a part's score from basis points to
 * the 1.0 to 5.0 scale (`outOf5FromBp`, the API's own conversion) and reads the
 * weight it actually carried; it works out nothing and bands nothing, which is
 * why there is no word beside a part's figure: the thresholds for those live
 * once, in the API.
 */

export type ScorePartRow = {
  component: string;
  label: string;
  /** 0 to 10000. Never null: a part with nothing recorded has no row. */
  scoreBp: number;
  /** The weight it actually carried, after left-out parts were dropped. */
  effectiveWeightBp: number;
};

/**
 * The rows the list draws and the lines its tooltip says, as data.
 *
 * Pure, so that "which parts are in the list" and "what the tooltip says" are
 * decisions about two arrays rather than things to find by reading JSX.
 */
export function scorePartsOf(
  components: readonly ApiComponentScore[],
  options: { projects: boolean; notes?: readonly (string | null | false)[] },
): { rows: ScorePartRow[]; lines: string[] } {
  const visible = visibleComponents([...components], {
    projects: options.projects,
  });

  const rows: ScorePartRow[] = [];
  const reasons: string[] = [];
  const setAt: string[] = [];
  for (const part of visible) {
    if (part.included && part.scoreBp !== null) {
      rows.push({
        component: part.component,
        label: part.label,
        scoreBp: part.scoreBp,
        effectiveWeightBp: part.effectiveWeightBp,
      });
      const note = setAtNote(part);
      if (note) setAt.push(`${part.label}: ${note}`);
    } else if (part.weightBp > 0 && part.excludedNote) {
      /* The API's own words for why it counted for nobody. A part weighted at
         nothing never held a weight, so there is nothing to explain. */
      reasons.push(`${part.label}: ${part.excludedNote}`);
    }
  }

  const lines = [
    leftOutNote(leftOutLabels(components)),
    ...reasons,
    ...setAt,
    ...(options.notes ?? []),
  ].filter((line): line is string => typeof line === "string" && line !== "");

  return { rows, lines };
}

/** A part's score the way the headline says one: "3.6 out of 5". */
export const partScoreWords = (scoreBp: number): string =>
  `${outOf5Label(outOf5FromBp(scoreBp))} out of 5`;

export function ScoreParts({
  components,
  notes,
  className,
}: {
  components: readonly ApiComponentScore[];
  /** Other sentences about this score (frozen weights, what was not counted), for the one tooltip. */
  notes?: readonly (string | null | false)[];
  className?: string;
}) {
  const projects = useProjectsGate();
  const { rows, lines } = scorePartsOf(components, {
    projects: projects.enabled,
    ...(notes ? { notes } : {}),
  });
  if (rows.length === 0) return null;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <ul className="flex min-w-0 flex-1 flex-col gap-4">
        {rows.map((row) => (
          <li key={row.component}>
            <ProgressMeter
              size="sm"
              label={row.label}
              /* The bar is the score's place on the 1.0 to 5.0 scale: 0 basis
                 points is 1.0 and 10000 is 5.0, which is this fraction. */
              value={row.scoreBp}
              max={10000}
              valueLabel={
                <>
                  <span className="text-ink">
                    {partScoreWords(row.scoreBp)}
                  </span>
                  <span className="ml-2 text-meta text-faint">
                    {weightLabel(row.effectiveWeightBp)} weight
                  </span>
                </>
              }
            />
          </li>
        ))}
      </ul>
      <AttentionMark tone="info" text={lines} label="About this score" />
    </div>
  );
}
