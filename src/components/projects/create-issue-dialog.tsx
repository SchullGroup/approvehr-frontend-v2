"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { openSprints } from "@/lib/projects/board";
import { parsePoints } from "@/lib/projects/mutations";
import {
  ISSUE_TYPE_LABEL,
  PICKABLE_ISSUE_TYPES,
  PRIORITIES,
  PRIORITY_LABEL,
  type IssueType,
  type NewIssueInput,
  type Priority,
} from "@/lib/projects/types";
import { AssigneeList } from "./assignees";
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
  /** Everybody on it, the lead first. */
  assigneeIds: string[];
};

function blank(defaults: Partial<NewIssueInput>): Draft {
  return {
    type: defaults.type ?? "STORY",
    title: "",
    description: "",
    priority: "MEDIUM",
    points: "",
    epicId: defaults.epicId ?? "",
    sprintId: defaults.sprintId ?? "",
    startDate: "",
    dueDate: "",
    assigneeIds: [],
  };
}

/**
 * Create an issue.
 *
 * Type, summary, description, priority, points, epic, sprint, dates, and "assign
 * to me". It stays mounted and reseeds its draft every time it opens, so the last
 * issue's text never greets the next; the summary takes focus on open.
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
  const { project, sprints, epics, actions, meId, connected, people } =
    useProject();
  const toast = useToast();
  const formId = useId();
  const titleRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<Draft>(() => blank(defaults));
  const [wasOpen, setWasOpen] = useState(open);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const title = draft.title.trim();
    if (!title) {
      setTitleError("Add a summary first.");
      titleRef.current?.focus();
      return;
    }
    setBusy(true);
    setFailure(null);
    const result = await actions.createIssue(
      {
        type: draft.type,
        title,
        description: draft.description,
        priority: draft.priority,
        points: isEpic ? null : parsePoints(draft.points),
        epicId: isEpic ? null : draft.epicId || null,
        sprintId: isEpic || !scrum ? null : draft.sprintId || null,
        startDate: isEpic ? draft.startDate || null : null,
        dueDate: draft.dueDate || null,
        assigneeIds: draft.assigneeIds,
      },
      { quiet: true },
    );
    if (!result.ok) {
      setBusy(false);
      setFailure(result.message);
      return;
    }
    const issue = { id: result.value.id, key: result.value.key };
    toast.push({ tone: "success", title: `${issue.key} created` });
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
      title="Create an issue"
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select
              value={draft.type}
              onChange={(e) => set("type", e.target.value as IssueType)}
            >
              {PICKABLE_ISSUE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ISSUE_TYPE_LABEL[type]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
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
        </div>

        <Field
          label="Summary"
          required
          {...(titleError ? { error: titleError } : {})}
        >
          <Input
            ref={titleRef}
            value={draft.title}
            maxLength={240}
            placeholder="Short, specific summary"
            autoComplete="off"
            onChange={(e) => {
              set("title", e.target.value);
              if (titleError) setTitleError(undefined);
            }}
          />
        </Field>

        <Field label="Description" optional>
          <Textarea
            value={draft.description}
            rows={4}
            placeholder="Context and acceptance criteria"
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          {!isEpic && (
            <Field label="Story points" optional>
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
            <Field label="Epic" optional>
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
          {scrum && !isEpic && (
            <Field label="Sprint" optional>
              <Select
                value={draft.sprintId}
                onChange={(e) => set("sprintId", e.target.value)}
              >
                <option value="">Backlog</option>
                {choices.map((sprint) => (
                  <option key={sprint.id} value={sprint.id}>
                    {sprint.name}
                    {sprint.state === "ACTIVE" ? " (active)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {isEpic && (
            <Field
              label="Start date"
              optional
              help="Epics with dates appear on the roadmap."
            >
              <Input
                type="date"
                value={draft.startDate}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </Field>
          )}
          <Field label="Due date" optional>
            <Input
              type="date"
              value={draft.dueDate}
              onChange={(e) => set("dueDate", e.target.value)}
            />
          </Field>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-body-sm font-medium text-ink">
            Assignees <span className="font-normal text-muted">(optional)</span>
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

        {failure && (
          <p role="alert" className="text-body-sm text-danger-text">
            {failure}
          </p>
        )}
      </form>
    </Modal>
  );
}
