"use client";

import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Select,
  Spinner,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { NOTICE_LINK, NoticeLine } from "@/components/portal/notice-line";
import { ApiError } from "@/lib/api/client";
import type { ApiGoal, ApiMyTask } from "@/lib/api/performance";
import { dayOf } from "@/lib/api/performance";
import { useKpis, useMyTasks, useTaskActions } from "@/lib/store/performance";
import { useSession } from "@/lib/store/session";

const GRADE_LABEL: Record<NonNullable<ApiMyTask["grade"]>, string> = {
  COMPLETED: "Done",
  PARTIALLY_COMPLETED: "Partly done",
  NOT_COMPLETED: "Not done",
};

const GRADE_TONE: Record<
  NonNullable<ApiMyTask["grade"]>,
  "success" | "warning" | "danger"
> = {
  COMPLETED: "success",
  PARTIALLY_COMPLETED: "warning",
  NOT_COMPLETED: "danger",
};

/**
 * Where somebody logs what they did, and reads what came back.
 *
 * ## Why this exists as its own panel
 *
 * The feedback was blunt about it: *"there is no place for employees to submit
 * their tasks"*. That was not quite true and the "not quite" is the whole
 * problem — `TaskLogPanel` worked, inside the detail modal of one specific
 * KPI. So somebody with four objectives had four places to log, each two
 * clicks deep, and nowhere at all to see their own week. A capability you can
 * only reach by already knowing where it is may as well not be there.
 *
 * The per-objective panel stays where it is: logging against the objective
 * you are looking at is the right move when you are looking at one. This is
 * the other door — the week, across every objective.
 *
 * ## Grades are read here, not given
 *
 * Ungraded shows as **"Waiting on a grade"**, never as "Not done". A week a
 * manager has not looked at yet is not a week of nothing, which is the same
 * distinction `taskCompletionRate` makes on the API when it refuses to score
 * an ungraded task as a zero.
 */
export function MyTasksPanel() {
  const { actingId } = useSession();
  const { tasks, loading, error, reload } = useMyTasks();
  const { goals, loading: goalsLoading } = useKpis("mine");
  const actions = useTaskActions();
  const toast = useToast();

  const [description, setDescription] = useState("");
  const [goalId, setGoalId] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  /* What the API will actually accept a task against: mine, agreed, still
     running. `submitTask` refuses everything else, so offering it here would
     be offering a refusal. */
  const loggable = useMemo(
    () =>
      goals.filter(
        (goal: ApiGoal) =>
          goal.ownerId === actingId &&
          goal.approval === "AGREED" &&
          goal.status !== "DONE",
      ),
    [goals, actingId],
  );

  /* Newest week first, and the API already sorts by when each task was
     logged — so grouping preserves that order without a second sort. */
  const weeks = useMemo(() => {
    const out: { key: string; label: string; tasks: ApiMyTask[] }[] = [];
    for (const task of tasks) {
      const last = out[out.length - 1];
      if (last && last.key === task.weekStart) {
        last.tasks.push(task);
        continue;
      }
      out.push({
        key: task.weekStart,
        label: `${dayOf(task.weekStart)} – ${dayOf(task.weekEnd)}`,
        tasks: [task],
      });
    }
    return out;
  }, [tasks]);

  const only = loggable.length === 1 ? loggable[0] : undefined;
  const chosen = only?.id ?? goalId;

  const submit = async () => {
    if (!chosen) {
      setFormError("Pick which objective this was toward.");
      return;
    }
    if (description.trim().length < 3) {
      setFormError("Say what you did.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await actions.submitTask(chosen, { description: description.trim() });
      setDescription("");
      if (!only) setGoalId("");
      reload();
      toast.push({
        title: "Logged",
        detail: "It goes to whoever reviews your work.",
        tone: "success",
      });
    } catch (cause) {
      setFormError(
        cause instanceof ApiError ? cause.message : "Could not log that.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <LoadFailure subject="your tasks" error={error} onRetry={reload} />

      <Card>
        <CardHeader title="Log what you did" />
        {goalsLoading ? (
          <CardBody className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </CardBody>
        ) : loggable.length === 0 ? (
          /* Not an error and not a form to grey out: a task is logged against
             an agreed objective, and somebody with none has an earlier step to
             take. Said as a line with the way forward in it, per the pattern
             `NoticeLine` exists for. */
          <CardBody>
            <NoticeLine tone="muted">
              A task is logged against an objective your manager has agreed.
              <a className={NOTICE_LINK} href="/performance/kpis">
                Set one up
              </a>
            </NoticeLine>
          </CardBody>
        ) : (
          <CardBody className="flex flex-col gap-3">
            {/* One objective needs no picker — it would be a control with a
                single answer, which is a decision the screen can make. */}
            {only ? (
              <p className="text-body-sm text-muted">
                Toward <span className="text-body">{only.title}</span>
              </p>
            ) : (
              <Select
                aria-label="Which objective this was toward"
                value={goalId}
                disabled={saving}
                placeholder="Pick an objective"
                onChange={(event) => setGoalId(event.target.value)}
              >
                {loggable.map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
              </Select>
            )}
            <Textarea
              aria-label="What you did"
              rows={2}
              maxLength={300}
              value={description}
              disabled={saving || !actions.editable}
              placeholder="Shipped the pagination endpoint and got it reviewed."
              onChange={(event) => setDescription(event.target.value)}
            />
            {formError && (
              <p className="text-meta text-danger-text">{formError}</p>
            )}
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="accent"
                loading={saving}
                disabled={!actions.editable}
                onClick={() => void submit()}
              >
                Log it
              </Button>
            </div>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Your weeks"
          {...(tasks.length > 0
            ? { description: "What you logged, and how it was graded." }
            : {})}
        />
        {loading ? (
          <CardBody className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </CardBody>
        ) : weeks.length === 0 ? (
          <EmptyState
            compact
            icon={<ClipboardList aria-hidden="true" />}
            title="Nothing logged yet"
            description="What you log here is what a manager grades, and what your delivery score is built from."
          />
        ) : (
          <CardBody className="flex flex-col gap-5">
            {weeks.map((week) => (
              <section key={week.key} className="flex flex-col gap-2">
                <h3 className="text-meta font-semibold text-muted">
                  {week.label}
                </h3>
                <ul className="flex flex-col gap-2">
                  {week.tasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-2"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-body-sm text-body">
                          {task.description}
                        </span>
                        <span className="text-meta text-muted">
                          {task.goalTitle}
                        </span>
                      </div>
                      {task.grade === null ? (
                        <span className="text-meta text-muted">
                          Waiting on a grade
                        </span>
                      ) : (
                        <Badge tone={GRADE_TONE[task.grade]}>
                          {GRADE_LABEL[task.grade]}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </CardBody>
        )}
      </Card>
    </div>
  );
}
