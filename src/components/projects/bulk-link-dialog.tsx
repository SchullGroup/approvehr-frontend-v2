"use client";

import { useMemo, useState } from "react";
import { Button, Field, Modal } from "@/components/ui";
import {
  bulkLinkLine,
  type BulkLinkResult,
  type BulkTarget,
} from "@/lib/projects/bulk-link";
import { flattenGroups, objectiveGroups } from "@/lib/projects/objectives";
import { count as countNoun } from "@/lib/projects/terms";
import { useKpis } from "@/lib/store/performance";
import { MeasurePicker, ObjectivePicker } from "./objective-picker";

/**
 * The dialog takes a moment to leave, with focus still in it, and then gives
 * focus back to whatever opened it. If that is gone (the chosen tasks, and the
 * button with them, were let go) focus falls to the page, so once the dialog has
 * left and focus is nowhere, put it where the person was reading.
 */
function settleFocus(target: () => HTMLElement | null) {
  let frames = 0;
  const step = () => {
    frames += 1;
    const now = document.activeElement;
    const inDialog =
      now instanceof HTMLElement && now.closest('[role="dialog"]') !== null;
    if (!inDialog) {
      if (!now || now === document.body) target()?.focus();
      return;
    }
    if (frames < 90) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * Link, or clear, many tasks at once.
 *
 * Opened from a project's task list and from a person's completed list with the
 * tasks already chosen. Choosing an objective (and, if it has measures, one of
 * them) links every task to it; choosing none clears the link on every task.
 * Either way it is the same change as one task's own link, task by task, and the
 * answer is one line and, for any task that could not be changed, one plain
 * reason beside its key. A task that could not be changed is not an alarm: it
 * is somebody else's to link, or it has gone.
 *
 * The dialog never says it changed anything until it has: the line it ends in
 * is built from what each task answered.
 */
export function BulkLinkDialog({
  open,
  onClose,
  tasks,
  assigneeId,
  run,
  onDone,
  focusAfter,
}: {
  open: boolean;
  onClose: () => void;
  /** The tasks chosen, keyed so a failure can name one. */
  tasks: readonly { id: string; key: string }[];
  /** Whose tasks these are, when they are one person's: their KPIs are listed first. */
  assigneeId?: string | null;
  /** Does the changing, and answers what each task said. */
  run: (target: BulkTarget) => Promise<BulkLinkResult>;
  /** The changes are made; refresh whatever is showing them. */
  onDone: (result: BulkLinkResult) => void;
  /**
   * Where focus goes if it has nowhere to return to. The tasks that were chosen
   * are let go once they are changed, and the button that opened this went with
   * them, so a keyboard user would land on the page's top.
   */
  focusAfter?: () => HTMLElement | null;
}) {
  /* Asked for only once the dialog is open: one of these sits behind every list
     that offers it, and none of them should cost a request until it is used. */
  const { goals, loading, error, reload } = useKpis("company", open);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [keyResultId, setKeyResultId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    value: BulkLinkResult;
    title: string | null;
    total: number;
  } | null>(null);

  const groups = useMemo(
    () =>
      objectiveGroups(goals, { meId: null, assigneeId: assigneeId ?? null }),
    [goals, assigneeId],
  );
  const chosen = flattenGroups(groups).find((o) => o.id === goalId);

  /* What was asked is held as it was asked, so the line that follows names the
     objective the tasks went to even if the lists change under it. */
  async function submit() {
    if (busy || tasks.length === 0) return;
    setBusy(true);
    const title = chosen?.title ?? null;
    const target: BulkTarget = goalId ? { goalId, keyResultId } : null;
    const value = await run(target);
    setBusy(false);
    setResult({ value, title, total: tasks.length });
    onDone(value);
  }

  function close() {
    onClose();
    /* Reset once it has gone, so reopening starts clean. */
    setResult(null);
    setGoalId(null);
    setKeyResultId(null);
    if (focusAfter) settleFocus(focusAfter);
  }

  const count = countNoun(tasks.length, "task");

  return (
    <Modal
      open={open}
      onClose={close}
      title={
        result ? "Link tasks to an objective" : `Link ${count} to an objective`
      }
      description={
        result
          ? undefined
          : "Optional. Choose an objective, or none to clear the link on every task chosen."
      }
      footer={
        result ? (
          <Button type="button" variant="primary" onClick={close}>
            Done
          </Button>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={busy}
              disabled={busy || tasks.length === 0}
              onClick={() => void submit()}
            >
              {goalId ? `Link ${count}` : `Clear the link on ${count}`}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-3">
          <p className="text-body-sm text-ink" aria-live="polite">
            {bulkLinkLine(result.value, result.total, result.title)}
          </p>
          {result.value.failed.length > 0 && (
            <ul className="space-y-1.5 text-body-sm text-muted">
              {result.value.failed.map((failure) => (
                <li key={failure.id} className="break-words">
                  <span className="tabular font-medium text-body">
                    {failure.key}
                  </span>{" "}
                  {failure.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Objective" optional>
            <ObjectivePicker
              groups={groups}
              value={goalId}
              loading={loading}
              onChange={(next) => {
                setGoalId(next);
                setKeyResultId(null);
              }}
            />
          </Field>
          {chosen && chosen.measures.length > 0 && (
            <Field label="Measure" optional>
              <MeasurePicker
                labelled
                measures={chosen.measures}
                value={keyResultId}
                onChange={setKeyResultId}
              />
            </Field>
          )}
          {error && (
            <p className="flex flex-wrap items-center gap-x-2 text-meta text-muted">
              Objectives could not be loaded.
              <Button size="sm" variant="ghost" onClick={reload}>
                Try again
              </Button>
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
