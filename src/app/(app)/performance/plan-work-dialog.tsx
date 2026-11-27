"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  AttentionMark,
  Button,
  Checkbox,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import {
  draftObjectivePlan,
  type ApiPlanPerson,
  type ApiPlanStory,
  type ApiWorkPlanOutcome,
} from "@/lib/api/ai";
import {
  commitObjectivePlan,
  projectsApi,
  type CommitPlanStory,
} from "@/lib/api/projects";
import type { ApiGoal } from "@/lib/api/performance";
import { TASK, nounFor, count as countNoun } from "@/lib/projects/terms";
import type { Project } from "@/lib/projects/types";

/**
 * Planning an agreed objective's work onto a project.
 *
 * Pick a project the caller leads, draft (`POST /ai/plan/objective`, writes
 * nothing), edit, then create (`POST /projects/:id/plan`). Who could take each
 * task is ranked by the API in code, and the first of them is who it starts on.
 *
 * ## One row per task
 *
 * A title, who takes it, and a pencil for the one thing worth writing about it:
 * what done looks like. Effort, labels and the target a task moves are what the
 * draft proposed and are sent as it proposed them, without a field each, and
 * the draft's steps are not created at all (they were never shown, and nothing
 * is created that was not on screen). A row with no title is left out when the
 * plan is created, and nothing is said about it.
 */

type DraftTask = {
  title: string;
  detail: string;
  keyResultId: string | null;
  points: number | null;
  labels: string[];
  assigneeId: string | null;
  candidates: ApiPlanStory["candidates"];
};

function taskFromApi(s: ApiPlanStory): DraftTask {
  return {
    title: s.title,
    detail: s.detail,
    keyResultId: s.keyResultId,
    points: s.points,
    labels: s.labels,
    assigneeId: s.candidates[0]?.employeeId ?? null,
    candidates: s.candidates,
  };
}

export function PlanWorkDialog({
  goal,
  open,
  onClose,
}: {
  goal: ApiGoal;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();

  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    let cancelled = false;
    projectsApi.list("mine").then(
      (list) => {
        if (cancelled) return;
        const mine = list
          .filter((p) => p.canManage === true)
          .sort(
            (a, b) =>
              Number(b.goalId === goal.id) - Number(a.goalId === goal.id),
          );
        setProjects(mine);
        const first = mine[0];
        if (first && (mine.length === 1 || first.goalId === goal.id))
          setProjectId(first.id);
      },
      (err: unknown) => {
        if (cancelled) return;
        setProjects([]);
        setProjectsError(
          err instanceof ApiError
            ? err.message
            : "Could not load your projects.",
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [goal.id]);

  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<ApiWorkPlanOutcome | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<DraftTask[]>([]);
  const [people, setPeople] = useState<ApiPlanPerson[]>([]);
  const [linkProject, setLinkProject] = useState(true);
  const [committing, setCommitting] = useState(false);

  const callDraft = async (pid: string) => {
    setDrafting(true);
    setDraftError(null);
    setDraft(null);
    try {
      const result = await draftObjectivePlan({
        goalId: goal.id,
        projectId: pid,
      });
      setDraft(result);
      if (result.available) {
        setTasks(result.stories.map(taskFromApi));
        setPeople(result.people);
        setLinkProject(result.project.goalLink !== "this");
      }
    } catch (err) {
      setDraftError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setDrafting(false);
    }
  };

  const handleProjectChange = (id: string) => {
    setProjectId(id);
    setDraft(null);
    setDraftError(null);
    setTasks([]);
  };

  const measureLabel = (id: string | null) =>
    goal.keyResults.find((kr) => kr.id === id)?.label ?? null;

  /* A row with no title is left out, and nothing is said about it: what is
     created is what is on screen with a name. */
  const named = tasks.filter((task) => task.title.trim().length > 0);

  const handleCommit = async () => {
    if (!draft?.available || named.length === 0) return;
    setCommitting(true);
    try {
      const toSend: CommitPlanStory[] = named.map((task) => {
        const measure = measureLabel(task.keyResultId);
        const description = [
          task.detail.trim(),
          measure ? `Moves the target "${measure}".` : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        return {
          title: task.title.trim(),
          ...(description ? { description } : {}),
          ...(task.points != null ? { points: task.points } : {}),
          ...(task.labels.length > 0 ? { labels: task.labels } : {}),
          assigneeId: task.assigneeId,
        };
      });
      const result = await commitObjectivePlan(projectId, {
        goalId: goal.id,
        linkProject,
        epic: { title: draft.epic.title, description: draft.epic.description },
        stories: toSend,
      });
      const taskWord = nounFor(result.issues.length, "task");
      const linked = result.linked
        ? " and linked the project to this objective"
        : "";
      toast.push({
        title: `Plan created under ${result.epic.key}`,
        tone: "success",
        detail: `${String(result.issues.length)} ${taskWord} added${linked}.`,
      });
      onClose();
    } catch (err) {
      toast.push({
        title: "Plan not created",
        tone: "danger",
        detail: err instanceof ApiError ? err.message : "Something went wrong.",
      });
    } finally {
      setCommitting(false);
    }
  };

  const setTask = (index: number, patch: Partial<DraftTask>) =>
    setTasks((prev) =>
      prev.map((task, i) => (i === index ? { ...task, ...patch } : task)),
    );

  const removeTask = (index: number) =>
    setTasks((prev) => prev.filter((_, i) => i !== index));

  const addTask = () =>
    setTasks((prev) => [
      ...prev,
      {
        title: "",
        detail: "",
        keyResultId: null,
        points: null,
        labels: [],
        assigneeId: null,
        candidates: [],
      },
    ]);

  const available = draft?.available === true ? draft : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Plan the work for "${goal.title}"`}
      size="xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {/* Absent, not disabled, while there is nothing to create. */}
          {available && named.length > 0 && (
            <Button
              variant="accent"
              loading={committing}
              onClick={() => void handleCommit()}
            >
              Create {countNoun(named.length, "task")}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Project to plan onto">
          {projects === null ? (
            <div className="flex items-center gap-2 text-body-sm text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading your projects
            </div>
          ) : projectsError ? (
            <p className="text-body-sm text-muted">{projectsError}</p>
          ) : projects.length === 0 ? (
            <p className="text-body-sm text-muted">
              You do not lead a project yet.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={projectId}
                onChange={(e) => handleProjectChange(e.target.value)}
                aria-label="Project"
              >
                <option value="">Choose a project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.key}: {p.name}
                    {p.goalId === goal.id ? " (linked to this objective)" : ""}
                  </option>
                ))}
              </Select>
              {projectId && !available && !drafting && (
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => void callDraft(projectId)}
                >
                  <Sparkles aria-hidden="true" className="size-3.5" />
                  Draft the work
                </Button>
              )}
              {available && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void callDraft(projectId)}
                  disabled={drafting}
                >
                  <RotateCw aria-hidden="true" className="size-3.5" />
                  Draft again
                </Button>
              )}
            </div>
          )}
        </Field>

        {drafting && (
          <div className="flex items-center gap-2 text-body-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Drafting the tasks
          </div>
        )}

        {/* What went wrong is the API's own sentence, as one plain line: no
            callout and no title over it. */}
        {draftError && <p className="text-body-sm text-muted">{draftError}</p>}
        {draft && !draft.available && (
          <p className="text-body-sm text-muted">{draft.reason}</p>
        )}

        {available && (
          <>
            {available.project.goalLink !== "this" && (
              <label className="flex cursor-pointer items-center gap-2.5">
                <Checkbox
                  checked={linkProject}
                  onChange={(e) => setLinkProject(e.target.checked)}
                />
                <span className="text-body-sm font-medium text-ink">
                  Link {available.project.name} to this objective
                </span>
                {available.project.goalLink === "other" &&
                  available.project.linkedGoalTitle && (
                    <InfoTooltip
                      text={`It is linked to "${available.project.linkedGoalTitle}" now. Linking it here moves where its finished ${TASK.many} show, not only this plan's.`}
                      label="About linking"
                    />
                  )}
              </label>
            )}

            <div className="flex flex-col gap-2">
              <ol className="flex flex-col gap-2">
                {tasks.map((task, index) => (
                  <TaskRow
                    key={index}
                    index={index}
                    task={task}
                    people={people}
                    onChange={(patch) => setTask(index, patch)}
                    onRemove={() => removeTask(index)}
                  />
                ))}
              </ol>
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={addTask}
              >
                <Plus aria-hidden="true" className="size-3.5" />
                Add a {TASK.one}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One task: its title, who takes it, and a pencil for what done looks like.
 *
 * Who takes it is one control. The people the API ranked for the task come
 * first, marked as suggested, then everyone else on the project; the one the
 * task would not count for is marked with a small icon that says why, and not
 * with a box of its own.
 */
function TaskRow({
  index,
  task,
  people,
  onChange,
  onRemove,
}: {
  index: number;
  task: DraftTask;
  people: ApiPlanPerson[];
  onChange: (patch: Partial<DraftTask>) => void;
  onRemove: () => void;
}) {
  const [writing, setWriting] = useState(false);
  const n = String(index + 1);
  const assignee = people.find((p) => p.employeeId === task.assigneeId) ?? null;
  const others = people.filter(
    (p) => !task.candidates.some((c) => c.employeeId === p.employeeId),
  );

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={task.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="What has to be done, starting with a verb"
          aria-label={`${TASK.One} ${n} title`}
          className="min-w-48 flex-1 font-medium"
        />
        <span className="flex items-center gap-1">
          <Select
            value={task.assigneeId ?? ""}
            onChange={(e) => onChange({ assigneeId: e.target.value || null })}
            aria-label={`${TASK.One} ${n} assignee`}
            className="w-44"
          >
            <option value="">Nobody yet</option>
            {task.candidates.map((c) => {
              const person = people.find((p) => p.employeeId === c.employeeId);
              return person ? (
                <option key={c.employeeId} value={c.employeeId}>
                  {person.name} (suggested)
                </option>
              ) : null;
            })}
            {others.map((p) => (
              <option key={p.employeeId} value={p.employeeId}>
                {p.name}
              </option>
            ))}
          </Select>
          {assignee && !assignee.ownKpiId && (
            <AttentionMark
              text={`${assignee.name} has no agreed objective under this one, so finishing this ${TASK.one} will not be filed against it.`}
            />
          )}
        </span>
        <IconButton
          label={`Write what done looks like for ${TASK.one} ${n}`}
          size="sm"
          aria-expanded={writing}
          onClick={() => setWriting((now) => !now)}
        >
          <Pencil aria-hidden="true" className="size-4" />
        </IconButton>
        <IconButton
          label={`Remove ${TASK.one} ${n}`}
          size="sm"
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </IconButton>
      </div>

      {writing && (
        <Textarea
          value={task.detail}
          onChange={(e) => onChange({ detail: e.target.value })}
          rows={2}
          placeholder="What done looks like"
          aria-label={`${TASK.One} ${n} detail`}
        />
      )}
    </li>
  );
}
