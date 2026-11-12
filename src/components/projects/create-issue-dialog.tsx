"use client";

import { DueTimeInput } from "@/components/projects/due-time-input";
import { useEffect, useId, useRef, useState } from "react";
import {
  Button,
  Field,
  FieldRow,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { openSprints } from "@/lib/projects/board";
import { parsePoints } from "@/lib/projects/mutations";
import { whereItWent } from "@/lib/projects/where-it-went";
import { ApiError } from "@/lib/api/client";
import {
  CREATED_NOTE,
  CYCLE,
  DEFAULT_TYPE,
  EFFORT,
  INITIATIVE,
  LATER,
  NEW_INITIATIVE,
  NEW_TASK,
  TYPE_LABEL,
  displayType,
} from "@/lib/projects/terms";
import {
  PICKABLE_ISSUE_TYPES,
  PRIORITIES,
  PRIORITY_LABEL,
  type IssueType,
  type NewIssueInput,
  type Priority,
} from "@/lib/projects/types";
import { AssigneeList } from "./assignees";
import { MORE_OPTIONS_KEY, MoreOptions, useMoreOptions } from "./more-options";
import { useProject } from "./project-context";
import {
  AttachButton,
  StagedList,
  attachStaged,
  useDropTarget,
  useStagedFiles,
} from "./task-files";

type Draft = {
  type: IssueType;
  title: string;
  description: string;
  priority: Priority;
  points: string;
  epicId: string;
  sprintId: string;
  startDate: string;
  dueDate: string;
  dueTime: string;
  /** Everybody on it, the lead first. */
  assigneeIds: string[];
};

/**
 * The API refused the cycle the task was put in: it closed, or it was deleted,
 * since the dialog opened. Anything else is a real refusal and is shown.
 */
function cycleIsGone(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 422 &&
    /\bcycle\b/i.test(error.message)
  );
}

/** The fields under More options, as the API names them in a refusal. */
const HIDDEN_FIELDS = [
  "type",
  "priority",
  "description",
  "points",
  "epicId",
  "startDate",
  "dueTime",
] as const;

/** A refusal's messages for fields under More options, by field. */
function hiddenFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  const found: Record<string, string> = {};
  for (const field of HIDDEN_FIELDS) {
    const message = error.messageFor(field);
    if (message) found[field] = message;
  }
  return found;
}

function blank(defaults: Partial<NewIssueInput>): Draft {
  return {
    type: displayType(defaults.type ?? DEFAULT_TYPE),
    title: "",
    description: "",
    priority: "MEDIUM",
    points: "",
    epicId: defaults.epicId ?? "",
    sprintId: defaults.sprintId ?? "",
    startDate: "",
    dueDate: "",
    dueTime: "",
    assigneeIds: [],
  };
}

/**
 * Create an issue.
 *
 * Short by default: the title (first, and focused on open), who it is for (with
 * "Assign to me") and the due date, plus the cycle beside it on a project with
 * cycles. Type, priority, description, effort, initiative, due time and files
 * are under "More options", which stays open if it was left open last time
 * (per browser), says in one line what in it is not at its default while
 * closed, and opens itself when the API refuses a field inside it.
 *
 * It stays mounted and reseeds its draft every time it opens, so the last
 * issue's text never greets the next.
 *
 * A refusal from the API is shown inside the dialog, beside the form, rather than
 * as a toast over a dialog that is still open.
 *
 * ## Files
 *
 * "Attach files" (or a drop onto the form) stages files. Create makes the issue
 * first, then uploads and records each file on it, with its own progress. A file
 * that fails does not undo the issue: the dialog says the issue was created,
 * lists what did not attach and why, and offers to try those again — never to
 * create the issue twice. Only against the API; the demo keeps no files.
 */
export function CreateIssueDialog({
  open,
  onClose,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  defaults: Partial<NewIssueInput>;
}) {
  const {
    project,
    issues,
    sprints,
    epics,
    actions,
    meId,
    connected,
    people,
    view,
    filter,
    today,
    dayOf,
  } = useProject();
  const toast = useToast();
  const formId = useId();
  const titleRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<Draft>(() => blank(defaults));
  const [wasOpen, setWasOpen] = useState(open);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  /* A refusal the API pinned on a field under More options, by field name. */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const more = useMoreOptions(MORE_OPTIONS_KEY, open);
  /* Set once the issue exists but a file did not attach to it. */
  const [created, setCreated] = useState<{ id: string; key: string } | null>(
    null,
  );
  const staged = useStagedFiles();
  const drop = useDropTarget((files) => staged.add(files), connected);

  /* Reseeded on every open, from this open's defaults. Adjusting state during
     render, because the dialog stays mounted and a `useState` initialiser runs
     only once. */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(blank(defaults));
      setTitleError(undefined);
      setFailure(null);
      setFieldErrors({});
      setBusy(false);
      setCreated(null);
      staged.clear();
    }
  }

  useEffect(() => {
    if (!open) return;
    /* After the modal's own focus trap has put focus on its first control. */
    const timer = window.setTimeout(() => titleRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const isEpic = draft.type === "EPIC";
  const scrum = project.type === "SCRUM";
  const choices = openSprints(sprints);
  const canAssignMe = meId !== null && project.memberIds.includes(meId);
  /* Cycle sits beside Due date on a project with cycles, not under More options. */
  const showCycle = scrum && !isEpic;
  /* A field under More options with an error opens it, whatever was remembered. */
  const moreOpen = more.remembered || Object.keys(fieldErrors).length > 0;
  const fieldError = (name: string) =>
    fieldErrors[name] ? { error: fieldErrors[name] } : {};
  const epicName = epics.find((e) => e.id === draft.epicId);
  const summary = [
    displayType(draft.type) !== DEFAULT_TYPE &&
      `Type: ${TYPE_LABEL[draft.type]}`,
    draft.priority !== "MEDIUM" &&
      `Priority: ${PRIORITY_LABEL[draft.priority]}`,
    !isEpic && draft.points.trim() !== "" && `${EFFORT.One}: ${draft.points}`,
    !isEpic && epicName && `${INITIATIVE.One}: ${epicName.title}`,
    isEpic && draft.startDate && `Start: ${draft.startDate}`,
    draft.dueDate && draft.dueTime && `Due time: ${draft.dueTime}`,
    draft.description.trim() !== "" && "Description added",
    staged.items.length > 0 &&
      `${staged.items.length} ${staged.items.length === 1 ? "file" : "files"}`,
  ].filter((line): line is string => typeof line === "string");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      setTitleError("Add a title first.");
      titleRef.current?.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    const input: NewIssueInput = {
      type: draft.type,
      title,
      description: draft.description,
      priority: draft.priority,
      points: isEpic ? null : parsePoints(draft.points),
      epicId: isEpic ? null : draft.epicId || null,
      sprintId: isEpic || !scrum ? null : draft.sprintId || null,
      startDate: isEpic ? draft.startDate || null : null,
      dueDate: draft.dueDate || null,
      dueTime: draft.dueDate && draft.dueTime ? draft.dueTime : null,
      assigneeIds: draft.assigneeIds,
    };
    let result = await actions.createIssue(input, { quiet: true });
    /* The cycle closed while the dialog was open (it was the running one when
       it opened). The task is still wanted, so it goes to Later, once, and the
       toast says why. */
    let cycleEnded = false;
    if (!result.ok && input.sprintId && cycleIsGone(result.error)) {
      result = await actions.createIssue(
        { ...input, sprintId: null },
        { quiet: true },
      );
      cycleEnded = result.ok;
    }
    if (!result.ok) {
      setBusy(false);
      const pinned = hiddenFieldErrors(result.error);
      setFieldErrors(pinned);
      /* A message already beside its field is not repeated under the form. */
      setFailure(Object.keys(pinned).length > 0 ? null : result.message);
      return;
    }
    const made = result.value;
    const issue = { id: made.id, key: made.key };
    const detail = cycleEnded
      ? CREATED_NOTE.cycleEnded
      : view
        ? whereItWent({
            view,
            project,
            issue: made,
            issues,
            sprints,
            today,
            doneDayOf: dayOf,
            filter,
            meId,
            nameOf: people.nameOf,
          })
        : null;
    toast.push({
      tone: "success",
      title: `${issue.key} created`,
      ...(detail ? { detail } : {}),
    });
    await attachFiles(issue);
  }

  /** Attach what is staged to the issue just made; close if all of it went. */
  async function attachFiles(issue: { id: string; key: string }) {
    setBusy(true);
    const failed = await attachStaged(issue, staged.items, staged);
    setBusy(false);
    if (failed > 0) {
      setCreated(issue);
      return;
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEpic ? NEW_INITIATIVE : NEW_TASK}
      description={`In ${project.name}`}
      size="lg"
      footer={
        created ? (
          <>
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={busy}
              onClick={() => void attachFiles(created)}
            >
              Try again
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={formId}
              variant="primary"
              loading={busy}
            >
              Create
            </Button>
          </>
        )
      }
    >
      {created && (
        <div className="space-y-3">
          <p role="status" className="text-body-sm text-ink">
            {created.key} was created. These files didn&apos;t attach to it:
          </p>
          <StagedList
            items={staged.items}
            onRemove={staged.remove}
            busy={busy}
            label="Files that didn't attach"
          />
        </div>
      )}
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        hidden={created !== null}
        className={cn(
          "space-y-4 rounded-md",
          drop.over &&
            "outline-2 outline-offset-4 outline-dashed outline-accent",
        )}
        {...drop.handlers}
      >
        <Field
          label="Title"
          required
          {...(titleError ? { error: titleError } : {})}
        >
          <Input
            ref={titleRef}
            value={draft.title}
            maxLength={240}
            placeholder="What needs doing"
            autoComplete="off"
            onChange={(e) => {
              set("title", e.target.value);
              if (titleError) setTitleError(undefined);
            }}
          />
        </Field>

        <fieldset className="space-y-2">
          <legend className="text-body-sm font-medium text-ink">
            Assignee <span className="font-normal text-muted">(optional)</span>
          </legend>
          <AssigneeList
            people={people}
            value={draft.assigneeIds}
            candidates={project.memberIds}
            disabled={false}
            onChange={(next) => set("assigneeIds", next)}
          />
          {canAssignMe && meId && !draft.assigneeIds.includes(meId) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => set("assigneeIds", [...draft.assigneeIds, meId])}
            >
              Assign to me
            </Button>
          )}
        </fieldset>

        <FieldRow>
          <Field label="Due date" optional>
            <Input
              type="date"
              value={draft.dueDate}
              onChange={(e) => {
                set("dueDate", e.target.value);
                /* Clearing the date clears the time, on screen as on save. */
                if (!e.target.value) set("dueTime", "");
              }}
            />
          </Field>
          {showCycle && (
            <Field label={CYCLE.One} optional>
              <Select
                value={draft.sprintId}
                onChange={(e) => set("sprintId", e.target.value)}
              >
                <option value="">{LATER}</option>
                {choices.map((sprint) => (
                  <option key={sprint.id} value={sprint.id}>
                    {sprint.name}
                    {sprint.state === "ACTIVE" ? " (active)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </FieldRow>

        <MoreOptions
          open={moreOpen}
          onToggle={(next) => {
            more.toggle(next);
            if (!next) setFieldErrors({});
          }}
          summary={summary}
        >
          <FieldRow>
            <Field label="Type" {...fieldError("type")}>
              <Select
                value={draft.type}
                onChange={(e) => set("type", e.target.value as IssueType)}
              >
                {PICKABLE_ISSUE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABEL[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" {...fieldError("priority")}>
              <Select
                value={draft.priority}
                onChange={(e) => set("priority", e.target.value as Priority)}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
          </FieldRow>

          <Field label="Description" optional {...fieldError("description")}>
            <Textarea
              value={draft.description}
              rows={4}
              placeholder="What needs doing, and why"
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>

          <FieldRow>
            {!isEpic && (
              <Field label={EFFORT.One} optional {...fieldError("points")}>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={draft.points}
                  placeholder="None"
                  onChange={(e) => set("points", e.target.value)}
                />
              </Field>
            )}
            {!isEpic && (
              <Field label={INITIATIVE.One} optional {...fieldError("epicId")}>
                <Select
                  value={draft.epicId}
                  onChange={(e) => set("epicId", e.target.value)}
                >
                  <option value="">None</option>
                  {epics.map((epic) => (
                    <option key={epic.id} value={epic.id}>
                      {epic.key} {epic.title}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {isEpic && (
              <Field
                label="Start date"
                optional
                help={`${INITIATIVE.Many} with dates appear on the timeline.`}
                {...fieldError("startDate")}
              >
                <Input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                />
              </Field>
            )}
            <Field label="Due time" optional {...fieldError("dueTime")}>
              <DueTimeInput
                date={draft.dueDate}
                value={draft.dueTime}
                onChange={(next) => set("dueTime", next ?? "")}
              />
            </Field>
          </FieldRow>

          {connected && !created && (
            <div className="space-y-2">
              <AttachButton onFiles={(files) => void staged.add(files)} />
              <StagedList
                items={staged.items}
                onRemove={staged.remove}
                busy={busy}
                label="Files to attach"
              />
            </div>
          )}
        </MoreOptions>

        {failure && (
          <p role="alert" className="text-body-sm text-danger-text">
            {failure}
          </p>
        )}
      </form>
    </Modal>
  );
}
