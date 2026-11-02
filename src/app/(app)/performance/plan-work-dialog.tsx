"use client";

import { useEffect, useState } from "react";
import {
  ChevronRight,
  LayoutList,
  Link,
  Link2Off,
  Loader2,
  Plus,
  RotateCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  Button,
  Callout,
  Checkbox,
  Disclosure,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api/client";
import { formatDateShort } from "@/lib/time";
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
import type { Project } from "@/lib/projects/types";

/**
 * Planning an agreed objective's work onto a project.
 *
 * Pick a project the caller leads, draft (`POST /ai/plan/objective`, writes
 * nothing), edit, then create (`POST /projects/:id/plan`). Who could take each
 * story is ranked by the API in code, and its reasons are shown in full.
 */

const POINT_OPTIONS = [1, 2, 3, 5, 8, 13] as const;
const MAX_STEPS = 8;

type DraftStory = {
  title: string;
  detail: string;
  keyResultId: string | null;
  points: number | null;
  labels: string;
  subtasks: string[];
  assigneeId: string | null;
  candidates: ApiPlanStory["candidates"];
};

function storyFromApi(s: ApiPlanStory): DraftStory {
  return {
    title: s.title,
    detail: s.detail,
    keyResultId: s.keyResultId,
    points: s.points,
    labels: s.labels.join(", "),
    subtasks: s.subtasks,
    assigneeId: s.candidates[0]?.employeeId ?? null,
    candidates: s.candidates,
  };
}

const labelsOf = (text: string): string[] => [
  ...new Set(
    text
      .split(",")
      .map((l) => l.trim().toLowerCase().replace(/\s+/g, "-"))
      .filter(Boolean),
  ),
];

/** Leave dates are calendar days, so they are read as UTC to stay on the same day. */
const shortDate = (iso: string): string => formatDateShort(iso, "UTC");

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
  const [stories, setStories] = useState<DraftStory[]>([]);
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
        setStories(result.stories.map(storyFromApi));
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
    setStories([]);
  };

  const measureLabel = (id: string | null) =>
    goal.keyResults.find((kr) => kr.id === id)?.label ?? null;

  const handleCommit = async () => {
    if (!draft?.available) return;
    setCommitting(true);
    try {
      const storiesToSend: CommitPlanStory[] = stories.map((s) => {
        const measure = measureLabel(s.keyResultId);
        const description = [
          s.detail.trim(),
          measure ? `Moves the measure "${measure}".` : "",
        ]
          .filter(Boolean)
          .join("\n\n");
        const labels = labelsOf(s.labels);
        const subtasks = s.subtasks.map((t) => t.trim()).filter(Boolean);
        return {
          title: s.title.trim(),
          ...(description ? { description } : {}),
          ...(s.points != null ? { points: s.points } : {}),
          ...(labels.length > 0 ? { labels } : {}),
          assigneeId: s.assigneeId,
          ...(subtasks.length > 0 ? { subtasks } : {}),
        };
      });
      const result = await commitObjectivePlan(projectId, {
        goalId: goal.id,
        linkProject,
        epic: { title: draft.epic.title, description: draft.epic.description },
        stories: storiesToSend,
      });
      const storyWord = result.issues.length === 1 ? "story" : "stories";
      const linked = result.linked
        ? " and linked the project to this objective"
        : "";
      toast.push({
        title: `Plan created under ${result.epic.key}`,
        tone: "success",
        detail: `${String(result.issues.length)} ${storyWord} added${linked}.`,
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

  const setStory = (index: number, patch: Partial<DraftStory>) =>
    setStories((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );

  const removeStory = (index: number) =>
    setStories((prev) => prev.filter((_, i) => i !== index));

  const addStory = () =>
    setStories((prev) => [
      ...prev,
      {
        title: "",
        detail: "",
        keyResultId: null,
        points: null,
        labels: "",
        subtasks: [],
        assigneeId: null,
        candidates: [],
      },
    ]);

  const available = draft?.available === true ? draft : null;
  const untitled = stories.filter((s) => s.title.trim().length === 0).length;
  const blocker =
    stories.length === 0
      ? "Keep at least one story."
      : untitled > 0
        ? `Give ${untitled === 1 ? "every story" : `all ${String(untitled)} untitled stories`} a title first.`
        : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Plan the work for "${goal.title}"`}
      size="xl"
    >
      <div className="flex flex-col gap-5">
        <Field label="Project to plan onto">
          {projects === null ? (
            <div className="flex items-center gap-2 text-body-sm text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading your projects
            </div>
          ) : projectsError ? (
            <Callout tone="warning" title="No projects to plan onto">
              {projectsError}
            </Callout>
          ) : projects.length === 0 ? (
            <p className="text-body-sm text-muted">
              Only a project&apos;s lead (or HR) can plan work onto it, and you
              lead none. Start a project under Projects, or ask its lead to plan
              from here.
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
            Reading the objective and what is already on the board
          </div>
        )}

        {draftError && (
          <Callout tone="warning" title="No plan this time">
            {draftError}
          </Callout>
        )}

        {draft && !draft.available && (
          <Callout tone="neutral" title="Suggestions are unavailable">
            {draft.reason}
          </Callout>
        )}

        {available && (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-meta text-muted">
                Drafted from {available.groundedIn.summary}. Nothing is created
                until you press Create.
              </p>
              {available.groundedIn.facts.length > 0 && (
                <Disclosure
                  title="What this was based on"
                  meta={`${String(available.groundedIn.facts.length)} facts`}
                  dense
                >
                  <ul className="flex list-disc flex-col gap-1 pl-4 text-meta text-muted">
                    {available.groundedIn.facts.map((fact, index) => (
                      <li key={`${String(index)}-${fact.slice(0, 24)}`}>
                        {fact}
                      </li>
                    ))}
                  </ul>
                </Disclosure>
              )}
            </div>

            <ProjectLinkNotice
              goalLink={available.project.goalLink}
              linkedGoalTitle={available.project.linkedGoalTitle}
              projectName={available.project.name}
              linkProject={linkProject}
              onChangeLinkProject={setLinkProject}
            />

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-body-sm font-medium text-ink">
                  {stories.length === 1
                    ? "1 story"
                    : `${String(stories.length)} stories`}{" "}
                  under the epic &ldquo;{available.epic.title}&rdquo;
                </p>
                <Button variant="ghost" size="sm" onClick={addStory}>
                  <Plus aria-hidden="true" className="size-3.5" />
                  Add a story
                </Button>
              </div>
              <ol className="flex flex-col gap-4">
                {stories.map((story, index) => (
                  <StoryCard
                    key={index}
                    index={index}
                    story={story}
                    keyResults={goal.keyResults}
                    people={people}
                    onChange={(patch) => setStory(index, patch)}
                    onRemove={() => removeStory(index)}
                  />
                ))}
              </ol>
            </div>

            {people.length > 0 && <PeoplePanel people={people} />}
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {available && (
            <span className="flex flex-wrap items-center gap-3">
              {blocker && (
                <span className="text-meta text-muted">{blocker}</span>
              )}
              <Button
                variant="accent"
                size="sm"
                loading={committing}
                disabled={blocker !== null}
                onClick={() => void handleCommit()}
              >
                <LayoutList aria-hidden="true" className="size-4" />
                Create{" "}
                {stories.length === 1
                  ? "1 story"
                  : `${String(stories.length)} stories`}
              </Button>
            </span>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function ProjectLinkNotice({
  goalLink,
  linkedGoalTitle,
  projectName,
  linkProject,
  onChangeLinkProject,
}: {
  goalLink: "this" | "none" | "other";
  linkedGoalTitle: string | null;
  projectName: string;
  linkProject: boolean;
  onChangeLinkProject: (v: boolean) => void;
}) {
  if (goalLink === "this") {
    return (
      <p className="flex items-center gap-2 text-body-sm text-muted">
        <Link
          aria-hidden="true"
          className="size-4 shrink-0 text-success-text"
        />
        {projectName} is linked to this objective, so finished stories count
        towards it.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex cursor-pointer items-start gap-2.5">
        <Checkbox
          checked={linkProject}
          onChange={(e) => onChangeLinkProject(e.target.checked)}
        />
        <span>
          <span className="block text-body-sm font-medium text-ink">
            Link {projectName} to this objective
          </span>
          {goalLink === "other" && linkedGoalTitle ? (
            <span className="mt-0.5 block text-meta text-warning-text">
              It is linked to &ldquo;{linkedGoalTitle}&rdquo; now. Linking it
              here moves where all of its finished work counts, not only this
              plan&apos;s.
            </span>
          ) : (
            <span className="mt-0.5 block text-meta text-muted">
              Finished stories count towards this objective once the project is
              linked.
            </span>
          )}
        </span>
      </label>
      {!linkProject && (
        <p className="flex items-center gap-2 text-meta text-muted">
          <Link2Off aria-hidden="true" className="size-3.5" />
          Unlinked, finished stories will not count towards this objective
          unless each person links their own issue.
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function StoryCard({
  index,
  story,
  keyResults,
  people,
  onChange,
  onRemove,
}: {
  index: number;
  story: DraftStory;
  keyResults: ApiGoal["keyResults"];
  people: ApiPlanPerson[];
  onChange: (patch: Partial<DraftStory>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const n = String(index + 1);
  const assignee =
    people.find((p) => p.employeeId === story.assigneeId) ?? null;
  const others = people.filter(
    (p) => !story.candidates.some((c) => c.employeeId === p.employeeId),
  );

  const setStep = (at: number, value: string) =>
    onChange({
      subtasks: story.subtasks.map((s, i) => (i === at ? value : s)),
    });

  return (
    <li className="rounded-lg border border-line bg-surface">
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className={cn(
            "mt-2.5 shrink-0 text-muted transition-transform",
            expanded && "rotate-90",
          )}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse story ${n}` : `Expand story ${n}`}
        >
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
        <Input
          value={story.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="What has to be done, starting with a verb"
          aria-label={`Story ${n} title`}
          className="flex-1 font-medium"
        />
        <button
          type="button"
          onClick={onRemove}
          className="mt-2.5 shrink-0 text-muted hover:text-danger-text"
          aria-label={`Remove story ${n}`}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-line p-3">
          <Textarea
            value={story.detail}
            onChange={(e) => onChange({ detail: e.target.value })}
            rows={2}
            placeholder="What done looks like"
            aria-label={`Story ${n} detail`}
          />

          <div className="flex flex-wrap gap-3">
            <Field label="Points" className="w-24 shrink-0">
              <Select
                value={story.points ?? ""}
                onChange={(e) =>
                  onChange({
                    points:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">None</option>
                {POINT_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>

            {keyResults.length > 0 && (
              <Field
                label="Moves the measure"
                help="Written into the story's description."
                className="min-w-40 flex-1"
              >
                <Select
                  value={story.keyResultId ?? ""}
                  onChange={(e) =>
                    onChange({ keyResultId: e.target.value || null })
                  }
                >
                  <option value="">None</option>
                  {keyResults.map((kr) => (
                    <option key={kr.id} value={kr.id}>
                      {kr.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field
              label="Labels"
              help="Separate with commas."
              className="min-w-40 flex-1"
            >
              <Input
                value={story.labels}
                onChange={(e) => onChange({ labels: e.target.value })}
                placeholder="design, outreach"
              />
            </Field>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-meta text-muted">Who takes it</legend>
            {story.candidates.length > 0 && (
              <ul className="flex flex-col gap-2">
                {story.candidates.map((c) => {
                  const person = people.find(
                    (p) => p.employeeId === c.employeeId,
                  );
                  const chosen = story.assigneeId === c.employeeId;
                  return (
                    <li key={c.employeeId}>
                      <button
                        type="button"
                        onClick={() => onChange({ assigneeId: c.employeeId })}
                        aria-pressed={chosen}
                        className={cn(
                          "w-full rounded-md border p-2.5 text-left transition-colors",
                          chosen
                            ? "border-accent-line bg-accent-soft"
                            : "border-line bg-canvas hover:border-control-line",
                        )}
                      >
                        <span className="block text-body-sm font-medium text-ink">
                          {person?.name ?? "Someone on the project"}
                          {person?.jobTitle && (
                            <span className="ml-1.5 font-normal text-muted">
                              {person.jobTitle}
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-meta text-muted">
                          {c.reasons.join(" · ")}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <Select
              value={story.assigneeId ?? ""}
              onChange={(e) => onChange({ assigneeId: e.target.value || null })}
              aria-label={`Story ${n} assignee`}
            >
              <option value="">Nobody yet</option>
              {story.candidates.map((c) => {
                const person = people.find(
                  (p) => p.employeeId === c.employeeId,
                );
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
              <Callout tone="warning" title="This work would not count">
                {assignee.name} has no agreed KPI under this objective, so
                finishing this story will not be filed against it. Give them one
                with &ldquo;Give a KPI to people&rdquo; on the objective, or
                choose someone else.
              </Callout>
            )}
          </fieldset>

          <div className="flex flex-col gap-2">
            <p className="text-meta text-muted">
              Steps, created as unassigned sub-tasks
            </p>
            {story.subtasks.length > 0 && (
              <ol className="flex flex-col gap-2">
                {story.subtasks.map((step, si) => (
                  <li key={si} className="flex items-center gap-2">
                    <Input
                      value={step}
                      onChange={(e) => setStep(si, e.target.value)}
                      aria-label={`Story ${n} step ${String(si + 1)}`}
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          subtasks: story.subtasks.filter((_, i) => i !== si),
                        })
                      }
                      className="shrink-0 text-muted hover:text-danger-text"
                      aria-label={`Remove step ${String(si + 1)}`}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {story.subtasks.length < MAX_STEPS && (
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => onChange({ subtasks: [...story.subtasks, ""] })}
              >
                <Plus aria-hidden="true" className="size-3.5" />
                Add a step
              </Button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

/* -------------------------------------------------------------------------- */

function PeoplePanel({ people }: { people: ApiPlanPerson[] }) {
  return (
    <Disclosure
      title="Everyone on the project"
      meta={`${String(people.length)} people`}
    >
      <ul className="flex flex-col gap-2">
        {people.map((person) => (
          <li
            key={person.employeeId}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span className="text-body-sm font-medium text-ink">
              {person.name}
              {person.jobTitle && (
                <span className="ml-1.5 font-normal text-muted">
                  {person.jobTitle}
                </span>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-2 text-meta text-muted">
              <span>
                {person.openIssues === 0
                  ? "Nothing open"
                  : `${String(person.openIssues)} open${person.openPoints > 0 ? `, ${String(person.openPoints)} points` : ""}`}
                {person.led ? "" : " on this project"}
              </span>
              {person.leave && (
                <span className="text-warning-text">
                  On leave {shortDate(person.leave.start)} to{" "}
                  {shortDate(person.leave.end)}
                </span>
              )}
              {!person.ownKpiId && (
                <span className="text-warning-text">
                  No KPI under this objective
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}
