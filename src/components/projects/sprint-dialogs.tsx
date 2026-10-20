"use client";

import { useId, useState } from "react";
import {
  Button,
  Callout,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  completionLine,
  sprintFigures,
  type CompletionDestination,
  type SprintFigures,
} from "@/lib/projects/backlog";
import { addDays } from "@/lib/projects/dates";
import {
  DEFAULT_SPRINT_DAYS,
  nextSprintDraft,
  sprintDatesProblem,
  startBlocker,
} from "@/lib/projects/sprints";
import type { CompleteSprintMove, Sprint } from "@/lib/projects/types";
import { useProject } from "./project-context";

/**
 * The four questions a sprint asks: start it, edit it, complete it, delete it.
 *
 * ## Stay mounted, keep the sprint
 *
 * Each dialog is mounted for good and told `open`, so `Modal` can play its exit.
 * That has two consequences, both handled here. The sprint it is about goes
 * `null` the moment it closes — and, for completing, the sprint is gone from the
 * project altogether a beat later — so each keeps the last one it was given
 * (`useHeld`, the adjust-state-during-render idiom; never a ref). And a draft
 * seeded once would greet the next sprint with the last one's text, so each draft
 * is reseeded on every open.
 *
 * ## Who may use them
 *
 * Starting, completing, editing and deleting are the lead's and HR's. The callers
 * only render the buttons for `canManage`; the API is the authority and says so
 * in its own words if it is ever asked by somebody else, which shows here, inside
 * the dialog, rather than as a toast over it.
 */

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** The last non-null value, kept so a closing dialog can still draw itself. */
function useHeld<T>(value: T | null): T | null {
  const [held, setHeld] = useState(value);
  if (value && value !== held) setHeld(value);
  return value ?? held;
}

/**
 * `value` while `live`, and what it last was when `live` stopped.
 *
 * Starting, completing or deleting a sprint changes the very figures the dialog
 * shows — completing leaves "Open 0" behind it — and the store applies the change
 * *before* the dialog is told to close, so the exit animation would play over the
 * new numbers. Callers pass `open && !busy`: frozen from the moment Save is
 * pressed, live again when the dialog next opens. Compared by content, because a
 * figures object is rebuilt on every render and comparing identities would never
 * settle.
 */
function useWhileLive<T>(value: T, live: boolean): T {
  const [held, setHeld] = useState(value);
  if (live && JSON.stringify(value) !== JSON.stringify(held)) setHeld(value);
  return live ? value : held;
}

const NO_FIGURES: SprintFigures = {
  issues: 0,
  points: 0,
  doneIssues: 0,
  donePoints: 0,
  openIssues: 0,
  openPoints: 0,
};

type Props = {
  sprint: Sprint | null;
  open: boolean;
  onClose: () => void;
};

/* ------------------------------------------------------------ start / edit -- */

type Draft = {
  name: string;
  startDate: string;
  endDate: string;
  goal: string;
};

function draftFor(
  sprint: Sprint,
  mode: "start" | "edit",
  today: string,
): Draft {
  /* Starting a sprint without dates would give the board no days to count, so a
     start offers a fortnight from today where there are none. Editing leaves
     what is there. */
  const start = sprint.startDate ?? (mode === "start" ? today : "");
  const end =
    sprint.endDate ??
    (mode === "start" ? addDays(today, DEFAULT_SPRINT_DAYS - 1) : "");
  return {
    name: sprint.name,
    startDate: start,
    endDate: end,
    goal: sprint.goal,
  };
}

export function SprintFormDialog({
  mode,
  sprint: given,
  open,
  onClose,
  onStarted,
}: Props & {
  mode: "start" | "edit";
  /** Called once a sprint has started, for the caller to go to the board. */
  onStarted?: () => void;
}) {
  const { project, issues, sprints, actions, today } = useProject();
  const toast = useToast();
  const formId = useId();
  const sprint = useHeld(given);
  /* Kept true after a save that worked: the dialog is on its way out, and what it
     shows must not change under the exit. Reset when it next opens. */
  const [busy, setBusy] = useState(false);
  const figures = useWhileLive(
    sprint ? sprintFigures(project.statuses, issues, sprint.id) : NO_FIGURES,
    open && !busy,
  );

  const [draft, setDraft] = useState<Draft>(() =>
    given ? draftFor(given, mode, today) : blankDraft(),
  );
  const [wasOpen, setWasOpen] = useState(open);
  const [nameError, setNameError] = useState<string | undefined>();
  const [datesError, setDatesError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && sprint) {
      setDraft(draftFor(sprint, mode, today));
      setNameError(undefined);
      setDatesError(undefined);
      setFailure(null);
      setBusy(false);
    }
  }

  if (!sprint) return null;

  const starting = mode === "start";
  /* Not once it has been sent: after it has started, "only a planned sprint can
     start" is true and would flash over the exit. */
  const blocker =
    starting && open && !busy ? startBlocker(sprint, sprints, issues) : null;
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!sprint || blocker) return;
    const name = draft.name.trim();
    let bad = false;
    if (!name) {
      setNameError("Give the sprint a name.");
      bad = true;
    }
    const problem =
      starting && (!draft.startDate || !draft.endDate)
        ? "Set a start and an end date to start the sprint."
        : sprintDatesProblem(draft.startDate || null, draft.endDate || null);
    if (problem) {
      setDatesError(problem);
      bad = true;
    }
    if (bad) return;

    setBusy(true);
    setFailure(null);
    const edits = {
      name,
      goal: draft.goal.trim(),
      startDate: draft.startDate || null,
      endDate: draft.endDate || null,
    };
    const result = starting
      ? await actions.startSprint(sprint.id, edits, { quiet: true })
      : await actions.updateSprint(sprint.id, edits, { quiet: true });
    if (!result.ok) {
      setBusy(false);
      setFailure(result.message);
      return;
    }
    toast.push({
      tone: "success",
      title: starting ? `${name} started` : `${name} saved`,
    });
    onClose();
    if (starting) onStarted?.();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={starting ? "Start sprint" : "Edit sprint"}
      {...(starting
        ? {
            description: `${plural(figures.issues, "issue", "issues")} and ${plural(figures.points, "point", "points")} will be committed to this sprint.`,
          }
        : {})}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            loading={busy}
            disabled={blocker !== null}
          >
            {starting ? "Start sprint" : "Save"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        {blocker && (
          <Callout tone="warning">
            <span role="alert">{blocker}</span>
          </Callout>
        )}
        <Field
          label="Sprint name"
          required
          {...(nameError ? { error: nameError } : {})}
        >
          <Input
            value={draft.name}
            maxLength={120}
            autoComplete="off"
            onChange={(event) => {
              set("name", event.target.value);
              if (nameError) setNameError(undefined);
            }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Start date"
            {...(starting ? { required: true } : { optional: true })}
            {...(datesError ? { error: datesError } : {})}
          >
            <Input
              type="date"
              value={draft.startDate}
              onChange={(event) => {
                set("startDate", event.target.value);
                if (datesError) setDatesError(undefined);
              }}
            />
          </Field>
          <Field
            label="End date"
            {...(starting ? { required: true } : { optional: true })}
          >
            <Input
              type="date"
              value={draft.endDate}
              onChange={(event) => {
                set("endDate", event.target.value);
                if (datesError) setDatesError(undefined);
              }}
            />
          </Field>
        </div>
        <Field label="Sprint goal" optional>
          <Textarea
            rows={3}
            value={draft.goal}
            placeholder="What should this sprint achieve?"
            onChange={(event) => set("goal", event.target.value)}
          />
        </Field>
        {failure && (
          <p role="alert" className="text-body-sm text-danger-text">
            {failure}
          </p>
        )}
      </form>
    </Modal>
  );
}

function blankDraft(): Draft {
  return { name: "", startDate: "", endDate: "", goal: "" };
}

/* ---------------------------------------------------------------- complete -- */

export function CompleteSprintDialog({ sprint: given, open, onClose }: Props) {
  const { project, issues, sprints, actions, today } = useProject();
  const toast = useToast();
  const formId = useId();
  const sprint = useHeld(given);
  /* Stays true after a completion that worked, so the exit plays over the figures
     it was asked with. Reset when the dialog next opens. */
  const [busy, setBusy] = useState(false);
  const figures = useWhileLive(
    sprint ? sprintFigures(project.statuses, issues, sprint.id) : NO_FIGURES,
    open && !busy,
  );

  const [dest, setDest] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  const [failure, setFailure] = useState<string | null>(null);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDest("");
      setFailure(null);
      setBusy(false);
    }
  }

  if (!sprint) return null;

  const planned = sprints
    .filter((s) => s.state === "PLANNED" && s.id !== sprint.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  /* A choice that has since stopped being offered (that sprint was started or
     deleted by someone else) falls back to the backlog rather than being sent. */
  const choice =
    dest === "new" || planned.some((s) => s.id === dest) ? dest : "";
  const nothingOpen = figures.openIssues === 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!sprint) return;
    const move: CompleteSprintMove =
      choice === "new" ? "new" : choice === "" ? null : choice;
    const to: CompletionDestination =
      choice === "new"
        ? { kind: "new" }
        : choice === ""
          ? { kind: "backlog" }
          : {
              kind: "sprint",
              name: planned.find((s) => s.id === choice)?.name ?? "a sprint",
            };
    /* The line is worked out from what the sprint held when it was asked to
       close, before the store moves anything. */
    const line = completionLine(sprint.name, figures, to);
    setBusy(true);
    setFailure(null);
    const result = await actions.completeSprint(
      sprint.id,
      move,
      nextSprintDraft(project, sprints, today),
      { quiet: true },
    );
    if (!result.ok) {
      setBusy(false);
      setFailure(result.message);
      return;
    }
    toast.push({ tone: "success", title: line });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Complete ${sprint.name}`}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={busy}>
            Complete sprint
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        <dl className="grid grid-cols-2 gap-3">
          <Tile
            label="Completed"
            value={figures.doneIssues}
            detail={plural(figures.donePoints, "point", "points")}
          />
          <Tile
            label="Open"
            value={figures.openIssues}
            detail={plural(figures.openPoints, "point", "points")}
          />
        </dl>
        {nothingOpen ? (
          <p className="text-body-sm text-muted">
            {figures.issues === 0
              ? "This sprint has no issues."
              : "Every issue is done."}
          </p>
        ) : (
          <Field label="Move open issues to">
            <Select
              value={choice}
              onChange={(event) => setDest(event.target.value)}
            >
              <option value="">Backlog</option>
              {planned.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="new">A new sprint</option>
            </Select>
          </Field>
        )}
        {failure && (
          <p role="alert" className="text-body-sm text-danger-text">
            {failure}
          </p>
        )}
      </form>
    </Modal>
  );
}

function Tile({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-canvas px-4 py-3">
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="mt-0.5">
        <span className="tabular text-h4 text-ink">{value}</span>{" "}
        <span className="tabular ml-1 text-body-sm text-muted">{detail}</span>
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ delete -- */

export function DeleteSprintDialog({ sprint: given, open, onClose }: Props) {
  const { project, issues, actions } = useProject();
  const toast = useToast();
  const sprint = useHeld(given);
  const [busy, setBusy] = useState(false);
  const { issues: count } = useWhileLive(
    sprint ? sprintFigures(project.statuses, issues, sprint.id) : NO_FIGURES,
    open && !busy,
  );
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setBusy(false);
  }
  if (!sprint) return null;

  async function confirm() {
    if (!sprint) return;
    setBusy(true);
    const result = await actions.deleteSprint(sprint.id);
    if (!result.ok) {
      setBusy(false);
      return;
    }
    toast.push({ tone: "success", title: `${sprint.name} deleted` });
    onClose();
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={confirm}
      title={`Delete ${sprint.name}?`}
      confirmLabel="Delete sprint"
      loading={busy}
      body={
        count === 0
          ? "It has no issues. This cannot be undone."
          : count === 1
            ? "Its 1 issue goes back to the backlog. This cannot be undone."
            : `Its ${count} issues go back to the backlog. This cannot be undone.`
      }
    />
  );
}
