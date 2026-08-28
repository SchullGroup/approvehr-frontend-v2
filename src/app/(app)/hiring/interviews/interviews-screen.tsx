"use client";

import Link from "next/link";
import { CalendarClock, Inbox, Lock, TriangleAlert } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Skeleton,
  Stat,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SourceBadge } from "@/components/hiring/source-badge";
import { usePermissions } from "@/lib/permissions";
import { pipelineSnapshot, useScreeningBacklog } from "@/lib/store/hiring";
import { cardById } from "@/lib/mock/hiring";
import { employeeById } from "@/lib/mock/people";
import { fullName } from "@/lib/types";

/**
 * Interviews.
 *
 * ## What is live here, and why it is a backlog rather than a diary
 *
 * `Interview` and `Scorecard` are real Prisma models and neither has a route —
 * `/api/v1/careers` covers adverts and the applications they bring in, and stops
 * there. So the diary and the scorecards below are seeded in both modes, and
 * each panel says so.
 *
 * What *is* live is the thing that decides whether there will be interviews next
 * week: how many people are sitting unscreened. Nobody gets interviewed before
 * somebody has read their application, so a full queue at the top of this page is
 * the most useful true statement it can make — and it comes from
 * `/careers/analytics`, one request, no list.
 *
 * ## Nothing on this page pretends to send anything
 *
 * "Send reminder" used to be a button with no handler, which is the quiet
 * version of the failure the badges exist to prevent: it looked like it worked.
 * It now answers, and what it says is that nothing was sent. The seeded diary
 * links to records that do exist rather than offering a "Join" that joins
 * nothing.
 */
export function InterviewsScreen() {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader title="Interviews" />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading interviews</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_HIRING")) {
    return (
      <>
        <PageHeader title="Interviews" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot see interviews"
              description="An interview record names a candidate and what was said about them, so it is kept to whoever hires. Ask whoever manages access to add hiring to your role."
              action={
                <ButtonLink href="/dashboard" variant="secondary" size="sm">
                  Back to your dashboard
                </ButtonLink>
              }
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Diary />;
}

/* -------------------------------------------------------------------------- */

const KIND_LABEL: Record<string, string> = {
  recruiter_screen: "Recruiter screen",
  technical: "Technical",
  panel: "Panel",
  final: "Final",
};

function Diary() {
  const backlog = useScreeningBacklog();
  const pipeline = pipelineSnapshot();
  const toast = useToast();

  const scheduled = [...pipeline.scheduledInterviews].sort((a, b) =>
    a.scheduledFor.localeCompare(b.scheduledFor),
  );

  /* Scorecards owed — the thing that actually blocks a pipeline. */
  const owed = pipeline.cards.flatMap((card) =>
    card.scorecards
      .filter((scorecard) => !scorecard.submittedAt)
      .flatMap((scorecard) => {
        /* `card.interviews` is already this application's, so the completed
           one is the interview the scorecard is owed for. */
        const interview = card.interviews.find(
          (iv) => iv.status === "completed",
        );
        return interview ? [{ interview, card, scorecard }] : [];
      }),
  );

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/hiring", label: "Pipeline" },
          { href: "/hiring/interviews", label: "Interviews" },
        ]}
        title="Interviews"
      />

      <PageBody className="flex flex-col gap-5">
        {/* The live half. One endpoint, and the only figures on this page that
            came from a database. */}
        <Card>
          <CardHeader
            title="Before anybody gets interviewed"
            action={<SourceBadge live={backlog.live} />}
          />
          <CardBody className="flex flex-col gap-4">
            {backlog.error && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-body-sm text-danger-text">
                  {backlog.error.message}
                </p>
                <Button variant="secondary" size="sm" onClick={backlog.reload}>
                  Try again
                </Button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Waiting to be screened"
                value={String(backlog.numbers.waiting)}
                icon={<TriangleAlert aria-hidden="true" />}
                hint={
                  backlog.numbers.waiting > 0
                    ? "nobody has looked yet"
                    : "queue is clear"
                }
              />
              <Stat
                label="Screened in"
                value={String(backlog.numbers.advanced)}
                hint="in a pipeline somewhere"
              />
              <Stat
                label="People who applied"
                value={String(backlog.numbers.applications)}
              />
            </div>
            {backlog.numbers.waiting > 0 && (
              <ButtonLink
                href="/hiring/postings/applications"
                variant="accent"
                size="sm"
                className="self-start"
              >
                <Inbox aria-hidden="true" className="size-3.5" />
                Screen {backlog.numbers.waiting} waiting
              </ButtonLink>
            )}
          </CardBody>
        </Card>

        {owed.length > 0 && (
          <Card>
            <CardHeader
              title="Scorecards owed"
              description="A candidate cannot leave the interview stage until these are in."
              action={<SourceBadge live={false} />}
            />
            <CardBody className="flex flex-col gap-2.5">
              {owed.map(({ interview, card, scorecard }) => {
                const who = employeeById(scorecard.interviewerId);
                const name = who ? fullName(who) : "Unknown";
                return (
                  <div
                    key={scorecard.id}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-warning-line bg-warning-soft p-3"
                  >
                    <Avatar name={name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-medium text-ink">
                        {name} owes a scorecard
                      </p>
                      <p className="text-meta text-body">
                        {KIND_LABEL[interview.kind] ?? interview.kind} with{" "}
                        {fullName(card.candidate)} · {card.requisition.title}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        toast.push({
                          title: "Nothing was sent",
                          tone: "info",
                          detail:
                            "Interviews and scorecards have no endpoint yet, so there is nobody to remind. Ask " +
                            `${name.split(" ")[0]} directly.`,
                        })
                      }
                    >
                      Send reminder
                    </Button>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Upcoming" action={<SourceBadge live={false} />} />
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
                /* A plain wrapper. The two links are siblings, never nested —
                   an outer link wrapping an inner one breaks hydration and
                   renders the page blank with nothing useful in the console. */
                <div
                  key={iv.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line p-3 transition-colors hover:bg-canvas"
                >
                  <div className="flex w-16 shrink-0 flex-col items-center rounded-md bg-sunken px-2 py-1.5">
                    <span className="text-meta uppercase tracking-wide text-muted">
                      {when.toLocaleDateString("en-NG", { month: "short" })}
                    </span>
                    <span className="tabular text-h4 leading-none text-ink">
                      {when.getDate()}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-body-sm font-medium text-ink">
                      <Link
                        href={`/hiring/candidates/${card.id}`}
                        className="hover:text-accent-text hover:underline underline-offset-4"
                      >
                        {fullName(card.candidate)}
                      </Link>
                    </p>
                    <p className="text-meta text-muted">
                      {KIND_LABEL[iv.kind] ?? iv.kind} ·{" "}
                      <Link
                        href={`/hiring/requisitions/${card.requisitionId}`}
                        className="hover:text-accent-text hover:underline underline-offset-4"
                      >
                        {card.requisition.title}
                      </Link>
                    </p>
                    <p className="tabular mt-0.5 text-meta text-muted">
                      {when.toLocaleTimeString("en-NG", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · {iv.durationMins} mins ·{" "}
                      {iv.interviewerIds
                        .map((id) => {
                          const person = employeeById(id);
                          return person ? fullName(person) : "Unknown";
                        })
                        .join(", ")}
                    </p>
                  </div>

                  <Badge tone="info" size="sm" dot>
                    Scheduled
                  </Badge>

                  <ButtonLink
                    href={`/hiring/candidates/${card.id}`}
                    size="sm"
                    variant="secondary"
                  >
                    Open record
                  </ButtonLink>
                </div>
              );
            })}
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}
