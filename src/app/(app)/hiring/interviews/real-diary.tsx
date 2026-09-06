"use client";

import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";
import { INTERVIEW_KIND_LABEL } from "@/lib/api/recruitment";
import { useInterviews } from "@/lib/store/recruitment";

/**
 * The real diary: scheduled interviews across every requisition, and
 * completed ones with no scorecard in yet — the closest honest analogue to
 * the seeded "scorecards owed" panel.
 *
 * There is no real equivalent of "owed" the seeded panel showed: a
 * `Scorecard` row only exists once somebody submits one, so nobody is
 * ever "invited" in a way the API can name before that happens. A completed
 * interview with zero scorecards is the nearest true signal.
 */
export function RealDiary() {
  const upcoming = useInterviews({ status: "SCHEDULED", pageSize: 50 });
  const completed = useInterviews({ status: "COMPLETED", pageSize: 50 });

  const needsScorecard = completed.interviews.filter((iv) => iv.scorecardsSubmitted === 0);

  return (
    <>
      {needsScorecard.length > 0 && (
        <Card>
          <CardHeader
            title="Completed, no scorecard yet"
            description="Nobody has submitted one since this interview finished."
          />
          <CardBody className="flex flex-col gap-2.5">
            {needsScorecard.map((iv) => (
              <Row key={iv.id} interview={iv} tone="warning" />
            ))}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Upcoming" />
        <CardBody className="flex flex-col gap-2.5">
          {upcoming.loading && upcoming.interviews.length === 0 && (
            <p className="text-body-sm text-muted">Loading…</p>
          )}
          {!upcoming.loading && upcoming.interviews.length === 0 && (
            <EmptyState
              compact
              icon={<CalendarClock aria-hidden="true" />}
              title="Nothing scheduled"
              description="Interviews you book will appear here."
            />
          )}
          {upcoming.interviews.map((iv) => (
            <Row key={iv.id} interview={iv} tone="info" />
          ))}
        </CardBody>
      </Card>
    </>
  );
}

function Row({
  interview,
  tone,
}: {
  interview: {
    id: string;
    applicationId: string;
    requisitionReference: string;
    candidateName: string;
    kind: keyof typeof INTERVIEW_KIND_LABEL;
    scheduledFor: string;
    durationMins: number;
    location: string | null;
    status: string;
  };
  tone: "info" | "warning";
}) {
  const when = new Date(interview.scheduledFor);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3 transition-colors hover:bg-canvas">
      <div className="flex w-16 shrink-0 flex-col items-center rounded-md bg-sunken px-2 py-1.5">
        <span className="text-meta text-muted">
          {when.toLocaleDateString("en-NG", { month: "short" })}
        </span>
        <span className="tabular text-h4 leading-none text-ink">{when.getDate()}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-medium text-ink">
          <Link
            href={`/hiring/candidates/${interview.applicationId}`}
            className="hover:text-accent-text hover:underline underline-offset-4"
          >
            {interview.candidateName}
          </Link>
        </p>
        <p className="text-meta text-muted">
          {INTERVIEW_KIND_LABEL[interview.kind] ?? interview.kind} · {interview.requisitionReference}
        </p>
        <p className="tabular mt-0.5 text-meta text-muted">
          {when.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })} ·{" "}
          {interview.durationMins} mins
          {interview.location ? ` · ${interview.location}` : ""}
        </p>
      </div>
      <Badge tone={tone} size="sm" dot>
        {interview.status.replace("_", " ").toLowerCase()}
      </Badge>
      <ButtonLink href={`/hiring/candidates/${interview.applicationId}`} size="sm" variant="secondary">
        Open record
      </ButtonLink>
    </div>
  );
}
