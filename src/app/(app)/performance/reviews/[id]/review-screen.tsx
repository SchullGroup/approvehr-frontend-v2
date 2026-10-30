"use client";

import { useState } from "react";
import { FileQuestion, LineChart, ShieldCheck } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  AttentionMark,
  Disclosure,
  EmptyState,
  Spinner,
  Stat,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  dayLabel,
  dayOf,
  ratingWordsFrom,
  scoreLabel,
  showsOverallMark,
  visibleComponents,
  weightLabel,
  weightsFromNote,
  type ApiComponentScore,
  type ApiEmployeeScore,
  type ApiReviewDetail,
} from "@/lib/api/performance";
import {
  evidenceLine,
  leftOutLabels,
  leftOutNote,
  setAtNote,
} from "@/lib/performance/score-wording";
import { useCan } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import {
  useEmployeeScore,
  useRatingScale,
  useReview,
  useReviewFlag,
  useSignOff,
  useSubjectSelfReview,
} from "@/lib/store/performance";
import { AppraiserStrip } from "../../review-parts";
import { WorkEvidence } from "@/components/performance/work-evidence";
import { FinaliseDialog } from "./finalise-dialog";
import { ReviewFormCard } from "./review-form-card";
import { SignOffDialog } from "./sign-off-dialog";
import {
  RecordCheck,
  StatusBadge,
} from "@/components/performance/record-check";

/**
 * One appraisal, projected by who is reading it.
 *
 * ## The projection, and why it is three lines rather than three routes
 *
 * | Reader | What is different |
 * |---|---|
 * | The person it is about | the answer they owe: acknowledge it |
 * | The person who wrote it | the form, and finalising it into the mark of record |
 * | Records permission | both of the above, read-only, plus recording a dispute if the subject does not accept it |
 *
 * Everything else — the mark, the answers, what the mark is made of — is the same
 * document for all three. The incumbent ships `self-appraisal`,
 * `manager-appraisal`, `manager-view` and `hr-view` as four routes over one
 * record; the reading is decided here, from `review.mine`, the subject id and one
 * permission, and the API refuses anything the projection would have hidden
 * anyway. A screen that only *hides* a control is a screen where the API is the
 * real gate, which is exactly the arrangement to want.
 *
 * ## The rating and the score are different figures and both can be absent
 *
 * `rating` is one person's overall mark out of five. `scoreBp` is the composite
 * over the weighted components. Neither is rendered as 0 when it is missing: "no
 * overall mark" is a form the author chose not to put a number on, and "no score"
 * is a person nothing counted for. Printing a zero for either is a claim about
 * somebody that is not true.
 *
 * ## The form is read here and answered on its own page
 *
 * This page is the record. Answering is one implementation — the full-page,
 * one-question-at-a-time form at `/performance/reviews/[id]/answer` — and this
 * links to it rather than growing a second one: a read-only copy of a form
 * drifts until it renders a question the form has stopped asking.
 */
export function ReviewScreen({ reviewId }: { reviewId: string }) {
  const { review: fresh, loading, error, reload } = useReview(reviewId);
  /* The last appraisal that loaded, shown while the next one is on its way.
     `reload` empties the answer until the new one lands, which blanked the whole
     page to a spinner — and took the dialog that had just recorded something
     with it. Only while it is loading: an answer that failed is not papered
     over with a stale one. */
  const [kept, setKept] = useState<ApiReviewDetail | null>(null);
  if (fresh && fresh !== kept) setKept(fresh);
  const review = fresh ?? (loading && kept?.id === reviewId ? kept : null);
  /* The company's own words. A record of a mark is the last place that should
     be quoting a scale the company renamed — it is the screen somebody reads
     when they are being told what they were marked. */
  const { scale } = useRatingScale();
  const ratingWords = ratingWordsFrom(scale.levels);
  const { actingId } = useSession();
  const canSeeCompany = useCan("EDIT_RECORDS");
  const canSeeFairness = useCan("VIEW_FAIRNESS");
  const signOff = useSignOff();
  const toast = useToast();

  const [signingOff, setSigningOff] = useState(false);
  const [finalising, setFinalising] = useState(false);

  const isSubject = review !== null && review.subjectId === actingId;

  /* What the employee said about their own period, for an appraiser writing
     theirs. Every piece of this already existed — the permission, the query and
     a typed API wrapper with no consumers — and no screen ever asked. */
  const { selfReview, loading: selfLoading } = useSubjectSelfReview(review);

  /* Only a manager review carries a rating of record, so it is the only kind
     with a composite behind it. A self-review is an input to the conversation and
     peer feedback reaches its subject as an aggregate nobody signs. */
  const score = useEmployeeScore(
    review?.cycleId ?? null,
    review?.subjectId ?? null,
    review !== null &&
      review.kind === "MANAGER" &&
      (isSubject || review.mine || canSeeCompany),
  );

  const record = useReviewFlag(
    review?.cycleId ?? null,
    review?.subjectId ?? null,
    review !== null &&
      review.kind === "MANAGER" &&
      canSeeFairness &&
      !isSubject &&
      !review.mine,
  );

  if (loading && !review) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ href: "/performance", label: "Performance" }]}
          title="Appraisal"
        />
        <PageBody className="flex items-center gap-2 py-16 text-body-sm text-muted">
          <Spinner size="sm" />
          Loading the appraisal
        </PageBody>
      </>
    );
  }

  if (!review) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ href: "/performance", label: "Performance" }]}
          title="Appraisal"
        />
        <PageBody>
          {/* The API answers 404 rather than 403 for a review somebody may not
              read, deliberately: a 403 confirms that a review of this person
              exists in this period, which is most of what a curious colleague
              wanted to know. So this cannot say "you are not allowed". */}
          <EmptyState
            icon={<FileQuestion aria-hidden="true" />}
            title="That appraisal is not available to you"
            description={
              error?.message ??
              "Either it does not exist or it is not yours to read."
            }
          />
        </PageBody>
      </>
    );
  }

  /* One write, and no announcement: acknowledging and finalising each turn
     their own dialog into the statement of what was recorded, so a toast on top
     of it would say it twice. A failure is still a toast, and leaves the dialog
     on its question. */
  const settle = async <T,>(
    action: () => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false }> => {
    try {
      const value = await action();
      reload();
      score.reload();
      return { ok: true, value };
    } catch (caught) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
      return { ok: false };
    }
  };

  const mayFinalise =
    review.kind === "MANAGER" &&
    review.submitted &&
    !review.finalised &&
    (review.mine || canSeeCompany);

  /* The subject owes an acknowledgement only once the mark is theirs, and
     only once. Disputing is no longer something they do here — see the
     callout below and `assertMayDispute` on the API, which is the actual
     gate this mirrors. */
  const owesAcknowledgement =
    isSubject && review.finalised && !review.acknowledged && !review.disputed;

  const answered = review.acknowledged || review.disputed;

  /* Whether anything on this page speaks of an overall mark. The company's
     setting says whether its forms end with one, and a mark already given is
     shown whatever the setting says now. See `showsOverallMark`. */
  const markShown = showsOverallMark(review);
  /* With their self review in, the two overall marks are one row of the
     comparison below, side by side. Said again in this card they would be said
     twice, the manager's here and both there. */
  const comparing = review.kind === "MANAGER" && selfReview !== null;

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
        title={review.kindLabel}
        meta={
          <>
            <Badge
              tone={review.submitted ? "neutral" : "warning"}
              size="sm"
              dot
            >
              {review.submitted ? "Sent" : "Not sent yet"}
            </Badge>
            {review.finalised && (
              <Badge tone="accent" size="sm">
                Final
              </Badge>
            )}
            {review.acknowledged && (
              <Badge tone="success" size="sm">
                Acknowledged
              </Badge>
            )}
            {review.disputed && (
              <Badge tone="danger" size="sm">
                Disputed
              </Badge>
            )}
          </>
        }
        /* One mark is not a judgement about somebody — it is one point on a
           line, and the line already exists and is already permissioned
           (`assertSeesEmployee`: self, direct report, or `EDIT_RECORDS`). The
           register row and the record page both link to it; the screen where
           somebody is actually deciding a rating was the one place that did
           not, which is exactly where the previous periods matter most. */
        action={
          <ButtonLink
            href={`/performance/history/${review.subjectId}`}
            variant="secondary"
            size="sm"
          >
            <LineChart aria-hidden="true" className="size-3.5" />
            {isSubject ? "My previous marks" : "Previous marks"}
          </ButtonLink>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-6">
          {/* Which reading this is. One route serves every reader, so saying so
              saves somebody wondering why a colleague sees a button they do not.

              **Not to the subject.** "You are reading this as the person it is
              about" tells somebody opening their own appraisal a thing they
              knew before they clicked, at the top of the screen, in the place
              a reader looks first. The line earns its space for the other
              three readings, where the asymmetry is real. */}
          {!isSubject && (
            <p className="text-body-sm text-muted">
              {review.mine
                ? "You are reading this as the person who wrote it."
                : canSeeCompany
                  ? "You are reading this with the records permission."
                  : "You are reading this as their manager."}
            </p>
          )}

          {owesAcknowledgement && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-body-sm">
              <span className="font-medium text-ink">
                Your rating is final and needs your response
              </span>
              <AttentionMark
                text={[
                  `Your rating for ${review.cycleName} is final. Please acknowledge that you have seen it. The date is recorded.`,
                  "Acknowledging is not agreeing. It only records that you have seen your rating.",
                ]}
              />
              <Button
                variant="accent"
                size="sm"
                onClick={() => setSigningOff(true)}
              >
                I have seen this
              </Button>
            </div>
          )}

          {/* -------------------------------------------------------- the mark */}
          <Card>
            <CardHeader
              title={
                review.kind === "MANAGER"
                  ? "The rating"
                  : markShown
                    ? "The self-rating"
                    : `The ${review.kindLabel.toLowerCase()}`
              }
              description={
                review.kind === "MANAGER"
                  ? "The appraiser's overall view, in their own words, with the date it was sent."
                  : markShown
                    ? "Shown beside the manager's rating. It does not count towards the final mark unless the company has turned that on."
                    : review.kind === "SELF"
                      ? "Shown beside the manager's review."
                      : undefined
              }
            />
            <CardBody className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                {/* Absent, never zero: a form the author chose not to put a
                    number on is not a form scored nought. And where the
                    company does not ask for an overall mark there is no row at
                    all: "None given" would read as something missing from a
                    form that never had a place for it. A mark somebody already
                    gave is shown whatever the setting says now. */}
                {markShown && !comparing && (
                  <Stat
                    label="Overall mark"
                    value={
                      review.rating === null
                        ? "None given"
                        : (ratingWords(review.rating) as string)
                    }
                    {...(review.rating === null
                      ? {
                          hint: "No overall mark. The answers stand on their own.",
                        }
                      : {})}
                  />
                )}
                <Stat
                  label="Written by"
                  value={
                    /* `Review.authorId` is not nullable, so a name is missing
                       only when the API withholds it — which it does for peer
                       feedback and nothing else. "Nobody yet" would read as a
                       pending event rather than a withheld fact. */
                    review.anonymous
                      ? "Not attributed"
                      : (review.authorName ?? "Not recorded")
                  }
                  {...(review.submittedAt
                    ? { hint: `Sent ${dayOf(review.submittedAt)}` }
                    : review.dueDate
                      ? { hint: `Due ${dayLabel(review.dueDate)}` }
                      : {})}
                />
              </div>

              {/* The third Stat here used to read "Rating of record — Yes /
                  Final on 3 September", which is what the "Final" badge at the
                  top of the page already says, in a heavier register, six
                  inches away. Two claims about one fact is the clutter the
                  feedback named; the date is worth keeping and a Stat is not
                  the shape for it.

                  In every other state something else on the screen already
                  says it: the callout above asks the subject for an answer, the
                  card below records the one they gave, and the footer tells an
                  appraiser what finalising will do. */}
              {review.finalisedAt && (
                <p className="text-body-sm text-muted">
                  Made final on {dayOf(review.finalisedAt)}.
                </p>
              )}

              {review.appraiser && (
                <AppraiserStrip
                  appraiser={review.appraiser}
                  mine={review.mine}
                />
              )}
            </CardBody>

            {mayFinalise && (
              <CardFooter className="flex-col items-start gap-2 sm:flex-row sm:items-center">
                <p className="text-body-sm text-body">
                  Making it final tells {review.subjectName} their rating. It
                  cannot be changed afterwards.
                </p>
                {signOff.canFinalise ? (
                  <Button
                    variant="approve"
                    size="sm"
                    onClick={() => setFinalising(true)}
                  >
                    Make it final
                  </Button>
                ) : (
                  <span className="text-body-sm text-muted">
                    {signOff.finaliseRefusal}
                  </span>
                )}
              </CardFooter>
            )}
          </Card>

          {/* What HR recommended as they made the rating final. Directly under
              the rating it travels with, because the person reads it with their
              rating and a card at the foot of a long page is one they can
              acknowledge without ever reaching. Absent when there is none: a
              card saying HR recommended nothing would be a claim about a choice
              nobody made. */}
          {review.kind === "MANAGER" && review.hrRecommendation && (
            <Card>
              <CardHeader
                title="HR's recommendation"
                description={
                  review.finalisedAt
                    ? `Added when the rating was made final on ${dayOf(review.finalisedAt)}.`
                    : undefined
                }
              />
              <CardBody>
                <p className="text-body-sm leading-relaxed whitespace-pre-line text-ink">
                  {review.hrRecommendation}
                </p>
              </CardBody>
            </Card>
          )}

          {/* --------------------------------------------- the employee's answer */}
          {answered && (
            <Card>
              <CardHeader
                title={review.disputed ? "Disputed" : "Acknowledged"}
                description={
                  review.disputed
                    ? "The rating stays as it is and the dispute is recorded beside it."
                    : "This shows the person has seen their rating. It does not mean they agree with it."
                }
              />
              <CardBody className="flex flex-col gap-2">
                <p className="text-body-sm text-body">
                  {review.subjectName}{" "}
                  {review.disputed ? "disputed this" : "acknowledged this"} on{" "}
                  {dayOf(
                    (review.disputedAt ?? review.acknowledgedAt) as string,
                  )}
                  .
                </p>
                {review.employeeComment ? (
                  <p className="border-l-2 border-line-strong pl-3 text-body-sm leading-relaxed text-ink">
                    {review.employeeComment}
                  </p>
                ) : (
                  <p className="text-body-sm text-muted">
                    They did not add a comment.
                  </p>
                )}
              </CardBody>
            </Card>
          )}

          {/* ------------------------------------------- what the mark is made of */}
          {review.kind === "MANAGER" && (
            <ScorePanel
              score={score.score}
              loading={score.loading}
              subjectName={review.subjectName}
              overallMark={review.overallMark}
              message={score.available ? score.error?.message : score.refusal}
            />
          )}

          {review.kind === "MANAGER" && record.flag && (
            <Card>
              <CardHeader
                title="Mark against the evidence"
                description="Their mark beside what their objectives, peer feedback and past marks suggest. Their manager doesn't see this."
                action={<StatusBadge status={record.flag.status} />}
              />
              <CardBody>
                <RecordCheck
                  cycleId={review.cycleId}
                  flag={record.flag}
                  claims={record.claims}
                />
              </CardBody>
            </Card>
          )}
          {/* ---------------------------------------- tickets from connected tools */}
          <WorkEvidence
            employeeId={review.subjectId}
            range={review.cycleId ? { cycleId: review.cycleId } : {}}
            title="Work from connected tools this period"
          />

          {/* ------------------------------------------------------------- the form */}
          <ReviewFormCard
            review={review}
            selfReview={selfReview}
            selfLoading={selfLoading}
            ratingWords={ratingWords}
          />
        </div>
      </PageBody>

      {signingOff && (
        <SignOffDialog
          review={review}
          ratingLabel={
            review.rating === null ? null : ratingWords(review.rating)
          }
          onClose={() => setSigningOff(false)}
          onConfirm={async (comment) => {
            const outcome = await settle(() =>
              signOff.acknowledge(review, comment),
            );
            return outcome.ok
              ? { at: outcome.value?.acknowledgedAt ?? null }
              : null;
          }}
        />
      )}

      <FinaliseDialog
        open={finalising}
        review={review}
        canRecommend={canSeeCompany}
        onClose={() => setFinalising(false)}
        onConfirm={async (recommendation) => {
          const outcome = await settle(() =>
            signOff.finalise(review.id, recommendation),
          );
          return outcome.ok
            ? { subjectNotified: outcome.value.subjectNotified }
            : null;
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * What the composite mark is made of, component by component.
 *
 * This panel is the answer to "why is my score what it is", which is the
 * question the whole module exists to be able to answer. Three rules it keeps:
 *
 * - **An excluded component is shown, with its reason, and never as a zero.**
 *   "Rated 0 on leadership" and "manages nobody, so not rated" are different
 *   claims and the API sends the reason for exactly this.
 * - **The weight it actually carried is shown beside the weight the company
 *   set**, because when a component drops out the rest are renormalised and a
 *   reader comparing 25% to a mark computed over 33% cannot check the sum.
 * - **The appraisers' own overall mark is shown apart from the score**, because
 *   it is not in it. Weighting the same judgement twice is the defect in the
 *   incumbent's formula, not a feature to copy.
 */
function ScorePanel({
  score,
  loading,
  message,
  subjectName,
  overallMark,
}: {
  score: ApiEmployeeScore | null;
  loading: boolean;
  message: string | undefined;
  subjectName: string;
  /** The company's setting, from the review. See `showsOverallMark`. */
  overallMark: boolean | undefined;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader title="What the mark is made of" />
        <CardBody className="flex items-center gap-2 text-body-sm text-muted">
          <Spinner size="sm" />
          Loading the score
        </CardBody>
      </Card>
    );
  }

  if (!score) {
    return (
      <Card>
        <CardHeader title="What the mark is made of" />
        <CardBody>
          {/* The API's own sentence, whatever it is — including "your rating is
              not final yet", which is a refusal with a reason rather than an
              error. Rendering a blank panel here would look like a score of
              nothing. */}
          <p className="text-body-sm leading-relaxed text-body">
            {message ?? "There is no score for this period yet."}
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="What the mark is made of" />
      <CardBody className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Overall score"
            /* An em dash, not a sentence — the reason lives in `hint`
               already, and a dash reads as the same kind of thing as the
               percentage it stands in for. */
            value={
              score.scoreBp === null ? (
                <span className="text-faint">—</span>
              ) : (
                scoreLabel(score.scoreBp)
              )
            }
            hint={
              score.scoreBp === null
                ? "Nothing recorded yet, so there is no score"
                : "Built from the parts that have something recorded"
            }
          />
          {/* Only where the company asks for an overall mark, or an appraiser
              already gave one. Otherwise this is a dash under a heading about
              a figure nobody can enter. */}
          {showsOverallMark({
            rating: score.appraiserMark.ratingBp,
            overallMark,
          }) && (
            <Stat
              /* Read across the scale rather than out of five: it is a weighted
               average across several appraisers, so it does not land on a whole
               mark, and rounding it to one would throw a judgement away. */
              label="Appraisers' overall rating"
              value={
                score.appraiserMark.ratingBp === null ? (
                  <span className="text-faint">—</span>
                ) : (
                  scoreLabel(score.appraiserMark.ratingBp)
                )
              }
              hint={
                score.appraiserMark.appraisers <= 1
                  ? "For reference. It does not count towards the score."
                  : `${weightLabel(score.appraiserMark.submittedWeightBp)} of the weight is in, across ${score.appraiserMark.appraisers} appraisers. For reference; it does not count towards the score.`
              }
            />
          )}
          <Stat
            label="Objectives agreed"
            value={String(score.objectives.agreed)}
            hint={
              score.objectives.awaitingApproval > 0
                ? `${score.objectives.awaitingApproval} still waiting to be agreed`
                : score.objectives.agreed === 0
                  ? "None agreed for this period"
                  : `${score.objectives.measured} of them measured`
            }
          />
        </div>

        {/* Why the parts that count are counting for more than was set, said
            once and naming what was left out. On each part it was the same
            sentence four times. */}
        {leftOutNote(leftOutLabels(score.components)) && (
          <p className="text-body-sm text-body">
            {leftOutNote(leftOutLabels(score.components))}
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {visibleComponents(score.components).map((component) => (
            <ComponentRow key={component.component} component={component} />
          ))}
        </ul>

        {score.unmappedRatings > 0 && (
          <p className="text-body-sm text-muted">
            {score.unmappedRatings === 1
              ? "1 rating belongs to a category that no part of the mark uses, so it is not in the score."
              : `${score.unmappedRatings} ratings belong to categories that no part of the mark uses, so they are not in the score.`}
          </p>
        )}

        {score.exceptions.length > 0 && (
          <div className="flex flex-col gap-2">
            {score.exceptions.map((issue) => (
              <p
                key={issue.code}
                className={
                  issue.severity === "BLOCKER"
                    ? "text-body-sm text-danger-text"
                    : "text-body-sm text-muted"
                }
              >
                {issue.message}
              </p>
            ))}
          </div>
        )}

        {/* Two paragraphs about how the product computes, on the screen where
            somebody reads what was decided about them. Both are true and worth
            keeping — one is the difference between a mark that can be moved
            later and one that cannot — and neither is what the reader came for.
            `PARITY.md` Rule 5: reference-shaped detail goes behind a reveal,
            and what needs acting on stays open. Nothing here needs acting on;
            the exceptions above do, and they are outside it. */}
        <Disclosure
          level={4}
          dense
          title="How this score is put together"
          hint="The weights used, and why the figures are whole numbers."
        >
          <div className="flex flex-col gap-3 text-body-sm leading-relaxed text-body">
            <p>
              {score.weightsFrom === "period"
                ? weightsFromNote("period")
                : score.weightsFrom === "snapshot"
                  ? "Scored on the weights locked in when this period started. Changing the company's weights later will not move this mark."
                  : "Scored on the company's weights as they are today. This period never locked in its own set, so changing the company's weights would change this mark, even though it has already been given."}
            </p>
            <p className="flex items-start gap-2 text-muted">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              <span>
                Scores are worked out in whole numbers, so {subjectName}&apos;s
                mark comes out exactly the same every time it is worked out.
              </span>
            </p>
          </div>
        </Disclosure>
      </CardBody>
    </Card>
  );
}

/** One component: what it scored, what it was worth, and why if it was left out. */
function ComponentRow({ component }: { component: ApiComponentScore }) {
  const setAt = setAtNote(component);
  return (
    <li className="rounded-md border border-line p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-body-sm font-medium text-ink">
          {component.label}
        </span>
        <span className="tabular flex flex-wrap items-center gap-2 text-body-sm">
          {/* Absent is absent. A component with nothing recorded prints the
              words, never a 0% that reads as a mark somebody was given. */}
          {component.scoreBp === null ? (
            <span className="text-muted">Nothing recorded</span>
          ) : (
            <span className="text-ink">{scoreLabel(component.scoreBp)}</span>
          )}
          <Badge tone={component.included ? "accent" : "neutral"} size="sm">
            {component.included
              ? `counts for ${weightLabel(component.effectiveWeightBp)}`
              : "not counted"}
          </Badge>
        </span>
      </div>

      {/* Three cases, each saying only what is specific to the row. A part left
          out says why, in the API's words, because that is different every
          time. A part counting for something other than the company set says
          what was set, since the badge beside it has the other figure; why it
          moved is said once above the list. A part counting for exactly what was
          set says nothing, because the badge already did. */}
      {component.excludedNote ? (
        <p className="mt-1.5 text-body-sm text-body">
          {component.excludedNote}
        </p>
      ) : setAt ? (
        <p className="mt-1.5 text-body-sm text-body">{setAt}</p>
      ) : null}

      <p className="mt-1 text-meta text-muted">{evidenceLine(component)}</p>
    </li>
  );
}
