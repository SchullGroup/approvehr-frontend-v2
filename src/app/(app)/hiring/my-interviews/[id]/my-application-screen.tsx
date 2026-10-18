"use client";

import { useState } from "react";
import { CalendarClock, UserRoundX } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Skeleton,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { CalendarMenu } from "@/components/hiring/interviews/calendar-menu";
import { JoinLink } from "@/components/hiring/interviews/join-link";
import { OpenCv } from "@/components/hiring/open-cv";
import { InterviewScoreCard } from "@/components/hiring/record-comms";
import { FitScoreCard } from "@/components/hiring/screening/fit-score-card";
import { ScorecardDialog } from "@/components/hiring/scorecard-dialog";
import { ApiError } from "@/lib/api/client";
import {
  RECOMMENDATION_LABEL,
  type ScorecardRecommendation,
} from "@/lib/api/recruitment";
import type { MyApplication, MyScorecard } from "@/lib/hiring/comms/model";
import { nudgeSentence } from "@/lib/hiring/interviews/reminders";
import { useInterviewsGateway } from "@/lib/hiring/interviews/use-interviews";
import { viewFromMyInterview } from "@/lib/hiring/interviews/wire";
import { usePipelineGateway } from "@/lib/hiring/pipeline/use-pipeline";
import { useOrgTimezone } from "@/lib/store/session";
import { formatWeekdayTime, zoneLabel } from "@/lib/time";
import { useLoaded } from "@/lib/use-loaded";

/**
 * One candidate, as somebody who is not in hiring may see them.
 *
 * ## What is here, and what is not
 *
 * A name, the role, the stage, their CV, the interviews this person was invited to
 * and their own scorecard for each. No email address, no phone number, no salary
 * figures, no screening answers, no history, no offer. A person outside the
 * candidate's reach is not told whether they exist: it reads as "not one you can
 * see", the same sentence for both.
 *
 * ## Scoring is blind
 *
 * A panelist sees their own scorecard and nobody else's. What a colleague wrote is
 * for the hiring manager, who sees every submitted scorecard and the score, because
 * deciding between candidates is what they are there for.
 */

const STATUS_TONE = {
  SCHEDULED: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
  NO_SHOW: "danger",
} as const;

const STATUS_LABEL = {
  SCHEDULED: "Coming up",
  COMPLETED: "Took place",
  CANCELLED: "Cancelled",
  NO_SHOW: "No show",
} as const;

const recommendation = (code: string | null): string | null =>
  code ? (RECOMMENDATION_LABEL[code as ScorecardRecommendation] ?? code) : null;

export function MyApplicationScreen({ id }: { id: string }) {
  const gateway = usePipelineGateway();
  const interviewsGateway = useInterviewsGateway();
  const timeZone = useOrgTimezone();
  const toast = useToast();
  const [scoring, setScoring] = useState<string | null>(null);

  const loaded = useLoaded<MyApplication>(
    `my-application:${gateway.mode}:${id}`,
    true,
    (signal) => gateway.mine.application(id, signal),
  );

  const application = loaded.data;
  const notFound =
    loaded.error instanceof ApiError && loaded.error.status === 404;

  if (loaded.loading) {
    return (
      <>
        <PageHeader
          title="Candidate"
          breadcrumb={[
            { href: "/hiring/my-interviews", label: "My interviews" },
          ]}
        />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading this candidate</span>
        </PageBody>
      </>
    );
  }

  if (notFound || (!application && !loaded.error)) {
    return (
      <>
        <PageHeader
          title="Candidate"
          breadcrumb={[
            { href: "/hiring/my-interviews", label: "My interviews" },
          ]}
        />
        <PageBody>
          <Card>
            <EmptyState
              icon={<UserRoundX aria-hidden="true" />}
              title="That is not a candidate you can see"
              description="You can see the candidates in a stage you sit on, or in a role you hire for."
              action={
                <ButtonLink
                  href="/hiring/my-interviews"
                  variant="secondary"
                  size="sm"
                >
                  Back to my interviews
                </ButtonLink>
              }
            />
          </Card>
        </PageBody>
      </>
    );
  }

  if (!application) {
    return (
      <>
        <PageHeader
          title="Candidate"
          breadcrumb={[
            { href: "/hiring/my-interviews", label: "My interviews" },
          ]}
        />
        <PageBody>
          <LoadFailure
            subject="this candidate"
            error={loaded.error}
            onRetry={loaded.reload}
          />
        </PageBody>
      </>
    );
  }

  const owed = application.interviews.filter(
    (interview) =>
      interview.iAmPanelist &&
      interview.mine === null &&
      (interview.status === "SCHEDULED" || interview.status === "COMPLETED"),
  );

  return (
    <>
      <PageHeader
        title={application.candidateName}
        breadcrumb={[{ href: "/hiring/my-interviews", label: "My interviews" }]}
        meta={
          <>
            {application.stageName && (
              <Badge tone="neutral" size="sm">
                {application.stageName}
              </Badge>
            )}
            {application.roles.map((role) => (
              <Badge key={role} tone="neutral" size="sm">
                {role}
              </Badge>
            ))}
          </>
        }
      />
      <PageBody className="flex flex-col gap-5">
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm text-body">
              {application.role}
              {application.reference ? ` (${application.reference})` : ""}
            </p>
            {application.hasCv && gateway.mine.openCv ? (
              <OpenCv open={() => gateway.mine.openCv!(application.id)} />
            ) : application.hasCv ? null : (
              <p className="text-meta text-muted">There is no CV on file.</p>
            )}
          </CardBody>
        </Card>

        {owed.length > 0 && (
          <Callout
            tone="warning"
            title={
              owed.length === 1
                ? "One scorecard is waiting for you"
                : `${String(owed.length)} scorecards are waiting for you`
            }
          >
            Hand them in from the interview below. They are blind: you see only
            your own, and what everybody wrote is for the hiring manager.
          </Callout>
        )}

        {application.screening && (
          <FitScoreCard screening={application.screening} />
        )}

        {application.score && <InterviewScoreCard score={application.score} />}

        {application.interviews.length === 0 ? (
          <Card>
            <EmptyState
              icon={<CalendarClock aria-hidden="true" />}
              title="No interviews yet"
              description="There is nothing for you to score on this candidate until one is booked."
            />
          </Card>
        ) : (
          application.interviews.map((interview) => (
            <Card key={interview.id}>
              <CardHeader
                title={interview.kind}
                description={`${formatWeekdayTime(interview.scheduledFor, interview.timeZone ?? timeZone)} · ${zoneLabel(interview.timeZone ?? timeZone)} · ${String(interview.durationMins)} mins${interview.location ? ` · ${interview.location}` : ""}${interview.stageName ? ` · ${interview.stageName}` : ""}`}
                action={
                  <Badge tone={STATUS_TONE[interview.status]} size="sm">
                    {STATUS_LABEL[interview.status]}
                  </Badge>
                }
              />
              <CardBody className="flex flex-col gap-4">
                {interview.status === "SCHEDULED" && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <JoinLink url={interview.joinUrl ?? null} />
                    <CalendarMenu
                      interview={viewFromMyInterview(application, interview)}
                      who="panelist"
                      getFile={() =>
                        interviewsGateway.calendarFile(
                          viewFromMyInterview(application, interview),
                          "panelist",
                        )
                      }
                    />
                  </div>
                )}
                {interview.panel.length > 0 && (
                  <p className="text-body-sm text-body">
                    Invited to score it:{" "}
                    {interview.panel.map((person, index) => (
                      <span key={person.employeeId}>
                        {index > 0 ? ", " : ""}
                        <span className="text-ink">{person.name}</span>
                        {person.submitted ? " (scorecard in)" : " (waiting)"}
                      </span>
                    ))}
                  </p>
                )}

                {interview.mine ? (
                  <ScorecardView title="Your scorecard" card={interview.mine} />
                ) : interview.iAmPanelist &&
                  (interview.status === "SCHEDULED" ||
                    interview.status === "COMPLETED") ? (
                  <div className="flex flex-col gap-2">
                    {interview.status === "COMPLETED" && interview.nudges && (
                      <p className="text-meta text-muted">
                        <span className="font-medium text-ink">
                          Scorecard due.{" "}
                        </span>
                        {nudgeSentence(interview.nudges, (iso) =>
                          formatWeekdayTime(iso, timeZone),
                        )}
                      </p>
                    )}
                    <Button
                      variant="accent"
                      size="sm"
                      onClick={() => setScoring(interview.id)}
                    >
                      Hand in my scorecard
                    </Button>
                  </div>
                ) : null}

                {interview.everyones && interview.everyones.length > 0 && (
                  <div className="flex flex-col gap-3 border-t border-line pt-3">
                    <p className="text-body-sm font-medium text-ink">
                      Everyone&apos;s scorecards
                    </p>
                    {interview.everyones.map((card) => (
                      <ScorecardView
                        key={card.id}
                        title={card.by ?? "A panelist"}
                        card={card}
                      />
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          ))
        )}
      </PageBody>

      <ScorecardDialog
        open={scoring !== null}
        onClose={() => setScoring(null)}
        description="Rate what you saw. A panelist sees only their own scorecard: what everybody wrote is for the hiring manager."
        onConfirm={async (input) => {
          if (!scoring) return;
          /* A refusal is thrown to the dialog, which shows it and keeps what was
             written. */
          await gateway.mine.submitScorecard(scoring, input);
          setScoring(null);
          loaded.reload();
          toast.push({
            title: "Your scorecard is in",
            tone: "success",
            detail: `For ${application.candidateName}.`,
          });
        }}
      />
    </>
  );
}

function ScorecardView({ title, card }: { title: string; card: MyScorecard }) {
  const verdict = recommendation(card.recommendation);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-sm font-medium text-ink">{title}</p>
        <span className="flex flex-wrap items-center gap-1.5">
          {card.composite !== null && (
            <Badge tone="accent" size="sm">
              Score {card.composite.toFixed(2)}
            </Badge>
          )}
          {verdict && (
            <Badge tone="neutral" size="sm">
              {verdict}
            </Badge>
          )}
        </span>
      </div>
      {card.ratings.length > 0 && (
        <ul className="flex flex-col gap-1 text-body-sm text-body">
          {card.ratings.map((rating) => (
            <li key={rating.competency}>
              {rating.competency}:{" "}
              <span className="tabular font-medium text-ink">
                {rating.score} / 5
              </span>
              {rating.weight !== 1 && (
                <span className="text-muted">
                  {" "}
                  (counts {rating.weight} times)
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {card.notes && <p className="text-body-sm text-body">{card.notes}</p>}
    </div>
  );
}
