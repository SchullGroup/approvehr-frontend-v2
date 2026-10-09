"use client";

import { useState } from "react";
import { Button, Field, Modal, Select, Textarea } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiTaskGrade } from "@/lib/api/performance";
import {
  GRADE_NOTE_MAX,
  gradeNeedsNote,
  gradeNoteProblem,
} from "@/lib/performance/task-grade";

/**
 * One task about to be graded with a comment.
 *
 * `grade` is the one already chosen on the row — Partly done or Reject, which
 * cannot be given without a reason — or `null` for "Grade with a comment",
 * where the reviewer picks the grade here and the comment is optional unless
 * they pick one of those two.
 */
export type GradeRequest = {
  task: { id: string; employeeName: string; description: string };
  grade: ApiTaskGrade | null;
};

/** The reviewer's words for each grade, as the row buttons say them. */
const ACTION: Record<ApiTaskGrade, string> = {
  COMPLETED: "Done",
  PARTIALLY_COMPLETED: "Partly done",
  NOT_COMPLETED: "Not done",
  REJECTED: "Reject",
};

const CHOICES: ApiTaskGrade[] = [
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "NOT_COMPLETED",
  "REJECTED",
];

const TITLE: Record<ApiTaskGrade | "choose", string> = {
  choose: "Grade with a comment",
  COMPLETED: "Mark as done",
  PARTIALLY_COMPLETED: "Mark as partly done",
  NOT_COMPLETED: "Mark as not done",
  REJECTED: "Reject this task",
};

const CONFIRM: Record<ApiTaskGrade | "choose", string> = {
  choose: "Save grade",
  COMPLETED: "Save grade",
  PARTIALLY_COMPLETED: "Mark partly done",
  NOT_COMPLETED: "Save grade",
  REJECTED: "Reject task",
};

const PLACEHOLDER: Record<ApiTaskGrade | "choose", string> = {
  choose: "Anything they should know?",
  COMPLETED: "Anything they should know?",
  PARTIALLY_COMPLETED: "The endpoint is up, but the tests are still missing.",
  NOT_COMPLETED: "Anything they should know?",
  REJECTED: "This is not part of this objective. Log the pagination work.",
};

/**
 * The comment on a weekly task's grade.
 *
 * A comment is required for Partly done and Reject, and optional on the other
 * two. The floor and ceiling are the API's own (`GRADE_NOTE_MIN` /
 * `GRADE_NOTE_MAX`), so this refuses nothing the server would accept.
 *
 * Stays mounted while closed, like `ApprovalReasonDialog`, so `Modal` can play
 * its exit: the request is frozen while the caller's goes `null`, and the
 * draft is cleared whenever a new request arrives, so one task's half-written
 * comment never turns up on the next.
 */
export function TaskGradeDialog({
  request,
  open,
  onClose,
  onConfirm,
}: {
  /** `null` while closed. */
  request: GradeRequest | null;
  open: boolean;
  onClose: () => void;
  /** Throw to keep the dialog open and show why. */
  onConfirm: (grade: ApiTaskGrade, note: string) => Promise<void>;
}) {
  const [frozen, setFrozen] = useState(request);
  const [picked, setPicked] = useState<ApiTaskGrade | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /* A new request is a new task, or the same task asked about again: start
     from a clean draft either way. */
  if (request && request !== frozen) {
    setFrozen(request);
    setPicked("");
    setNote("");
    setFailed(null);
  }

  if (!frozen) return null;

  const fixed = frozen.grade;
  const grade: ApiTaskGrade | null = fixed ?? (picked || null);
  const mode = fixed ?? "choose";
  const required = grade !== null && gradeNeedsNote(grade);
  const problem = grade === null ? null : gradeNoteProblem(grade, note);
  /* Only nag once there is something to nag about — an empty required field
     is the starting state, not a mistake. */
  const showProblem = problem !== null && note.trim().length > 0;
  const ready = grade !== null && problem === null;

  const submit = async () => {
    if (!ready || grade === null) return;
    setBusy(true);
    setFailed(null);
    try {
      await onConfirm(grade, note.trim());
    } catch (error) {
      setFailed(
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
      title={TITLE[mode]}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={grade === "REJECTED" ? "danger" : "accent"}
            loading={busy}
            disabled={!ready}
            onClick={() => void submit()}
          >
            {CONFIRM[mode]}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-meta font-medium text-muted">
            {frozen.task.employeeName}
          </p>
          <p className="mt-0.5 line-clamp-3 text-body-sm text-body">
            {frozen.task.description}
          </p>
        </div>

        {fixed === null && (
          <Field label="Grade" required>
            <Select
              value={picked}
              disabled={busy}
              placeholder="Pick a grade"
              onChange={(event) =>
                setPicked(event.target.value as ApiTaskGrade)
              }
            >
              {CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {ACTION[choice]}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {grade === "REJECTED" && (
          <p className="text-body-sm text-muted">
            It counts as not done. They can log a corrected task this week.
          </p>
        )}

        <Field
          label="Comment"
          {...(required ? { required: true } : { optional: true })}
          {...(showProblem ? { error: problem } : {})}
        >
          <Textarea
            rows={4}
            maxLength={GRADE_NOTE_MAX}
            value={note}
            disabled={busy}
            placeholder={PLACEHOLDER[mode]}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <p className="-mt-3 text-right text-meta tabular-nums text-muted">
          {note.length}/{GRADE_NOTE_MAX}
        </p>

        {failed && (
          <p
            role="status"
            className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink"
          >
            {failed}
          </p>
        )}
      </div>
    </Modal>
  );
}
