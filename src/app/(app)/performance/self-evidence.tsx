"use client";

import { ProgressMeter } from "@/components/ui";
import { useKpis } from "@/lib/store/performance";
import { readCount } from "@/lib/api/performance";

/**
 * What this person set out to do, shown while they rate themselves: their objectives as bars.
 *
 * ## Why it is here at all
 *
 * The self-review asked somebody to put a number on their own period with nothing on screen about that
 * period. `useKpis` already has the objectives and their progress, and the form read none of it, so the
 * answer came out of memory. A mark argued over months later is only defensible if the person giving it
 * could see what they were marking.
 *
 * It sits above the finished work in the same drawer, with no heading of its own: the drawer says what
 * it is. The log of logged tasks that used to sit beside it, with its grades and its rate, is gone.
 *
 * ## Only ever the caller's own
 *
 * `useKpis("mine")` is scoped to the signed-in person. Rendering it on a review **about somebody else**
 * would put the manager's own objectives under the subject's name: a wrong claim, in the one place a wrong
 * claim is least recoverable. The caller gates on `kind === "SELF" && mine`; this component takes no
 * employee id precisely so it cannot be pointed elsewhere.
 *
 * ## Absent is not zero
 *
 * An objective none of whose measures has been read has the 0 it was made with, and "0% done" beside
 * somebody's name for their own period is a claim they are about to rate themselves against. It says
 * "Not recorded" and draws no bar. Nothing at all is drawn for nobody with objectives.
 */
export function SelfEvidence() {
  const { goals } = useKpis("mine");

  /* Company-wide goals are not this person's objectives. They arrive in the
     same list because the KPI screen shows both; counting them here would
     credit somebody with a target nobody set them. */
  const mine = goals.filter((goal) => !goal.companyWide);
  if (mine.length === 0) return null;

  return (
    <ul className="flex flex-col gap-4">
      {mine.map((goal) =>
        readCount(goal.keyResults)?.read === 0 ? (
          <li
            key={goal.id}
            className="flex items-baseline justify-between gap-3"
          >
            <span className="text-body-sm font-medium text-body">
              {goal.title}
            </span>
            <span className="text-body-sm text-muted">Not recorded</span>
          </li>
        ) : (
          <li key={goal.id}>
            <ProgressMeter
              value={goal.progress}
              label={goal.title}
              tone="accent"
              size="sm"
            />
          </li>
        ),
      )}
    </ul>
  );
}
