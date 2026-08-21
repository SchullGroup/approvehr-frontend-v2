import type { Metadata } from "next";
import Link from "next/link";
import {
  Briefcase,
  CalendarClock,
  FileText,
  Mail,
  MapPin,
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
  Timeline,
  type TimelineEntry,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { SourceBadge } from "@/components/hiring/source-badge";
import { StagePill, stageLabel } from "@/components/hiring/stage-pill";
import { APPLICATIONS, cardById, daysInStage } from "@/lib/mock/hiring";
import { employeeById } from "@/lib/mock/people";
import { STAGES, fullName, type PipelineCard } from "@/lib/types";

export function generateStaticParams() {
  return APPLICATIONS.map((a) => ({ id: a.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const card = cardById(id);
  return { title: card ? fullName(card.candidate) : "Candidate" };
}

const SOURCE_LABEL: Record<string, string> = {
  careers_page: "Careers page",
  referral: "Referral",
  linkedin: "LinkedIn",
  agency: "Agency",
  sourced: "Sourced",
};

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

/**
 * The full candidate record — the Deel pattern: a fixed identity rail on the
 * left carrying everything that never changes, and the working detail on the
 * right. The drawer on the board is for a glance; this is where someone reads
 * before a decision.
 *
 * ## Seeded in both modes, and an unknown id is not a 404
 *
 * `Candidate`, the pipeline `Application`, `Interview` and `Scorecard` are all
 * real Prisma models with no route in `approvehr-api`. So everything on this page
 * comes from the seed whichever mode the app is in, and the badge says so.
 *
 * The route takes a pipeline **application** id, which is what the board links
 * with. Screening somebody in through `/hiring/postings/applications` produces a
 * **candidate** id, and that screen links here with it — a real database id this
 * browser's seed has never seen. `notFound()` there is a dead end reached by
 * following a link the product itself drew, so an unrecognised id says what
 * happened and offers the way back instead.
 */
export default async function CandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const card = cardById(id);
  if (!card) return <NotInThisBrowser id={id} />;

  const name = fullName(card.candidate);
  const submitted = card.scorecards.filter((s) => s.submittedAt);
  const pending = card.scorecards.filter((s) => !s.submittedAt);
  const stageDef = STAGES.find((s) => s.id === card.stage)!;

  const avg =
    submitted.length > 0
      ? submitted.reduce(
          (sum, sc) =>
            sum +
            sc.ratings.reduce((a, r) => a + r.score, 0) /
              (sc.ratings.length || 1),
          0,
        ) / submitted.length
      : null;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/hiring", label: "Hiring" },
          {
            href: `/hiring/requisitions/${card.requisitionId}`,
            label: card.requisition.title,
          },
          { href: `/hiring/candidates/${card.id}`, label: name },
        ]}
        title={name}
        meta={
          <>
            <StagePill stage={card.stage} outcome={card.outcome} />
            <SourceBadge live={false} />
          </>
        }
        description={`${card.candidate.currentTitle} at ${card.candidate.currentCompany} · applied ${card.appliedAt}`}
        action={
          <>
            <Button variant="secondary" size="sm">
              <CalendarClock aria-hidden="true" className="size-3.5" />
              Schedule
            </Button>
            <ButtonLink
              href={`/hiring/requisitions/${card.requisitionId}`}
              variant="secondary"
              size="sm"
            >
              Back to pipeline
            </ButtonLink>
          </>
        }
      />

      <PageBody>
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
          {/* Identity rail */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
            <Card>
              <CardBody className="flex flex-col items-center gap-3 text-center">
                <Avatar name={name} size="lg" tone="accent" />
                <div>
                  <p className="text-h4 text-ink">{name}</p>
                  <p className="mt-0.5 text-[0.875rem] text-muted">
                    {card.candidate.currentTitle}
                  </p>
                </div>
                {card.rating !== null && (
                  <span className="tabular inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[0.875rem] font-semibold text-ink">
                    <Star
                      aria-hidden="true"
                      className="size-3.5 fill-warning text-warning"
                    />
                    {card.rating}.0
                  </span>
                )}
              </CardBody>
              <CardBody className="border-t border-line">
                <ContactList card={card} />
              </CardBody>
            </Card>

            <Card>
              <CardBody className="flex flex-col gap-3">
                <h2 className="text-[0.75rem] font-semibold tracking-wide text-muted">
                  Applying for
                </h2>
                <Link
                  href={`/hiring/requisitions/${card.requisitionId}`}
                  className="flex items-start gap-2.5 rounded-md border border-line p-2.5 transition-colors hover:bg-canvas"
                >
                  <Briefcase
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-faint"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[0.875rem] font-medium text-ink">
                      {card.requisition.title}
                    </span>
                    <span className="block truncate text-[0.75rem] text-muted">
                      {card.requisition.reference} ·{" "}
                      {card.requisition.department}
                    </span>
                  </span>
                </Link>
                <DescriptionList
                  columns={1}
                  items={[
                    {
                      term: "Band",
                      value: (
                        <>
                          <Money amount={card.requisition.salaryMin} decimals />{" "}
                          – <Money amount={card.requisition.salaryMax} decimals />
                        </>
                      ),
                    },
                    { term: "Source", value: SOURCE_LABEL[card.candidate.source] },
                    {
                      term: "Days in stage",
                      value: `${daysInStage(card)} days`,
                    },
                  ]}
                />
              </CardBody>
            </Card>
          </aside>

          {/* Detail */}
          <div className="flex min-w-0 flex-col gap-5">
            {card.outcome === "in_progress" && (
              <Callout tone="accent" title={`To leave ${stageLabel(card.stage)}`}>
                {stageDef.exitCriteria}
              </Callout>
            )}
            {card.outcome === "rejected" && card.rejectionReason && (
              <Callout tone="danger" title="Rejected">
                {card.rejectionReason}
              </Callout>
            )}

            {/* Offer */}
            {card.offer && (
              <Card>
                <CardHeader
                  title="Offer"
                  description="Generated from the requisition band."
                  action={
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
                  }
                />
                <CardBody className="flex flex-wrap items-end justify-between gap-4">
                  <DescriptionList
                    columns={2}
                    items={[
                      {
                        term: "Gross monthly",
                        value: <Money amount={card.offer.grossMonthly} decimals />,
                      },
                      { term: "Start date", value: card.offer.startDate },
                    ]}
                  />
                  {card.offer.status === "pending_approval" && (
                    <ButtonLink href="/hiring/offers" variant="accent" size="sm">
                      Review approval
                    </ButtonLink>
                  )}
                </CardBody>
              </Card>
            )}

            {/* Screening */}
            <Card>
              <CardHeader title="Screening answers" />
              <CardBody className="flex flex-col gap-3">
                {card.requisition.screeningQuestions.length === 0 && (
                  <p className="text-[0.875rem] text-muted">
                    This role has no screening questions configured.
                  </p>
                )}
                {card.requisition.screeningQuestions.map((q) => {
                  const answer = card.screeningAnswers?.[q.id];
                  return (
                    <div key={q.id} className="rounded-md border border-line p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[0.875rem] font-medium text-ink">
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
                          "mt-1.5 text-[0.875rem]",
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

            {/* Scorecards */}
            <Card>
              <CardHeader
                title="Scorecards"
                description={
                  avg !== null
                    ? `${submitted.length} submitted · average ${avg.toFixed(1)} / 5`
                    : "None submitted yet"
                }
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
                    has not submitted. The candidate cannot leave Interview
                    until every scorecard is in.
                  </Callout>
                )}

                {submitted.map((sc) => {
                  const who = employeeById(sc.interviewerId);
                  return (
                    <div key={sc.id} className="rounded-md border border-line p-3.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={who ? fullName(who) : "?"} size="xs" />
                        <span className="min-w-0 flex-1 truncate text-[0.875rem] font-medium text-ink">
                          {who ? fullName(who) : "Unknown"}
                        </span>
                        {sc.recommendation && (
                          <Badge
                            tone={RECOMMENDATION[sc.recommendation].tone}
                            size="sm"
                          >
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
                              r.score >= 4
                                ? "success"
                                : r.score >= 3
                                  ? "accent"
                                  : "warning"
                            }
                          />
                        ))}
                      </div>
                      {sc.notes && (
                        <p className="mt-3 border-t border-line pt-2.5 text-[0.875rem] leading-relaxed text-body">
                          {sc.notes}
                        </p>
                      )}
                    </div>
                  );
                })}

                {submitted.length === 0 && pending.length === 0 && (
                  <p className="text-[0.875rem] text-muted">
                    Scorecards appear once an interview is scheduled.
                  </p>
                )}
              </CardBody>
            </Card>

            {/* Interviews */}
            <Card>
              <CardHeader title="Interviews" />
              <CardBody className="flex flex-col gap-2.5">
                {card.interviews.length === 0 && (
                  <p className="text-[0.875rem] text-muted">
                    Nothing scheduled.
                  </p>
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
                      <p className="text-[0.875rem] font-medium text-ink">
                        {INTERVIEW_LABEL[iv.kind]}
                      </p>
                      <p className="tabular mt-0.5 text-[0.75rem] text-muted">
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
                    <Badge
                      tone={iv.status === "completed" ? "success" : "info"}
                      size="sm"
                    >
                      {iv.status}
                    </Badge>
                  </div>
                ))}
              </CardBody>
            </Card>

            {/* Documents + activity */}
            <div className="grid gap-5 lg:grid-cols-2">
              <Card>
                <CardHeader title="Documents" />
                <CardBody>
                  <div className="flex items-center gap-2.5 rounded-md border border-line p-3">
                    <FileText
                      aria-hidden="true"
                      className="size-4 shrink-0 text-faint"
                    />
                    <span className="min-w-0 flex-1 truncate text-[0.875rem] text-ink">
                      {card.candidate.cvFileName}
                    </span>
                    <Button size="sm" variant="secondary">
                      Open
                    </Button>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Activity" />
                <CardBody>
                  <Timeline entries={activityFor(card)} />
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function ContactList({ card }: { card: PipelineCard }) {
  const rows: [React.ReactNode, string][] = [
    [<Mail key="m" aria-hidden="true" />, card.candidate.email],
    [<Phone key="p" aria-hidden="true" />, card.candidate.phone],
    [<MapPin key="l" aria-hidden="true" />, card.candidate.location],
  ];
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map(([icon, text], i) => (
        <li key={i} className="flex items-center gap-2.5">
          <span className="shrink-0 text-faint [&>svg]:size-3.5">{icon}</span>
          <span className="min-w-0 truncate text-[0.875rem] text-body">
            {text}
          </span>
        </li>
      ))}
    </ul>
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
      title: `${INTERVIEW_LABEL[iv.kind]} ${iv.status}`,
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
    detail: SOURCE_LABEL[card.candidate.source],
    timestamp: card.appliedAt,
  });

  return entries;
}

/* -------------------------------------------------------------------------- */

/**
 * A candidate this browser has never heard of.
 *
 * Reached by screening somebody in while connected: the API creates the
 * `Candidate` and returns its id, and there is no route to read it back with.
 * Saying that, and pointing at the queue the person came from, beats a bare 404.
 */
function NotInThisBrowser({ id }: { id: string }) {
  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/hiring", label: "Hiring" }]}
        title="Candidate record"
        meta={<SourceBadge live={false} />}
      />
      <PageBody>
        <Card>
          <EmptyState
            icon={<FileText aria-hidden="true" />}
            title="This record is in the database, not in this browser"
            description="They were screened in through the careers page, so their candidate record was created by the API. Nothing reads it back yet — the pipeline has no endpoint."
            action={
              <ButtonLink
                href="/hiring/postings/applications"
                variant="accent"
                size="sm"
              >
                Back to applications
              </ButtonLink>
            }
          />
          <span className="sr-only">Candidate id {id}</span>
        </Card>
      </PageBody>
    </>
  );
}
