"use client";

import { useState } from "react";
import {
  CalendarRange,
  CheckCheck,
  ClipboardList,
  Clock,
  MessagesSquare,
  ShieldCheck,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  EmptyState,
  Spinner,
  Stat,
} from "@/components/ui";
import {
  dayLabel,
  dayOf,
  type ApiCycle,
  type ApiGoal,
  type ApiPeerFeedback,
  type ApiReview,
} from "@/lib/api/performance";
import { useFeatures } from "@/lib/store/features";
import { useSession } from "@/lib/store/session";
import {
  useAppraisals,
  useKpis,
  useMyAppraisers,
  useObjectiveApprovals,
} from "@/lib/store/performance";
import { FrameworkDisclosure, HowItWorks } from "./how-it-works";
import { ReviewFormModal } from "./review-form";
import { SkillsTab } from "./skills";
import { StartPeriodButton } from "./start-period";

/**
 * What needs you: the first thing anybody sees in this module.
 *
 * ## Why this replaced four tabs
 *
 * The tabs were *kpis · appraisals · skills · appraiser mapping* — four nouns, and
 * a person arriving with a job to do had to know which noun their job lived
 * under. A product owner read the module and could not work out how to create an
 * appraisal or find the periods, which is the whole verdict.
 *
 * So the landing answers three questions in this order, and nothing else:
 *
 * | Question | What it is |
 * |---|---|
 * | **What is open** | the appraisal period that is running, and its stage |
 * | **What is waiting on you** | your forms, your ratings to answer, objectives to agree |
 * | **What is waiting on somebody else** | objectives you sent, the appraiser who has not finished |
 *
 * Everything reference-shaped — how an appraisal works, the framework, the
 * record of what was said about you, skills against their targets — is behind a
 * `Disclosure` with its count on the closed line. `PARITY.md` Rule 5, including
 * the half of it people skip: **a warning never goes behind a click**. The
 * no-appraiser exception and an unanswered final rating render above everything,
 * outside every reveal.
 *
 * ## Skills is a disclosure and not a tab, deliberately
 *
 * Levels against a target are configuration-shaped: a five-person company should
 * never meet them. There is no `skills` feature flag to hang that on, so the
 * mechanism is the reveal — and because `Disclosure` unmounts its children while
 * closed, a reader who never opens it never pays for the three requests behind
 * it. Who-appraises-whom stays a tab **only** under the `multiAppraiser` flag,
 * which is where that decision already lived.
 *
 * ## Two lists, and they are not the same list
 *
 * "Waiting on you" is work. "What was said about you" is a record, and it only
 * exists once a rating is final or a period is published. Merging them is what
 * the incumbent does, and it is why nobody there can tell whether they still owe
 * something. An unsent self-review is deliberately kept out of the record list
 * even though the API returns it there.
 *
 * ## Peer feedback says its one line once
 *
 * Anonymity is stated once, at the top of the peer section, and never repeated
 * per answer. What it claims is exactly what is true — no name is attached to an
 * answer — and it does not claim more, because `Review.authorId` is still
 * written for the peer row that carries the answers. Nothing in the read path
 * returns it to anybody, including HR.
 */
export function WhatNeedsYouTab({
  canSeeCompany,
  isManager,
}: {
  canSeeCompany: boolean;
  isManager: boolean;
}) {
  const features = useFeatures();
  const appraisals = useAppraisals();
  const approvals = useObjectiveApprovals();
  const mineGoals = useKpis("mine");
  const { actingId } = useSession();

  /**
   * Whether any of the appraisal half of this screen exists at all.
   *
   * `PARITY.md` Rule 2: a company that answered "no" to formal appraisals must
   * not be shown a form, a period or a competency framework. Before this screen
   * existed the gate was the tab list — Appraisals and Skills simply were not
   * there — and folding those tabs into this one would have leaked all of it to
   * everybody. So the gate moved inside, block by block.
   *
   * The objective blocks below are **not** behind it. Agreeing a target is the
   * KPI lifecycle, the KPIs tab shows it with the flag off, and a company that
   * sets goals without scoring them still has objectives to send and agree.
   */
  const scored = features.appraisals;

  const [opened, setOpened] = useState<string | null>(null);

  const owed = appraisals.mine.toComplete;
  const record = appraisals.mine.aboutMe.filter((review) => review.submitted);

  /**
   * Ratings this person has been told and has not answered.
   *
   * Checked on all three flags rather than on `!acknowledged`, because not
   * acknowledged usually means nobody has been asked yet — a third state, and
   * the common one.
   */
  const owesAnswer = appraisals.mine.aboutMe.filter(
    (review) => review.finalised && !review.acknowledged && !review.disputed,
  );
  const answered = appraisals.mine.aboutMe.filter(
    (review) => review.acknowledged || review.disputed,
  );

  const openPeriod = periodInPlay(appraisals.cycles);

  /**
   * Whether anybody is appraising this person in the period that is running.
   *
   * Asked directly rather than inferred from the lists above, and the difference
   * matters: a manager review stays out of "what was said about you" until it is
   * finalised or the period is published, so its absence is the ordinary
   * mid-period state. Reading that absence as "nobody is appraising you" would be
   * wrong for almost everybody. `useMyAppraisers` asks the endpoint whose whole
   * purpose is this question, and an empty answer is the answer.
   */
  const mine = useMyAppraisers(
    openPeriod && openPeriod.stage !== "PUBLISHED" ? openPeriod.id : null,
    actingId,
  );
  const noAppraiser =
    mine.row !== null && mine.row.appraisers.length === 0
      ? mine.row.exceptions.find((issue) => issue.code === "NO_APPRAISER")
      : undefined;
  const appraisingMe = mine.row?.appraisers ?? [];

  /* My own objectives, split by who the next move belongs to. `mine` scope also
     returns the company's, which nobody owns and nobody sends — hence the owner
     check rather than a bare approval filter. */
  const myObjectives = mineGoals.goals.filter(
    (goal) => actingId !== null && goal.ownerId === actingId,
  );
  const toSend = myObjectives.filter(
    (goal) => goal.approval === "DRAFT" || goal.approval === "NEEDS_REVISION",
  );
  const sentForApproval = myObjectives.filter(
    (goal) => goal.approval === "AWAITING_APPROVAL",
  );

  const queue = approvals.queue;
  const owedNow = scored ? owed : [];
  const waitingOnMe =
    owedNow.length +
    (scored ? owesAnswer.length : 0) +
    queue.length +
    toSend.length;
  const waitingOnOthers =
    sentForApproval.length + (scored ? appraisingMe.length : 0);

  /* A manager's third question is "who has not sent theirs in", and the honest
     answer is an aggregate over the period — one register read, on the period's
     own screen. So this is a link and not a count: a number here would either be
     wrong or would cost this screen the heaviest request in the module. */
  const showOutstandingLink =
    scored &&
    (canSeeCompany || isManager) &&
    openPeriod !== undefined &&
    openPeriod.stage !== "DRAFT" &&
    openPeriod.stage !== "PUBLISHED";

  return (
    <div className="flex flex-col gap-6">
      {DEMO_ENABLED && appraisals.source === "demo" && (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="warning" size="sm">
            Demo · answers stay in this browser
          </Badge>
        </div>
      )}

      {appraisals.error && (
        <p className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink">
          {appraisals.error.message}
        </p>
      )}

      {/* Outside every reveal, by Rule 5's own test: somebody who never opens a
          disclosure must not be able to be surprised by this. Being the last to
          hear about your own missing appraiser is the worst possible order to
          find out in. */}
      {scored && noAppraiser && (
        <Callout tone="warning" title="Nobody is appraising you in this period">
          <p>{noAppraiser.message}</p>
          <p className="mt-2">
            Your self-review still counts and still goes in. What is missing is
            somebody to write the manager review, which is the rating of record —
            ask whoever runs the period to set a manager on your record or assign
            an appraiser.
          </p>
        </Callout>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Waiting on you"
          value={String(waitingOnMe)}
          {...(waitingOnMe > 0
            ? { hint: "Everything below with a button beside it" }
            : { hint: "Nothing needs you here" })}
        />
        <Stat
          label="Waiting on somebody else"
          value={String(waitingOnOthers)}
          {...(waitingOnOthers > 0
            ? { hint: "Sent, and not answered yet" }
            : {})}
        />
        {scored && (
          <Stat
            label="Ratings to answer"
            value={String(owesAnswer.length)}
            {...(owesAnswer.length > 0
              ? { hint: "Acknowledge it or say you disagree" }
              : {})}
          />
        )}
        {scored && (
          <Stat
            label="Appraisal period"
            value={openPeriod ? openPeriod.name : "None running"}
            {...(openPeriod
              ? { hint: `At ${openPeriod.stageLabel}` }
              : { hint: "Nothing is open, so nobody owes a form" })}
          />
        )}
      </div>

      {/* Switched off, and the way to switch it on. The one appraisal thing a
          company that said "no formal appraisals" is shown, because the answer
          to "where do I create an appraisal" cannot be silence. */}
      {!scored && (
        <Card>
          <CardHeader
            title="Appraisals are switched off"
            description="KPIs work without them. Turning them on adds appraisal periods, a mark made of objectives and competencies, and a record of what each person was told."
            action={
              <ButtonLink variant="accent" size="sm" href="/settings/features">
                Turn appraisals on
              </ButtonLink>
            }
          />
        </Card>
      )}

      {/* ---------------------------------------------------------------- open */}
      {scored && (
      <Card>
        <CardHeader
          title="What is open"
          {...(openPeriod
            ? {
                description:
                  "The appraisal period everything below belongs to.",
              }
            : {})}
          action={
            openPeriod ? undefined : (
              <StartPeriodButton variant="accent" withIcon />
            )
          }
        />
        {appraisals.loading ? (
          <CardBody className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </CardBody>
        ) : !openPeriod ? (
          <EmptyState
            compact
            icon={<CalendarRange aria-hidden="true" />}
            title="No appraisal period is running"
            description="A period is the stretch of time an appraisal covers. Starting one gives everybody a form."
          />
        ) : (
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                {openPeriod.name}
                <Badge
                  tone={openPeriod.stage === "PUBLISHED" ? "neutral" : "info"}
                  size="sm"
                  dot
                >
                  {openPeriod.stageLabel}
                </Badge>
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-meta text-muted">
                <span>
                  {openPeriod.questionCount === 1
                    ? "1 question"
                    : `${openPeriod.questionCount} questions`}
                </span>
                <span>
                  {openPeriod.reviewCount === 1
                    ? "1 form"
                    : `${openPeriod.reviewCount} forms`}
                </span>
                {openPeriod.dueDate && (
                  <span>Answers due {dayLabel(openPeriod.dueDate)}</span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink
                size="sm"
                href={`/performance/periods/${openPeriod.id}`}
              >
                {openPeriod.stage === "DRAFT"
                  ? "Set it up and start it"
                  : "Who is outstanding"}
              </ButtonLink>
            </div>
          </CardBody>
        )}
      </Card>
      )}

      {/* ------------------------------------------------- final, not answered */}
      {/* Its own card and above the work list, because a rating nobody has
          answered is the exposure this whole feature exists to close — and
          because silence is not acceptance, so it cannot be left to be
          noticed. */}
      {scored && owesAnswer.length > 0 && (
        <Card>
          <CardHeader
            title="Your rating is final"
            description="Read it, then acknowledge that you have seen it or say formally that you do not accept it. Acknowledging is not agreeing."
            action={
              <Badge
                tone="accent"
                size="sm"
                icon={<ShieldCheck aria-hidden="true" />}
              >
                {owesAnswer.length === 1
                  ? "1 to answer"
                  : `${owesAnswer.length} to answer`}
              </Badge>
            }
          />
          <CardBody className="flex flex-col gap-2">
            {owesAnswer.map((review) => (
              <div
                key={review.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-accent-line bg-accent-soft p-3"
              >
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-ink">
                    {review.cycleName}
                    {review.rating !== null
                      ? ` · ${review.rating} out of 5`
                      : " · no overall mark"}
                  </p>
                  <p className="mt-1 text-meta text-muted">
                    {review.finalisedAt
                      ? `Final on ${dayOf(review.finalisedAt)}`
                      : "Final"}
                    {review.authorName ? ` · from ${review.authorName}` : ""}
                  </p>
                </div>
                <ButtonLink
                  variant="accent"
                  size="sm"
                  href={`/performance/reviews/${review.id}`}
                >
                  Read it and answer
                </ButtonLink>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* ---------------------------------------------------- waiting on you */}
      <Card>
        <CardHeader
          title="Waiting on you"
          description="Each of these is one click from being dealt with."
        />
        {appraisals.loading ? (
          <CardBody className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </CardBody>
        ) : owedNow.length === 0 && queue.length === 0 && toSend.length === 0 ? (
          <EmptyState
            compact
            icon={<CheckCheck aria-hidden="true" />}
            title="Nothing needs you"
            description="When a period starts, your form turns up here. So does anything of yours to send, and anybody's objectives to agree."
          />
        ) : (
          <CardBody className="flex flex-col gap-2">
            {/* The objective queue first: agreeing a target is the step before
                anybody can be rated on it, and it is somebody else's work being
                held up rather than your own. */}
            {queue.length > 0 && (
              <TaskRow
                icon={<CheckCheck aria-hidden="true" />}
                title={
                  queue.length === 1
                    ? "1 objective is waiting for you to agree it"
                    : `${queue.length} objectives are waiting for you to agree them`
                }
                detail="An objective has to be agreed before the period it covers."
                href="/performance/approvals"
                action="Open the queue"
              />
            )}

            {toSend.length > 0 && (
              <TaskRow
                icon={<ClipboardList aria-hidden="true" />}
                title={
                  toSend.length === 1
                    ? "1 objective of yours has not been sent for approval"
                    : `${toSend.length} objectives of yours have not been sent for approval`
                }
                detail={objectiveNames(toSend)}
                href="/performance?tab=kpis"
                action="Open your KPIs"
              />
            )}

            {owedNow.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                context="owed"
                actionLabel="Fill it in"
                onOpen={() => setOpened(review.id)}
              />
            ))}
          </CardBody>
        )}
      </Card>

      {/* ------------------------------------------- waiting on somebody else */}
      <Card>
        <CardHeader
          title="Waiting on somebody else"
          description="Sent, and nothing more for you to do until it comes back."
        />
        {waitingOnOthers === 0 && !showOutstandingLink ? (
          <EmptyState
            compact
            icon={<Clock aria-hidden="true" />}
            title="Nothing is out with anybody"
            description="Objectives you send for approval, and the appraiser writing about you, show up here."
          />
        ) : (
          <CardBody className="flex flex-col gap-2">
            {sentForApproval.length > 0 && (
              <TaskRow
                icon={<Clock aria-hidden="true" />}
                title={
                  sentForApproval.length === 1
                    ? "1 objective of yours is waiting to be agreed"
                    : `${sentForApproval.length} objectives of yours are waiting to be agreed`
                }
                detail={objectiveNames(sentForApproval)}
                href="/performance?tab=kpis"
                action="See them"
              />
            )}

            {showOutstandingLink && openPeriod && (
              <TaskRow
                icon={<CalendarRange aria-hidden="true" />}
                title={`Forms other people owe in ${openPeriod.name}`}
                detail="Who has not sent theirs in, by name, and one button to nudge them."
                href={`/performance/periods/${openPeriod.id}`}
                action="Who is outstanding"
              />
            )}

            {scored &&
              appraisingMe.map((appraiser) => (
              <div
                key={appraiser.assignmentId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3"
              >
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-ink">
                    {appraiser.appraiserName} is appraising you
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-meta text-muted">
                    <span>{appraiser.roleLabel}</span>
                    {mine.row && <span>{mine.row.cycleName}</span>}
                    <Badge
                      tone={appraiser.submitted ? "neutral" : "warning"}
                      size="sm"
                      dot
                    >
                      {appraiser.submitted ? "Form sent" : "Form not sent yet"}
                    </Badge>
                  </p>
                </div>
                {/* Their mark, not their form. A working figure moves every time
                    somebody records a rating, so the subject sees it when it is
                    final and not before — the API refuses it either way. */}
                <span className="text-meta text-muted">
                  You will see the mark when it is final
                </span>
              </div>
            ))}
          </CardBody>
        )}
      </Card>

      {/* ------------------------------------------------------- the reference */}
      {scored && <HowItWorks />}

      {scored && (
      <Disclosure
        title="What was said about you"
        meta={
          record.length > 0 ? (
            <Badge tone="neutral" size="sm">
              {record.length === 1 ? "1 review" : `${record.length} reviews`}
            </Badge>
          ) : undefined
        }
        hint={
          record.length === 0
            ? "A manager's review reaches you when your rating is made final, or when the period is published — whichever comes first."
            : answered.length > 0
              ? `${answered.length === 1 ? "1 has" : `${answered.length} have`} been answered. Nothing here needs you.`
              : "Yours to read. Nothing here needs you."
        }
        level={2}
      >
        {record.length === 0 ? (
          <EmptyState
            compact
            icon={<MessagesSquare aria-hidden="true" />}
            title="Nothing published yet"
            description="A manager's review reaches you when the period closes, not before."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {record.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                context="record"
                actionLabel="Read it"
                onOpen={() => setOpened(review.id)}
              />
            ))}
          </div>
        )}
      </Disclosure>
      )}

      {scored && (
      <Disclosure
        title="Peer feedback"
        meta={
          appraisals.mine.peerFeedback.length > 0 ? (
            <Badge tone="neutral" size="sm">
              {appraisals.mine.peerFeedback.length === 1
                ? "1 period"
                : `${appraisals.mine.peerFeedback.length} periods`}
            </Badge>
          ) : undefined
        }
        hint="Anonymous. No name is attached to an answer."
        level={2}
      >
        {appraisals.mine.peerFeedback.length === 0 ? (
          <p className="text-body-sm text-muted">
            Nothing from colleagues yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {appraisals.mine.peerFeedback.map((entry) => (
              <PeerBlock key={entry.cycleId} entry={entry} />
            ))}
          </div>
        )}
      </Disclosure>
      )}

      {scored && <FrameworkDisclosure />}

      {/* Configuration-shaped, and a five-person company never opens it. The
          three requests behind it do not happen until somebody does. */}
      {scored && (
        <Disclosure
          title="Skills and levels"
          hint="Where people are against the levels the company set, and where the gaps are."
          level={2}
        >
          <SkillsTab canSeeCompany={canSeeCompany} isManager={isManager} />
        </Disclosure>
      )}

      {opened && (
        <ReviewFormModal
          reviewId={opened}
          onClose={() => setOpened(null)}
          onDone={appraisals.reload}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The period everything on this screen belongs to.
 *
 * The running one, or the most recent if none is running — never a draft in
 * preference to a period people are actually answering. `cycles` arrives newest
 * first, so the first match is the newest match.
 */
function periodInPlay(periods: ApiCycle[]): ApiCycle | undefined {
  return (
    periods.find(
      (period) => period.stage !== "PUBLISHED" && period.stage !== "DRAFT",
    ) ?? periods[0]
  );
}

/** Three names and a count, never a bare count. */
function objectiveNames(goals: ApiGoal[]): string {
  const names = goals.slice(0, 3).map((goal) => goal.title);
  const rest = goals.length - names.length;
  return rest > 0 ? `${names.join(", ")} and ${rest} more` : names.join(", ");
}

/** One thing to do, and the link that does it. */
function TaskRow({
  icon,
  title,
  detail,
  href,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span aria-hidden="true" className="mt-0.5 [&>svg]:size-4 text-muted">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-body-sm font-medium text-ink">
            {title}
          </span>
          {detail && (
            <span className="mt-1 block text-meta text-muted">{detail}</span>
          )}
        </span>
      </div>
      <ButtonLink size="sm" href={href}>
        {action}
      </ButtonLink>
    </div>
  );
}

/**
 * One review, as a row.
 *
 * The second name on the row is different in the two lists, and getting it
 * wrong makes the row useless. In the work list the useful name is **who it is
 * about** — that is what tells you which of your five forms this is. In the
 * record list the subject is always you, so the useful name is **who wrote
 * it**. A single "· name" that always showed the subject printed your own name
 * back at you.
 */
function ReviewRow({
  review,
  context,
  actionLabel,
  onOpen,
}: {
  review: ApiReview;
  context: "owed" | "record";
  actionLabel: string;
  onOpen: () => void;
}) {
  /* In the record list the subject is always you, so an author who *is* the
     subject would print your own name back at you — which is what a first draft
     did, as "Self-review · from Adaeze Okonkwo". */
  const who =
    context === "owed"
      ? review.kind === "SELF"
        ? null
        : review.subjectName
      : review.authorId !== null && review.authorId !== review.subjectId
        ? review.authorName
        : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3">
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-ink">
          {review.kindLabel}
          {who ? (context === "owed" ? ` · ${who}` : ` · from ${who}`) : ""}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-meta text-muted">
          <span>{review.cycleName}</span>
          {review.dueDate && <span>Due {dayLabel(review.dueDate)}</span>}
          {/* Absent, not zero: a form the author put no number on is not a form
              marked nought. */}
          {review.rating !== null && <span>Mark {review.rating} out of 5</span>}
          <Badge tone={review.submitted ? "neutral" : "warning"} size="sm" dot>
            {review.submitted ? "Sent" : "Not sent"}
          </Badge>
          {/* Three separate facts, and each is its own badge. A rating can be
              final and unanswered, which is neither agreement nor a dispute. */}
          {review.disputed ? (
            <Badge tone="danger" size="sm">
              Disputed {review.disputedAt ? dayOf(review.disputedAt) : ""}
            </Badge>
          ) : review.acknowledged ? (
            <Badge tone="success" size="sm">
              Acknowledged{" "}
              {review.acknowledgedAt ? dayOf(review.acknowledgedAt) : ""}
            </Badge>
          ) : review.finalised ? (
            <Badge tone="accent" size="sm">
              Final, not answered
            </Badge>
          ) : null}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant={review.submitted ? "secondary" : "accent"}
          size="sm"
          onClick={onOpen}
        >
          {actionLabel}
        </Button>
        {/* Everything a rating has to be able to explain — the components behind
            it, who else appraised, the acknowledgement — is on the record. */}
        <ButtonLink size="sm" href={`/performance/reviews/${review.id}`}>
          The record
        </ButtonLink>
      </div>
    </div>
  );
}

/**
 * One period's peer answers, pooled.
 *
 * Below the floor there is nothing to show but the API's own sentence, and that
 * is what is shown — no partial average, no count of who is missing.
 */
function PeerBlock({ entry }: { entry: ApiPeerFeedback }) {
  if (entry.withheld) {
    return (
      <div className="rounded-md border border-line bg-canvas p-3.5">
        <p className="text-body-sm font-medium text-ink">{entry.cycleName}</p>
        <p className="mt-1 text-body-sm text-body">{entry.note}</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-line p-3.5">
      <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
        {entry.cycleName}
        <Badge tone="neutral" size="sm">
          {entry.responses === 1 ? "1 answer" : `${entry.responses} answers`}
        </Badge>
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {entry.answers.map((answer) => (
          <div key={answer.questionId}>
            <p className="text-meta font-medium text-muted">{answer.prompt}</p>
            {answer.averageRating !== null && (
              <p className="tabular mt-1 text-body-sm text-ink">
                Average {answer.averageRating} out of 5, across{" "}
                {answer.answered === 1 ? "1 answer" : `${answer.answered} answers`}
              </p>
            )}
            {answer.yeses > 0 && (
              <p className="tabular mt-1 text-body-sm text-ink">
                {answer.yeses} of {answer.answered} said yes
              </p>
            )}
            {answer.choices.length > 0 && (
              <p className="mt-1 text-body-sm text-ink">
                {answer.choices.join(" · ")}
              </p>
            )}
            {answer.texts.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {answer.texts.map((text, index) => (
                  <li
                    key={index}
                    className="border-l-2 border-line-strong pl-3 text-body-sm leading-relaxed text-body"
                  >
                    {text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
