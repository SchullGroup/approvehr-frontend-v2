import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, Video } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SourceBadge } from "@/components/hiring/source-badge";
import { INTERVIEWS, cardById } from "@/lib/mock/hiring";
import { employeeById } from "@/lib/mock/people";
import { fullName } from "@/lib/types";

export const metadata: Metadata = {
  title: "Interviews",
  description: "Everything scheduled, and every scorecard still owed.",
};

/**
 * `/hiring/interviews`
 *
 * Seeded in both modes, and the badge says so.
 *
 * `Interview` and `Scorecard` are real Prisma models and neither has a route in
 * `approvehr-api` — `/api/v1/careers` covers adverts and the applications they
 * bring in, and stops there. So this screen has no live source to switch to, and
 * the honest thing on a connected laptop is to keep saying it is demo data
 * rather than inherit the page-level "connected" badge from its neighbours.
 */

const KIND_LABEL: Record<string, string> = {
  recruiter_screen: "Recruiter screen",
  technical: "Technical",
  panel: "Panel",
  final: "Final",
};

export default function InterviewsPage() {
  const scheduled = INTERVIEWS.filter((i) => i.status === "scheduled").sort(
    (a, b) => a.scheduledFor.localeCompare(b.scheduledFor),
  );
  const completed = INTERVIEWS.filter((i) => i.status === "completed");

  /* Scorecards owed — the thing that actually blocks a pipeline. */
  const owed = completed.flatMap((iv) => {
    const card = cardById(iv.applicationId);
    if (!card) return [];
    return card.scorecards
      .filter((s) => !s.submittedAt)
      .map((s) => ({ interview: iv, card, scorecard: s }));
  });

  return (
    <>
      <PageHeader
        title="Interviews"
        description="Everything scheduled, and every scorecard still owed."
        meta={<SourceBadge live={false} />}
      />

      <PageBody className="flex flex-col gap-5">
        {owed.length > 0 && (
          <Card>
            <CardHeader
              title="Scorecards owed"
              description="A candidate cannot leave the interview stage until these are in."
            />
            <CardBody className="flex flex-col gap-2.5">
              {owed.map(({ interview, card, scorecard }) => {
                const who = employeeById(scorecard.interviewerId);
                return (
                  <div
                    key={scorecard.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-warning-line bg-warning-soft p-3"
                  >
                    <Avatar name={who ? fullName(who) : "?"} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.875rem] font-medium text-ink">
                        {who ? fullName(who) : "Unknown"} owes a scorecard
                      </p>
                      <p className="text-[0.75rem] text-body">
                        {KIND_LABEL[interview.kind]} with{" "}
                        {fullName(card.candidate)} ·{" "}
                        {card.requisition.title}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary">
                      Send reminder
                    </Button>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Upcoming" />
          <CardBody className="flex flex-col gap-2.5">
            {scheduled.length === 0 && (
              <EmptyState
                compact
                icon={<CalendarClock aria-hidden="true" />}
                title="Nothing scheduled"
                description="Interviews you book will appear here."
              />
            )}

            {scheduled.map((iv) => {
              const card = cardById(iv.applicationId);
              if (!card) return null;
              const when = new Date(iv.scheduledFor);
              return (
                <div
                  key={iv.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3 transition-colors hover:bg-canvas"
                >
                  <div className="flex w-16 shrink-0 flex-col items-center rounded-md bg-sunken px-2 py-1.5">
                    <span className="text-[0.75rem] uppercase tracking-wide text-muted">
                      {when.toLocaleDateString("en-NG", { month: "short" })}
                    </span>
                    <span className="tabular text-h4 leading-none text-ink">
                      {when.getDate()}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[0.875rem] font-medium text-ink">
                      <Link
                        href={`/hiring/requisitions/${card.requisitionId}`}
                        className="hover:text-accent-text hover:underline underline-offset-4"
                      >
                        {fullName(card.candidate)}
                      </Link>
                    </p>
                    <p className="text-[0.75rem] text-muted">
                      {KIND_LABEL[iv.kind]} · {card.requisition.title}
                    </p>
                    <p className="tabular mt-0.5 text-[0.75rem] text-muted">
                      {when.toLocaleTimeString("en-NG", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {iv.durationMins} mins ·{" "}
                      {iv.interviewerIds
                        .map((id) => {
                          const e = employeeById(id);
                          return e ? fullName(e) : "Unknown";
                        })
                        .join(", ")}
                    </p>
                  </div>

                  <Badge tone="info" size="sm" dot>
                    Scheduled
                  </Badge>

                  <Button size="sm" variant="secondary">
                    <Video aria-hidden="true" className="size-3.5" />
                    Join
                  </Button>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
