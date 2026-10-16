"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  SegmentedControl,
  Skeleton,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { useMyAccess } from "@/lib/hiring/pipeline/use-comms";
import { usePipelineGateway } from "@/lib/hiring/pipeline/use-pipeline";
import { useOrgTimezone } from "@/lib/store/session";
import { formatWeekdayTime } from "@/lib/time";
import { useLoaded } from "@/lib/use-loaded";

/**
 * The interviews an employee was invited to score, and the candidates behind them.
 *
 * ## The narrow door
 *
 * This is the whole of hiring that a panelist, or a hiring manager who holds no hiring
 * permission, can reach. They see a candidate's name, the role, the stage, their own
 * interviews and a CV. They do not see contact details, salary figures, answers,
 * history or offers, and they cannot move, reject or email anybody. The page says so,
 * once, because "why can I not see more" is the second question after "why can I see
 * this".
 *
 * Which interviews are theirs is the API's answer, never this screen's.
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

export function MyInterviewsScreen() {
  const gateway = usePipelineGateway();
  const access = useMyAccess();
  const timeZone = useOrgTimezone();
  const [which, setWhich] = useState<"waiting" | "all">("waiting");

  const interviews = useLoaded(
    `my-interviews:${gateway.mode}:${which}`,
    true,
    (signal) =>
      gateway.mine.interviews(
        { awaitingMyScorecard: which === "waiting", page: 1, pageSize: 100 },
        signal,
      ),
  );
  const applications = useLoaded(
    `my-applications:${gateway.mode}`,
    true,
    (signal) =>
      gateway.mine.applications(
        { includeClosed: false, page: 1, pageSize: 100 },
        signal,
      ),
  );

  const nothing = access.data !== null && !access.data.hasAnyAccess;

  return (
    <>
      <PageHeader
        title="My interviews"
        description="The interviews you were invited to score. You see each candidate's name, the role and their CV, and nothing else about hiring."
      />
      <PageBody className="flex flex-col gap-5">
        {nothing ? (
          <Card>
            <EmptyState
              icon={<CalendarCheck aria-hidden="true" />}
              title="No interviews are yours yet"
              description="When somebody invites you to score an interview, or makes you the hiring manager for a role, it appears here."
            />
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader
                title="Interviews"
                action={
                  <SegmentedControl
                    label="Show"
                    value={which}
                    onChange={setWhich}
                    options={[
                      { value: "waiting", label: "Waiting for my scorecard" },
                      { value: "all", label: "All of mine" },
                    ]}
                  />
                }
              />
              <CardBody>
                {interviews.loading ? (
                  <>
                    <Skeleton className="h-24 w-full" />
                    <span className="sr-only-focusable">
                      Loading your interviews
                    </span>
                  </>
                ) : interviews.error || !interviews.data ? (
                  <LoadFailure
                    subject="my interviews"
                    error={interviews.error}
                    onRetry={interviews.reload}
                    missingMeans="module"
                  />
                ) : interviews.data.rows.length === 0 ? (
                  <p className="text-body-sm text-muted">
                    {which === "waiting"
                      ? "Nothing is waiting for your scorecard."
                      : "You have not been invited to any interviews."}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {interviews.data.rows.map((row) => (
                      <li
                        key={row.interviewId}
                        className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line p-3"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/hiring/my-interviews/${row.applicationId}`}
                            className="text-body-sm font-medium text-ink underline-offset-2 hover:underline"
                          >
                            {row.candidateName}
                          </Link>
                          <p className="mt-0.5 text-meta text-muted">
                            {row.role}
                            {row.reference ? ` (${row.reference})` : ""}
                          </p>
                          <p className="tabular mt-0.5 text-meta text-muted">
                            {row.kind} ·{" "}
                            {formatWeekdayTime(row.scheduledFor, timeZone)} ·{" "}
                            {row.durationMins} mins
                            {row.location ? ` · ${row.location}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={STATUS_TONE[row.status]} size="sm">
                            {STATUS_LABEL[row.status]}
                          </Badge>
                          {row.scorecardIn ? (
                            <Badge tone="success" size="sm">
                              Your scorecard is in
                            </Badge>
                          ) : (
                            <Badge tone="warning" size="sm">
                              Your scorecard is owed
                            </Badge>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            {applications.data && applications.data.rows.length > 0 && (
              <Card>
                <CardHeader
                  title="Candidates you can see"
                  description="People currently in a stage you sit on, or in a role you hire for."
                />
                <CardBody>
                  <ul className="flex flex-col gap-2.5">
                    {applications.data.rows.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line p-3"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/hiring/my-interviews/${row.id}`}
                            className="text-body-sm font-medium text-ink underline-offset-2 hover:underline"
                          >
                            {row.candidateName}
                          </Link>
                          <p className="mt-0.5 text-meta text-muted">
                            {row.role}
                            {row.reference ? ` (${row.reference})` : ""}
                            {row.stageName ? ` · ${row.stageName}` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {row.roles.map((role) => (
                            <Badge key={role} tone="neutral" size="sm">
                              {role}
                            </Badge>
                          ))}
                          {row.scorecardsOwed > 0 && (
                            <Badge tone="warning" size="sm">
                              {row.scorecardsOwed === 1
                                ? "1 scorecard owed"
                                : `${String(row.scorecardsOwed)} scorecards owed`}
                            </Badge>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
