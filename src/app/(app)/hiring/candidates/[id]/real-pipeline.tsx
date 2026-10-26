"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Briefcase, Plus, TriangleAlert } from "lucide-react";
import {
  Badge,
  Button,
  AttentionMark,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  DescriptionList,
  Field,
  Input,
  Modal,
  Money,
  ProgressMeter,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { AcceptOfferDialog } from "@/components/hiring/hired/accept-offer-dialog";
import { MoveEmailDialog } from "@/components/hiring/move-email-dialog";
import { OpenCv, useCanOpenCv } from "@/components/hiring/open-cv";
import {
  DeletionNotice,
  InterviewScoreCard,
  RecordEmails,
} from "@/components/hiring/record-comms";
import { InterviewsCard } from "@/components/hiring/interviews/interviews-card";
import { RecordTags } from "@/components/hiring/record-tags";
import { RejectDialog } from "@/components/hiring/reject-dialog";
import { ScorecardDialog } from "@/components/hiring/scorecard-dialog";
import { StageHistory } from "@/components/hiring/stage-history";
import { ExportButton } from "@/components/portal/export-button";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import { offerLetter } from "@/lib/api/exports";
import {
  RECOMMENDATION_LABEL,
  kobo,
  naira,
  recruitmentApi,
  type ApiApplicationDetail,
  type ApiStage,
  type UpdateOfferBody,
} from "@/lib/api/recruitment";
import { noticeSentence } from "@/lib/hiring/comms/status";
import { useConnectedInterviews } from "@/lib/hiring/interviews/use-connected-interviews";
import { acceptedNotice, whatAcceptingDoes } from "@/lib/hiring/hired/copy";
import { useHiredSettings } from "@/lib/hiring/hired/use-hired";
import type { ScorecardInput } from "@/lib/hiring/comms/model";
import { noticeFrom } from "@/lib/hiring/pipeline/api-gateway";
import { emailLogFrom, scoreFrom } from "@/lib/hiring/pipeline/api-comms";
import {
  useEmailReadiness,
  useStageMail,
} from "@/lib/hiring/pipeline/use-comms";
import {
  usePipelineGateway,
  useRejectionReasons,
} from "@/lib/hiring/pipeline/use-pipeline";
import { isTerminalType } from "@/lib/hiring/pipeline/stage-types";
import { useCan } from "@/lib/permissions";
import {
  useApplicationMutations,
  useCandidateMutations,
  useInterviewDetail,
  useInterviewMutations,
  useOfferMutations,
  useStages,
} from "@/lib/store/recruitment";
import { useOrgTimezone, useSession } from "@/lib/store/session";

/** What a scorecard form hands over, as the API's body. */
const scorecardBody = (input: ScorecardInput) => ({
  recommendation: input.recommendation,
  ...(input.notes.trim() ? { notes: input.notes.trim() } : {}),
  ratings: input.ratings.map((rating) => ({
    competency: rating.competency,
    score: rating.score,
    weight: rating.weight,
    ...(rating.comment.trim() ? { comment: rating.comment.trim() } : {}),
  })),
});

const OUTCOME_TONE = {
  IN_PROGRESS: "info",
  OFFER_MADE: "warning",
  HIRED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
} as const;

const OUTCOME_LABEL: Record<string, string> = {
  IN_PROGRESS: "In progress",
  OFFER_MADE: "Offer made",
  HIRED: "Hired",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

const OFFER_STATUS_TONE = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warning",
  SENT: "info",
  ACCEPTED: "success",
  DECLINED: "danger",
  WITHDRAWN: "neutral",
} as const;

export function realOutcomeBadge(application: ApiApplicationDetail) {
  return (
    <Badge tone={OUTCOME_TONE[application.outcome]} dot>
      {OUTCOME_LABEL[application.outcome] ?? application.outcome}
    </Badge>
  );
}

/** The role card for a real pipeline application, replacing `SeededRole`. */
export function RealRole({
  application,
}: {
  application: ApiApplicationDetail;
}) {
  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-meta font-semibold text-muted">Applying for</h2>
        </div>
        <Link
          href={`/hiring/requisitions/${application.requisitionId}`}
          className="flex items-start gap-2.5 rounded-md border border-line p-2.5 transition-colors hover:bg-canvas"
        >
          <Briefcase
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-faint"
          />
          <span className="min-w-0">
            <span className="block truncate text-body-sm font-medium text-ink">
              {application.requisitionJobTitle}
            </span>
            <span className="block truncate text-meta text-muted">
              {application.requisitionReference}
            </span>
          </span>
        </Link>
        <DescriptionList
          columns={1}
          items={[
            { term: "Stage", value: application.stageName ?? "Not yet placed" },
            {
              term: "Outcome",
              value: (
                <span className="inline-flex items-center gap-1.5">
                  {realOutcomeBadge(application)}
                  {application.outcome === "REJECTED" &&
                    application.rejectionReason && (
                      <AttentionMark
                        text={["Rejected.", application.rejectionReason]}
                      />
                    )}
                </span>
              ),
            },
          ]}
        />
      </CardBody>
    </Card>
  );
}

/**
 * The real pipeline: stage moves, interviews, scorecards and the offer —
 * everything `Pipeline` in `candidate-screen.tsx` renders from the seed, now
 * against `/api/v1/recruitment`.
 */
export function RealPipeline({
  application,
  onChanged,
}: {
  application: ApiApplicationDetail;
  onChanged: () => void;
}) {
  const stagesState = useStages(application.requisitionId);
  /* Nobody is moved into Hired by hand (an accepted offer puts them there) and
     Rejected has its own button with a reason; both are left out of the menu. */
  const moveOptions = stagesState.stages
    .filter((stage) => stage.id !== application.stageId)
    .filter((stage) => !isTerminalType(stage.type));
  const applications = useApplicationMutations();
  const offers = useOfferMutations();
  const canApprove = useCan("APPROVE_HIRING");
  const canManage = useCan("MANAGE_HIRING");
  const timeZone = useOrgTimezone();
  const { employeeId } = useSession();

  const [scoring, setScoring] = useState<string | null>(null);
  const readiness = useEmailReadiness(canManage);
  const emailsSupported = readiness.data?.supported === true;
  const stageMail = useStageMail(application.requisitionId, canManage);
  const interviews = useInterviewMutations();
  /* One array per read of the record, so a change made on the card stays on screen
     until the record is read again and not a render longer. */
  const rawInterviews = useMemo(
    () => new Map(application.interviews.map((iv) => [iv.id, iv])),
    [application.interviews],
  );
  const { views: interviewViews, reload: reloadInterviews } =
    useConnectedInterviews(application.interviews, {
      applicationId: application.id,
      candidateName: application.candidateName,
      role: application.requisitionJobTitle,
    });
  const [movingTo, setMovingTo] = useState<string | null>(null);
  const [openScorecards, setOpenScorecards] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleScorecards = (interviewId: string) =>
    setOpenScorecards((prev) => {
      const next = new Set(prev);
      if (next.has(interviewId)) next.delete(interviewId);
      else next.add(interviewId);
      return next;
    });
  const [offering, setOffering] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const gateway = usePipelineGateway();
  const reasons = useRejectionReasons();
  const [withdrawingApplication, setWithdrawingApplication] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    tone: "success" | "warning" | "danger";
    text: string;
  } | null>(null);

  const say = (tone: "success" | "warning" | "danger", text: string) =>
    setNotice({ tone, text });
  const fail = (error: unknown) =>
    say(
      "danger",
      error instanceof ApiError
        ? error.message
        : "Something went wrong. Try again.",
    );

  /**
   * The stage sends an email when somebody is moved into it, so ask first: the API
   * sends it unless told not to. If it is not known whether the stage sends one,
   * nothing is sent.
   */
  function chooseStage(stageId: string) {
    if (emailsSupported && stageMail.known && stageMail.byStage.has(stageId)) {
      setMovingTo(stageId);
      return;
    }
    void moveTo(stageId, false);
  }

  async function moveTo(stageId: string, sendEmail: boolean) {
    setBusy(true);
    try {
      const result = await applications.move(
        application.id,
        stageId,
        sendEmail,
      );
      const said = noticeSentence(
        noticeFrom(result.email),
        application.candidateName,
      );
      say(
        said && (said.tone === "warning" || said.tone === "danger")
          ? "warning"
          : "success",
        said ? `Moved. ${said.text}` : "Moved.",
      );
      setMovingTo(null);
      onChanged();
    } catch (error) {
      setMovingTo(null);
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  /** A reason from the company's list, and an optional note. A decline email only if it was ticked. */
  async function reject(choice: {
    reasonId: string;
    note: string | null;
    sendEmail: boolean;
  }) {
    setBusy(true);
    setRejectError(null);
    try {
      const result = await gateway.reject(
        {
          id: application.id,
          candidateId: application.candidate.id,
          name: application.candidateName,
          email: application.candidateEmail,
          reference: null,
          source: null,
          flagged: false,
          duplicate: false,
          tags: [],
          talentPool: false,
          stageId: application.stageId,
          stageName: application.stageName,
          stageEnteredAt: application.stageEnteredAt,
          outcome: application.outcome,
          rejectionReason: application.rejectionReason,
        },
        choice,
      );
      const said = noticeSentence(result.email, application.candidateName);
      say(
        said && (said.tone === "warning" || said.tone === "danger")
          ? "warning"
          : "success",
        said ? `Rejected. ${said.text}` : "Rejected. Nothing was sent to them.",
      );
      setRejecting(false);
      onChanged();
    } catch (error) {
      setRejectError(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  /* A different fact from `reject`: `ApplicationOutcome` has both `REJECTED`
     and `WITHDRAWN`, and the two controls must not read as one act wearing
     two labels — see `WithdrawApplicationDialog` for the wording rule. */
  async function withdrawApplication(reason: string) {
    setBusy(true);
    try {
      await applications.withdraw(application.id, reason.trim() || undefined);
      say("success", "Recorded as withdrawn.");
      setWithdrawingApplication(false);
      onChanged();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {notice && (
        <Callout
          tone={notice.tone}
          title={
            notice.tone === "success"
              ? "Done"
              : notice.tone === "warning"
                ? "Done, with a note"
                : "Not done"
          }
        >
          {notice.text}
        </Callout>
      )}

      {application.outcome === "IN_PROGRESS" && (
        <Card>
          <CardHeader title="Move this candidate" />
          <CardBody className="flex flex-wrap items-center gap-2">
            {/* Loading and error are checked explicitly rather than falling
                through to an empty `stages` array — that array reads
                identically whether the fetch is still in flight, failed, or
                genuinely came back with one stage, and the first two used to
                render as the third: a candidate page landed on right after
                an advance (before the stage list has had its first round
                trip) briefly claimed "there is nowhere else to move them"
                about a requisition that, once loaded, had several. */}
            {canManage && stagesState.loading && (
              <Skeleton className="h-8 w-40" />
            )}
            {canManage && !stagesState.loading && stagesState.error && (
              <p className="w-full text-body-sm text-danger-text">
                {stagesState.error.message} The stages could not be loaded, so
                no &ldquo;Move to&rdquo; options are shown here. Reject and
                Withdraw below still work.
              </p>
            )}
            {canManage &&
              !stagesState.loading &&
              !stagesState.error &&
              stagesState.stages.length > 0 &&
              moveOptions.length === 0 && (
                <p className="w-full text-body-sm text-muted">
                  This requisition has only the one stage they are already in,
                  so there is nowhere else to move them, reject or withdraw them
                  instead, or add another stage on the requisition.
                </p>
              )}
            {/* `POST /applications/:id/move` and `.../reject` are both gated
                on `MANAGE_HIRING` server-side, same as withdraw below — an
                APPROVE_HIRING-only account can reach this screen (the entry
                gate admits either permission) and was seeing these as live,
                always-refused buttons before this check existed. */}
            {canManage &&
              !stagesState.loading &&
              !stagesState.error &&
              moveOptions.length > 0 && (
                <Select
                  aria-label="Move to…"
                  value=""
                  disabled={busy}
                  className="w-auto"
                  onChange={(event) => {
                    if (event.currentTarget.value)
                      chooseStage(event.currentTarget.value);
                  }}
                >
                  <option value="" disabled>
                    Move to…
                  </option>
                  {moveOptions.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </Select>
              )}
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRejectError(null);
                  setRejecting(true);
                }}
              >
                Reject
              </Button>
            )}
            {/* `POST /applications/:id/withdraw` is gated on `MANAGE_HIRING`
                server-side — see `OfferCard`'s comment on the same gate for
                why this is offered rather than left to 403 on the press. */}
            {canManage && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setWithdrawingApplication(true)}
              >
                Candidate withdrew
              </Button>
            )}
          </CardBody>
        </Card>
      )}

      <RecordTags
        application={application}
        canManage={canManage}
        onChanged={onChanged}
      />

      {application.offer ? (
        <OfferCard
          offer={application.offer}
          candidateName={application.candidateName}
          requisitionId={application.requisitionId}
          canApprove={canApprove}
          canManage={canManage}
          onChanged={onChanged}
          onNotice={say}
          emailsSupported={emailsSupported}
          blockedBy={readiness.data?.blockedBy ?? []}
        />
      ) : application.outcome === "IN_PROGRESS" ? (
        <Card>
          <CardHeader
            title="Offer"
            action={
              <Button
                variant="accent"
                size="sm"
                onClick={() => setOffering(true)}
              >
                <Plus aria-hidden="true" className="size-3.5" />
                Make an offer
              </Button>
            }
          />
        </Card>
      ) : null}

      <InterviewsCard
        applicationId={application.id}
        requisitionId={application.requisitionId}
        stageId={application.stageId}
        stageName={application.stageName}
        candidateName={application.candidateName}
        role={application.requisitionJobTitle}
        interviews={interviewViews}
        canManage={canManage}
        onChanged={() => {
          onChanged();
          reloadInterviews();
        }}
        onNotice={say}
        scorecardActions={(iv) => {
          const raw = rawInterviews.get(iv.id);
          if (!raw) return null;
          const inCount = raw.scorecards.filter((s) => s.submitted).length;
          return (
            <>
              {/* Completed with nothing submitted is the same fact the diary's own
                  "Completed, no scorecard yet" card warns about: this is the one
                  screen where a refused "Move to" click (the scorecard gate) is
                  actually experienced, so it says so beforehand. */}
              {iv.status === "COMPLETED" && inCount === 0 ? (
                <span className="flex items-center gap-1 text-meta text-warning-text">
                  <TriangleAlert aria-hidden="true" className="size-3.5" />
                  Completed, no scorecard yet
                </span>
              ) : (
                <span className="text-meta text-muted">
                  {inCount} of{" "}
                  {raw.panelists && raw.panelists.length > 0
                    ? raw.panelists.length
                    : raw.scorecards.length || 1}{" "}
                  scorecards in
                </span>
              )}
              {employeeId === null ? (
                /* A scorecard from this screen is filed under the signed-in person's
                   employee record, and this account has none (a company without
                   Core HR, whose people were invited by email). They hand theirs in
                   from My interviews, once invited to the interview. */
                <span className="text-meta text-muted">
                  Scorecards are handed in by the people invited to score, from
                  My interviews.
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScoring(iv.id)}
                >
                  Submit a scorecard
                </Button>
              )}
              {inCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleScorecards(iv.id)}
                >
                  {openScorecards.has(iv.id)
                    ? "Hide what was submitted"
                    : "Show what was submitted"}
                </Button>
              )}
            </>
          );
        }}
        scorecardPanel={(iv) =>
          openScorecards.has(iv.id) ? (
            <InterviewScorecards interviewId={iv.id} />
          ) : null
        }
      />

      {/* Last, after the live controls: this is the record of what has been
          done, read after the things that can still be done. It comes with the
          application itself, so it refreshes with every `onChanged`. */}
      {application.scores && (
        <InterviewScoreCard score={scoreFrom(application.scores)} />
      )}

      {application.emails && (
        <RecordEmails
          emails={emailLogFrom(application.emails)}
          timeZone={timeZone}
        />
      )}

      {application.retention &&
        (application.outcome === "REJECTED" ||
          application.outcome === "WITHDRAWN") && (
          <DeletionNotice line={application.retention} />
        )}

      <StageHistory events={application.history} />

      {/* Each dialog below stays mounted regardless of its gating state —
          `Modal` decides whether to render from the real `open` prop, so it
          can see that value go false and play its own exit animation. */}
      <ScorecardDialog
        open={scoring !== null}
        onClose={() => setScoring(null)}
        onConfirm={async (input) => {
          if (!scoring) return;
          /* A refusal is thrown to the dialog, which shows it where the
             person is looking and keeps what they wrote. */
          await interviews.submitScorecard(scoring, scorecardBody(input));
          setScoring(null);
          onChanged();
        }}
      />

      <OfferDialog
        open={offering}
        onClose={() => setOffering(false)}
        onConfirm={async (amountNaira, startDate) => {
          try {
            await offers.create(application.id, {
              grossMonthlyKobo: kobo(amountNaira),
              startDate,
            });
            setOffering(false);
            onChanged();
          } catch (error) {
            fail(error);
          }
        }}
      />

      <RejectDialog
        open={rejecting}
        busy={busy}
        error={rejectError}
        subject={application.candidateName}
        reasons={reasons.items}
        onClose={() => setRejecting(false)}
        emailOffer={
          emailsSupported
            ? {
                label: "Send them a decline email",
                description:
                  "Off unless you tick it. Rejecting never emails anybody by itself.",
                blockedBy: readiness.data?.blockedBy ?? [],
              }
            : null
        }
        onConfirm={(choice) => void reject(choice)}
      />

      <MoveEmailDialog
        open={movingTo !== null}
        onClose={() => setMovingTo(null)}
        who={application.candidateName}
        stage={
          stageMail.stages?.find((stage) => stage.stageId === movingTo)?.name ??
          "this stage"
        }
        mail={(movingTo && stageMail.byStage.get(movingTo)) || null}
        readiness={readiness.data}
        busy={busy}
        onChoose={(send) => movingTo && void moveTo(movingTo, send)}
      />

      <WithdrawApplicationDialog
        open={withdrawingApplication}
        busy={busy}
        onClose={() => setWithdrawingApplication(false)}
        onConfirm={withdrawApplication}
      />
    </>
  );
}

/**
 * What a submitted scorecard actually says — ratings, notes, recommendation —
 * fetched on demand rather than with the application. `ApiInterviewSummary`
 * (what the application payload already carries) only ever has
 * `ApiInterviewScorecardRef[]`: an id and whether it is submitted, nothing an
 * approver could read. The content lives behind its own endpoint
 * (`GET /recruitment/interviews/:id`), so it is fetched only once somebody
 * asks to see it rather than once per interview on every page load.
 *
 * No interviewer name: `ApiScorecard.interviewerName` is always `null` on
 * this backend today (see its own doc comment), so this does not invent one.
 */
function InterviewScorecards({ interviewId }: { interviewId: string }) {
  const { interview, loading, error, reload } = useInterviewDetail(interviewId);
  const submitted = interview?.scorecards.filter((s) => s.submitted) ?? [];

  if (loading) return <Skeleton className="h-16 w-full" />;

  return (
    <div className="mt-2.5 flex flex-col gap-2.5 border-t border-line pt-2.5">
      <LoadFailure subject="this scorecard" error={error} onRetry={reload} />
      {!error && submitted.length === 0 && (
        <p className="text-body-sm text-muted">Nothing submitted yet.</p>
      )}
      {submitted.map((sc, index) => {
        const avg =
          sc.ratings.reduce((sum, r) => sum + r.score, 0) /
          (sc.ratings.length || 1);
        return (
          <div key={sc.id} className="rounded-md border border-line p-3">
            <div className="flex items-center gap-2">
              <span className="text-body-sm font-medium text-ink">
                Scorecard {index + 1}
              </span>
              {sc.recommendation && (
                <Badge size="sm">
                  {RECOMMENDATION_LABEL[sc.recommendation]}
                </Badge>
              )}
              {sc.ratings.length > 0 && (
                <span className="ml-auto text-meta text-muted">
                  {avg.toFixed(1)} / 5 average
                </span>
              )}
            </div>
            {sc.ratings.length > 0 && (
              <div className="mt-2.5 flex flex-col gap-2">
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
            )}
            {sc.notes && (
              <p className="mt-2.5 border-t border-line pt-2 text-body-sm leading-relaxed text-body">
                {sc.notes}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------- offer */

function OfferCard({
  offer,
  candidateName,
  requisitionId,
  canApprove,
  canManage,
  onChanged,
  onNotice,
  emailsSupported,
  blockedBy,
}: {
  offer: NonNullable<ApiApplicationDetail["offer"]>;
  candidateName: string;
  /** The job, for the link to its hires. */
  requisitionId: string;
  canApprove: boolean;
  canManage: boolean;
  /** The server can send emails to candidates, so the offer notice is offered. */
  emailsSupported: boolean;
  /** Why an email asked for now would not be sent. */
  blockedBy: readonly string[];
  onChanged: () => void;
  /** Surfaces a fact onto the page's own notice banner — used for accepting,
   *  which can silently reject every other in-progress candidate on the same
   *  requisition (the API fills the role and closes the rest of its own
   *  pipeline in the same transaction) with nothing else on this page ever
   *  saying so. */
  onNotice: (tone: "success" | "warning" | "danger", text: string) => void;
}) {
  const offers = useOfferMutations();
  const [tellThem, setTellThem] = useState(false);
  /* Recording an acceptance used to **create the employee**, and `POST /employees`
     needs `EDIT_RECORDS`, so the API asks for it as well as `MANAGE_HIRING`:
     managing hiring alone was a way round the permission that guards every other
     way of putting a person on the payroll. It now creates one only where the
     company's setting says so and it has Core HR. Where that is not known, the
     stricter rule holds: a control whose only outcome is a 403 is not offered. */
  const canEditPeople = useCan("EDIT_RECORDS");
  const hired = useHiredSettings(offer.status === "SENT");
  const acceptWords = whatAcceptingDoes({
    setting: hired.settings?.onOfferAccepted ?? null,
    coreHr: hired.settings?.coreHr ?? null,
  });
  const settingKnown = hired.settings !== null;
  const makesEmployee = !settingKnown || acceptWords.makesEmployee;
  const canRecordAcceptance = canManage && (!makesEmployee || canEditPeople);
  const [accepting, setAccepting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [redoing, setRedoing] = useState(false);

  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      onChanged();
      return result;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  const fail = (err: unknown) =>
    setError(err instanceof ApiError ? err.message : "Something went wrong.");

  return (
    <Card>
      <CardHeader
        title="Offer"
        action={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge tone={OFFER_STATUS_TONE[offer.status]} dot>
              {offer.status.replace("_", " ").toLowerCase()}
            </Badge>
            {offer.outsideBand && (
              <Badge tone="warning" size="sm">
                Outside band
              </Badge>
            )}
          </span>
        }
      />
      <CardBody className="flex flex-col gap-4">
        {error && (
          <Callout tone="danger" title="Not done">
            {error}
          </Callout>
        )}
        <p className="flex items-baseline gap-2">
          <Money amount={naira(offer.grossMonthlyKobo)} decimals size="lg" />
          <span className="text-body-sm text-muted">
            a month, from {offer.startDate}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
          {offer.status === "DRAFT" && (
            <Button
              variant="accent"
              size="sm"
              loading={busy}
              onClick={() => void run(() => offers.submit(offer.id))}
            >
              Submit for approval
            </Button>
          )}
          {/* `PATCH /offers/:id` is `MANAGE_HIRING`-gated, same as every
              other offer write on this card — offered on that permission
              rather than left to refuse on the press. */}
          {offer.status === "DRAFT" && canManage && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          )}
          {(offer.status === "DECLINED" || offer.status === "WITHDRAWN") &&
            canManage && (
              <Button
                variant="accent"
                size="sm"
                onClick={() => setRedoing(true)}
              >
                Make a new offer
              </Button>
            )}
          {offer.status === "PENDING_APPROVAL" &&
            !offer.approvedAt &&
            canApprove && (
              <Button
                variant="approve"
                size="sm"
                loading={busy}
                onClick={() => void run(() => offers.approve(offer.id))}
              >
                Approve
              </Button>
            )}
          {offer.status === "PENDING_APPROVAL" &&
            !offer.approvedAt &&
            !canApprove && (
              <span className="text-meta text-muted">Waiting on approval.</span>
            )}
          {offer.status === "PENDING_APPROVAL" &&
            offer.approvedAt &&
            canManage && (
              <>
                {emailsSupported && (
                  <div className="flex w-full flex-col gap-1.5">
                    <Checkbox
                      label="Also tell them an offer is on its way"
                      description="A short email with no figure and no letter. Off unless you tick it."
                      checked={tellThem}
                      onChange={(event) => setTellThem(event.target.checked)}
                    />
                    {tellThem && blockedBy.length > 0 && (
                      <p className="text-meta text-warning-text">
                        It would not be sent right now: {blockedBy.join(" ")}
                      </p>
                    )}
                  </div>
                )}
                <Button
                  variant="accent"
                  size="sm"
                  loading={busy}
                  onClick={() =>
                    void run(() =>
                      offers.send(
                        offer.id,
                        tellThem ? { sendEmail: true } : {},
                      ),
                    ).then((sent) => {
                      if (!sent) return;
                      const said = noticeSentence(
                        noticeFrom(sent.email),
                        candidateName,
                      );
                      if (said)
                        onNotice(
                          said.tone === "warning" || said.tone === "danger"
                            ? "warning"
                            : "success",
                          `Offer marked as sent. ${said.text}`,
                        );
                    })
                  }
                >
                  Send
                </Button>
              </>
            )}
          {offer.status === "PENDING_APPROVAL" &&
            offer.approvedAt &&
            !canManage && (
              <span className="text-meta text-muted">
                Approved. Waiting to be sent.
              </span>
            )}
          {offer.status === "SENT" && (
            <>
              {!canRecordAcceptance && (
                <span className="text-meta text-muted">
                  Recording that they accepted also creates their employee
                  record here, so it needs permission to edit people as well as
                  to manage hiring.
                </span>
              )}
              {canRecordAcceptance && (
                <Button
                  variant="approve"
                  size="sm"
                  loading={busy}
                  onClick={() => setAccepting(true)}
                >
                  Record accepted
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                loading={busy}
                onClick={() => void run(() => offers.decline(offer.id))}
              >
                Record declined
              </Button>
            </>
          )}
          {offer.status !== "ACCEPTED" &&
            offer.status !== "DECLINED" &&
            offer.status !== "WITHDRAWN" && (
              <Button
                variant="ghost"
                size="sm"
                loading={busy}
                onClick={() => void run(() => offers.withdraw(offer.id))}
              >
                Withdraw
              </Button>
            )}
          {offer.status === "ACCEPTED" &&
            (offer.employeeId ? (
              <Link
                href={`/people/${offer.employeeId}`}
                className="text-meta text-success-text underline underline-offset-2"
              >
                Employee record created.
              </Link>
            ) : (
              <span className="text-meta text-success-text">
                On the Hired list. No employee record yet.{" "}
                {canManage && (
                  <Link
                    href={`/hiring/hired?job=${requisitionId}`}
                    className="underline underline-offset-2"
                  >
                    Open the Hired list
                  </Link>
                )}
              </span>
            ))}
          {/* Approved, not pending: `approvedAt` is never cleared once set, so
              this stays reachable at SENT, ACCEPTED and DECLINED — unlike the
              approvals inbox, whose own copy of this button vanishes the
              moment an offer is marked sent because that screen only ever
              lists PENDING_APPROVAL offers. This is the one place left where
              a lost or outdated copy can still be re-downloaded. Same gate
              `real-approvals.tsx` uses — see `lib/api/exports.ts#offerLetter`. */}
          {offer.approvedAt && (
            <ExportButton
              label="Offer letter"
              download={() =>
                offerLetter(
                  offer.id,
                  `offer-${candidateName.replace(/\s+/g, "-")}`,
                )
              }
            />
          )}
        </div>
      </CardBody>

      {/* Mounted regardless of `editing`/`redoing` — see the note above
          `ScheduleInterviewDialog` on why these dialogs stay mounted rather
          than being conditionally rendered. */}
      <AcceptOfferDialog
        open={accepting}
        onClose={() => setAccepting(false)}
        name={candidateName}
        words={acceptWords}
        known={settingKnown}
        busy={busy}
        onConfirm={() =>
          void run(() => offers.accept(offer.id)).then((result) => {
            setAccepting(false);
            if (!result) return;
            /* Said from the API's answer: an employee record is claimed only if
               it came back with one, and a role with room for more says which
               hire this was, so "accepted" is not read as "the role is done". */
            onNotice(
              "success",
              acceptedNotice(candidateName, {
                employeeId: result.employeeId ?? null,
                employeeCreated: result.employeeCreated,
                note: result.onOfferAccepted?.note ?? null,
                rejectedOthers: result.rejectedOthers,
                hiresSoFar: result.hiresSoFar,
                headcount: result.headcount,
                requisitionFilled: result.requisitionFilled,
              }),
            );
          })
        }
      />

      <EditOfferDialog
        open={editing}
        offer={offer}
        onClose={() => setEditing(false)}
        onConfirm={async (body) => {
          try {
            setError(null);
            await offers.update(offer.id, body);
            setEditing(false);
            onChanged();
          } catch (err) {
            fail(err);
          }
        }}
      />

      <OfferDialog
        open={redoing}
        onClose={() => setRedoing(false)}
        title="Make a new offer"
        confirmLabel="Save as draft"
        help="This starts a fresh draft on the same application, the offer that was declined or withdrawn is replaced, not duplicated. Submit it for approval once you are ready."
        onConfirm={async (amountNaira, startDate) => {
          try {
            setError(null);
            await offers.redo(offer.id, {
              grossMonthlyKobo: kobo(amountNaira),
              startDate,
            });
            setRedoing(false);
            onChanged();
          } catch (err) {
            fail(err);
          }
        }}
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ dialogs */

/**
 * Also does duty for "make a new offer" on a declined or withdrawn offer
 * (`offers.redo`) — same two fields, same money conversion, a fresh start
 * rather than a correction. `title`/`confirmLabel`/`help` let that call site
 * say so without a second copy of the amount-to-kobo logic below.
 */
function OfferDialog({
  open,
  onClose,
  onConfirm,
  title = "Make an offer",
  confirmLabel = "Save as draft",
  help = "Saved as a draft. Submit it for approval once you are ready.",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (amountNaira: number, startDate: string) => Promise<void>;
  title?: string;
  confirmLabel?: string;
  help?: string;
}) {
  const [amount, setAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [busy, setBusy] = useState(false);
  const parsed = Number(amount.replace(/\D/g, "")) || 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={parsed <= 0 || !startDate}
            onClick={() => {
              setBusy(true);
              void onConfirm(parsed, startDate).finally(() => setBusy(false));
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Gross monthly (₦)" required>
          <Input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
            placeholder="1,500,000"
          />
        </Field>
        <Field label="Start date" required>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.currentTarget.value)}
          />
        </Field>
        <p className="text-meta text-muted">{help}</p>
      </div>
    </Modal>
  );
}

/**
 * Correcting a draft offer's figure before it is submitted — `grossMonthlyKobo`
 * and/or `startDate`, only the one(s) that changed. Unlike `OfferDialog`
 * above (blank fields, a fresh start), this is prefilled from the offer on
 * screen: it is a correction, not a new proposal, so there is something to
 * show and nothing to retype that did not change.
 */
function EditOfferDialog({
  open,
  offer,
  onClose,
  onConfirm,
}: {
  open: boolean;
  offer: NonNullable<ApiApplicationDetail["offer"]>;
  onClose: () => void;
  onConfirm: (body: UpdateOfferBody) => Promise<void>;
}) {
  const [amount, setAmount] = useState(() =>
    String(naira(offer.grossMonthlyKobo)),
  );
  const [startDate, setStartDate] = useState(offer.startDate);
  const [busy, setBusy] = useState(false);
  const parsed = Number(amount.replace(/\D/g, "")) || 0;

  const body: UpdateOfferBody = {};
  if (parsed > 0 && kobo(parsed) !== offer.grossMonthlyKobo) {
    body.grossMonthlyKobo = kobo(parsed);
  }
  if (startDate && startDate !== offer.startDate) {
    body.startDate = startDate;
  }
  const hasChanges = Object.keys(body).length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="Edit this offer"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={parsed <= 0 || !startDate || !hasChanges}
            onClick={() => {
              setBusy(true);
              void onConfirm(body).finally(() => setBusy(false));
            }}
          >
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Gross monthly (₦)" required>
          <Input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.currentTarget.value)}
            placeholder="1,500,000"
          />
        </Field>
        <Field label="Start date" required>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.currentTarget.value)}
          />
        </Field>
        {!hasChanges && (
          <p className="text-meta text-muted">
            Nothing here differs from the offer as it stands.
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * A distinct fact from rejecting — `ApplicationOutcome` has both
 * `REJECTED` and `WITHDRAWN` as separate values, and the two controls must
 * not read as one act wearing two labels. The candidate pulling out on
 * their own is not the company turning them down, so neither this title nor
 * its confirm button ever says "declined" or "rejected".
 */
function WithdrawApplicationDialog({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="The candidate pulled out?"
      description="Records that they withdrew on their own, not that the company turned them down. It reads differently everywhere this application appears."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() => onConfirm(reason)}
          >
            Record as withdrawn
          </Button>
        </>
      }
    >
      <Field label="Reason" optional help="Kept internal.">
        <Textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
        />
      </Field>
    </Modal>
  );
}

export type { ApiStage };

/* ------------------------------------------------------- screening answers */

/**
 * What the screener asked, and what they were told.
 *
 * ## These five facts were written and could not be read
 *
 * `advance` on the screening queue collects a notice period, a current salary,
 * an expected salary, right to work and a CV, and writes them onto `Candidate`.
 * `ApiApplicationDetail.candidate` has carried every one of them since the
 * recruitment module shipped. **Nothing rendered any of them**, and
 * `useCandidateMutations().update` — the PATCH that corrects them — had no
 * consumer at all.
 *
 * So a recruiter typed somebody's salary expectation into a dialog, pressed
 * Screen in, and the candidate's own record never mentioned it again. The
 * figure that decides whether an offer is worth making was in the database and
 * unreachable from the one screen built to decide it.
 *
 * That is the fifth instance of this shape in this codebase — a capability
 * present, correct, and findable by nobody — and the second where somebody had
 * already entered the data.
 *
 * ## Not the same thing as the demo's "Screening answers"
 *
 * The seeded pipeline renders a per-role **questionnaire**:
 * `requisition.screeningQuestions` with a free-text answer each and a knockout
 * flag. There is no such model on the API — `Requisition` has no questions and
 * `Application` has no answers — so that panel cannot be wired, and pretending
 * otherwise would mean inventing questions nobody set. This panel is the five
 * facts the API does hold, which the demo does not show.
 *
 * ## Absent is never zero, and two of the five are money
 *
 * `currentSalaryKobo: null` means nobody asked. Rendering it as ₦0.00 would
 * claim a person earns nothing — the same wrong claim as the payroll that paid
 * a company ₦0 because no attendance row existed, on the figure an offer is
 * negotiated against. `Money` takes `number | null` for exactly this and
 * carries its own absent copy.
 *
 * `rightToWork` is three states, not two: yes, no, and **not asked**. A `null`
 * shown as "No" would reject somebody for a question nobody put to them.
 */
export function RealScreening({
  application,
  onChanged,
}: {
  application: ApiApplicationDetail;
  onChanged: () => void;
}) {
  const candidate = application.candidate;
  const canManage = useCan("MANAGE_HIRING");
  const [editing, setEditing] = useState(false);

  const asked =
    candidate.noticeDays !== null ||
    candidate.currentSalaryKobo !== null ||
    candidate.expectedSalaryKobo !== null ||
    candidate.rightToWork !== null;

  return (
    <Card>
      <CardHeader
        title="What the screener asked"
        description={
          asked
            ? "Recorded when they were screened in. Correct anything that has changed."
            : undefined
        }
        {...(canManage
          ? {
              action: (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditing(true)}
                >
                  {asked ? "Update" : "Fill these in"}
                </Button>
              ),
            }
          : {})}
      />
      <CardBody className="flex flex-col gap-3">
        {!asked && (
          <p className="text-body-sm text-muted">
            Nothing was recorded when this person was screened in. None of it is
            required, an offer can be made without any of it, but a notice
            period and a salary expectation are what a hiring manager asks for
            first.
          </p>
        )}

        <DescriptionList
          columns={2}
          items={[
            {
              term: "Notice period",
              /* "Not asked" rather than "0 days". Somebody on no notice and
                 somebody nobody asked are different facts, and the first is a
                 reason to move fast. */
              value:
                candidate.noticeDays === null ? (
                  <span className="text-faint">Not asked</span>
                ) : candidate.noticeDays === 0 ? (
                  "Available immediately"
                ) : (
                  `${String(candidate.noticeDays)} ${candidate.noticeDays === 1 ? "day" : "days"}`
                ),
            },
            {
              term: "Right to work",
              value:
                candidate.rightToWork === null ? (
                  <span className="text-faint">Not asked</span>
                ) : (
                  <Badge
                    tone={candidate.rightToWork ? "success" : "warning"}
                    size="sm"
                  >
                    {candidate.rightToWork ? "Confirmed" : "Not confirmed"}
                  </Badge>
                ),
            },
            {
              term: "Earning now",
              value: (
                <Money
                  amount={
                    candidate.currentSalaryKobo === null
                      ? null
                      : naira(candidate.currentSalaryKobo)
                  }
                  decimals
                  per="month"
                  absent="Not asked"
                />
              ),
            },
            {
              term: "Expecting",
              value: (
                <Money
                  amount={
                    candidate.expectedSalaryKobo === null
                      ? null
                      : naira(candidate.expectedSalaryKobo)
                  }
                  decimals
                  per="month"
                  absent="Not asked"
                />
              ),
            },
          ]}
        />

        <CvLine
          candidateId={candidate.id}
          hasCv={Boolean(candidate.cvStorageKey)}
          source={candidate.source}
        />
      </CardBody>

      {/* `candidate` is always available here (it comes straight from the
          `application` prop, not from `editing`), so the only thing this
          state gates is `open` — `Modal` stays mounted and decides for
          itself whether to render. */}
      <ScreeningDialog
        open={editing}
        candidate={candidate}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          onChanged();
        }}
      />
    </Card>
  );
}

/**
 * The CV, and the one way to read it.
 *
 * `cvStorageKey` is a **key** — a record that a file was attached on screening —
 * and nothing here ever shows it or links to it. Reading the file is
 * `OpenCv`: one audited request that asks the API for a short-lived address, and
 * the API writes down who asked. It is offered only to whoever may read the
 * candidate at all, and only when there is a key to open; what the API says when
 * the file is missing, flagged or unreachable is shown beside the button as it
 * wrote it.
 */
function CvLine({
  candidateId,
  hasCv,
  source,
}: {
  candidateId: string;
  hasCv: boolean;
  source: string | null;
}) {
  const canOpen = useCanOpenCv();
  if (!hasCv && !source) return null;
  return (
    <div className="flex flex-col gap-1 border-t border-line pt-3">
      {hasCv && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-meta text-muted">
            A CV was attached on screening.
          </p>
          {canOpen ? (
            <OpenCv
              open={() => recruitmentApi.openCandidateCv(candidateId)}
              label="Open CV"
            />
          ) : (
            <p className="text-meta text-faint">
              Opening it is kept to whoever hires or approves hiring.
            </p>
          )}
        </div>
      )}
      {source && (
        <p className="text-meta text-muted">
          Heard about the role through{" "}
          <span className="text-body">{source}</span>.
        </p>
      )}
    </div>
  );
}

/**
 * Correcting the five.
 *
 * Sent as a **whole set**, and an emptied field clears the fact rather than
 * leaving it: that is the only way somebody can take back an expectation that
 * was noted wrong, and `UpdateCandidateBody` accepts `null` for each. A form
 * that only ever added would make a mistyped salary permanent.
 */
function ScreeningDialog({
  open,
  candidate,
  onClose,
  onSaved,
}: {
  open: boolean;
  candidate: ApiApplicationDetail["candidate"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const candidates = useCandidateMutations();
  const [notice, setNotice] = useState(
    candidate.noticeDays === null ? "" : String(candidate.noticeDays),
  );
  const [current, setCurrent] = useState(
    candidate.currentSalaryKobo === null
      ? ""
      : String(naira(candidate.currentSalaryKobo)),
  );
  const [expected, setExpected] = useState(
    candidate.expectedSalaryKobo === null
      ? ""
      : String(naira(candidate.expectedSalaryKobo)),
  );
  const [right, setRight] = useState(
    candidate.rightToWork === null ? "" : candidate.rightToWork ? "yes" : "no",
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  /* A blank box is a cleared fact, so an empty string maps to null rather than
     being dropped from the body. `Number("")` is 0, which is why this parses
     explicitly instead. */
  const numberOrNull = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  };

  const save = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const days = numberOrNull(notice);
      const now = numberOrNull(current);
      const want = numberOrNull(expected);
      await candidates.update(candidate.id, {
        noticeDays: days === null ? null : Math.round(days),
        currentSalaryKobo: now === null ? null : kobo(now),
        expectedSalaryKobo: want === null ? null : kobo(want),
        rightToWork: right === "" ? null : right === "yes",
      });
      onSaved();
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="What the screener asked"
      description="Leave anything blank that was never asked. Clearing a box removes what was recorded."
      footer={
        <div className="flex items-center gap-2">
          <Button variant="accent" loading={busy} onClick={() => void save()}>
            Save
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Notice period"
          optional
          help="In days. Zero means they can start immediately, which is a different answer from leaving it blank."
        >
          <Input
            type="number"
            min={0}
            value={notice}
            onChange={(event) => setNotice(event.target.value)}
            placeholder="30"
          />
        </Field>
        <Field label="Earning now" optional help="Monthly, in naira.">
          <Input
            type="number"
            min={0}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            placeholder="400000"
          />
        </Field>
        <Field
          label="Expecting"
          optional
          help="Monthly, in naira. This is the figure an offer gets measured against."
        >
          <Input
            type="number"
            min={0}
            value={expected}
            onChange={(event) => setExpected(event.target.value)}
            placeholder="550000"
          />
        </Field>
        <Field
          label="Right to work"
          optional
          help="Blank means nobody asked, which is not the same as being told no."
        >
          <Select
            value={right}
            onChange={(event) => setRight(event.target.value)}
          >
            <option value="">Not asked</option>
            <option value="yes">Confirmed</option>
            <option value="no">Not confirmed</option>
          </Select>
        </Field>
        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
