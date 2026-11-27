"use client";

import { useState } from "react";
import { FileQuestion, LineChart } from "lucide-react";
import {
  AttentionMark,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  EmptyState,
  NextStep,
  Spinner,
  Tabs,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { AskPeersButton } from "../../periods/[id]/ask-peers";
import { ApiError } from "@/lib/api/client";
import {
  outcomeWords,
  ratingWordsFrom,
  scoreWords,
  showsOverallMark,
  weightsFromNote,
  type ApiEmployeeScore,
  type ApiReviewDetail,
} from "@/lib/api/performance";
import { appraiserStripLine } from "@/lib/performance/score-wording";
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
import { useProjectsGate } from "@/lib/store/project-session";
import { useWorkEvidence } from "@/lib/store/work-trackers";
import { WorkEvidence } from "@/components/performance/work-evidence";
import { WorkBehindTheMark } from "@/components/performance/kept-work";
import {
  ScoreParts,
  partScoreWords,
} from "@/components/performance/score-parts";
import { FinaliseDialog } from "./finalise-dialog";
import { ReviewFormCard, hasAnswers } from "./review-form-card";
import { SignOffDialog } from "./sign-off-dialog";
import { recordLine, recordStatus, recordTitle } from "./record-words";
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
 * The page does not say which reading it is. It used to open with "You are
 * reading this as the person who wrote it", which tells a reader what they did
 * not ask; what it says instead is whose appraisal this is, in the title.
 *
 * ## Tabs, not a stack of cards
 *
 * The record was up to eight cards one above the other, and the answers people
 * came for sat under the machinery. It is now a page with one status in its
 * header and one thing to do above the tabs, then:
 *
 * | Tab | What it holds | Who sees it |
 * |---|---|---|
 * | Rating | the rating, who wrote it and when, what the score is made of | everybody |
 * | Answers | the questions and what was answered, beside the self review | when there is something to read |
 * | Work | what was finished in the period (`WorkTab`) | when there is work to read |
 * | HR | the score against the evidence | only who may read it (`VIEW_FAIRNESS`, not the subject, not the author) |
 *
 * Nothing a reader could not see before is shown to them now: each tab is the
 * same gate around the same component, and a tab with nothing in it is not drawn.
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
  const projects = useProjectsGate();

  const [signingOff, setSigningOff] = useState(false);
  const [finalising, setFinalising] = useState(false);
  /* The tab somebody chose. Null until they do, so that what is open follows
     what there is (see `tabs`) rather than a default fixed before it is known. */
  const [chosen, setChosen] = useState<string | null>(null);

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

  /* Whether there is work to read, so that the Work tab is there only when it
     has something in it. The project boards' list is there whenever the company
     has Projects (and the kind is not peer feedback, which has none); what is
     left to ask is the connected tools' evidence, and only where the boards do
     not already settle it. */
  const boards = projects.enabled && review?.kind !== "PEER";
  const tools = useWorkEvidence(
    boards ? null : (review?.subjectId ?? null),
    review?.cycleId ? { cycleId: review.cycleId } : {},
  );
  const hasWork = boards || (tools.evidence?.tasks.length ?? 0) > 0;

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
            plain
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

  /* One write. Finalising turns its dialog into the statement of what was
     recorded, so a toast on top of it would say it twice; acknowledging closes
     its dialog and says "Acknowledged" in a toast. A failure is a toast, and
     leaves the dialog on its question. */
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
     only once. Disputing is no longer something they do here — see
     `SignOffDialog` and `assertMayDispute` on the API, which is the actual
     gate this mirrors. */
  const owesAcknowledgement =
    isSubject && review.finalised && !review.acknowledged && !review.disputed;

  /* The author's own form, not sent. Its next step is to fill it in, and that is
     all the page says about it. */
  const filling = review.mine && !review.submitted;

  /* Whether anything on this page speaks of an overall mark. The company's
     setting says whether its forms end with one, and a mark already given is
     shown whatever the setting says now. See `showsOverallMark`. */
  const markShown = showsOverallMark(review);
  /* The one answer the person is given, once there is one (U36). */
  const outcomeLine =
    review.kind === "MANAGER" ? outcomeWords(review.outcome) : null;
  /* With their self review in, the two overall marks are one row of the
     comparison on the Answers tab, side by side. Said again here they would be
     said twice. */
  const comparing = review.kind === "MANAGER" && selfReview !== null;
  /* The person it is about reads the one answer and no other figure: the
     author's own overall mark and the breakdown are for whoever decides. */
  const readsOutcomeOnly = isSubject && outcomeLine !== null;
  const ownMark =
    markShown && !comparing && review.rating !== null && !readsOutcomeOnly
      ? ratingWords(review.rating)
      : null;

  const tabs = [
    { id: "rating", label: "Rating" },
    ...(hasAnswers(review, selfReview)
      ? [{ id: "answers", label: "Answers" }]
      : []),
    ...(hasWork ? [{ id: "work", label: "Work" }] : []),
    ...(record.flag ? [{ id: "hr", label: "HR" }] : []),
  ];
  /* Open on the rating once there is one to read, and on the answers while the
     form is still being written. */
  const fallback =
    !review.submitted && tabs.some((tab) => tab.id === "answers")
      ? "answers"
      : "rating";
  const active =
    chosen !== null && tabs.some((tab) => tab.id === chosen)
      ? chosen
      : fallback;

  const status = recordStatus(review);

  const panel =
    active === "answers" ? (
      <ReviewFormCard
        review={review}
        selfReview={selfReview}
        selfLoading={selfLoading}
        ratingWords={ratingWords}
      />
    ) : active === "work" ? (
      <WorkTab review={review} own={isSubject} />
    ) : active === "hr" && record.flag ? (
      <Card>
        <CardBody>
          <RecordCheck
            cycleId={review.cycleId}
            flag={record.flag}
            claims={record.claims}
          />
        </CardBody>
      </Card>
    ) : (
      <RatingCard
        review={review}
        isSubject={isSubject}
        headline={outcomeLine ?? ownMark}
        rated={outcomeLine !== null && !isSubject ? ownMark : null}
        score={
          review.kind === "MANAGER" && !readsOutcomeOnly
            ? {
                score: score.score,
                loading: score.loading,
                message: score.available ? score.error?.message : undefined,
                showTotal: outcomeLine === null,
              }
            : null
        }
      />
    );

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "Performance" }]}
        title={recordTitle(review, isSubject)}
        subline={review.cycleName}
        meta={
          <>
            {/* One status. The ones that used to sit beside it (Sent, Final,
                Acknowledged) are the furthest of the four, and the dates are
                the line under the rating. A form being filled in says it as
                the next step below, and not here as well. */}
            {!filling && (
              <Badge tone={status.tone} size="sm">
                {status.label}
              </Badge>
            )}
            {/* The one thing the HR tab says that belongs in the header, for
                the people who can see it. */}
            {record.flag && <StatusBadge status={record.flag.status} />}
          </>
        }
        /* One mark is not a judgement about somebody — it is one point on a
           line, and the line already exists and is already permissioned
           (`assertSeesEmployee`: self, direct report, or `EDIT_RECORDS`). The
           register row and the record page both link to it; the screen where
           somebody is actually deciding a rating was the one place that did
           not, which is exactly where the previous periods matter most. */
        action={
          <>
            {/* The manager writing this review can ask the person's colleagues
                for feedback from here (UAT 23 Nov, U101 / PERF-21): it used to
                be one of three buttons on each row of HR's Marks table, and a
                line manager cannot open that page. The API lets the manager
                ask. Only while the period is running. */}
            {review.kind === "MANAGER" &&
              review.mine &&
              review.cycleStage !== "PUBLISHED" &&
              review.cycleStage !== "DRAFT" && (
                <AskPeersButton
                  cycleId={review.cycleId}
                  subjectId={review.subjectId}
                  subjectName={review.subjectName}
                  onAsked={() => undefined}
                />
              )}
            <ButtonLink
              href={`/performance/history/${review.subjectId}`}
              variant="secondary"
              size="sm"
            >
              <LineChart aria-hidden="true" className="size-3.5" />
              {isSubject ? "My previous scores" : "Previous scores"}
            </ButtonLink>
          </>
        }
      />

      <PageBody>
        <div className="flex flex-col gap-5">
          {/* The one thing to do. The subject's is a banner with one button, and
              what acknowledging means is one tooltip beside it. The author's
              and HR's are a next step, and only where it can be done: in the
              demo the rating cannot be made final, and a button that could
              only refuse is not drawn. */}
          {owesAcknowledgement && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-body-sm">
              <span className="font-medium text-ink">Your rating is final</span>
              <AttentionMark
                text="This records that you saw it, not that you agree."
                label="What acknowledging means"
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
          {filling && (
            <NextStep
              title="Not sent yet"
              action={{
                label: "Fill it in",
                href: `/performance/reviews/${review.id}/answer`,
              }}
            />
          )}
          {mayFinalise && signOff.canFinalise && (
            <NextStep
              title="Ready to make final"
              action={{
                label: "Make it final",
                onClick: () => setFinalising(true),
              }}
            />
          )}

          {tabs.length > 1 ? (
            <Tabs items={tabs} value={active} onChange={setChosen}>
              {panel}
            </Tabs>
          ) : (
            panel
          )}
        </div>
      </PageBody>

      {signingOff && (
        <SignOffDialog
          onClose={() => setSigningOff(false)}
          onConfirm={async (comment) => {
            const outcome = await settle(() =>
              signOff.acknowledge(review, comment),
            );
            if (outcome.ok)
              toast.push({ title: "Acknowledged", tone: "success" });
            return outcome.ok;
          }}
        />
      )}

      <FinaliseDialog
        open={finalising}
        review={review}
        /* Only where the server says it keeps one. A server that predates the
           recommendation ignores the body of the finalise, so a box offered
           there would be followed by "saved" for words nobody kept, on a
           rating that can no longer be changed. The key is on every review a
           server that has the field sends (`null` when there is none), so its
           being absent is the answer. */
        canRecommend={canSeeCompany && review.hrRecommendation !== undefined}
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
 * The Rating tab: one card with no heading.
 *
 * The rating large, in the company's words with its figure out of 5; one small
 * line under it saying who wrote it and when each thing happened (`recordLine`);
 * what the person said when they acknowledged it, if they said anything; what HR
 * recommended as it was made final, as text and nothing else; and what the score
 * is made of (`ScoreParts`).
 *
 * Every fact is said once. The card used to have a title and a description, three
 * stat tiles, a badge for each of Sent, Final and Acknowledged, "Made final on
 * 5 Sep" and a sentence under the button. What the appraiser's share of the score
 * is, and the rules about the breakdown, are tooltips.
 *
 * **HR's recommendation** travels with the rating, and the person reads it with
 * their rating, so it is here and not behind a tab only HR can open. It is absent
 * when there is none: a card saying HR recommended nothing would be a claim about
 * a choice nobody made.
 */
function RatingCard({
  review,
  isSubject,
  headline,
  rated,
  score,
}: {
  review: ApiReviewDetail;
  isSubject: boolean;
  /** The rating, in words, or null where there is none to say. */
  headline: string | null;
  /** The author's own overall rating, when the headline is the score of record. */
  rated: string | null;
  /** What the score is made of, for a manager review the reader may see it for. */
  score: {
    score: ApiEmployeeScore | null;
    loading: boolean;
    message: string | undefined;
    showTotal: boolean;
  } | null;
}) {
  const line = recordLine(review, { rated });
  const strip = review.appraiser
    ? [
        review.appraiser.note,
        appraiserStripLine({
          appraiser: review.appraiser,
          mine: review.mine,
          asksMark: review.overallMark === true,
        }),
      ]
    : [];

  return (
    <Card>
      <CardBody className="flex flex-col gap-5">
        {(headline || line || strip.some(Boolean)) && (
          <div className="flex flex-col gap-1.5">
            {headline && (
              <p className="tabular text-h3 font-semibold text-ink">
                {headline}
              </p>
            )}
            {(line || strip.some(Boolean)) && (
              <p className="flex flex-wrap items-center gap-x-2 text-body-sm text-muted">
                {line}
                <AttentionMark
                  tone="info"
                  text={strip}
                  label="About this appraiser"
                />
              </p>
            )}
          </div>
        )}

        {/* What the person said as they acknowledged it. It is theirs by being
            under their rating, so nothing here needs to say "you". */}
        {review.employeeComment && (
          <section aria-label={isSubject ? "Your comment" : "Their comment"}>
            <p className="border-l-2 border-line-strong pl-3 text-body-sm leading-relaxed whitespace-pre-line text-ink">
              {review.employeeComment}
            </p>
          </section>
        )}

        {review.kind === "MANAGER" && review.hrRecommendation && (
          <section aria-label="HR's recommendation">
            <p className="text-body-sm leading-relaxed whitespace-pre-line text-ink">
              {review.hrRecommendation}
            </p>
          </section>
        )}

        {score && <RatingParts {...score} />}
      </CardBody>
    </Card>
  );
}

/**
 * What the score is made of, on the record: the one list (`ScoreParts`) and, in
 * its one tooltip, the sentences that used to be a paragraph above it, a note
 * under each part, a line about ratings no part uses and a reveal below.
 *
 * Absent where there is nothing to say: no card saying there is no score. A
 * refusal ("your rating is not final yet") is a state the status badge already
 * names. A read that failed is a plain muted line, since that is the one thing
 * here somebody may need to know went wrong.
 */
function RatingParts({
  score,
  loading,
  message,
  showTotal,
}: {
  score: ApiEmployeeScore | null;
  loading: boolean;
  message: string | undefined;
  /** Before there is a rating of record, the score the parts add up to is the figure to read. */
  showTotal: boolean;
}) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-body-sm text-muted">
        <Spinner size="sm" />
        Loading the score
      </p>
    );
  }
  if (!score) {
    return message ? (
      <p className="text-body-sm text-muted">{message}</p>
    ) : null;
  }

  return (
    <ScoreParts
      components={score.components}
      {...(showTotal && score.scoreBp !== null
        ? {
            total: {
              scoreBp: score.scoreBp,
              /* The headline's own words: the band and the figure where the API
                 sent a band, the figure out of 5 where it did not. */
              words: score.bandLabel
                ? (scoreWords(score) ?? "")
                : partScoreWords(score.scoreBp),
            },
          }
        : {})}
      notes={[
        score.weightsFrom === "period"
          ? weightsFromNote("period")
          : score.weightsFrom === "current"
            ? "Scored on the company's weights as they are today. This period never locked in its own set, so changing the company's weights would change this score, even though it has already been given."
            : null,
        score.unmappedRatings === 1
          ? "1 rating belongs to a category that no part of the score uses, so it is not in the score."
          : score.unmappedRatings > 1
            ? `${String(score.unmappedRatings)} ratings belong to categories that no part of the score uses, so they are not in the score.`
            : null,
        ...score.exceptions.map((issue) => issue.message),
      ]}
    />
  );
}

/**
 * The Work tab: the two work components, as they are.
 *
 * Connected tools' tickets, and what was finished on the project boards (the
 * kept record where the rating is final and one was kept, the live list
 * otherwise). Kept as one small block so that what they say inside can change
 * without this screen changing.
 */
function WorkTab({ review, own }: { review: ApiReviewDetail; own: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      <WorkEvidence
        employeeId={review.subjectId}
        range={review.cycleId ? { cycleId: review.cycleId } : {}}
        title="Work from connected tools this period"
      />
      <WorkBehindTheMark
        reviewId={review.id}
        kind={review.kind}
        final={review.finalised}
        disputed={review.disputed}
        subjectId={review.subjectId}
        cycleId={review.cycleId}
        periodStart={review.periodStart}
        periodEnd={review.periodEnd}
        subjectName={review.subjectName}
        own={own}
      />
    </div>
  );
}
