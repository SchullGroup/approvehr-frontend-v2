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
import { useAppraisalProgress, useAppraisals } from "@/lib/store/performance";

/**
 * "Your appraisal" at the top of the Overview for everybody who is not HR (owner,
 * 24 Nov 2026): the one next step ("Step 2 of 4: Core competencies" and a
 * Continue), and for a manager their team's list below it (`TeamAppraisals`).
 * Reads the period's appraisal progress; where the API does not have it, or
 * nothing is running, it draws nothing.
 *
 * This is the only place this is drawn. There used to be a page of its own at
 * `/performance/appraisals`, an older copy of the same two things; it is gone and
 * its address sends people to Performance, where this is.
 */

type Mine = NonNullable<ApiAppraisalProgress["mine"]>;

/** "Step 2 of 4: Core competencies", from the steps. Null when there are none. */
export function stepLine(mine: Mine): string | null {
  if (mine.steps.length === 0) return null;
  const index = mine.steps.findIndex((step) => !step.done);
  if (index === -1) return null;
  const step = mine.steps[index];
  return `Step ${String(index + 1)} of ${String(mine.steps.length)}: ${step?.label ?? ""}`;
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
              label:
                line && mine.steps.some((s) => s.done) ? "Continue" : "Start",
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
