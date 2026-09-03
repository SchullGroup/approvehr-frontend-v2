"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Check,
  CornerDownRight,
  Plus,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Input,
  ProgressMeter,
  SegmentedControl,
  Spinner,
  Stat,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import {
  SuggestButton,
  SuggestionPanel,
} from "@/components/performance/suggestions";
import { ApiError } from "@/lib/api/client";
import { useTaskSummarySuggestion } from "@/lib/store/ai";
import { useSession } from "@/lib/store/session";
import {
  formatMeasure,
  quarterLabel,
  type ApiGoal,
  type ApiKeyResult,
} from "@/lib/api/performance";
import {
  APPROVAL_TONE,
  GOAL_STATUS_LABEL,
  GOAL_STATUS_TONE,
  SCOPE_LABEL,
  mayBeSubmitted,
  useKpiMutations,
  useKpis,
  useObjectiveMutations,
  type GoalNode,
  type KpiScope,
} from "@/lib/store/performance";
import { ApprovalReasonDialog } from "./approval-dialogs";
import { AddMeasureDialog, NewKpiDialog, StopKpiDialog } from "./goal-dialogs";
import { TaskLogPanel } from "./task-log";

/**
 * The KPI cascade.
 *
 * ## One tree, three readings
 *
 * Company goal at the top, team goals beneath it, individual beneath those. The
 * indentation is the ladder; the badge on each row says which rung it is, and
 * that is derived — a goal with no owner is the company's, a goal with goals
 * under it is a team's, anything else is one person's.
 *
 * ## Updating progress is one number, inline
 *
 * No dialog. A measure is a row with a number in it, and moving that number is
 * the thing people come here to do — putting it behind "Open → edit → save"
 * turns a five-second job into a five-click one, and the number then does not
 * get updated.
 *
 * ## `lowerIsBetter` renders the right way round
 *
 * A cost or a time-to-hire target progresses as the number **falls**. The bar
 * fills as it falls, because `percent` comes from the API and the API's
 * arithmetic is direction-aware — this screen never divides current by target.
 * The direction is also stated in words beside it, with an arrow, so a
 * cost-reduction row at 50% cannot be misread as half-failed.
 *
 * ## Two axes on every card, and they disagree on purpose
 *
 * `status` is how it is going. `approval` is whether anybody agreed to it. A KPI
 * can be **agreed and off track** at the same time, which is the ordinary case
 * rather than an edge one, so both badges are on the card and neither is derived
 * from the other. One field carrying both would make "nobody has agreed this" and
 * "this is going badly" indistinguishable, and they call for opposite actions.
 *
 * ## An agreed target is frozen here, and the screen says so before it refuses
 *
 * After agreement the *target* cannot move: not the title, not the period, not a
 * measure's target, and no new measure — because adding one changes what
 * delivering the objective means. Progress still moves, which is the half that is
 * not frozen. The API enforces every one of those; this screen stops offering the
 * controls and says why, because a button that returns "that is refused" was a
 * design failure two clicks earlier.
 *
 * Reopening is the one way through, it needs a reason, and the reason is the
 * record: a target that moved with no account of why is the single most common
 * way an appraisal becomes indefensible.
 */
export function KpisTab({
  scope,
  scopes,
  onScopeChange,
}: {
  scope: KpiScope;
  scopes: KpiScope[];
  onScopeChange: (scope: KpiScope) => void;
}) {
  const kpis = useKpis(scope);
  const mutations = useKpiMutations();
  const objectives = useObjectiveMutations();
  const toast = useToast();
  const { actingId } = useSession();

  const [creating, setCreating] = useState<{ parentId?: string } | null>(null);
  const [addingTo, setAddingTo] = useState<ApiGoal | null>(null);
  const [stopping, setStopping] = useState<ApiGoal | null>(null);
  const [completing, setCompleting] = useState<ApiGoal | null>(null);
  const [reopening, setReopening] = useState<ApiGoal | null>(null);

  /** Every write reports its own failure. The API's message is the useful part. */
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.push({ title: success, tone: "success" });
      kpis.reload();
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

  const tracked = kpis.goals.filter((goal) => goal.status !== "DONE");
  const waiting = kpis.goals.filter(
    (goal) => goal.approval === "AWAITING_APPROVAL",
  );
  const unsent = kpis.goals.filter(
    (goal) => goal.approval === "DRAFT" || goal.approval === "NEEDS_REVISION",
  );
  const attention = tracked.filter(
    (goal) => goal.status === "AT_RISK" || goal.status === "OFF_TRACK",
  );
  const measures = kpis.goals.flatMap((goal) => goal.keyResults);
  const hit = measures.filter((measure) => measure.met).length;
  /* Null, not 0. A mean over nothing is not zero progress — it is no progress
     recorded, and the two read identically on a Stat while meaning opposite
     things. Same rule the module's own `period-status.tsx` states with
     `notYet`. */
  const average =
    tracked.length === 0
      ? null
      : Math.round(
          tracked.reduce(
            (sum, goal) => sum + (goal.measuredProgress ?? goal.progress),
            0,
          ) / tracked.length,
        );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {scopes.length > 1 ? (
          <SegmentedControl<KpiScope>
            label="Whose KPIs to show"
            value={scope}
            onChange={onScopeChange}
            options={scopes.map((id) => ({
              value: id,
              label: SCOPE_LABEL[id],
            }))}
          />
        ) : (
          <span className="text-body-sm text-muted">{SCOPE_LABEL[scope]}</span>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {DEMO_ENABLED && kpis.source === "demo" && (
            <Badge tone="warning" size="sm">
              Demo · numbers stay in this browser
            </Badge>
          )}
          {mutations.editable && (
            <Button variant="accent" size="sm" onClick={() => setCreating({})}>
              <Plus aria-hidden="true" className="size-4" />
              New KPI
            </Button>
          )}
        </div>
      </div>

      <LoadFailure subject="the KPI cascade" error={kpis.error}  onRetry={kpis.reload}/>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="KPIs being tracked" value={String(tracked.length)} />
        <Stat
          label="Average progress"
          value={average === null ? "Nothing tracked yet" : `${average}%`}
          {...(average === null
            ? {}
            : {
                hint:
                  tracked.length === 1 ? "across 1 KPI" : `across ${tracked.length} KPIs`,
              })}
        />
        <Stat
          label="Needs attention"
          value={String(attention.length)}
          {...(attention.length > 0
            ? { trend: { direction: "down" as const, label: "Behind" } }
            : {})}
        />
        <Stat
          label="Measures at target"
          /* "0 of 0" is a measurement of a set nobody has created. */
          value={measures.length === 0 ? "None set yet" : `${hit} of ${measures.length}`}
        />
      </div>

      {/* Delivery against objectives is one of the four parts an appraisal is
          made of, and only an **agreed** objective counts towards it. Somebody
          whose KPIs are all drafts is somebody who will be unscored on that
          part, so the count is on the page rather than discovered at the end of
          the period. */}
      {waiting.length + unsent.length > 0 && (
        <Callout tone="info" title="Not everything here can be scored yet">
          <p>
            Only an agreed objective counts towards delivery at review time.
            {waiting.length > 0 &&
              ` ${waiting.length === 1 ? "1 is" : `${waiting.length} are`} waiting for somebody to agree.`}
            {unsent.length > 0 &&
              ` ${unsent.length === 1 ? "1 has" : `${unsent.length} have`} not been sent yet.`}
          </p>
          <p className="mt-2">
            <Link
              href="/performance/approvals"
              className="font-medium underline-offset-2 hover:underline"
            >
              Objectives waiting on you
            </Link>
          </p>
        </Callout>
      )}

      <Card>
        <CardHeader
          title="The cascade"
          description="Company KPI at the top. Everything below ladders up to it."
        />
        {kpis.loading ? (
          <CardBody className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading KPIs
          </CardBody>
        ) : kpis.cascade.length === 0 ? (
          <EmptyState
            icon={<Target aria-hidden="true" />}
            title="No KPIs yet"
            description="Start with one company KPI, then hang each team's under it."
            action={
              mutations.editable ? (
                <Button variant="accent" onClick={() => setCreating({})}>
                  New KPI
                </Button>
              ) : undefined
            }
          />
        ) : (
          <CardBody className="flex flex-col gap-3">
            {kpis.cascade.map((node) => (
              <GoalBranch
                key={node.id}
                node={node}
                editable={mutations.editable}
                actingId={actingId}
                onAddMeasure={setAddingTo}
                onAddChild={(parentId) => setCreating({ parentId })}
                onComplete={setCompleting}
                onStop={setStopping}
                onShare={(goal) =>
                  void run(
                    () => mutations.shareGoal(goal.id),
                    `"${goal.title}" shared`,
                  )
                }
                onSubmit={(goal) =>
                  void run(
                    () => objectives.submit(goal.id),
                    `"${goal.title}" sent to be agreed`,
                  )
                }
                onReopen={setReopening}
                onRecord={async (measureId, value, note) => {
                  await mutations.recordProgress(measureId, value, note);
                  if (kpis.source === "api") kpis.reload();
                }}
              />
            ))}
          </CardBody>
        )}
      </Card>

      {creating && (
        <NewKpiDialog
          parentId={creating.parentId}
          parentTitle={
            creating.parentId
              ? kpis.goals.find((goal) => goal.id === creating.parentId)?.title
              : undefined
          }
          onClose={() => setCreating(null)}
          onCreate={async (body) => {
            const ok = await run(() => mutations.createGoal(body), "KPI added");
            if (ok) setCreating(null);
          }}
        />
      )}

      {addingTo && (
        <AddMeasureDialog
          goalTitle={addingTo.title}
          onClose={() => setAddingTo(null)}
          onAdd={async (body) => {
            const ok = await run(
              () => mutations.addKeyResult(addingTo.id, body),
              "Measure added",
            );
            if (ok) setAddingTo(null);
          }}
        />
      )}

      {stopping && (
        <StopKpiDialog
          goalTitle={stopping.title}
          onClose={() => setStopping(null)}
          onStop={async (reason) => {
            const ok = await run(
              () => mutations.cancelGoal(stopping.id, reason),
              `"${stopping.title}" stopped`,
            );
            if (ok) setStopping(null);
          }}
        />
      )}

      {reopening && (
        <ApprovalReasonDialog
          act="revise"
          goalTitle={reopening.title}
          onClose={() => setReopening(null)}
          onConfirm={async (reason) => {
            const ok = await run(
              () => objectives.revise(reopening.id, reason),
              `"${reopening.title}" reopened: it has to be agreed again`,
            );
            if (ok) setReopening(null);
          }}
        />
      )}

      <ConfirmDialog
        open={completing !== null}
        onClose={() => setCompleting(null)}
        title={`Mark "${completing?.title ?? ""}" done?`}
        confirmLabel="Mark done"
        tone="primary"
        onConfirm={async () => {
          if (!completing) return;
          const ok = await run(
            () => mutations.completeGoal(completing.id),
            `"${completing.title}" marked done`,
          );
          if (ok) setCompleting(null);
        }}
        body={
          completing && completing.keyResults.some((measure) => !measure.met)
            ? `${completing.keyResults.filter((m) => !m.met).length} of its measures are short of target. Done is your call, and the numbers stay as they are.`
            : "Progress goes to 100% and it drops out of the tracked list."
        }
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** One rung of the ladder, and everything beneath it. */
function GoalBranch({
  node,
  editable,
  actingId,
  onAddMeasure,
  onAddChild,
  onComplete,
  onStop,
  onShare,
  onSubmit,
  onReopen,
  onRecord,
}: {
  node: GoalNode;
  editable: boolean;
  /** Signed-in person's own employee id — decides who may log a task. */
  actingId: string | null;
  onAddMeasure: (goal: ApiGoal) => void;
  onAddChild: (parentId: string) => void;
  onComplete: (goal: ApiGoal) => void;
  onStop: (goal: ApiGoal) => void;
  onShare: (goal: ApiGoal) => void;
  onSubmit: (goal: ApiGoal) => void;
  onReopen: (goal: ApiGoal) => void;
  onRecord: (
    measureId: string,
    value: string,
    note?: string,
  ) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <GoalCard
        goal={node}
        depth={node.depth}
        editable={editable}
        actingId={actingId}
        onAddMeasure={onAddMeasure}
        onAddChild={onAddChild}
        onComplete={onComplete}
        onStop={onStop}
        onShare={onShare}
        onSubmit={onSubmit}
        onReopen={onReopen}
        onRecord={onRecord}
      />
      {node.children.map((child) => (
        <GoalBranch
          key={child.id}
          node={child}
          editable={editable}
          actingId={actingId}
          onAddMeasure={onAddMeasure}
          onAddChild={onAddChild}
          onComplete={onComplete}
          onStop={onStop}
          onShare={onShare}
          onSubmit={onSubmit}
          onReopen={onReopen}
          onRecord={onRecord}
        />
      ))}
    </div>
  );
}

/** Which rung this is. Derived, so it cannot disagree with the data. */
function rungLabel(goal: ApiGoal): string {
  if (goal.companyWide) return "Company KPI";
  if (goal.childCount > 0) return "Team KPI";
  return "Personal KPI";
}

function GoalCard({
  goal,
  depth,
  editable,
  actingId,
  onAddMeasure,
  onAddChild,
  onComplete,
  onStop,
  onShare,
  onSubmit,
  onReopen,
  onRecord,
}: {
  goal: ApiGoal;
  depth: number;
  editable: boolean;
  /** Signed-in person's own employee id — decides who may log a task. */
  actingId: string | null;
  onAddMeasure: (goal: ApiGoal) => void;
  onAddChild: (parentId: string) => void;
  onComplete: (goal: ApiGoal) => void;
  onStop: (goal: ApiGoal) => void;
  onShare: (goal: ApiGoal) => void;
  onSubmit: (goal: ApiGoal) => void;
  onReopen: (goal: ApiGoal) => void;
  onRecord: (
    measureId: string,
    value: string,
    note?: string,
  ) => Promise<void>;
}) {
  const progress = goal.measuredProgress ?? goal.progress;
  const done = goal.status === "DONE";
  const canShare = goal.dueQuarter !== null && goal.keyResults.length > 0;
  const rung = rungLabel(goal);
  /* Only the goal's own owner may log a task against it — the API's own
     rule (`submitTask` throws for anybody else) — and only once it is
     agreed, matching the objective/delivery scoring it feeds. */
  const canLogTasks =
    !done && goal.approval === "AGREED" && actingId === goal.ownerId;
  /* Nothing to agree against: the API refuses to send an objective that belongs
     to no period, because one agreed for no period cannot be agreed before it. */
  const noPeriod = goal.reviewCycleId === null && goal.dueQuarter === null;

  return (
    <div
      className={cn(
        "rounded-lg border border-line p-4",
        goal.companyWide ? "bg-canvas" : "bg-surface",
        done && "opacity-75",
      )}
      style={{ marginLeft: Math.min(depth, 4) * 20 }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-2.5">
          {depth > 0 && (
            <CornerDownRight
              aria-hidden="true"
              className="mt-1 size-4 shrink-0 text-faint"
            />
          )}
          <div className="min-w-0">
            <p className="text-body-sm font-medium text-ink">{goal.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-meta text-muted">
              <Badge tone={goal.companyWide ? "accent" : "neutral"} size="sm">
                {rung}
              </Badge>
              {goal.companyWide ? (
                <span>Everyone</span>
              ) : goal.ownerName ? (
                <span className="flex items-center gap-1.5">
                  <Avatar name={goal.ownerName} size="xs" />
                  {goal.ownerName}
                </span>
              ) : (
                <span>No owner</span>
              )}
              {/* The appraisal period is what makes this scoreable; a bare
                  quarter is what companies typed before periods existed and is
                  still allowed. */}
              <span>
                {goal.reviewCycleName ?? quarterLabel(goal.dueQuarter)}
              </span>
              {goal.revisionCount > 0 && (
                <span>
                  {goal.revisionCount === 1
                    ? "Target reopened once"
                    : `Target reopened ${goal.revisionCount} times`}
                </span>
              )}
              {depth === 0 && goal.parentTitle && (
                <span>Under {goal.parentTitle}</span>
              )}
            </div>
          </div>
        </div>

        {/* Two axes, both shown. Agreed and off track at once is the ordinary
            case, and one badge carrying both would hide whichever mattered. */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={APPROVAL_TONE[goal.approval]} size="sm" dot>
            {goal.approvalLabel}
          </Badge>
          <Badge tone={GOAL_STATUS_TONE[goal.status]} size="sm" dot>
            {GOAL_STATUS_LABEL[goal.status]}
          </Badge>
        </div>
      </div>

      {/* The reason somebody gave. Kept on the card while it matters, because a
          second version of an objective only makes sense beside what was asked
          for — and a refusal with no reason on screen is a refusal nobody can
          act on. */}
      {goal.approvalNote && (
        <p className="mt-3 border-l-2 border-line-strong pl-3 text-body-sm leading-relaxed text-body">
          {goal.approvalNote}
        </p>
      )}

      <div className="mt-3.5">
        <ProgressMeter
          value={progress}
          showValue
          size="sm"
          tone={
            done
              ? "ink"
              : goal.status === "OFF_TRACK"
                ? "danger"
                : goal.status === "AT_RISK"
                  ? "warning"
                  : "accent"
          }
          label={
            goal.keyResults.length === 0
              ? "Progress, entered by hand"
              : goal.keyResults.length === 1
                ? "Progress, from 1 measure"
                : `Progress, from ${goal.keyResults.length} measures`
          }
        />
      </div>

      {goal.keyResults.length > 0 && (
        <ul className="mt-3.5 flex flex-col gap-3 border-t border-line pt-3.5">
          {goal.keyResults.map((measure) => (
            <MeasureRow
              key={measure.id}
              measure={measure}
              goalId={goal.id}
              editable={!done}
              onRecord={onRecord}
            />
          ))}
        </ul>
      )}

      {goal.keyResults.length === 0 && (
        <p className="mt-3 text-body-sm text-body">
          No measure yet, so nothing tracks itself.
        </p>
      )}

      {canLogTasks && (
        <TaskLogPanel goalId={goal.id} keyResults={goal.keyResults} />
      )}

      {/* What the freeze actually costs, said before anything is refused. The
          target is frozen and progress is not, and the two halves are easy to
          confuse into "this KPI is finished". */}
      {goal.targetFrozen && (
        <p className="mt-3 text-body-sm text-muted">
          Agreed, so the target is fixed: the title, the period and every
          measure&apos;s target stay as they are, and no measure can be added
          because that would change what delivering this means. The numbers
          still move.
        </p>
      )}

      {noPeriod && goal.approval !== "AGREED" && (
        <p className="mt-3 text-body-sm text-body">
          Give this a quarter before it can be sent to be agreed. An objective
          agreed for no period cannot be agreed before it.
        </p>
      )}

      <div className="mt-3.5 flex flex-wrap gap-2">
        {/* The lifecycle moves need no permission — the API checks the reporting
            line — so they are offered whatever `editable` says about writing
            goals. Sending your own objective to be agreed is a thing you do to
            your own work. */}
        {mayBeSubmitted(goal) && (
          <Button variant="accent" size="sm" onClick={() => onSubmit(goal)}>
            {goal.approval === "NEEDS_REVISION"
              ? "Send it again"
              : "Send to be agreed"}
          </Button>
        )}
        {goal.approval === "AGREED" && !done && (
          <Button size="sm" onClick={() => onReopen(goal)}>
            Reopen the target
          </Button>
        )}

        {editable && (
          <>
            {/* Refused by the API on an agreed objective, so it is not offered.
                The sentence above says why rather than leaving a gap. */}
            {!goal.targetFrozen && (
              <Button size="sm" onClick={() => onAddMeasure(goal)}>
                <Plus aria-hidden="true" className="size-4" />
                Add a measure
              </Button>
            )}
            <Button size="sm" onClick={() => onAddChild(goal.id)}>
              Add a KPI under this
            </Button>
            {canShare && (
              <Button size="sm" onClick={() => onShare(goal)}>
                Tell the people affected
              </Button>
            )}
            {!done && (
              <>
                <Button size="sm" onClick={() => onComplete(goal)}>
                  Mark done
                </Button>
                <Button size="sm" onClick={() => onStop(goal)}>
                  Stop this KPI
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One measure, with the number editable in place.
 *
 * The Save button appears only once the value has actually changed, so the row
 * is a reading until you make it an edit. The input is `inputMode="decimal"`
 * rather than `type="number"`: a decimal string is what the API stores, spinners
 * on a business figure invite a stray scroll, and `type="number"` silently
 * discards a value it cannot parse.
 */
function MeasureRow({
  measure,
  goalId,
  editable,
  onRecord,
}: {
  measure: ApiKeyResult;
  /** The objective this measure belongs to. Grounds the write-up suggestion. */
  goalId: string;
  editable: boolean;
  onRecord: (
    measureId: string,
    value: string,
    note?: string,
  ) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const summary = useTaskSummarySuggestion();

  const value = draft ?? measure.currentValue;
  const changed = draft !== null && draft.trim() !== measure.currentValue;

  const save = async () => {
    if (!changed) return;
    setSaving(true);
    setFailed(null);
    try {
      await onRecord(measure.id, (draft ?? "").trim(), note.trim() || undefined);
      setDraft(null);
      setNote("");
      summary.clear();
    } catch (error) {
      setFailed(
        error instanceof ApiError
          ? error.message
          : "Could not save that number. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-body-sm font-medium text-ink">
          {measure.label}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <Badge
            tone="neutral"
            size="sm"
            icon={
              measure.lowerIsBetter ? (
                <TrendingDown aria-hidden="true" />
              ) : (
                <TrendingUp aria-hidden="true" />
              )
            }
          >
            {measure.lowerIsBetter ? "Counting down" : "Counting up"}
          </Badge>
          {measure.met && (
            <Badge tone="accent" size="sm" icon={<Check aria-hidden="true" />}>
              At target
            </Badge>
          )}
        </span>
      </div>

      <ProgressMeter
        value={measure.percent}
        showValue
        size="sm"
        tone={measure.met ? "ink" : "accent"}
      />

      <p className="tabular text-body-sm text-body">
        Now {formatMeasure(measure.currentValue, measure.unit)} · target{" "}
        {formatMeasure(measure.targetValue, measure.unit)} · started at{" "}
        {formatMeasure(measure.startValue, measure.unit)}
      </p>

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={`Latest number for ${measure.label}`}
            inputMode="decimal"
            className="h-8 w-36"
            value={value}
            onChange={(event) => setDraft(event.target.value)}
          />
          {measure.unit && (
            <span className="text-body-sm text-muted">{measure.unit}</span>
          )}
          {changed && (
            <>
              <Button
                variant="accent"
                size="sm"
                loading={saving}
                onClick={() => void save()}
              >
                Save<span className="sr-only"> {measure.label}</span>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setDraft(null);
                  setNote("");
                  summary.clear();
                }}
              >
                Undo
              </Button>
            </>
          )}
        </div>
      )}

      {/* The note the API has always accepted and nothing has ever rendered.
          `progressSchema` takes `{ currentValue, note }` and `recordProgress`
          has carried a third argument the whole time — so a number moved and
          the reason it moved was lost, which is the fact somebody actually
          needs at the review. It appears only once the number has changed:
          asking "what did you do" beside a figure nobody has touched is a
          question about nothing. */}
      {editable && changed && (
        <div className="flex flex-col gap-2">
          <Textarea
            rows={2}
            aria-label={`What moved ${measure.label}`}
            placeholder="What moved it? Closed the Ikeja rollout…"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SuggestButton
              loading={summary.loading}
              label="Write this up for me"
              onClick={() =>
                void summary.ask({ goalId, headline: note.trim() })
              }
            />
            {note.trim().length > 0 && note.trim().length < 10 && (
              <span className="text-meta text-muted">
                A few more words and it can draft the rest.
              </span>
            )}
          </div>
          <SuggestionPanel
            state={summary}
            onDismiss={summary.clear}
            useLabel="Use this wording"
            emptyHint="Your words, expanded. Check it before you save."
            /* Replaces the headline with the fuller version, in an editable box
               somebody still has to press Save under. The suggestion is built
               from what they typed and adds no achievement they did not
               mention — see `modules/ai/service.ts#suggestTaskSummary`. */
            onUse={(suggestion) => setNote(suggestion.detail || suggestion.title)}
          />
        </div>
      )}

      {failed && (
        <p className="text-body-sm text-danger-text" role="status">
          {failed}
        </p>
      )}
    </li>
  );
}
