"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge, Button, Select, Textarea } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiKeyResult, ApiTask } from "@/lib/api/performance";
import { useGoalTasks, useTaskActions } from "@/lib/store/performance";

const GRADE_LABEL: Record<
  NonNullable<ApiTask["grade"]> | "UNGRADED",
  string
> = {
  COMPLETED: "Done",
  PARTIALLY_COMPLETED: "Partly done",
  NOT_COMPLETED: "Not done",
  UNGRADED: "Not graded yet",
};

const GRADE_TONE: Record<
  NonNullable<ApiTask["grade"]> | "UNGRADED",
  "success" | "warning" | "danger" | "neutral"
> = {
  COMPLETED: "success",
  PARTIALLY_COMPLETED: "warning",
  NOT_COMPLETED: "danger",
  UNGRADED: "neutral",
};

/**
 * What was actually done toward one objective, week by week.
 *
 * ## Why this exists beside a measure
 *
 * A measure moves in numbers somebody types by hand — "42 of 60 hires
 * closed" — and says nothing about *what happened* to move it. A task is the
 * other half: a line of what was done, graded by a manager, and it is what
 * `taskCompletionRate` is built from. Only shown on an **agreed** objective,
 * because `submitTask` refuses on anything else — a target still being
 * negotiated has nothing to log progress against yet.
 *
 * ## Inline, not a dialog
 *
 * `MeasureRow` beside this makes the same call for the same reason: logging
 * what you did this week is a five-second job, and a modal turns it into a
 * five-click one. The list under it is this objective's own history, not a
 * queue — grading that history is `ReviewTasksTab`'s job, on a manager's own
 * screen, not something offered here.
 */
export function TaskLogPanel({
  goalId,
  keyResults,
}: {
  goalId: string;
  keyResults: ApiKeyResult[];
}) {
  const { tasks, loading, reload } = useGoalTasks(goalId);
  const actions = useTaskActions();

  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState("");
  const [keyResultId, setKeyResultId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (description.trim().length < 3) {
      setError("Say what you did.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await actions.submitTask(goalId, {
        description: description.trim(),
        ...(keyResultId ? { keyResultId } : {}),
      });
      setDescription("");
      setKeyResultId("");
      setAdding(false);
      reload();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Could not log that.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3.5 border-t border-line pt-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-meta font-medium text-muted">
          Tasks logged against this
        </p>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" className="size-3.5" />
            Log a task
          </Button>
        )}
      </div>

      {adding && (
        <div className="mt-2 flex flex-col gap-2">
          <Textarea
            rows={2}
            value={description}
            disabled={saving}
            placeholder="What did you do toward this, this week?"
            onChange={(event) => setDescription(event.target.value)}
          />
          {keyResults.length > 1 && (
            <Select
              value={keyResultId}
              disabled={saving}
              placeholder="Not tied to one measure"
              onChange={(event) => setKeyResultId(event.target.value)}
            >
              {keyResults.map((measure) => (
                <option key={measure.id} value={measure.id}>
                  {measure.label}
                </option>
              ))}
            </Select>
          )}
          {error && <p className="text-meta text-danger-text">{error}</p>}
          <div className="flex gap-2">
            <Button
              variant="accent"
              size="sm"
              loading={saving}
              onClick={() => void submit()}
            >
              Save it
            </Button>
            <Button
              size="sm"
              disabled={saving}
              onClick={() => {
                setAdding(false);
                setError(null);
                setDescription("");
                setKeyResultId("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!loading && tasks.length === 0 && !adding && (
        <p className="mt-2 text-meta text-muted">Nothing logged yet.</p>
      )}

      {tasks.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {tasks.slice(0, 5).map((task) => {
            const key = task.grade ?? "UNGRADED";
            return (
              <li
                key={task.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line px-3 py-2"
              >
                <span className="min-w-0 text-body-sm text-body">
                  {task.description}
                </span>
                <Badge tone={GRADE_TONE[key]} size="sm">
                  {GRADE_LABEL[key]}
                </Badge>
              </li>
            );
          })}
          {tasks.length > 5 && (
            <li className="text-meta text-muted">
              {tasks.length - 5} more, from earlier weeks
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
