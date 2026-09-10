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
  Card,
  CardBody,
  CardHeader,
  Disclosure,
  EmptyState,
  Spinner,
  Tabs,
  type TabItem,
} from "@/components/ui";
import {
  dayLabel,
  dayOf,
  ratingWords,
  type ApiGoal,
  type ApiPeerFeedback,
  type ApiReview,
  periodInPlay,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { useSession } from "@/lib/store/session";
import {
  useAppraisals,
  useKpis,
  useMyAppraisers,
  useObjectiveApprovals,
  useReviewsIWrote,
} from "@/lib/store/performance";
import { AppraisersDialog } from "./appraiser-map";
import { ManagerQuestionButton } from "./manager-question";
import { PeriodStatus } from "./period-status";
import { ReviewFormModal } from "./review-form";
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
 * Everything reference-shaped — how an appraisal works, and the framework —
 * has **left this screen** for `/performance/how-it-works`. It was behind a
 * `Disclosure` here, which was better than printing it inline and still put a
 * manual on the page somebody opens to do a task. `PeriodStatus`'s rail draws
 * the shape those four lines described, and carries the link for the rest.
 *
 * What stays behind a reveal is this person's own record — what was said about
 * them, and peer feedback — which is data rather than explanation. `PARITY.md`
 * Rule 5, including the half people skip: **a warning never goes behind a
 * click**. The no-appraiser exception and an unanswered final rating render
 * above everything, outside every reveal.
 *
 * ## Skills moved out to its own tab
 *
 * It used to be a disclosure here, on the grounds that levels against a
 * target are configuration-shaped and a five-person company should never
 * meet them. That held for "which tab is my task under" and did nothing for
 * "where do I manage this" — the product owner's next complaint, once the
 * first was fixed. It is Competency Ratings now, and `performance-screen.tsx`
 * carries the reasoning for the tab strip as a whole. Who-appraises-whom
 * stays a tab **only** under the `multiAppraiser` flag, which is where that
 * decision already lived.
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
  const { isConnected, actingId, employeeId } = useSession();

  /**
   * Who to ask the API about, which is not who to attribute an action to.
   *
   * `actingId` is for attribution and falls back to `""` when this sign-in has
   * no staff record behind it. `employeeId` is the staff record itself, and is
   * null for that same account — which is the honest answer to "whose reviews",
   * because such an account owns none. Using the attribution value as a lookup
   * key is what took this screen down in production. `skills.tsx` already draws
   * the line this way; this is the same seam.
   */
  const meOrNobody = isConnected ? employeeId : actingId;

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
   * Manager reviews this person has already sent, and the ones still to
   * finalise.
   *
   * Sending a manager review used to make it unreachable: `toComplete` drops it
   * the moment it is submitted, `aboutMe` is reviews about *you*, and the only
   * "Finalise" link in the product is in the period register, behind
   * `EDIT_RECORDS`. A line manager could write a rating and never open it
   * again, while the review page's own `mayFinalise` admitted them the whole
   * time. `useReviewsIWrote` is that read; the card near the bottom is the link
   * back.
   *
   * Gated on the period being in play rather than on being somebody's manager.
   * An assigned appraiser who is not a line manager writes manager reviews too
   * and has no register to fall back on, so gating on `isManager` would leave
   * the defect standing for exactly the person least able to work around it.
   * The cost is one request while a period is running, and none when it is not.
   */
  const written = useReviewsIWrote(
    openPeriod &&
      openPeriod.stage !== "DRAFT" &&
      openPeriod.stage !== "PUBLISHED"
      ? openPeriod.id
      : null,
    scored,
  );

  /**
   * Ratings of record still to be picked, and only once calibration is running.
   *
   * Finalising is irreversible — it is what the person is told, and it cannot be
   * re-marked — and the API imposes no stage of its own, so a manager can lock a
   * mark during SELF or MANAGER and there is nothing to stop them. Prompting for
   * it before CALIBRATION would make this screen quietly recommend skipping the
   * stage the period itself defines. So the reviews stay reachable throughout,
   * in the card below, and the *prompt* waits.
   */
  const toFinalise = written.reviews.filter((review) => !review.finalised);
  const finaliseNow = openPeriod?.stage === "CALIBRATION" ? toFinalise : [];

  /**
   * Ratings this person has made final, that the person they are about has not
   * answered.
   *
   * The other half of `toFinalise`, and it belongs in the other tab: once a
   * rating is final the next move is not the appraiser's, it is the subject's —
   * they acknowledge it or they formally dispute it, and until one of those
   * happens the sign-off is open. That is the definition of waiting on somebody
   * else, and it was the one thing genuinely of this person's that had nowhere
   * on this screen to be.
   *
   * All three flags, never `!acknowledged` alone. Not acknowledged usually
   * means nobody has been asked yet, which is a third state and the common one
   * — the same rule `owesAnswer` above follows for the same reason, one side of
   * the same fact along.
   */
  const awaitingAnswer = written.reviews.filter(
    (review) => review.finalised && !review.acknowledged && !review.disputed,
  );

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
    meOrNobody,
  );
  const appraisingMe = mine.row?.appraisers ?? [];

  /* Whoever may change the mapping — the API gates `PUT /cycles/:id/appraisers`
     on `MANAGE_SETTINGS`, so this is the same question asked before offering the
     button rather than after the refusal.

     The same permission decides whether a period may be set up, started, or its
     feature flag turned on, so the cards below read it too. They had no gate at
     all: an employee opening KPIs & appraisals was offered "Set it up and start
     it" on a draft period and "Turn appraisals on", both of which land on a
     screen that is read-only for them. */
  const canManagePeriods = useCan("MANAGE_SETTINGS");
  const [assigningSelf, setAssigningSelf] = useState(false);

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
    finaliseNow.length +
    queue.length +
    toSend.length;
  const waitingOnOthers =
    sentForApproval.length +
    awaitingAnswer.length +
    (scored ? appraisingMe.length : 0);

  /**
   * The whole of what used to be three stat tiles, as one sentence.
   *
   * Built from clauses so a nought is never printed as a figure: what is
   * waiting on you breaks down only when there is something to break down,
   * and "nothing else is waiting on you" is a clause rather than a tile
   * showing 0. The order is the same order the tabs below run in.
   */
  const needsYouLine = (() => {
    const parts: string[] = [];
    if (owedNow.length > 0) {
      parts.push(
        owedNow.length === 1
          ? "1 review to write"
          : `${owedNow.length} reviews to write`,
      );
    }
    if (scored && owesAnswer.length > 0) {
      parts.push(
        owesAnswer.length === 1
          ? "1 rating to answer"
          : `${owesAnswer.length} ratings to answer`,
      );
    }
    if (finaliseNow.length > 0) {
      parts.push(
        finaliseNow.length === 1
          ? "1 rating to finalise"
          : `${finaliseNow.length} ratings to finalise`,
      );
    }
    if (queue.length > 0) {
      parts.push(
        queue.length === 1
          ? "1 objective to agree"
          : `${queue.length} objectives to agree`,
      );
    }
    if (toSend.length > 0) {
      parts.push(
        toSend.length === 1
          ? "1 of yours to send"
          : `${toSend.length} of yours to send`,
      );
    }

    const mine =
      parts.length === 0
        ? ""
        : parts.length === 1
          ? parts[0]!
          : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]!}`;

    const theirs =
      waitingOnOthers === 0
        ? "nothing is waiting on anybody else"
        : waitingOnOthers === 1
          ? "1 thing is waiting on somebody else"
          : `${waitingOnOthers} things are waiting on somebody else`;

    if (mine === "") {
      return `Nothing is waiting on you, and ${theirs}.`;
    }
    return `${mine.charAt(0).toUpperCase()}${mine.slice(1)} — and ${theirs}.`;
  })();

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

  /**
   * The three cards below used to stand one above the other — "What is
   * open", "Waiting on you", "Waiting on somebody else" — which cost a
   * scroll to reach the one a reader actually came for. One section, three
   * tabs, same three questions in the same order the module's own doc
   * comment above already argues for.
   *
   * "This period" is absent when appraisals are switched off, matching the
   * card it replaces — a company without appraisals still sends and agrees
   * objectives, so the other two tabs are never gated on `scored`.
   */
  const sectionTabs: TabItem[] = [
    ...(scored ? [{ id: "period", label: "This period" }] : []),
    {
      id: "waiting-on-you",
      label: "Waiting on you",
      ...(waitingOnMe > 0 ? { count: waitingOnMe } : {}),
    },
    {
      id: "waiting-on-others",
      label: "Waiting on somebody else",
      ...(waitingOnOthers > 0 ? { count: waitingOnOthers } : {}),
    },
  ];
  const [sectionTab, setSectionTab] = useState(
    scored ? "period" : "waiting-on-you",
  );

  return (
    <div className="flex flex-col gap-6">
      {DEMO_ENABLED && appraisals.source === "demo" && (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="warning" size="sm">
            Demo · answers stay in this browser
          </Badge>
        </div>
      )}

      {/* Not shown to somebody with no employee record at all. That is not a
          failure to recover from — it is a founder's own account, exactly as
          created at registration, and `ownEmployeeId` on the API already
          tells this same person, the moment they try to act on a goal or a
          review, that linking themselves is optional housekeeping rather
          than a fix this page should nag them about on every visit. The rest
          of this screen — cycles, appraisals for other people — works for
          them regardless, which is what made this read as "wrong here"
          rather than as a genuine error: the danger-toned banner presumed a
          broken personal state on an account that was never meant to have
          one. A caller who *does* have a record and still hit this is a real
          failure worth surfacing, so the check is on the session, not on
          whether the error exists. */}
      {appraisals.error && employeeId !== null && (
        <p className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink">
          {appraisals.error.message}
        </p>
      )}

      {/* The "Nobody is set to appraise you yet" notice used to be here, and
          Kene asked for it off this screen: *"Remove this from here."*

          It was the first thing on the performance landing, above the figures,
          for a problem the reader usually cannot fix — an employee cannot
          assign their own appraiser, so it was a coloured sentence telling
          somebody about somebody else's job before they had read anything they
          came for.

          Nothing is lost. `appraiser-map.tsx` raises it against the people it
          belongs to, the period screen raises it in the exception lines
          `PeriodStatus` renders, and both are read by whoever actually sets
          appraisers. The employee's own copy was the one nobody could act on. */}

      {/*
       * One figure, not four tiles.
       *
       * This was `Waiting on you` / `Waiting on somebody else` / `Ratings to
       * answer` / `Appraisal period`, all the same size. Three of the four are
       * usually zero or a label, so the one number that means work competed
       * with two noughts and a piece of text — and a nought rendered as a
       * headline figure reads as a result rather than as an absence.
       *
       * The zeroes are still said. They are the second half of one sentence
       * now, where "nothing else is waiting on you" costs a glance instead of
       * two tiles. The period moved to the rail below, which says what stage it
       * is at rather than only naming it.
       */}
      <Card>
        <CardBody className="flex flex-col gap-1">
          {waitingOnMe > 0 ? (
            <>
              <p className="flex flex-wrap items-baseline gap-2">
                <span className="tabular text-h2 font-semibold text-ink">
                  {waitingOnMe}
                </span>
                <span className="text-body font-semibold text-ink">
                  {waitingOnMe === 1 ? "thing needs you" : "things need you"}
                </span>
              </p>
              <p className="text-body-sm text-muted">{needsYouLine}</p>
            </>
          ) : (
            <>
              <p className="text-body font-semibold text-ink">
                Nothing needs you here
              </p>
              <p className="text-body-sm text-muted">{needsYouLine}</p>
            </>
          )}
        </CardBody>
      </Card>

      {/* Switched off, and the way to switch it on. The one appraisal thing a
          company that said "no formal appraisals" is shown, because the answer
          to "where do I create an appraisal" cannot be silence. */}
      {!scored && (
        <Card>
          <CardHeader
            title="Appraisals are switched off"
            description={
              canManagePeriods
                ? "KPIs work without them. Turning them on adds appraisal periods, a mark made of objectives and competencies, and a record of what each person was told."
                : "Your company does not run formal appraisals. KPIs still work."
            }
            action={
              canManagePeriods ? (
                <ButtonLink
                  variant="accent"
                  size="sm"
                  href="/settings/features"
                >
                  Turn appraisals on
                </ButtonLink>
              ) : undefined
            }
          />
        </Card>
      )}

      {/* ------------------------------------------------- final, not answered */}
      {/* Outside every tab, not just outside every disclosure. A rating
          nobody has answered is the exposure this whole feature exists to
          close, and silence is not acceptance — burying it one click inside
          "Waiting on you" is exactly the kind of thing Rule 5 exists to
          forbid for a warning. */}
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
                      ? ` · ${ratingWords(review.rating)}`
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

      {/* --------------------------------------------------- the three tabs */}
      <Tabs items={sectionTabs} value={sectionTab} onChange={setSectionTab}>
        {sectionTab === "period" && scored && (
          <Card>
            <CardHeader
              title="This period"
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
                description={
                  canManagePeriods
                    ? "A period is the stretch of time an appraisal covers. Starting one gives everybody a form."
                    : "Your form turns up here when one starts."
                }
              />
            ) : (
              <>
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                      {openPeriod.name}
                      <Badge
                        tone={
                          openPeriod.stage === "PUBLISHED" ? "neutral" : "info"
                        }
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
                  {/* Both destinations are the period's management screen, so both
                      are gated the same way `showOutstandingLink` already gates the
                      one beside it. Setting a period up and reading who is
                      outstanding are things a period's owner does; an employee's
                      own business with a period is the form, which is the work list
                      in the tab beside this one. Absent, not disabled. */}
                  {(canManagePeriods ||
                    (isManager &&
                      openPeriod.managersCanAddQuestions &&
                      openPeriod.stage === "DRAFT")) && (
                    <div className="flex flex-wrap gap-2">
                      {canManagePeriods && (
                        <ButtonLink
                          size="sm"
                          href={`/performance/periods/${openPeriod.id}`}
                        >
                          {openPeriod.stage === "DRAFT"
                            ? "Set it up and start it"
                            : "Who is outstanding"}
                        </ButtonLink>
                      )}
                      {/* HR turned this on for this period, and it is only
                          worth showing while there is still time to use it —
                          `addManagerQuestion` refuses once the cycle leaves
                          DRAFT, same as HR's own question list does. */}
                      {isManager &&
                        openPeriod.managersCanAddQuestions &&
                        openPeriod.stage === "DRAFT" && (
                          <ManagerQuestionButton
                            cycleId={openPeriod.id}
                            onAdded={appraisals.reload}
                          />
                        )}
                    </div>
                  )}
                </CardBody>

                {/* How far along it is, for whoever is running it. Absent for
                    everybody else rather than zeroed — see `period-status.tsx`.
                    This card said which period was open and nothing about its
                    state, so "where is this up to" was two clicks from the screen
                    that asked it. */}
                <PeriodStatus
                  cycle={openPeriod}
                  canSeeCompany={canSeeCompany}
                />
              </>
            )}
          </Card>
        )}

        {sectionTab === "waiting-on-you" && (
          <Card>
            <CardHeader title="Waiting on you" />
            {appraisals.loading ? (
              <CardBody className="flex items-center gap-2 text-body-sm text-muted">
                <Spinner size="sm" />
                Loading
              </CardBody>
            ) : owedNow.length === 0 &&
              finaliseNow.length === 0 &&
              queue.length === 0 &&
              toSend.length === 0 ? (
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
                    href="/performance/kpis"
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

                {/* One row per rating rather than one row with a count, because
                    each is a separate irreversible decision about a named
                    person and the link has to reach that person's review.
                    Counting them into a single row would land somewhere that
                    then asks which. */}
                {finaliseNow.map((review) => (
                  <TaskRow
                    key={review.id}
                    icon={<ShieldCheck aria-hidden="true" />}
                    title={`${review.subjectName}'s rating is written and not final`}
                    detail="Calibration is running. Finalising makes this the rating of record and tells them, and it cannot be re-marked."
                    href={`/performance/reviews/${review.id}`}
                    action="Open it"
                  />
                ))}
              </CardBody>
            )}
          </Card>
        )}

        {sectionTab === "waiting-on-others" && (
          <Card>
            <CardHeader title="Waiting on somebody else" />
            {waitingOnOthers === 0 && !showOutstandingLink ? (
              <EmptyState
                compact
                icon={<Clock aria-hidden="true" />}
                title="Nothing is out with anybody"
                description="Objectives you send for approval, ratings you have made final that nobody has answered, and the appraiser writing about you, all show up here."
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
                    href="/performance/kpis"
                    action="See them"
                  />
                )}

                {/* After the objectives, which are also yours and out with
                    somebody, and before the aggregate below — this is a named
                    person and a specific thing you did, which is the more
                    actionable of the two. One row each rather than a count:
                    what a reader does with this is chase a person, and a
                    number names nobody. */}
                {awaitingAnswer.map((review) => (
                  <TaskRow
                    key={review.id}
                    icon={<ShieldCheck aria-hidden="true" />}
                    title={`${review.subjectName} has not answered their rating`}
                    detail={`${
                      review.finalisedAt
                        ? `Final on ${dayOf(review.finalisedAt)}. `
                        : ""
                    }They either acknowledge it or formally dispute it, and the sign-off stays open until one of those.`}
                    href={`/performance/reviews/${review.id}`}
                    action="Open it"
                  />
                ))}

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
                            {appraiser.submitted
                              ? "Form sent"
                              : "Form not sent yet"}
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
        )}
      </Tabs>

      {/* ------------------------------------------------------- the reference */}
      {/*
       * `HowItWorks` used to render here — four lines explaining what a period
       * is, what you do inside it, what your mark is made of and what happens
       * at the end. It was already the trimmed remainder of a longer piece that
       * moved to `/performance/how-it-works`, and it is gone from this screen
       * now for the same reason the rest went: the rail above draws the shape
       * those four lines described. A product that has to print its own manual
       * on the landing page has not shown you the thing.
       *
       * Nothing is lost. The whole explanation is still one link away, and
       * `PeriodStatus` carries the link. The component itself is now deleted
       * rather than left exported with no importers — see the note in
       * `how-it-works.tsx` for why a spare copy is worse than none.
       */}

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
              ? "A manager's review reaches you when your rating is made final, or when the period is published, whichever comes first."
              : owesAnswer.length > 0
                ? /* Before the two "nothing here needs you" wordings, because
                     an unanswered final rating is precisely something that
                     does. A closed reveal saying nothing needs you, over a
                     mark waiting to be acknowledged, is the failure mode a
                     reveal has. */
                  `${owesAnswer.length === 1 ? "1 is" : `${owesAnswer.length} are`} final and not answered yet.`
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

      {/*
       * The other side of the same fact: "What was said about you" above is
       * every review *about* this person, and this is every one they *wrote*.
       * Between them a review is reachable from whichever end you come at it
       * from, which was the whole defect — the author's end had no door at all.
       *
       * Open when something is still to finalise, closed once everything is
       * settled. A reveal that hides an act somebody still has to perform is
       * the failure mode a reveal has; a reveal over a finished record is what
       * one is for.
       */}
      {scored && written.reviews.length > 0 && (
        <Disclosure
          title="Reviews you have written"
          defaultOpen={toFinalise.length > 0}
          meta={
            <Badge tone="neutral" size="sm">
              {written.reviews.length === 1
                ? "1 review"
                : `${written.reviews.length} reviews`}
            </Badge>
          }
          hint={
            toFinalise.length === 0
              ? "All final. Yours to read."
              : toFinalise.length === 1
                ? "1 is written and not final yet."
                : `${toFinalise.length} are written and not final yet.`
          }
          level={2}
        >
          <div className="flex flex-col gap-2">
            {written.reviews.map((review) => (
              <div
                key={review.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3"
              >
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-ink">
                    {review.subjectName}
                    {review.rating !== null
                      ? ` · ${ratingWords(review.rating)}`
                      : " · no overall mark"}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-meta text-muted">
                    <span>{review.cycleName}</span>
                    {/* Four states, never three: not answered is not the same
                        fact as disagreed, and nobody having been asked yet is
                        the common one. Same rule the register's sign-off
                        column follows. */}
                    {review.disputed ? (
                      <Badge tone="danger" size="sm" dot>
                        Disputed
                      </Badge>
                    ) : review.acknowledged ? (
                      <Badge tone="success" size="sm" dot>
                        Acknowledged
                      </Badge>
                    ) : review.finalised ? (
                      <Badge tone="warning" size="sm" dot>
                        Final, not answered yet
                      </Badge>
                    ) : (
                      <Badge tone="info" size="sm" dot>
                        Written, not final
                      </Badge>
                    )}
                  </p>
                </div>
                <ButtonLink
                  variant="accent"
                  size="sm"
                  href={`/performance/reviews/${review.id}`}
                >
                  {review.finalised ? "Read it" : "Open it"}
                </ButtonLink>
              </div>
            ))}
          </div>
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

      {/* `FrameworkDisclosure` — the four competency groups, as reference —
          moved to `/performance/how-it-works` with the rest of the explanation.
          Somebody who wants to know what an appraisal is made of is asking a
          question about the model, not doing a task, and this screen is for the
          task. `/performance/skills` shows them their own actual levels, which
          is the version of that question with an answer in it. */}

      {opened && (
        <ReviewFormModal
          reviewId={opened}
          onClose={() => setOpened(null)}
          onDone={appraisals.reload}
        />
      )}

      {/* The same dialog the period screen uses, on the screen where the
          problem was noticed. One implementation of "who appraises this
          person"; two places it can be reached from. */}
      {assigningSelf && mine.row && openPeriod && (
        <AppraisersDialog
          cycleId={openPeriod.id}
          row={mine.row}
          onClose={() => setAssigningSelf(false)}
          onSaved={() => {
            setAssigningSelf(false);
            /* `useMyAppraisers` has no reload of its own; the appraisals load
               is what this screen re-reads, and the mapping is re-fetched with
               it on the next render. */
            appraisals.reload();
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

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
          {review.rating !== null && <span>{ratingWords(review.rating)}</span>}
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
        {/*
         * Two acts on an unsent form, and one on a sent one.
         *
         * This was a single button, and the reason is worth keeping because it
         * is still half true: two buttons that both merely "showed the review"
         * sat here once with no way to tell why there were two, and the record
         * page for an unsent form was a column of "Not answered" reading as
         * lost answers rather than ones still waiting.
         *
         * The second half of that stopped being true. The page now heads that
         * card "3 questions still unanswered" and carries its own "Fill it in",
         * so it says *waiting*, not *lost* — and it holds what the modal cannot:
         * the appraiser strip, the components behind the mark, the whole record.
         *
         * So both are offered, and the objection is answered by making them
         * plainly different rather than by dropping one. Filling it in is the
         * primary act and happens in place; opening the record is secondary and
         * goes somewhere. The labels name the destination, not the thing.
         *
         * A sent form keeps one button, because there is no form left to fill —
         * a second control here would go where the first one goes.
         *
         * And only in the work list. The same row renders under "What was said
         * about you", which is a reading surface: an unsent form reaches it
         * only as this person's own self-review, which is already in the work
         * list above with both acts on it. Offering "Read it" beside "Open the
         * record" there would be two buttons that both just show the review,
         * which is the exact thing this comment starts by warning about.
         */}
        {review.submitted ? (
          <ButtonLink
            variant="accent"
            size="sm"
            href={`/performance/reviews/${review.id}`}
          >
            Read the review
          </ButtonLink>
        ) : (
          <>
            <Button variant="accent" size="sm" onClick={onOpen}>
              {actionLabel}
            </Button>
            {context === "owed" && (
              <ButtonLink
                variant="secondary"
                size="sm"
                href={`/performance/reviews/${review.id}`}
              >
                Open the record
              </ButtonLink>
            )}
          </>
        )}
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
                {/* The one place a mark stays a figure. An average of ordinal
                    words is not a word: 3.4 and 2.6 both round to "Meets
                    Expectations" and only one of them is nearer 2. Naming a
                    level here would be a claim nobody made. rating-scale-prose */}
                Average {answer.averageRating} out of 5, across{" "}
                {answer.answered === 1
                  ? "1 answer"
                  : `${answer.answered} answers`}
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
