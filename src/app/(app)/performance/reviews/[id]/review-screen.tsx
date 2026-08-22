"use client";

import { useState } from "react";
import { FileQuestion, ShieldCheck } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Callout,
  ConfirmDialog,
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
  scoreLabel,
  weightLabel,
  type ApiComponentScore,
  type ApiEmployeeScore,
  type ApiReviewDetail,
} from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import {
  useEmployeeScore,
  useReview,
  useSignOff,
} from "@/lib/store/performance";
import { ReviewFormModal } from "../../review-form";
import { AppraiserStrip, ReadAnswer, draftFrom } from "../../review-parts";
import { SignOffDialog, type SignOffAct } from "./sign-off-dialog";

/**
 * One appraisal, projected by who is reading it.
 *
 * ## The projection, and why it is three lines rather than three routes
 *
 * | Reader | What is different |
 * |---|---|
 * | The person it is about | the answer they owe: acknowledge or dispute |
 * | The person who wrote it | the form, and finalising it into the mark of record |
 * | Records permission | both of the above, read-only, plus the employee's answer |
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
 * ## The form is read here and answered in the modal
 *
 * This page is the record. Answering is one implementation, in
 * `ReviewFormModal`, and this opens it rather than growing a second one — a
 * read-only copy of a form drifts until it renders a question the form has
 * stopped asking.
 */
export function ReviewScreen({ reviewId }: { reviewId: string }) {
  const { review, loading, error, reload } = useReview(reviewId);
  const { actingId } = useSession();
  const canSeeCompany = useCan("EDIT_RECORDS");
  const signOff = useSignOff();
  const toast = useToast();

  const [answering, setAnswering] = useState(false);
  const [signingOff, setSigningOff] = useState<SignOffAct | null>(null);
  const [finalising, setFinalising] = useState(false);

  const isSubject = review !== null && review.subjectId === actingId;

  /* Only a manager review carries a rating of record, so it is the only kind
     with a composite behind it. A self-review is an input to the conversation and
     peer feedback reaches its subject as an aggregate nobody signs. */
  const score = useEmployeeScore(
    review?.cycleId ?? null,
    review?.subjectId ?? null,
    review !== null && review.kind === "MANAGER" && (isSubject || review.mine || canSeeCompany),
  );

  if (loading) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ href: "/performance", label: "KPIs & appraisals" }]}
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
          breadcrumb={[{ href: "/performance", label: "KPIs & appraisals" }]}
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

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.push({ title: success, tone: "success" });
      reload();
      score.reload();
      return true;
    } catch (caught) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
      return false;
    }
  };

  const mayFinalise =
    review.kind === "MANAGER" &&
    review.submitted &&
    !review.finalised &&
    (review.mine || canSeeCompany);

  /* The subject owes an answer only once the mark is theirs, and only once. */
  const owesAnswer =
    isSubject && review.finalised && !review.acknowledged && !review.disputed;

  const answered = review.acknowledged || review.disputed;

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "KPIs & appraisals" }]}
        title={review.kindLabel}
        description={
          review.kind === "SELF" && isSubject
            ? "Your own words about your own work."
            : `About ${review.subjectName}. ${review.cycleName}.`
        }
        meta={
          <>
            <Badge tone={review.submitted ? "neutral" : "warning"} size="sm" dot>
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
      />

      <PageBody>
        <div className="flex flex-col gap-6">
          {/* Which reading this is. One route serves every reader, so saying so
              costs a line and saves somebody wondering why a colleague sees a
              button they do not. */}
          <p className="text-body-sm text-muted">
            {isSubject
              ? "You are reading this as the person it is about."
              : review.mine
                ? "You are reading this as the person who wrote it."
                : canSeeCompany
                  ? "You are reading this with the records permission."
                  : "You are reading this as their manager."}
          </p>

          {owesAnswer && (
            <Callout tone="accent" title="This rating is final. It needs your answer">
              <p>
                You have been told your rating for {review.cycleName}. Acknowledge
                that you have seen it, or say formally that you do not accept it.
                Both are recorded; leaving it unanswered is not one of the two.
              </p>
              <p className="mt-2">
                <strong>Acknowledging is not agreeing.</strong> It records that
                you were shown this and nothing more.
              </p>
              <p className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => setSigningOff("acknowledge")}
                >
                  I have seen this
                </Button>
                <Button size="sm" onClick={() => setSigningOff("dispute")}>
                  I do not accept it
                </Button>
              </p>
            </Callout>
          )}

          {/* -------------------------------------------------------- the mark */}
          <Card>
            <CardHeader
              title={review.kind === "MANAGER" ? "The rating" : "The mark on it"}
              description={
                review.kind === "MANAGER"
                  ? "One person's overall judgement, in their own words, with the date it was sent."
                  : "A self-rating is collected and shown beside the manager's. It is weighted at zero unless the company deliberately turns it on."
              }
            />
            <CardBody className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                {/* Absent, never zero: a form the author chose not to put a
                    number on is not a form scored nought. */}
                <Stat
                  label="Overall mark"
                  value={
                    review.rating === null
                      ? "None given"
                      : `${review.rating} out of 5`
                  }
                  {...(review.rating === null
                    ? { hint: "The answers were the judgement" }
                    : {})}
                />
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
                <Stat
                  label="Rating of record"
                  value={review.finalised ? "Yes" : "Not yet"}
                  hint={
                    review.finalisedAt
                      ? `Final on ${dayOf(review.finalisedAt)}`
                      : "Until it is final, nothing has been told to anybody"
                  }
                />
              </div>

              {review.appraiser && (
                <AppraiserStrip
                  appraiser={review.appraiser}
                  subjectName={review.subjectName}
                  mine={review.mine}
                />
              )}

              {review.summary && (
                <div>
                  <p className="text-meta font-medium text-muted">In summary</p>
                  <p className="mt-1 text-body-sm leading-relaxed text-ink">
                    {review.summary}
                  </p>
                </div>
              )}
            </CardBody>

            {mayFinalise && (
              <CardFooter className="flex-col items-start gap-2 sm:flex-row sm:items-center">
                <p className="text-body-sm text-body">
                  Finalising makes this the rating of record and tells{" "}
                  {review.subjectName}. It cannot be re-marked afterwards.
                </p>
                {signOff.canFinalise ? (
                  <Button
                    variant="approve"
                    size="sm"
                    onClick={() => setFinalising(true)}
                  >
                    Make this the rating
                  </Button>
                ) : (
                  <span className="text-body-sm text-muted">
                    {signOff.finaliseRefusal}
                  </span>
                )}
              </CardFooter>
            )}
          </Card>

          {/* --------------------------------------------- the employee's answer */}
          {answered && (
            <Card>
              <CardHeader
                title={review.disputed ? "Disputed" : "Acknowledged"}
                description={
                  review.disputed
                    ? "The rating stands and the dispute is recorded beside it. Rewriting the mark would destroy the evidence of what was decided."
                    : "A record that this person was shown their rating. Not a record that they agreed with it."
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
                    They added nothing, which they were not obliged to.
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
              message={score.available ? score.error?.message : score.refusal}
              subjectName={review.subjectName}
            />
          )}

          {/* ------------------------------------------------------------- the form */}
          <Card>
            <CardHeader
              title="What was asked, and what was answered"
              description={
                review.outstanding.length === 0
                  ? "Every question on this form."
                  : `${review.outstanding.length === 1 ? "1 question" : `${review.outstanding.length} questions`} still unanswered.`
              }
              {...(review.mine && !review.submitted
                ? {
                    action: (
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={() => setAnswering(true)}
                      >
                        Fill it in
                      </Button>
                    ),
                  }
                : {})}
            />
            {review.questions.length === 0 ? (
              <EmptyState
                compact
                icon={<FileQuestion aria-hidden="true" />}
                title="This period asks nothing on this form"
                description="A form with no questions asks nobody anything. Add questions to the cycle."
              />
            ) : (
              <CardBody className="flex flex-col gap-4">
                {review.questions.map((question) => (
                  <ReadAnswer
                    key={question.id}
                    question={question}
                    held={draftFrom(question)}
                  />
                ))}
              </CardBody>
            )}
          </Card>
        </div>
      </PageBody>

      {answering && (
        <ReviewFormModal
          reviewId={review.id}
          onClose={() => setAnswering(false)}
          onDone={reload}
        />
      )}

      {signingOff && (
        <SignOffDialog
          act={signingOff}
          review={review}
          onClose={() => setSigningOff(null)}
          onConfirm={async (comment) => {
            const ok = await run(
              () =>
                signingOff === "acknowledge"
                  ? signOff.acknowledge(review, comment)
                  : signOff.dispute(review, comment ?? ""),
              signingOff === "acknowledge"
                ? "Acknowledgement recorded"
                : "Dispute recorded. The rating stands beside it",
            );
            if (ok) setSigningOff(null);
          }}
        />
      )}

      <FinaliseDialog
        open={finalising}
        review={review}
        onClose={() => setFinalising(false)}
        onConfirm={async () => {
          const ok = await run(
            () => signOff.finalise(review.id),
            `${review.subjectName} has been told their rating`,
          );
          if (ok) setFinalising(false);
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Finalising, behind a confirmation that names what it does.
 *
 * The same shape as approving a payroll run, and for the same reason: after it,
 * what the person is told is fixed. The confirmation names the person and the
 * mark rather than asking "are you sure" — an irreversible act with a generic
 * dialog in front of it is an irreversible act nobody read.
 */
function FinaliseDialog({
  open,
  review,
  onClose,
  onConfirm,
}: {
  open: boolean;
  review: ApiReviewDetail;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={onConfirm}
      title={`Make this ${review.subjectName}'s rating?`}
      confirmLabel="Make this the rating"
      tone="primary"
      body={
        <span>
          {review.subjectName} will be told, and will be asked to acknowledge it
          or dispute it.{" "}
          {review.rating === null
            ? "This form carries no overall mark, so what they read is the answers."
            : `The mark of record becomes ${review.rating} out of 5.`}{" "}
          It cannot be re-marked afterwards.
        </span>
      }
    />
  );
}

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
}: {
  score: ApiEmployeeScore | null;
  loading: boolean;
  message: string | undefined;
  subjectName: string;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader title="What the mark is made of" />
        <CardBody className="flex items-center gap-2 text-body-sm text-muted">
          <Spinner size="sm" />
          Working out the components
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
      <CardHeader
        title="What the mark is made of"
        description={
          score.weightsFrom === "snapshot"
            ? "The weights frozen onto this period when it started. A later change to the company's weights does not move this mark."
            : "The company's current weights. This period started before weights were frozen onto a period, so a change to them would move this mark."
        }
      />
      <CardBody className="flex flex-col gap-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Composite score"
            value={
              score.scoreBp === null ? "No mark" : scoreLabel(score.scoreBp)
            }
            hint={
              score.scoreBp === null
                ? "Nothing that counts has been recorded"
                : "Weighted over the components that carried data"
            }
          />
          <Stat
            /* Read across the scale rather than out of five: it is a weighted
               average across several appraisers, so it does not land on a whole
               mark, and rounding it to one would throw a judgement away. */
            label="Appraisers' mark, on the scale"
            value={
              score.appraiserMark.ratingBp === null
                ? "None in yet"
                : scoreLabel(score.appraiserMark.ratingBp)
            }
            hint={
              score.appraiserMark.appraisers <= 1
                ? "Deliberately not part of the score"
                : `${weightLabel(score.appraiserMark.submittedWeightBp)} of ${score.appraiserMark.appraisers} appraisers in — deliberately not part of the score`
            }
          />
          <Stat
            label="Objectives agreed"
            value={String(score.objectives.agreed)}
            hint={
              score.objectives.awaitingApproval > 0
                ? `${score.objectives.awaitingApproval} still waiting to be agreed`
                : `${score.objectives.measured} of them measured`
            }
          />
        </div>

        <ul className="flex flex-col gap-3">
          {score.components.map((component) => (
            <ComponentRow key={component.component} component={component} />
          ))}
        </ul>

        {score.unmappedRatings > 0 && (
          <p className="text-body-sm text-muted">
            {score.unmappedRatings === 1
              ? "1 rating was recorded against a category no component reads. It is counted here rather than dropped."
              : `${score.unmappedRatings} ratings were recorded against a category no component reads. They are counted here rather than dropped.`}
          </p>
        )}

        {score.exceptions.length > 0 && (
          <div className="flex flex-col gap-2">
            {score.exceptions.map((issue) => (
              <p
                key={issue.code}
                className={
                  issue.severity === "BLOCKER"
                    ? "rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink"
                    : "rounded-md border border-warning-line bg-warning-soft px-3.5 py-2.5 text-body-sm text-ink"
                }
              >
                {issue.message}
              </p>
            ))}
          </div>
        )}

        <p className="flex items-start gap-2 text-body-sm text-muted">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            Every figure here is a whole number of basis points, so{" "}
            {subjectName}&apos;s mark reproduces exactly. A score assembled from
            decimals does not, and one that does not reproduce cannot be
            defended.
          </span>
        </p>
      </CardBody>
    </Card>
  );
}

/** One component: what it scored, what it was worth, and why if it was left out. */
function ComponentRow({ component }: { component: ApiComponentScore }) {
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
              ? `carried ${weightLabel(component.effectiveWeightBp)}`
              : "not counted"}
          </Badge>
        </span>
      </div>

      <p className="mt-1.5 text-body-sm text-body">
        {component.excludedNote ??
          `Set at ${weightLabel(component.weightBp)} by the company, carried ${weightLabel(component.effectiveWeightBp)} here because components with no data were left out.`}
      </p>

      <p className="mt-1 text-meta text-muted">
        {component.evidenceCount === 0
          ? "No evidence behind this"
          : component.evidenceCount === 1
            ? "1 thing averaged"
            : `${component.evidenceCount} things averaged`}
      </p>
    </li>
  );
}
