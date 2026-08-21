"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  Modal,
  Radio,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  OUTCOME_CHOICES,
  OUTCOME_LABELS,
  ownerLabel,
  type ApiExitGroup,
  type ApiExitTask,
  type ExitTaskOutcome,
  type UpdateTaskBody,
} from "@/lib/api/offboarding";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { Select } from "@/components/ui";

/**
 * The checklist: one card per group, one row per line.
 *
 * ## Two checkboxes, two people
 *
 * The first says the thing was done. The second is labelled **"Checked by"** and
 * says somebody else saw it. They are deliberately not one control with two
 * clicks: "I returned the laptop" and "I received the laptop" are different
 * claims, and the API refuses to let one account make both. The second box being
 * a box — rather than a button, or a state on the first — is what makes it read
 * as a second signature.
 *
 * Confirmation is never a blocker on closing. It is a control, not a gate: an
 * exit that could not close because nobody was free to countersign would push
 * people to tick both boxes themselves, which is the failure it exists to stop.
 *
 * ## An unreturned laptop is an open task with an answer
 *
 * "Still not back" records what happened without ticking the line off, so it
 * keeps blocking. The only ways past it are the laptop coming back, or the
 * company writing it off with a reason — a decision that belongs in the record,
 * not behind a checkbox.
 */
export function Checklist({
  groups,
  closed,
  canTick,
  canVerify,
  completedByMe,
  onUpdate,
  onVerify,
}: {
  groups: ApiExitGroup[];
  /** Nothing can change once the exit is closed or declined. */
  closed: boolean;
  canTick: (task: ApiExitTask) => boolean;
  /** `EDIT_RECORDS`. The second signature is not everybody's to give. */
  canVerify: boolean;
  /** A hint so the interface does not offer a refusal. The API is the control. */
  completedByMe: (task: ApiExitTask) => boolean;
  onUpdate: (taskId: string, body: UpdateTaskBody) => Promise<void>;
  onVerify: (taskId: string) => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [recording, setRecording] = useState<ApiExitTask | null>(null);
  const [handing, setHanding] = useState<ApiExitTask | null>(null);

  async function run(taskId: string, action: () => Promise<void>) {
    setBusy(taskId);
    try {
      await action();
      return true;
    } catch (error) {
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {groups.map((group) => {
          const done = group.tasks.filter((task) => task.completed).length;
          return (
            <Card key={group.kind}>
              <CardHeader
                title={group.label}
                level={3}
                action={
                  <span className="tabular text-[0.875rem] text-muted">
                    {done} of {group.tasks.length}
                  </span>
                }
              />
              <CardBody className="flex flex-col gap-3">
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    closed={closed}
                    busy={busy === task.id}
                    canTick={canTick(task)}
                    canVerify={canVerify}
                    tickedByMe={completedByMe(task)}
                    onTick={(next) =>
                      void run(task.id, () =>
                        onUpdate(task.id, { completed: next }),
                      )
                    }
                    onVerify={() => void run(task.id, () => onVerify(task.id))}
                    onRecord={() => setRecording(task)}
                    onHandOver={canVerify ? () => setHanding(task) : undefined}
                  />
                ))}
              </CardBody>
            </Card>
          );
        })}
      </div>

      {recording && (
        <OutcomeDialog
          task={recording}
          onClose={() => setRecording(null)}
          onSave={async (body) => {
            const ok = await run(recording.id, () =>
              onUpdate(recording.id, body),
            );
            if (ok) setRecording(null);
          }}
        />
      )}

      {handing && (
        <HandOverDialog
          task={handing}
          onClose={() => setHanding(null)}
          onSave={async (assigneeId) => {
            const ok = await run(handing.id, () =>
              onUpdate(handing.id, { assigneeId }),
            );
            if (ok) {
              toast.push({ title: "Handed over", tone: "success" });
              setHanding(null);
            }
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function TaskRow({
  task,
  closed,
  busy,
  canTick,
  canVerify,
  tickedByMe,
  onTick,
  onVerify,
  onRecord,
  onHandOver,
}: {
  task: ApiExitTask;
  closed: boolean;
  busy: boolean;
  canTick: boolean;
  canVerify: boolean;
  /** True when this account ticked it off, so it cannot also confirm it. */
  tickedByMe: boolean;
  onTick: (next: boolean) => void;
  onVerify: () => void;
  onRecord: () => void;
  /** Absent for anybody who cannot reassign — HR only. */
  onHandOver?: (() => void) | undefined;
}) {
  const stuck = task.outcome === "NOT_RETURNED";
  const owner = ownerLabel(task.owner);
  const who =
    task.assigneeName && task.assigneeName !== owner
      ? `${owner} · ${task.assigneeName}`
      : owner;

  /* Equipment gets the four answers. Everything else gets one — writing it off —
     because "came back damaged" is not a sentence about a reference letter, and
     a mandatory line nobody can finish still needs a way out. */
  const choices = OUTCOME_CHOICES.filter(
    (choice) => task.kind === "EQUIPMENT" || choice.value === "WAIVED",
  );

  /* Once two people have signed a line off, correcting it means reopening it —
     so the outcome control goes away rather than quietly overwriting a
     confirmation. Equipment keeps it while unconfirmed, because "came back" and
     "came back damaged" are noticed a day apart. */
  const showOutcome =
    !closed &&
    canTick &&
    !task.verified &&
    (!task.completed || task.kind === "EQUIPMENT");

  return (
    /* Stacked on a phone, side by side from `sm`. `flex-wrap` was not enough:
       a `min-w-0 flex-1` label beside a `shrink-0` block stays on one line and
       collapses to one word per line rather than wrapping to the next row. */
    <div className="flex flex-col gap-3 rounded-md border border-line p-3 sm:flex-row sm:items-start sm:gap-4">
      <div className="min-w-0 flex-1">
        <Checkbox
          checked={task.completed}
          disabled={closed || busy || !canTick}
          onChange={(e) => onTick(e.target.checked)}
          label={
            <span className="flex flex-wrap items-center gap-2">
              <span className={task.completed ? "text-muted line-through" : ""}>
                {task.label}
              </span>
              {!task.mandatory && (
                <Badge tone="neutral" size="sm">
                  Optional
                </Badge>
              )}
              {task.outcome && task.outcome !== "DONE" && (
                <Badge tone={stuck ? "danger" : "warning"} size="sm">
                  {OUTCOME_LABELS[task.outcome]}
                </Badge>
              )}
            </span>
          }
          description={who}
        />

        {task.note && (
          <p className="mt-2 ml-7 text-[0.875rem] text-body">{task.note}</p>
        )}
      </div>

      <div className="flex flex-col items-start gap-2 sm:shrink-0">
        {/* The second signature. A different label, because it is a different
            person — not a second state on the box above it.

            A confirmed box is deliberately **not** `disabled`. `Checkbox`
            orders its `disabled:` utilities after its `checked:` ones, so a
            box that is both renders a white tick on `bg-sunken` — about
            1.06:1, which is invisible. A confirmed line that looks
            unconfirmed is the one thing this control must never do. So it is
            checked, immutable through a no-op handler, and dark. The fix
            belongs in `components/ui/choice.tsx`, but that is a shared
            component and changing its disabled state needs its own pass
            through `verify-contrast`. */}
        {task.verified ? (
          <Checkbox
            checked
            onChange={() => undefined}
            onClick={(e) => e.preventDefault()}
            label={
              task.verifiedByName
                ? `Checked by ${task.verifiedByName}`
                : "Checked by"
            }
          />
        ) : (
          <Checkbox
            checked={false}
            disabled={closed || busy || !canVerify || !task.completed || tickedByMe}
            onChange={() => onVerify()}
            label="Checked by"
            {...(!closed && task.completed && tickedByMe
              ? { description: "Somebody else has to confirm this." }
              : {})}
          />
        )}

        {showOutcome && choices.length > 0 && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onRecord}>
            {task.kind === "EQUIPMENT" ? "Say what happened" : "Write it off"}
          </Button>
        )}

        {/* `PATCH /tasks/:id` has always taken an `assigneeId` and notified
            whoever it landed on, and nothing ever sent one — so a line owned by
            "IT" stayed owned by nobody in particular, which in a thirty-person
            company means it stays undone. Only offered while the line is open:
            handing over something already finished is not a thing to do. */}
        {onHandOver && !closed && !task.completed && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={onHandOver}>
            {task.assigneeName ? "Hand to somebody else" : "Give it to somebody"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * What happened to it.
 *
 * Every answer except "came back" needs a note, because each one is a claim
 * somebody will be asked about later — an insurance question, a final-pay
 * deduction, or a write-off in the accounts.
 *
 * ## Why the note is required whenever there already is one
 *
 * `PATCH /tasks/:id` takes `note` with a minimum length of one, so a note
 * cannot be *removed* once written — only replaced. Left alone, that produced a
 * row reading "Came back" with "Emeka says it is at home" underneath it: the
 * answer and the note contradicting each other, which is worse than either
 * alone. So a line that already carries a note has to be given a fresh one.
 *
 * TODO(clear-note): when the API accepts a null note, drop `alreadyNoted` from
 * `noteRequired` below and let an outdated line simply be cleared.
 */
function OutcomeDialog({
  task,
  onClose,
  onSave,
}: {
  task: ApiExitTask;
  onClose: () => void;
  onSave: (body: UpdateTaskBody) => Promise<void>;
}) {
  const choices = OUTCOME_CHOICES.filter(
    (choice) => task.kind === "EQUIPMENT" || choice.value === "WAIVED",
  );
  const first = choices[0];
  const [outcome, setOutcome] = useState<ExitTaskOutcome>(
    first ? first.value : "WAIVED",
  );
  const [note, setNote] = useState(task.note ?? "");
  const [busy, setBusy] = useState(false);

  const needsNote =
    choices.find((choice) => choice.value === outcome)?.needsNote ?? true;
  const alreadyNoted = task.note !== null;
  const noteRequired = needsNote || alreadyNoted;
  const ready = !noteRequired || note.trim().length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={task.label}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!ready || busy}
            onClick={() => {
              setBusy(true);
              void onSave({
                outcome,
                ...(note.trim() ? { note: note.trim() } : {}),
              }).finally(() => setBusy(false));
            }}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          {choices.map((choice) => (
            <Radio
              key={choice.value}
              name="exit-task-outcome"
              value={choice.value}
              checked={outcome === choice.value}
              onChange={() => setOutcome(choice.value)}
              label={choice.label}
              {...(choice.value === "NOT_RETURNED"
                ? { description: "Stays open until it comes back." }
                : {})}
            />
          ))}
        </div>

        <Field
          label="What happened"
          required={noteRequired}
          help={noteRequired ? undefined : "Optional."}
        >
          <Textarea
            rows={3}
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Left it at home, bringing it Monday."
          />
        </Field>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Giving a line to a person.
 *
 * `PATCH /tasks/:id` has always taken an `assigneeId` and notified whoever the
 * line landed on. Nothing ever sent one, so every line owned by a *role* — "IT",
 * "Finance" — was owned by nobody, and a task with no name on it in a
 * thirty-person company is a task that gets done on the last day or not at all.
 *
 * The directory is loaded here rather than by the screen above, so opening a
 * leaver's page does not fetch two hundred people on the chance that somebody
 * reassigns something. This component only exists while the dialog is open.
 *
 * "Back to the role" sends `null`, which is the API's own way of saying the line
 * belongs to whoever is free again — a real answer, not a cleared field.
 */
function HandOverDialog({
  task,
  onClose,
  onSave,
}: {
  task: ApiExitTask;
  onClose: () => void;
  onSave: (assigneeId: string | null) => Promise<void>;
}) {
  const { employees, loading } = useEmployeeDirectory({ pageSize: 200 });
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title={task.label}
      description={`Right now this is ${ownerLabel(task.owner)}${
        task.assigneeName ? ` — ${task.assigneeName}` : " and nobody in particular"
      }.`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={busy || assigneeId === (task.assigneeId ?? "")}
            onClick={() => {
              setBusy(true);
              void onSave(assigneeId === "" ? null : assigneeId).finally(() =>
                setBusy(false),
              );
            }}
          >
            {busy ? "Saving…" : "Hand it over"}
          </Button>
        </div>
      }
    >
      <Field
        label="Who is doing it"
        help="They are told, once, when it changes hands."
      >
        <Select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
        >
          <option value="">
            {loading ? "Loading people…" : `Back to ${ownerLabel(task.owner)}`}
          </option>
          {employees.map((person) => (
            <option key={person.id} value={person.id}>
              {person.firstName} {person.lastName} · {person.jobTitle}
            </option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}
