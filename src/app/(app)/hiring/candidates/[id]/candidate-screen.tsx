"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Briefcase,
  CalendarClock,
  Inbox,
  Lock,
  Mail,
  MapPin,
  Paperclip,
  Phone,
  Star,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  Money,
  ProgressMeter,
  Skeleton,
  Timeline,
  useToast,
  type TimelineEntry,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SourceBadge } from "@/components/hiring/source-badge";
import { StagePill, stageLabel } from "@/components/hiring/stage-pill";
import {
  DeclineDialog,
  ScreenInDialog,
} from "@/components/hiring/screening-dialogs";
import { BandPosition } from "@/app/(app)/payroll/pay-setup/band-position";
import { ApiError } from "@/lib/api/client";
import {
  APPLICATION_STATUS_TONE,
  type ApplicantRecord,
} from "@/lib/api/hiring";
import { usePermissions } from "@/lib/permissions";
import { useApplicantRecord, useOfferBands } from "@/lib/store/hiring";
import { STAGES, fullName, type PipelineCard } from "@/lib/types";
import { daysInStage } from "@/lib/mock/hiring";
import { employeeById } from "@/lib/mock/people";

/**
 * One person's file.
 *
 * ## The page has two halves and it never blends them
 *
 * The **application** — who applied, through which advert, what they wrote, what
 * a screener did about it, and everything else that email address has applied
 * for — is live whenever the API is up. `/careers/applications` answers all of
 * it.
 *
 * The **pipeline record** — the stage they are in, their interviews, their
 * scorecards, the offer — is seeded in both modes, because `Candidate`, the
 * pipeline `Application`, `Interview`, `Scorecard` and `Offer` are Prisma models
 * with no route. `POST /applications/:id/advance` writes into them and nothing
 * reads them back.
 *
 * So each panel carries its own badge. A page-level "Live from the API" over a
 * seeded scorecard would be the exact failure the badges exist to prevent, and a
 * page-level "Demo data" over a real person's phone number would be a lie in the
 * other direction.
 *
 * ## Three kinds of id arrive here, and all three work
 *
 * The board links a seeded pipeline application id; the screening queue links
 * the candidate id the API returned from `advance`; the applications list links a
 * job application id. `useApplicantRecord` resolves all three — see its header
 * for how — so nothing upstream has to know which kind it is holding.
 */
export function CandidateScreen({ id }: { id: string }) {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader title="Candidate" />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading this candidate</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_HIRING")) {
    return (
      <>
        <PageHeader title="Candidate" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot see candidates"
              description="This record holds a stranger's phone number and salary expectation, so it is kept to whoever hires. Ask whoever manages access to add hiring to your role."
              action={
                <ButtonLink href="/hiring" variant="secondary" size="sm">
                  Back to hiring
                </ButtonLink>
              }
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Record id={id} />;
}

/* -------------------------------------------------------------------------- */

function Record({ id }: { id: string }) {
  const view = useApplicantRecord(id);
  const [screening, setScreening] = useState(false);
  const [declining, setDeclining] = useState(false);
  const toast = useToast();

  const { record, card } = view;

  if (view.loading && record === null && card === null) {
    return (
      <>
        <PageHeader title="Candidate" />
        <PageBody className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
          <span className="sr-only-focusable">Loading this candidate</span>
        </PageBody>
      </>
    );
  }

  if (record === null && card === null) {
    return <NotFoundHere id={id} error={view.error} onRetry={view.reload} />;
  }

  const name = record?.name ?? (card ? fullName(card.candidate) : "Candidate");
  const fail = (error: unknown) =>
    toast.push({
      title: "That did not work",
      tone: "danger",
      detail:
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
    });

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/hiring", label: "Hiring" },
          ...(card
            ? [
                {
                  href: `/hiring/requisitions/${card.requisitionId}`,
                  label: card.requisition.title,
                },
              ]
            : [{ href: "/hiring/postings/applications", label: "Applications" }]),
          { href: `/hiring/candidates/${id}`, label: name },
        ]}
        title={name}
        meta={
          card ? (
            <StagePill stage={card.stage} outcome={card.outcome} />
          ) : record ? (
            <Badge tone={APPLICATION_STATUS_TONE[record.status]} dot>
              {record.statusLabel}
            </Badge>
          ) : undefined
        }
        description={subtitle(record, card)}
        action={
          card ? (
            <ButtonLink
              href={`/hiring/requisitions/${card.requisitionId}`}
              variant="secondary"
              size="sm"
            >
              Back to pipeline
            </ButtonLink>
          ) : (
            <ButtonLink
              href="/hiring/postings/applications"
              variant="secondary"
              size="sm"
            >
              Back to applications
            </ButtonLink>
          )
        }
      />

      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
          <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
            <Card>
              <CardBody className="flex flex-col items-center gap-3 text-center">
                <Avatar name={name} size="lg" tone="accent" />
                <div>
                  <p className="text-h4 text-ink">{name}</p>
                  <p className="mt-0.5 text-body-sm text-muted">
                    {card?.candidate.currentTitle ??
                      record?.postingTitle ??
                      "Applicant"}
                  </p>
                </div>
                {card?.rating != null && (
                  <span className="tabular inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-body-sm font-semibold text-ink">
                    <Star
                      aria-hidden="true"
                      className="size-3.5 fill-warning text-warning"
                    />
                    {card.rating}.0
                  </span>
                )}
              </CardBody>
              <CardBody className="border-t border-line">
                <Contact record={record} card={card} />
              </CardBody>
            </Card>

            {card ? (
              <SeededRole card={card} />
            ) : record ? (
              <LiveAdvert record={record} live={view.live} />
            ) : null}
          </aside>

          <div className="flex min-w-0 flex-col gap-5">
            {record ? (
              <Application
                record={record}
                live={view.live}
                editable={view.editable}
                matchedByEmail={view.matchedBy === "email"}
                onScreenIn={() => setScreening(true)}
                onDecline={() => setDeclining(true)}
                onRetry={view.reload}
              />
            ) : (
              <Card>
                <CardHeader
                  title="Not a careers-page application"
                  action={<SourceBadge live={false} />}
                />
                <CardBody>
                  <p className="text-body-sm text-body">
                    Nobody filled a form in for this person — a recruiter added
                    them. There is no application record to read, so everything
                    below is the seeded pipeline.
                  </p>
                </CardBody>
              </Card>
            )}

            {card ? (
              <Pipeline card={card} />
            ) : (
              <Card>
                <CardHeader
                  title="Their pipeline record"
                  action={<SourceBadge live={false} />}
                />
                <CardBody className="flex flex-col items-start gap-3">
                  <p className="text-body-sm text-body">
                    The stage they are in, their interviews, their scorecards and
                    any offer were written by the API and cannot be read back —
                    the pipeline has no endpoint yet. The application above is
                    everything this page can show for certain.
                  </p>
                  <ButtonLink href="/hiring" variant="secondary" size="sm">
                    Back to hiring
                  </ButtonLink>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </PageBody>

      {screening && record && (
        <ScreenInDialog
          applicantName={record.name}
          appliedFor={record.postingTitle}
          roleName={card?.requisition.title ?? record.postingTitle}
          onClose={() => setScreening(false)}
          onConfirm={async (input) => {
            try {
              const result = await view.screenIn(input);
              /* The API writes this sentence and it names the stage they landed
                 in. Showing it rather than composing one means the screen
                 cannot disagree with what actually happened. */
              toast.push({
                title: `${record.name} is in the pipeline`,
                tone: "success",
                detail: result.note,
              });
              setScreening(false);
            } catch (error) {
              fail(error);
            }
          }}
        />
      )}

      {declining && record && (
        <DeclineDialog
          applicantName={record.name}
          onClose={() => setDeclining(false)}
          onConfirm={async (reason) => {
            try {
              await view.screenOut(reason.trim() === "" ? undefined : reason.trim());
              toast.push({
                title: `${record.name} turned down`,
                tone: "success",
                detail: "Nothing was sent to them. Write to them yourself.",
              });
              setDeclining(false);
            } catch (error) {
              fail(error);
            }
          }}
        />
      )}
    </>
  );
}

/**
 * The line under the name.
 *
 * Prefers what the seed knows about their working life — current title and
 * employer — because that is what somebody about to interview them wants. Falls
 * back to the advert and the date, which is what the API can say for certain.
 */
function subtitle(
  record: ApplicantRecord | null,
  card: PipelineCard | null,
): string {
  if (card) {
    return `${card.candidate.currentTitle} at ${card.candidate.currentCompany} · applied ${card.appliedAt}`;
  }
  if (record) {
    return `Applied for ${record.postingTitle} on ${record.appliedOn}`;
  }
  return "";
}

/* -------------------------------------------------------------------- rail */

/**
 * Email, phone and where they are.
 *
 * The live record wins on every field it has, because a screener may have
 * corrected a phone number since the seed was written. Location only ever comes
 * from the seed — the application form does not ask for it.
 */
function Contact({
  record,
  card,
}: {
  record: ApplicantRecord | null;
  card: PipelineCard | null;
}) {
  const rows: { icon: React.ReactNode; text: string; href?: string }[] = [];
  const email = record?.email ?? card?.candidate.email;
  const phone = record?.phone ?? card?.candidate.phone ?? null;

  if (email) {
    rows.push({ icon: <Mail aria-hidden="true" />, text: email, href: `mailto:${email}` });
  }
  if (phone) {
    rows.push({ icon: <Phone aria-hidden="true" />, text: phone, href: `tel:${phone}` });
  }
  if (card) {
    rows.push({ icon: <MapPin aria-hidden="true" />, text: card.candidate.location });
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={row.text} className="flex items-center gap-2.5">
          <span className="shrink-0 text-faint [&>svg]:size-3.5">{row.icon}</span>
          {row.href ? (
            <a
              href={row.href}
              className="min-w-0 truncate text-body-sm text-body hover:text-accent-text hover:underline underline-offset-4"
            >
              {row.text}
            </a>
          ) : (
            <span className="min-w-0 truncate text-body-sm text-body">
              {row.text}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  careers_page: "Careers page",
  referral: "Referral",
  linkedin: "LinkedIn",
  agency: "Agency",
  sourced: "Sourced",
};

/** The role they are in the pipeline for. Seeded, and says so. */
function SeededRole({ card }: { card: PipelineCard }) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-meta font-semibold tracking-wide text-muted">
            Applying for
          </h2>
          <SourceBadge live={false} />
        </div>
        <Link
          href={`/hiring/requisitions/${card.requisitionId}`}
          className="flex items-start gap-2.5 rounded-md border border-line p-2.5 transition-colors hover:bg-canvas"
        >
          <Briefcase
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-faint"
          />
          <span className="min-w-0">
            <span className="block truncate text-body-sm font-medium text-ink">
              {card.requisition.title}
            </span>
            <span className="block truncate text-meta text-muted">
              {card.requisition.reference} · {card.requisition.department}
            </span>
          </span>
        </Link>
        <DescriptionList
          columns={1}
          items={[
            {
              /* "Range on the role", not "Band" — the offer card below places
                 the figure against a *grade* band from the pay structure, and
                 two things both called "band" on one page cannot be told
                 apart. This pair is what the requisition was opened at. */
              term: "Range on the role",
              value: (
                <>
                  <Money amount={card.requisition.salaryMin} decimals /> –{" "}
                  <Money amount={card.requisition.salaryMax} decimals />
                </>
              ),
            },
            {
              term: "Source",
              value: SOURCE_LABEL[card.candidate.source] ?? card.candidate.source,
            },
            { term: "Days in stage", value: `${daysInStage(card)} days` },
          ]}
        />
      </CardBody>
    </Card>
  );
}

/** The advert they applied through. Live. */
function LiveAdvert({
  record,
  live,
}: {
  record: ApplicantRecord;
  live: boolean;
}) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-meta font-semibold tracking-wide text-muted">
            Applied through
          </h2>
          <SourceBadge live={live} />
        </div>
        <Link
          href={`/hiring/postings/applications?posting=${record.postingId}`}
          className="flex items-start gap-2.5 rounded-md border border-line p-2.5 transition-colors hover:bg-canvas"
        >
          <Briefcase
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-faint"
          />
          <span className="min-w-0">
            <span className="block truncate text-body-sm font-medium text-ink">
              {record.postingTitle}
            </span>
            <span className="block truncate text-meta text-muted">
              Everybody else who applied to it
            </span>
          </span>
        </Link>
        <DescriptionList
          columns={1}
          items={[
            { term: "Applied", value: record.appliedOn },
            { term: "Heard about it", value: record.source ?? "Not given" },
            ...(record.screenedOn
              ? [{ term: "Screened", value: record.screenedOn }]
              : []),
          ]}
        />
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------- live panel */

/**
 * Their application, as the database holds it.
 *
 * The one panel on this page that can be live, so it carries the actions too:
 * screening in and turning down are `/careers` writes, and this is a perfectly
 * good place to make them from once somebody has read the cover note.
 */
function Application({
  record,
  live,
  editable,
  matchedByEmail,
  onScreenIn,
  onDecline,
  onRetry,
}: {
  record: ApplicantRecord;
  live: boolean;
  editable: boolean;
  /** True when this was joined to the pipeline candidate by email, not by id. */
  matchedByEmail: boolean;
  onScreenIn: () => void;
  onDecline: () => void;
  onRetry: () => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader
        title="Their application"
        description={`${record.statusLabel} · applied ${record.appliedOn}`}
        action={<SourceBadge live={live} />}
      />
      <CardBody className="flex flex-col gap-4">
        {/* An email match joins two records nothing had linked, so they can
            disagree — a pipeline card marked rejected beside an application
            still marked as waiting. Saying which join this is beats letting
            somebody read the two as one record. */}
        {matchedByEmail && (
          <p className="text-meta text-muted">
            Matched to the pipeline candidate by email address, so the two
            records can disagree about where this person got to.
          </p>
        )}
        {record.declineReason && (
          <Callout tone="danger" title="Turned down">
            {record.declineReason}
          </Callout>
        )}

        {record.coverNote ? (
          <div>
            <h3 className="mb-1.5 text-meta font-semibold tracking-wide text-muted">
              What they wrote
            </h3>
            <p className="whitespace-pre-line rounded-md bg-canvas p-3 text-body-sm leading-relaxed text-body">
              {record.coverNote}
            </p>
          </div>
        ) : (
          <p className="text-body-sm text-muted">
            They sent no covering note.
          </p>
        )}

        {/* The CV. `cvUrl` is null in every environment while no object store is
            wired, and the API's own sentence explains why rather than this
            screen inventing one. */}
        <div className="flex flex-wrap items-center gap-2.5 rounded-md border border-line p-3">
          <Paperclip aria-hidden="true" className="size-4 shrink-0 text-faint" />
          {record.cvUrl ? (
            <a
              href={record.cvUrl}
              className="text-body-sm font-medium text-accent-text hover:underline underline-offset-4"
            >
              Open their CV
            </a>
          ) : (
            <span className="min-w-0 flex-1 text-body-sm text-body">
              {record.cvNote ?? "No CV is attached to this application."}
            </span>
          )}
        </div>

        {record.otherApplications.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-meta font-semibold tracking-wide text-muted">
              Also applied for
            </h3>
            <ul className="flex flex-col gap-1.5">
              {record.otherApplications.map((other) => (
                <li
                  key={other.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-2.5 py-2"
                >
                  <Link
                    href={`/hiring/candidates/${other.id}`}
                    className="min-w-0 truncate text-body-sm text-ink hover:text-accent-text hover:underline underline-offset-4"
                  >
                    {other.postingTitle}
                  </Link>
                  <span className="tabular shrink-0 text-meta text-muted">
                    {other.statusLabel} · {other.appliedOn}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {record.waiting && editable && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button variant="accent" onClick={onScreenIn}>
              Screen in
            </Button>
            <Button variant="secondary" onClick={onDecline}>
              Turn down
            </Button>
          </div>
        )}

        {record.waiting && !editable && (
          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <p className="text-body-sm text-body">
              Screening somebody in writes a candidate into the pipeline, so it
              needs the API.
            </p>
            <Button variant="secondary" size="sm" onClick={() => void onRetry()}>
              Check again
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/* ----------------------------------------------------------- seeded panel */

const INTERVIEW_LABEL: Record<string, string> = {
  recruiter_screen: "Recruiter screen",
  technical: "Technical",
  panel: "Panel",
  final: "Final",
};

const RECOMMENDATION = {
  strong_yes: { label: "Strong yes", tone: "success" as const },
  yes: { label: "Yes", tone: "success" as const },
  no: { label: "No", tone: "danger" as const },
  strong_no: { label: "Strong no", tone: "danger" as const },
};

/** Stage, offer, screening answers, scorecards, interviews. Seeded throughout. */
function Pipeline({ card }: { card: PipelineCard }) {
  const submitted = card.scorecards.filter((s) => s.submittedAt);
  const pending = card.scorecards.filter((s) => !s.submittedAt);
  const stageDef = STAGES.find((s) => s.id === card.stage);

  const avg =
    submitted.length > 0
      ? submitted.reduce(
          (sum, sc) =>
            sum +
            sc.ratings.reduce((a, r) => a + r.score, 0) / (sc.ratings.length || 1),
          0,
        ) / submitted.length
      : null;

  return (
    <>
      {card.outcome === "in_progress" && stageDef && (
        <Callout tone="accent" title={`To leave ${stageLabel(card.stage)}`}>
          {stageDef.exitCriteria}
        </Callout>
      )}
      {card.outcome === "rejected" && card.rejectionReason && (
        <Callout tone="danger" title="Rejected">
          {card.rejectionReason}
        </Callout>
      )}

      {card.offer && (
        <Card>
          <CardHeader
            title="Offer"
            description="Placed against the grade ladder, which is what the company actually pays for this level."
            action={
              <span className="inline-flex flex-wrap items-center gap-2">
                <Badge
                  tone={
                    card.offer.status === "accepted"
                      ? "success"
                      : card.offer.status === "pending_approval"
                        ? "warning"
                        : "info"
                  }
                  dot
                >
                  {card.offer.status.replace("_", " ")}
                </Badge>
                <SourceBadge live={false} />
              </span>
            }
          />
          <CardBody className="flex flex-col gap-5">
            <OfferAgainstBand grossMonthly={card.offer.grossMonthly} />

            <div className="flex flex-wrap items-end justify-between gap-4">
              <DescriptionList
                columns={2}
                items={[{ term: "Start date", value: card.offer.startDate }]}
              />
              {card.offer.status === "pending_approval" && (
                <ButtonLink href="/hiring/offers" variant="accent" size="sm">
                  Review approval
                </ButtonLink>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Screening answers"
          action={<SourceBadge live={false} />}
        />
        <CardBody className="flex flex-col gap-3">
          {card.requisition.screeningQuestions.length === 0 && (
            <p className="text-body-sm text-muted">
              This role has no screening questions configured.
            </p>
          )}
          {card.requisition.screeningQuestions.map((q) => {
            const answer = card.screeningAnswers?.[q.id];
            return (
              <div key={q.id} className="rounded-md border border-line p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-body-sm font-medium text-ink">
                    {q.question}
                  </p>
                  {q.knockout && (
                    <Badge tone="warning" size="sm">
                      Knockout
                    </Badge>
                  )}
                </div>
                <p
                  className={cn(
                    "mt-1.5 text-body-sm",
                    answer ? "text-body" : "italic text-faint",
                  )}
                >
                  {answer ?? "Not answered yet"}
                </p>
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Scorecards"
          description={
            avg !== null
              ? `${submitted.length} submitted · average ${avg.toFixed(1)} / 5`
              : "None submitted yet"
          }
          action={<SourceBadge live={false} />}
        />
        <CardBody className="flex flex-col gap-3">
          {pending.length > 0 && (
            <Callout
              tone="warning"
              title={`${pending.length} scorecard outstanding`}
            >
              {pending
                .map((s) => {
                  const e = employeeById(s.interviewerId);
                  return e ? fullName(e) : "Unknown";
                })
                .join(", ")}{" "}
              has not submitted. The candidate cannot leave Interview until every
              scorecard is in.
            </Callout>
          )}

          {submitted.map((sc) => {
            const who = employeeById(sc.interviewerId);
            return (
              <div key={sc.id} className="rounded-md border border-line p-3.5">
                <div className="flex items-center gap-2.5">
                  <Avatar name={who ? fullName(who) : "?"} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-body-sm font-medium text-ink">
                    {who ? fullName(who) : "Unknown"}
                  </span>
                  {sc.recommendation && (
                    <Badge tone={RECOMMENDATION[sc.recommendation].tone} size="sm">
                      {RECOMMENDATION[sc.recommendation].label}
                    </Badge>
                  )}
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {sc.ratings.map((r) => (
                    <ProgressMeter
                      key={r.competency}
                      value={r.score}
                      max={5}
                      label={r.competency}
                      size="sm"
                      tone={
                        r.score >= 4 ? "success" : r.score >= 3 ? "accent" : "warning"
                      }
                    />
                  ))}
                </div>
                {sc.notes && (
                  <p className="mt-3 border-t border-line pt-2.5 text-body-sm leading-relaxed text-body">
                    {sc.notes}
                  </p>
                )}
              </div>
            );
          })}

          {submitted.length === 0 && pending.length === 0 && (
            <p className="text-body-sm text-muted">
              Scorecards appear once an interview is scheduled.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Interviews" action={<SourceBadge live={false} />} />
        <CardBody className="flex flex-col gap-2.5">
          {card.interviews.length === 0 && (
            <p className="text-body-sm text-muted">Nothing scheduled.</p>
          )}
          {card.interviews.map((iv) => (
            <div
              key={iv.id}
              className="flex items-start gap-3 rounded-md border border-line p-3"
            >
              <CalendarClock
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-faint"
              />
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-medium text-ink">
                  {INTERVIEW_LABEL[iv.kind] ?? iv.kind}
                </p>
                <p className="tabular mt-0.5 text-meta text-muted">
                  {new Date(iv.scheduledFor).toLocaleString("en-NG", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · {iv.durationMins} mins ·{" "}
                  {iv.interviewerIds
                    .map((x) => employeeById(x)?.firstName ?? "?")
                    .join(", ")}
                </p>
              </div>
              <Badge tone={iv.status === "completed" ? "success" : "info"} size="sm">
                {iv.status}
              </Badge>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Activity" action={<SourceBadge live={false} />} />
        <CardBody>
          <Timeline entries={activityFor(card)} />
        </CardBody>
      </Card>
    </>
  );
}

/**
 * The offer, placed against the real grade ladder.
 *
 * Its own component so the `/grades` request only happens for a candidate who
 * actually has an offer. Most do not, and `GET /grades` needs
 * `MANAGE_PAY_STRUCTURE` — which plenty of recruiters do not hold — so calling
 * it from `Pipeline` would put a refused request on every candidate page for no
 * benefit.
 *
 * The seeded offer figure is naira; `bandFor` converts it to kobo, once, in
 * `lib/api/hiring.ts`. Nothing here multiplies by 100.
 */
function OfferAgainstBand({ grossMonthly }: { grossMonthly: number }) {
  const bands = useOfferBands();
  const placement = bands.bandFor(grossMonthly);

  if (!placement) {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-baseline gap-2">
          <Money amount={grossMonthly} decimals size="lg" />
          <span className="text-body-sm text-muted">a month</span>
        </p>
        <p className="text-body-sm text-body">{bands.note}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <BandPosition
        grade={placement.band}
        offerKobo={placement.offerKobo}
        gradeLabel={placement.label}
        label="Against the grade ladder"
      />
      <span className="self-start">
        <SourceBadge live={bands.live} note="The band, not the offer." />
      </span>
    </div>
  );
}

function activityFor(card: PipelineCard): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  if (card.offer) {
    entries.push({
      id: "offer",
      title: `Offer ${card.offer.status.replace("_", " ")}`,
      detail: <Money amount={card.offer.grossMonthly} decimals />,
      timestamp: card.stageEnteredAt,
      tone: card.offer.status === "accepted" ? "success" : "accent",
    });
  }

  for (const iv of [...card.interviews].reverse()) {
    entries.push({
      id: iv.id,
      title: `${INTERVIEW_LABEL[iv.kind] ?? iv.kind} ${iv.status}`,
      timestamp: new Date(iv.scheduledFor).toLocaleDateString("en-NG", {
        day: "numeric",
        month: "short",
      }),
      tone: iv.status === "completed" ? "success" : "neutral",
    });
  }

  entries.push({
    id: "entered",
    title: `Moved to ${stageLabel(card.stage)}`,
    timestamp: card.stageEnteredAt,
    tone: "accent",
  });
  entries.push({
    id: "applied",
    title: "Application received",
    detail: SOURCE_LABEL[card.candidate.source] ?? card.candidate.source,
    timestamp: card.appliedAt,
  });

  return entries;
}

/* -------------------------------------------------------------------------- */

/**
 * An id neither source knows.
 *
 * In demo mode this is a real database id somebody pasted or followed from
 * another browser's session. Connected, it is an application that has since been
 * removed, or a candidate whose `JobApplication` is outside the first hundred
 * rows. Either way `notFound()` would be a dead end reached by following a link
 * the product itself drew, so this says what happened and offers the way back.
 */
function NotFoundHere({
  id,
  error,
  onRetry,
}: {
  id: string;
  error: ApiError | null;
  onRetry: () => Promise<void>;
}) {
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/hiring", label: "Hiring" }]}
        title="Candidate record"
      />
      <PageBody>
        <Card>
          <EmptyState
            icon={<Inbox aria-hidden="true" />}
            title={
              error
                ? "That record could not be loaded"
                : "Nothing here matches that record"
            }
            description={
              error
                ? error.message
                : "No careers-page application and no seeded pipeline candidate carries this id. If they were screened in from another browser, open the applications queue and find them by name."
            }
            action={
              <div className="flex flex-wrap items-center gap-2">
                <ButtonLink
                  href="/hiring/postings/applications"
                  variant="accent"
                  size="sm"
                >
                  Open applications
                </ButtonLink>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void onRetry()}
                >
                  Try again
                </Button>
              </div>
            }
          />
          <span className="sr-only">Candidate id {id}</span>
        </Card>
      </PageBody>
    </>
  );
}
