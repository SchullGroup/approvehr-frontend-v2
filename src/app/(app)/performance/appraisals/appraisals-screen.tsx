"use client";

import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { ButtonLink, Card, EmptyState, LoadState } from "@/components/ui";
import { ProgressMeter } from "@/components/ui/progress";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  TeamAppraisals,
  personOf,
} from "@/components/performance/team-appraisals";
import { performanceApi } from "@/lib/api/performance";
import { useAppraisalProgress, useAppraisals } from "@/lib/store/performance";

/**
 * Appraisals: where your own appraisal stands, step by step, and where your
 * team's do (owner, 24 Nov 2026). Read from the period's appraisal progress.
 *
 * An API that does not have that route yet answers nothing here, and the screen
 * says so calmly and points at the Overview, where the forms still are. It never
 * shows an error for a route that is not there.
 */
export function AppraisalsScreen() {
  const router = useRouter();
  const appraisals = useAppraisals();
  /* The period that is running now: the form to fill in is in one of these. */
  const running = appraisals.cycles.find(
    (one) => one.stage === "SELF" || one.stage === "MANAGER",
  );
  const detail = useAppraisalProgress(running?.id ?? null);
  const progress = detail.progress;
  const mine = progress?.mine ?? null;
  const team = progress?.team ?? null;

  /* A team member's manager form, found among the forms this person owes. */
  const formFor = (employeeId: string) =>
    appraisals.mine.toComplete.find(
      (review) =>
        review.kind === "MANAGER" &&
        review.subjectId === employeeId &&
        review.cycleId === running?.id,
    )?.id ?? null;

  const none = !running || detail.unavailable || (!mine && !team);

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
        title="Appraisals"
        {...(running ? { meta: <span>{running.name}</span> } : {})}
      />
      <PageBody className="flex flex-col gap-6">
        <LoadState
          loading={appraisals.loading || detail.loading}
          error={appraisals.error ?? detail.error}
          subject="the appraisals"
          onRetry={detail.reload}
          skeleton="list"
        >
          {none ? (
            <Card>
              <EmptyState
                compact
                icon={<ClipboardList aria-hidden="true" />}
                title="Nothing to fill in right now"
                description="When an appraisal period is running, your steps and your team's show here."
                action={
                  <ButtonLink href="/performance" variant="accent" size="sm">
                    Go to Performance
                  </ButtonLink>
                }
              />
            </Card>
          ) : (
            <>
              {mine && (
                <Card className="flex flex-col gap-3 p-5">
                  <h2 className="text-body-md font-semibold text-ink">
                    Your appraisal
                  </h2>
                  <ProgressMeter
                    value={mine.steps.filter((step) => step.done).length}
                    max={Math.max(mine.steps.length, 1)}
                    showValue={false}
                    label={
                      mine.submitted
                        ? "Sent"
                        : `${String(mine.steps.filter((s) => s.done).length)} of ${String(mine.steps.length)} steps`
                    }
                  />
                  {!mine.submitted && mine.reviewId && (
                    <ButtonLink
                      href={`/performance/reviews/${mine.reviewId}/answer`}
                      variant="accent"
                      size="sm"
                      className="self-start"
                    >
                      {mine.currentStep ? "Continue" : "Start"}
                    </ButtonLink>
                  )}
                </Card>
              )}
              {team && team.length > 0 && running && (
                <div className="flex flex-col gap-3">
                  <h2 className="text-body-md font-semibold text-ink">
                    Your team
                  </h2>
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
            </>
          )}
        </LoadState>
      </PageBody>
    </>
  );
}
