"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCheck, Inbox, Target } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Spinner,
  Stat,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  formatMeasure,
  quarterLabel,
  type ApiGoal,
} from "@/lib/api/performance";
import { useFeatures } from "@/lib/store/features";
import {
  APPROVAL_TONE,
  useObjectiveApprovals,
  useObjectiveMutations,
} from "@/lib/store/performance";
import { ApprovalReasonDialog, type ApprovalAct } from "../approval-dialogs";
import { StartPeriodButton } from "../start-period";

/**
 * Objectives waiting to be agreed.
 *
 * ## Why this screen exists at all
 *
 * An objective must be agreed **before** the period it covers. Otherwise a
 * manager can set the target after seeing the result, and every rating built on
 * it is an opinion wearing a number. This queue is the whole of that rule made
 * operable: the one place where somebody says yes, and the place a year later
 * that answers "who agreed this, and when".
 *
 * ## Three answers, not one, and two of them need words
 *
 * Agree, send back, refuse. **Send back** returns it for another go and keeps
 * the fact that somebody looked; **refuse** is terminal, because the answer to a
 * refused objective is a different objective rather than the same one re-sent
 * with the refusal quietly attached. Both carry a required reason: a refusal
 * with no reason is not feedback, and it is not evidence either.
 *
 * Agree is the green control. Green in this design system is the approval act and
 * nothing else, so it belongs here and it is deliberately not the loudest thing
 * on the row — the guard on agreeing a target is reading the target, which is why
 * the measures are on the card rather than behind it.
 *
 * ## An empty queue is two different facts
 *
 * "Nobody has anything waiting" and "you agree nobody's objectives" are opposite
 * states and both render as no rows. `couldHaveQueue` is which one it is, and
 * saying the wrong one sends somebody looking for a permission problem that is
 * not there.
 *
 * ## Nobody's own objectives are here
 *
 * Enforced by the API, and worth stating on screen rather than leaving somebody
 * to wonder where theirs went: a queue containing a row nobody in the world may
 * action is a queue with a permanently stuck row in it.
 */
export function ApprovalsScreen() {
  const approvals = useObjectiveApprovals();
  const objectives = useObjectiveMutations();
  const features = useFeatures();
  const toast = useToast();

  const [agreeing, setAgreeing] = useState<ApiGoal | null>(null);
  const [reasonFor, setReasonFor] = useState<{
    goal: ApiGoal;
    act: ApprovalAct;
  } | null>(null);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.push({ title: success, tone: "success" });
      approvals.reload();
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

  /* A link straight here with appraisals switched off gets the reason, not an
     empty queue — the lifecycle is part of the appraisal module. */
  if (!features.loading && !features.appraisals) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ href: "/performance", label: "KPIs & appraisals" }]}
          title="Objectives to agree"
        />
        <PageBody>
          <EmptyState
            icon={<Target aria-hidden="true" />}
            title="Appraisals are switched off"
            description="Agreeing objectives before the period they cover is part of the appraisal module. Turn it on and this queue fills itself."
            action={
              <Link
                href="/settings/features"
                className="text-body-sm font-medium text-accent-text underline-offset-2 hover:underline"
              >
                Open feature settings
              </Link>
            }
          />
        </PageBody>
      </>
    );
  }

  const measured = approvals.queue.filter(
    (goal) => goal.keyResults.length > 0,
  ).length;

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/performance", label: "KPIs & appraisals" }]}
        title="Objectives to agree"
        /* One of the three doors on the same dialog. Agreeing the objectives is
           the step immediately before starting the period they belong to, so
           this is one of the places somebody has the thought — and looking for
           the button is what the product owner could not do. */
        action={<StartPeriodButton withIcon />}
        meta={
          DEMO_ENABLED && approvals.source === "demo" ? (
            <Badge tone="warning" size="sm">
              Demo · decisions stay in this browser
            </Badge>
          ) : undefined
        }
      />

      <PageBody>
        <div className="flex flex-col gap-6">
          <LoadFailure
            subject="the objectives waiting on you"
            error={approvals.error}
           onRetry={approvals.reload}/>

          <div className="grid gap-4 sm:grid-cols-2">
            <Stat
              label="Waiting on you"
              value={String(approvals.queue.length)}
              hint="Nobody agrees their own, so yours are not here"
            />
            <Stat
              label="With a measure on them"
              value={`${measured} of ${approvals.queue.length}`}
              hint="An objective with no measure is scored on a stated figure"
            />
          </div>

          <Card>
            <CardHeader
              title="Waiting to be agreed"
              description="The target is frozen once you agree it. Progress still moves; changing what was asked for needs a recorded revision."
            />
            {approvals.loading ? (
              <CardBody className="flex items-center gap-2 text-body-sm text-muted">
                <Spinner size="sm" />
                Loading the queue
              </CardBody>
            ) : approvals.queue.length === 0 ? (
              <EmptyState
                compact
                icon={
                  approvals.couldHaveQueue ? (
                    <CheckCheck aria-hidden="true" />
                  ) : (
                    <Inbox aria-hidden="true" />
                  )
                }
                title={
                  approvals.couldHaveQueue
                    ? "Nothing waiting"
                    : "You agree nobody's objectives"
                }
                description={
                  approvals.couldHaveQueue
                    ? "Every objective sent to you has been answered. New ones turn up here."
                    : "This queue fills up for whoever people report to. Yours are on the KPI tab, where you can send them to be agreed."
                }
              />
            ) : (
              <CardBody className="flex flex-col gap-3">
                {approvals.queue.map((goal) => (
                  <ObjectiveCard
                    key={goal.id}
                    goal={goal}
                    onAgree={() => setAgreeing(goal)}
                    onSendBack={() => setReasonFor({ goal, act: "send_back" })}
                    onReject={() => setReasonFor({ goal, act: "reject" })}
                  />
                ))}
              </CardBody>
            )}
          </Card>
        </div>
      </PageBody>

      <ConfirmDialog
        open={agreeing !== null}
        onClose={() => setAgreeing(null)}
        title={`Agree "${agreeing?.title ?? ""}"?`}
        confirmLabel="Agree it"
        tone="primary"
        body={
          <span>
            {agreeing?.ownerName ?? "The owner"} will be judged on this for{" "}
            {agreeing?.reviewCycleName ??
              quarterLabel(agreeing?.dueQuarter ?? null)}
            . The target is frozen from now on: progress still moves, and
            changing what was asked for needs a revision that records who
            changed it and why.
          </span>
        }
        onConfirm={async () => {
          if (!agreeing) return;
          const ok = await run(
            () => objectives.agree(agreeing.id),
            `"${agreeing.title}" agreed`,
          );
          if (ok) setAgreeing(null);
        }}
      />

      {reasonFor && (
        <ApprovalReasonDialog
          act={reasonFor.act}
          goalTitle={reasonFor.goal.title}
          onClose={() => setReasonFor(null)}
          onConfirm={async (reason) => {
            const { goal, act } = reasonFor;
            const ok = await run(
              () =>
                act === "send_back"
                  ? objectives.sendBack(goal.id, reason)
                  : objectives.reject(goal.id, reason),
              act === "send_back"
                ? `"${goal.title}" sent back`
                : `"${goal.title}" refused`,
            );
            if (ok) setReasonFor(null);
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One objective, with enough of it on screen to answer without opening it.
 *
 * The measures are here rather than behind a link because agreeing is the act
 * this whole lifecycle exists to make meaningful, and agreeing a target you have
 * not read is the thing it is meant to prevent. An objective with **no** measure
 * says so, in words — it can still be agreed, and the score records that its
 * progress came from a stated figure rather than a measured one, which is weaker
 * evidence and should be visible rather than disguised.
 */
function ObjectiveCard({
  goal,
  onAgree,
  onSendBack,
  onReject,
}: {
  goal: ApiGoal;
  onAgree: () => void;
  onSendBack: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body-sm font-medium text-ink">{goal.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-meta text-muted">
            {goal.companyWide ? (
              <Badge tone="accent" size="sm">
                Company objective
              </Badge>
            ) : goal.ownerName ? (
              <span className="flex items-center gap-1.5">
                <Avatar name={goal.ownerName} size="xs" />
                {goal.ownerName}
              </span>
            ) : (
              <span>No owner</span>
            )}
            {/* The period, and which of the two kinds it is. An appraisal
                period is what makes the objective scoreable; a bare quarter is
                what companies typed before periods existed and is still
                allowed. */}
            <span>{goal.reviewCycleName ?? quarterLabel(goal.dueQuarter)}</span>
            {goal.revisionCount > 0 && (
              <span>
                {goal.revisionCount === 1
                  ? "Reopened once"
                  : `Reopened ${goal.revisionCount} times`}
              </span>
            )}
          </div>
        </div>

        <Badge tone={APPROVAL_TONE[goal.approval]} size="sm" dot>
          {goal.approvalLabel}
        </Badge>
      </div>

      {goal.description && (
        <p className="mt-3 text-body-sm leading-relaxed text-body">
          {goal.description}
        </p>
      )}

      {goal.keyResults.length === 0 ? (
        <p className="mt-3 text-body-sm text-body">
          No measure on this one. It can be agreed, and its progress will be the
          figure the owner states rather than one that counts itself.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
          {goal.keyResults.map((measure) => (
            <li key={measure.id} className="text-body-sm text-body">
              <span className="font-medium text-ink">{measure.label}</span>
              {" — "}
              <span className="tabular">
                {formatMeasure(measure.startValue, measure.unit)} to{" "}
                {formatMeasure(measure.targetValue, measure.unit)}
              </span>
              {measure.lowerIsBetter && " (counting down)"}
            </li>
          ))}
        </ul>
      )}

      {/* The previous objection, if this has been round once. Kept visible while
          it is waiting again, because the second version only makes sense beside
          what was asked for. */}
      {goal.approvalNote && (
        <p className="mt-3 border-l-2 border-line-strong pl-3 text-body-sm leading-relaxed text-body">
          {goal.approvalNote}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="approve" size="sm" onClick={onAgree}>
          Agree it
        </Button>
        <Button size="sm" onClick={onSendBack}>
          Send it back
        </Button>
        <Button size="sm" onClick={onReject}>
          Refuse it
        </Button>
      </div>
    </div>
  );
}
