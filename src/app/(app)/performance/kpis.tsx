"use client";

import { useState } from "react";
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
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  formatMeasure,
  quarterLabel,
  type ApiGoal,
  type ApiKeyResult,
} from "@/lib/api/performance";
import {
  GOAL_STATUS_LABEL,
  GOAL_STATUS_TONE,
  SCOPE_LABEL,
  useKpiMutations,
  useKpis,
  type GoalNode,
  type KpiScope,
} from "@/lib/store/performance";
import { AddMeasureDialog, NewKpiDialog, StopKpiDialog } from "./goal-dialogs";

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
  const toast = useToast();

  const [creating, setCreating] = useState<{ parentId?: string } | null>(null);
  const [addingTo, setAddingTo] = useState<ApiGoal | null>(null);
  const [stopping, setStopping] = useState<ApiGoal | null>(null);
  const [completing, setCompleting] = useState<ApiGoal | null>(null);

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
  const attention = tracked.filter(
    (goal) => goal.status === "AT_RISK" || goal.status === "OFF_TRACK",
  );
  const measures = kpis.goals.flatMap((goal) => goal.keyResults);
  const hit = measures.filter((measure) => measure.met).length;
  const average =
    tracked.length === 0
      ? 0
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
            options={scopes.map((id) => ({ value: id, label: SCOPE_LABEL[id] }))}
          />
        ) : (
          <span className="text-[0.875rem] text-muted">{SCOPE_LABEL[scope]}</span>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {kpis.source === "demo" && (
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

      {kpis.error && (
        <p className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-[0.875rem] text-ink">
          {kpis.error.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="KPIs being tracked" value={String(tracked.length)} />
        <Stat
          label="Average progress"
          value={`${average}%`}
          hint={tracked.length === 1 ? "across 1 KPI" : `across ${tracked.length} KPIs`}
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
          value={`${hit} of ${measures.length}`}
        />
      </div>

      <Card>
        <CardHeader
          title="The cascade"
          description="Company KPI at the top. Everything below ladders up to it."
        />
        {kpis.loading ? (
          <CardBody className="flex items-center gap-2 text-[0.875rem] text-muted">
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
                onRecord={async (measureId, value) => {
                  await mutations.recordProgress(measureId, value);
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
  onAddMeasure,
  onAddChild,
  onComplete,
  onStop,
  onShare,
  onRecord,
}: {
  node: GoalNode;
  editable: boolean;
  onAddMeasure: (goal: ApiGoal) => void;
  onAddChild: (parentId: string) => void;
  onComplete: (goal: ApiGoal) => void;
  onStop: (goal: ApiGoal) => void;
  onShare: (goal: ApiGoal) => void;
  onRecord: (measureId: string, value: string) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <GoalCard
        goal={node}
        depth={node.depth}
        editable={editable}
        onAddMeasure={onAddMeasure}
        onAddChild={onAddChild}
        onComplete={onComplete}
        onStop={onStop}
        onShare={onShare}
        onRecord={onRecord}
      />
      {node.children.map((child) => (
        <GoalBranch
          key={child.id}
          node={child}
          editable={editable}
          onAddMeasure={onAddMeasure}
          onAddChild={onAddChild}
          onComplete={onComplete}
          onStop={onStop}
          onShare={onShare}
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
  onAddMeasure,
  onAddChild,
  onComplete,
  onStop,
  onShare,
  onRecord,
}: {
  goal: ApiGoal;
  depth: number;
  editable: boolean;
  onAddMeasure: (goal: ApiGoal) => void;
  onAddChild: (parentId: string) => void;
  onComplete: (goal: ApiGoal) => void;
  onStop: (goal: ApiGoal) => void;
  onShare: (goal: ApiGoal) => void;
  onRecord: (measureId: string, value: string) => Promise<void>;
}) {
  const progress = goal.measuredProgress ?? goal.progress;
  const done = goal.status === "DONE";
  const canShare = goal.dueQuarter !== null && goal.keyResults.length > 0;
  const rung = rungLabel(goal);

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
            <p className="text-[0.9375rem] font-medium text-ink">{goal.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[0.75rem] text-muted">
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
              <span>{quarterLabel(goal.dueQuarter)}</span>
              {depth === 0 && goal.parentTitle && (
                <span>Under {goal.parentTitle}</span>
              )}
            </div>
          </div>
        </div>

        <Badge tone={GOAL_STATUS_TONE[goal.status]} size="sm" dot>
          {GOAL_STATUS_LABEL[goal.status]}
        </Badge>
      </div>

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
              editable={!done}
              onRecord={onRecord}
            />
          ))}
        </ul>
      )}

      {goal.keyResults.length === 0 && (
        <p className="mt-3 text-[0.875rem] text-body">
          No measure yet, so nothing tracks itself.
        </p>
      )}

      {editable && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onAddMeasure(goal)}>
            <Plus aria-hidden="true" className="size-4" />
            Add a measure
          </Button>
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
        </div>
      )}
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
  editable,
  onRecord,
}: {
  measure: ApiKeyResult;
  editable: boolean;
  onRecord: (measureId: string, value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const value = draft ?? measure.currentValue;
  const changed = draft !== null && draft.trim() !== measure.currentValue;

  const save = async () => {
    if (!changed) return;
    setSaving(true);
    setFailed(null);
    try {
      await onRecord(measure.id, (draft ?? "").trim());
      setDraft(null);
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
        <span className="text-[0.875rem] font-medium text-ink">
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

      <p className="tabular text-[0.875rem] text-body">
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
            <span className="text-[0.875rem] text-muted">{measure.unit}</span>
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
              <Button size="sm" onClick={() => setDraft(null)}>
                Undo
              </Button>
            </>
          )}
        </div>
      )}

      {failed && (
        <p className="text-[0.875rem] text-danger-text" role="status">
          {failed}
        </p>
      )}
    </li>
  );
}
