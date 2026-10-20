"use client";

import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  ProgressMeter,
  TextLink,
} from "@/components/ui";
import { RECOMMENDATION_LABEL } from "@/lib/api/recruitment";
import type {
  RetentionLine,
  ScoreSummary,
  SentEmail,
} from "@/lib/hiring/comms/model";
import { emailLine } from "@/lib/hiring/comms/status";
import { formatDateShort, formatDateTimeShort } from "@/lib/time";

/**
 * What a candidate's record says about emails, the interview score and when the
 * person is scheduled to go.
 *
 * Each is a plain reading of what the API holds. None invents a figure or a status:
 * an application nobody has scored shows no score (never 0), and an email is called
 * sent only when the API says it was.
 */

/* ---------------------------------------------------------------------- emails */

export function RecordEmails({
  emails,
  timeZone,
}: {
  emails: readonly SentEmail[];
  timeZone: string;
}) {
  return (
    <Card>
      <CardHeader
        title="Emails to them"
        description="Every email somebody asked for on this application, and whether it was sent."
      />
      <CardBody>
        {emails.length === 0 ? (
          <p className="text-body-sm text-muted">
            No email has been asked for. One goes only when somebody on your
            team chooses to send it: when they move somebody into a stage that
            has a message, reject with a decline email, invite them to an
            interview, or send an offer.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {emails.map((email) => {
              const line = emailLine(
                email.status,
                email.note,
                email.sentAt,
                (iso) => formatDateTimeShort(iso, timeZone),
              );
              return (
                <li
                  key={email.id}
                  className="flex flex-col gap-1 rounded-md border border-line p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body-sm font-medium text-ink">
                      {email.kindLabel}
                    </span>
                    <Badge tone={line.tone} size="sm">
                      {line.label}
                    </Badge>
                  </div>
                  <p className="text-meta text-muted">
                    {email.because}
                    {email.templateName ? ` · ${email.templateName}` : ""} ·
                    asked for {formatDateTimeShort(email.createdAt, timeZone)}
                  </p>
                  {email.subject && (
                    <p className="text-meta text-body">
                      Subject: {email.subject}
                    </p>
                  )}
                  {line.detail && (
                    <p className="text-body-sm text-body">{line.detail}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/* ----------------------------------------------------------------------- score */

const TALLY: { key: keyof ScoreSummary["recommendations"]; label: string }[] = [
  { key: "STRONG_YES", label: RECOMMENDATION_LABEL.STRONG_YES },
  { key: "YES", label: RECOMMENDATION_LABEL.YES },
  { key: "NO", label: RECOMMENDATION_LABEL.NO },
  { key: "STRONG_NO", label: RECOMMENDATION_LABEL.STRONG_NO },
];

export function InterviewScoreCard({ score }: { score: ScoreSummary }) {
  const tally = TALLY.filter((entry) => score.recommendations[entry.key] > 0);
  return (
    <Card>
      <CardHeader
        title="Interview score"
        description="The weighted average of every scorecard handed in, out of 5. A rating that carries more weight counts for more."
      />
      <CardBody className="flex flex-col gap-4">
        {score.composite === null ? (
          <p className="text-body-sm text-muted">
            Not scored yet. A score appears once a scorecard with ratings is
            handed in.
          </p>
        ) : (
          <>
            <p className="flex items-baseline gap-2">
              <span className="tabular text-h2 text-ink">
                {score.composite.toFixed(2)}
              </span>
              <span className="text-body-sm text-muted">
                out of {String(score.outOf)}, from {score.scorecardsSubmitted}{" "}
                {score.scorecardsSubmitted === 1 ? "scorecard" : "scorecards"}
              </span>
            </p>

            {score.byCompetency.length > 0 && (
              <div className="flex flex-col gap-2.5">
                <p className="text-body-sm font-medium text-ink">
                  By what was rated
                </p>
                {score.byCompetency.map((entry) => (
                  <ProgressMeter
                    key={entry.competency}
                    label={entry.competency}
                    value={entry.average}
                    max={score.outOf}
                    valueLabel={`${entry.average.toFixed(2)} (${String(entry.ratings)} ${entry.ratings === 1 ? "rating" : "ratings"})`}
                  />
                ))}
              </div>
            )}

            {score.interviews.some((line) => line.composite !== null) && (
              <ul className="flex flex-col gap-1 text-body-sm text-body">
                {score.interviews
                  .filter((line) => line.composite !== null)
                  .map((line) => (
                    <li key={line.interviewId}>
                      {line.kind}:{" "}
                      <span className="tabular font-medium text-ink">
                        {line.composite?.toFixed(2)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}

        {tally.length > 0 && (
          <p className="flex flex-wrap items-center gap-2 text-body-sm text-body">
            Recommendations, counted apart from the score:
            {tally.map((entry) => (
              <Badge key={entry.key} tone="neutral" size="sm">
                {score.recommendations[entry.key]} {entry.label.toLowerCase()}
              </Badge>
            ))}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------- retention */

const REASON: Record<NonNullable<RetentionLine["reason"]>, string | null> = {
  none_set: null,
  hired: null,
  talent_pool:
    "Kept in the talent pool, so this record is not scheduled for deletion.",
  still_active:
    "Still in progress on another role, so this record is not scheduled for deletion.",
};

/** When this person's record is scheduled to be deleted, or why it is not. Quiet when there is nothing to say. */
export function DeletionNotice({ line }: { line: RetentionLine }) {
  if (line.scheduledDeletionOn) {
    return (
      <p className="text-meta text-muted">
        Scheduled for deletion on{" "}
        <span className="font-medium text-ink">
          {formatDateShort(`${line.scheduledDeletionOn}T00:00:00Z`, "UTC")}
        </span>
        , under your{" "}
        <TextLink href="/hiring/settings/retention">retention period</TextLink>.
      </p>
    );
  }
  const reason = line.reason ? REASON[line.reason] : null;
  return reason ? <p className="text-meta text-muted">{reason}</p> : null;
}
