"use client";

import { useRouter } from "next/navigation";
import { NextStep } from "@/components/performance/next-step";
import {
  TeamAppraisals,
  personOf,
} from "@/components/performance/team-appraisals";
import {
  performanceApi,
  type ApiAppraisalProgress,
} from "@/lib/api/performance";
import {
  hasStarted,
  stepLine as stepsLine,
} from "@/lib/performance/progress-words";
import { useAppraisalProgress, useAppraisals } from "@/lib/store/performance";

/**
 * "Your appraisal" at the top of the Overview for everybody who is appraised, HR
 * and administrators included (an administrator with a form of their own had no
 * way to it): the one next step ("Step 2 of 4: Core competencies" and a
 * Continue), and for a manager their team's list below it (`TeamAppraisals`).
 * Reads the period's appraisal progress; where the API does not have it, or
 * nothing is running, it draws nothing.
 *
 * This is the only place this is drawn. There used to be a page of its own at
 * `/performance/appraisals`, an older copy of the same two things; it is gone and
 * its address sends people to Performance, where this is.
 */

type Mine = NonNullable<ApiAppraisalProgress["mine"]>;

/**
 * "Step 2 of 4: Core competencies", and how much of it is answered once
 * something is. Null when there are no steps or every one is done. The words
 * are `progress-words`', shared with the team list.
 */
export function stepLine(mine: Mine): string | null {
  return stepsLine(mine.steps);
}

export function YourAppraisalCard({ mine }: { mine: Mine }) {
  const line = stepLine(mine);
  if (mine.submitted) {
    return (
      <NextStep title="Your appraisal is sent" detail="Your manager has it." />
    );
  }
  return (
    <NextStep
      title="Your appraisal"
      {...(line ? { detail: line } : {})}
      {...(mine.reviewId
        ? {
            action: {
              /* Continue once anything is answered, not only once a whole step
                 is done: somebody part-way through the first step has begun. */
              label: hasStarted(mine.steps) ? "Continue" : "Start",
              href: `/performance/reviews/${mine.reviewId}/answer`,
            },
          }
        : {})}
    />
  );
}

export function YourAppraisal() {
  const router = useRouter();
  const appraisals = useAppraisals();
  const running = appraisals.cycles.find(
    (one) => one.stage === "SELF" || one.stage === "MANAGER",
  );
  const { progress, unavailable } = useAppraisalProgress(running?.id ?? null);
  if (!running || unavailable || !progress) return null;
  const mine = progress.mine;
  const team = progress.team;

  const formFor = (employeeId: string) =>
    appraisals.mine.toComplete.find(
      (review) =>
        review.kind === "MANAGER" &&
        review.subjectId === employeeId &&
        review.cycleId === running.id,
    )?.id ?? null;

  return (
    <div className="flex flex-col gap-4">
      {mine && <YourAppraisalCard mine={mine} />}
      {team && team.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-body-md font-semibold text-ink">Your team</h2>
          <TeamAppraisals
            people={team.map(personOf)}
            onOpen={(person) => {
              const id = formFor(person.id);
              router.push(
                id
                  ? `/performance/reviews/${id}/answer`
                  : `/performance/history/${person.id}`,
              );
            }}
            onNudge={async (person) => {
              await performanceApi.nudgePerson(running.id, person.id);
            }}
          />
        </div>
      )}
    </div>
  );
}
