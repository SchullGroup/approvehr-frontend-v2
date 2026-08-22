"use client";

import { useState } from "react";
import Link from "next/link";
import { ClipboardList, Layers, MessagesSquare, ShieldCheck } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Spinner,
  Stat,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  dayLabel,
  dayOf,
  type ApiCycle,
  type ApiPeerFeedback,
  type ApiReview,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { useSession } from "@/lib/store/session";
import {
  useAppraisals,
  useCycleMutations,
  useFramework,
  useMyAppraisers,
} from "@/lib/store/performance";
import { NewCycleDialog, QuestionsDialog } from "./cycle-dialogs";
import { ReviewFormModal } from "./review-form";

/**
 * Appraisals: what you owe, and what was said about you.
 *
 * ## Two lists, and they are not the same list
 *
 * "Waiting on you" is work — your own self-review, and one form per person who
 * reports to you. "What was said about you" is a record, and it only exists once
 * a cycle is published. Merging them into one "My reviews" table is what the
 * incumbent does, and it is why nobody can tell whether they still owe
 * something.
 *
 * An unsent self-review is deliberately kept out of the record list even though
 * the API returns it there: it is in the work list, and showing the same empty
 * form twice under two headings reads as two jobs.
 *
 * ## Peer feedback says its one line once
 *
 * Anonymity is stated once, at the top of the peer section, and never repeated
 * per answer. What it claims is exactly what is true — no name is attached to an
 * answer — and it does not claim more, because `Review.authorId` is still
 * written for the peer row that carries the answers. Nothing in the read path
 * returns it to anybody, including HR.
 *
 * ## Nobody appraising somebody is an exception, and it survives the toast
 *
 * Starting a cycle fills in the obvious mapping — everybody's line manager, at
 * 100% — and returns `withoutAppraiser`: the people who have no manager either,
 * by name. They will finish the cycle with **no mark**, which is the performance
 * module's version of running payroll with nobody's bank account: every screen
 * looks finished and one person silently got nothing.
 *
 * So it is a callout on the page and not only a toast. A toast disappears in six
 * seconds, and this needs somebody to act on it. This is the *simple* mode's
 * safety net and it works with the multi-appraiser flag off, which is the point
 * — a company that never opens the mapping surface still gets told.
 */
export function AppraisalsTab() {
  const appraisals = useAppraisals();
  const framework = useFramework();
  const cycles = useCycleMutations();
  const features = useFeatures();
  const canManage = useCan("MANAGE_SETTINGS");
  const { actingId } = useSession();
  const toast = useToast();

  const [opened, setOpened] = useState<string | null>(null);
  const [questionsFor, setQuestionsFor] = useState<ApiCycle | null>(null);
  const [creatingCycle, setCreatingCycle] = useState(false);
  const [unappraised, setUnappraised] = useState<{
    cycleName: string;
    names: string[];
  } | null>(null);
  const [unscoreable, setUnscoreable] = useState<{
    cycleName: string;
    names: string[];
  } | null>(null);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.push({ title: success, tone: "success" });
      appraisals.reload();
      return true;
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
      return false;
    }
  };

  /**
   * Starting a cycle, kept apart from `run` because the result matters.
   *
   * `run` throws its result away, which is right for five of the six mutations
   * here and wrong for this one: `withoutAppraiser` is the list of people who
   * would finish with no mark, and a helper that discards it is a helper that
   * discards the only warning anybody gets.
   */
  const startCycle = async (cycle: ApiCycle) => {
    try {
      const result = await cycles.activate(cycle.id);
      toast.push({ title: `${cycle.name} started`, tone: "success" });
      setUnappraised(
        result.withoutAppraiser.length > 0
          ? { cycleName: cycle.name, names: result.withoutAppraiser }
          : null,
      );
      /* The second silent failure, and it is a different one: somebody with an
         appraiser and nothing agreed to be judged on still finishes the period
         with a hole in their mark, because delivery against objectives is one of
         the four parts the framework seeds. Named, not counted. */
      setUnscoreable(
        result.withoutAgreedObjectives.length > 0
          ? { cycleName: cycle.name, names: result.withoutAgreedObjectives }
          : null,
      );
      appraisals.reload();
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    }
  };

  const owed = appraisals.mine.toComplete;
  const record = appraisals.mine.aboutMe.filter((review) => review.submitted);
  /**
   * Ratings this person has been told and has not answered.
   *
   * The last step of the simple path, and the one nobody else in this market
   * records at all. It is checked on all three flags rather than on
   * `!acknowledged`, because not acknowledged usually means nobody has been asked
   * yet — a third state, and the common one.
   */
  const owesAnswer = appraisals.mine.aboutMe.filter(
    (review) =>
      review.finalised && !review.acknowledged && !review.disputed,
  );
  const answered = appraisals.mine.aboutMe.filter(
    (review) => review.acknowledged || review.disputed,
  );
  const openCycle =
    appraisals.cycles.find((cycle) => cycle.stage !== "PUBLISHED" && cycle.stage !== "DRAFT") ??
    appraisals.cycles[0];

  /**
   * Whether anybody is appraising this person in the cycle that is running.
   *
   * Asked directly rather than inferred from the lists above, and the difference
   * matters: a manager review stays out of "what was said about you" until it is
   * finalised or the cycle is published, so its absence is the ordinary mid-cycle
   * state. Reading that absence as "nobody is appraising you" would be wrong for
   * almost everybody. `useMyAppraisers` asks the endpoint whose whole purpose is
   * this question, and an empty answer is the answer.
   */
  const mine = useMyAppraisers(
    openCycle && openCycle.stage !== "PUBLISHED" ? openCycle.id : null,
    actingId,
  );
  const noAppraiser =
    mine.row !== null && mine.row.appraisers.length === 0
      ? mine.row.exceptions.find((issue) => issue.code === "NO_APPRAISER")
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {appraisals.source === "demo" && (
          <Badge tone="warning" size="sm">
            Demo · answers stay in this browser
          </Badge>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {/* Agreeing objectives is the step before rating anybody, so the link
              to it belongs beside the reviews rather than only on the KPI tab. */}
          <ButtonLink size="sm" href="/performance/approvals">
            Objectives to agree
          </ButtonLink>
          {canManage && cycles.editable && (
            <Button
              variant="accent"
              size="sm"
              onClick={() => setCreatingCycle(true)}
            >
              New cycle
            </Button>
          )}
        </div>
      </div>

      {appraisals.error && (
        <p className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink">
          {appraisals.error.message}
        </p>
      )}

      {/* Not a toast. Somebody has to act on this, and a toast is gone in six
          seconds. It stays until the page is left or somebody dismisses it. */}
      {unappraised && (
        <Callout tone="danger" title="Some people have nobody appraising them">
          <p>
            {unappraised.names.join(", ")}{" "}
            {unappraised.names.length === 1 ? "has" : "have"} no manager, so
            starting {unappraised.cycleName} gave{" "}
            {unappraised.names.length === 1 ? "them" : "them"} no appraiser.{" "}
            {unappraised.names.length === 1 ? "They" : "They"} will finish this
            cycle with no mark unless somebody is assigned.
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-3">
            <span>
              Set a manager on their record
              {features.multiAppraiser
                ? ", or assign an appraiser on the Who appraises whom tab."
                : "."}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setUnappraised(null)}
            >
              Dismiss
            </Button>
          </p>
        </Callout>
      )}

      {/* The other way somebody finishes a cycle short. Separate from the one
          above because the fix is different: that one needs an appraiser, this
          one needs an objective agreed. */}
      {unscoreable && (
        <Callout tone="warning" title="Some people have nothing agreed to be judged on">
          <p>
            {unscoreable.names.join(", ")}{" "}
            {unscoreable.names.length === 1 ? "has" : "have"} no agreed objective
            in {unscoreable.cycleName}. Delivery against objectives is one of the
            four parts an appraisal is made of, so that part of their mark cannot
            be worked out — it is left out rather than scored zero, and the rest of
            their score carries the difference.
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-3">
            <Link
              href="/performance/approvals"
              className="font-medium underline-offset-2 hover:underline"
            >
              Agree what is waiting
            </Link>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setUnscoreable(null)}
            >
              Dismiss
            </Button>
          </p>
        </Callout>
      )}

      {/* The employee's own half of the exception the cycle screen shows HR. A
          person nobody is appraising finishes the period with no mark, and being
          the last to hear about your own missing appraiser is the worst possible
          order to find out in. */}
      {noAppraiser && (
        <Callout tone="warning" title="Nobody is appraising you in this cycle">
          <p>{noAppraiser.message}</p>
          <p className="mt-2">
            Your self-review still counts and still goes in. What is missing is
            somebody to write the manager review, which is the rating of record —
            ask whoever runs the cycle to set a manager on your record or assign
            an appraiser.
          </p>
        </Callout>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Forms waiting on you" value={String(owed.length)} />
        <Stat
          label="Ratings needing your answer"
          value={String(owesAnswer.length)}
          {...(owesAnswer.length > 0
            ? { hint: "Acknowledge it or say you disagree" }
            : {})}
        />
        <Stat label="Reviews about you" value={String(record.length)} />
        <Stat
          label="Current cycle"
          value={openCycle ? openCycle.name : "None running"}
          {...(openCycle ? { hint: `At ${openCycle.stageLabel}` } : {})}
        />
      </div>

      {/* The last step of the simple path: set goals, one manager agrees, rate
          once, the employee acknowledges. Its own card and above the work list,
          because a rating nobody has answered is the exposure this whole feature
          exists to close — and because silence is not acceptance, so it cannot be
          left to be noticed. */}
      {owesAnswer.length > 0 && (
        <Card>
          <CardHeader
            title="Your rating is final"
            description="Read it, then acknowledge that you have seen it or say formally that you do not accept it. Acknowledging is not agreeing."
            action={
              <Badge tone="accent" size="sm" icon={<ShieldCheck aria-hidden="true" />}>
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

      <Card>
        <CardHeader
          title="Waiting on you"
          description={
            /* With several appraisers per person, "your reports" is wrong: a
               functional manager owes forms for people who report elsewhere. */
            features.multiAppraiser
              ? "Your own review, and one for each person you appraise."
              : "Your own review, and one for each person who reports to you."
          }
        />
        {appraisals.loading ? (
          <CardBody className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </CardBody>
        ) : owed.length === 0 ? (
          <EmptyState
            compact
            icon={<ClipboardList aria-hidden="true" />}
            title="Nothing to fill in"
            description="When a cycle starts, your form turns up here."
          />
        ) : (
          <CardBody className="flex flex-col gap-2">
            {owed.map((review) => (
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

      <Card>
        <CardHeader
          title="What was said about you"
          description="Yours to read once your rating is final, or once the cycle is published — whichever comes first."
          {...(answered.length > 0
            ? {
                action: (
                  <Badge tone="neutral" size="sm">
                    {answered.length === 1
                      ? "1 answered"
                      : `${answered.length} answered`}
                  </Badge>
                ),
              }
            : {})}
        />
        {record.length === 0 ? (
          <EmptyState
            compact
            icon={<MessagesSquare aria-hidden="true" />}
            title="Nothing published yet"
            description="A manager's review reaches you when the cycle closes, not before."
          />
        ) : (
          <CardBody className="flex flex-col gap-2">
            {record.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                context="record"
                actionLabel="Read it"
                onOpen={() => setOpened(review.id)}
              />
            ))}
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader title="Peer feedback" />
        <CardBody className="flex flex-col gap-4">
          <p className="text-body-sm text-body">
            Peer feedback is anonymous. No name is attached to an answer.
          </p>
          {appraisals.mine.peerFeedback.length === 0 ? (
            <p className="text-body-sm text-muted">
              Nothing from colleagues yet.
            </p>
          ) : (
            appraisals.mine.peerFeedback.map((entry) => (
              <PeerBlock key={entry.cycleId} entry={entry} />
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="What an appraisal is made of"
          description="Four parts, shipped ready. Rename or switch off any of them in settings."
        />
        {framework.loading ? (
          <CardBody className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading the framework
          </CardBody>
        ) : framework.groups.length === 0 ? (
          <EmptyState
            compact
            icon={<Layers aria-hidden="true" />}
            title="No framework yet"
            description="Finish setup and the four standard parts are created for you."
          />
        ) : (
          <CardBody className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {framework.groups.map((group) => (
              <div key={group.category}>
                <p className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-ink">
                  {group.category}
                  {group.category === "Leadership" && (
                    <Badge tone="neutral" size="sm">
                      Managers only
                    </Badge>
                  )}
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {group.competencies.map((competency) => (
                    <li key={competency.id} className="text-body-sm text-body">
                      {competency.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardBody>
        )}
      </Card>

      {canManage && (
        <Card>
          <CardHeader
            title="Cycles"
            {...(cycles.editable
              ? {
                  description:
                    "Nudges show up in the app. Email is not connected.",
                }
              : {})}
          />
          {appraisals.cycles.length === 0 ? (
            <EmptyState
              compact
              icon={<ClipboardList aria-hidden="true" />}
              title="No cycles yet"
              description="Create one, add the questions, then start it."
              action={
                cycles.editable ? (
                  <Button variant="accent" onClick={() => setCreatingCycle(true)}>
                    New cycle
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <CardBody className="flex flex-col gap-2">
              {appraisals.cycles.map((cycle) => (
                <div
                  key={cycle.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3"
                >
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-ink">
                      {cycle.name}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-meta text-muted">
                      <Badge
                        tone={cycle.stage === "PUBLISHED" ? "neutral" : "info"}
                        size="sm"
                        dot
                      >
                        {cycle.stageLabel}
                      </Badge>
                      <span>
                        {cycle.questionCount === 1
                          ? "1 question"
                          : `${cycle.questionCount} questions`}
                      </span>
                      <span>
                        {cycle.reviewCount === 1
                          ? "1 form"
                          : `${cycle.reviewCount} forms`}
                      </span>
                      {cycle.dueDate && <span>Due {dayLabel(cycle.dueDate)}</span>}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {/* The cycle screen is the read: who is outstanding, who has
                        nobody appraising them, where every mark stands. It works
                        for anybody holding the records permission, which is not
                        the same set as the people who can start a cycle. */}
                    {cycle.stage !== "DRAFT" && (
                      <ButtonLink
                        size="sm"
                        href={`/performance/cycles/${cycle.id}`}
                      >
                        Who is outstanding
                      </ButtonLink>
                    )}
                  </div>

                  {cycles.editable && (
                    <div className="flex flex-wrap gap-2">
                      {cycle.stage === "DRAFT" && (
                        <>
                          <Button size="sm" onClick={() => setQuestionsFor(cycle)}>
                            Questions
                          </Button>
                          {cycle.questionCount > 0 && (
                            <Button
                              variant="accent"
                              size="sm"
                              onClick={() => void startCycle(cycle)}
                            >
                              Start it
                            </Button>
                          )}
                        </>
                      )}
                      {cycle.stage !== "DRAFT" && cycle.stage !== "PUBLISHED" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() =>
                              void run(
                                () => cycles.remind(cycle.id),
                                "Nudged everyone who is late",
                              )
                            }
                          >
                            Nudge who is late
                          </Button>
                          <Button
                            size="sm"
                            onClick={() =>
                              void run(
                                () => cycles.publish(cycle.id),
                                `${cycle.name} published`,
                              )
                            }
                          >
                            Publish results
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </CardBody>
          )}
        </Card>
      )}

      {opened && (
        <ReviewFormModal
          reviewId={opened}
          onClose={() => setOpened(null)}
          onDone={appraisals.reload}
        />
      )}

      {questionsFor && (
        <QuestionsDialog
          cycleId={questionsFor.id}
          cycleName={questionsFor.name}
          onClose={() => {
            setQuestionsFor(null);
            appraisals.reload();
          }}
          onAdd={(body) => cycles.addQuestion(questionsFor.id, body).then(() => {})}
          onRemove={(id) => cycles.removeQuestion(id).then(() => {})}
        />
      )}

      {creatingCycle && (
        <NewCycleDialog
          onClose={() => setCreatingCycle(false)}
          onCreate={async (name, dueDate) => {
            const ok = await run(
              () => cycles.createCycle(name, dueDate),
              `${name} created`,
            );
            if (ok) setCreatingCycle(false);
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

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
 * One cycle's peer answers, pooled.
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
