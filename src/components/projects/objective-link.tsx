"use client";

import { useCallback, useId, useMemo } from "react";
import { Button, Field, useToast } from "@/components/ui";
import { employeeById } from "@/lib/mock/people";
import {
  flattenGroups,
  mayLinkIssue,
  objectiveGroups,
  objectiveLine,
  withCurrentGroup,
} from "@/lib/projects/objectives";
import type { Issue } from "@/lib/projects/types";
import { useKpis } from "@/lib/store/performance";
import { useProjectActor } from "@/lib/store/project-session";
import { MeasurePicker, ObjectivePicker } from "./objective-picker";
import { useProject } from "./project-context";

/**
 * The two places a Projects record may be linked to an objective.
 *
 * ## Optional, quiet, and the same demo and connected
 *
 * Linking is never required and never a fault. The task drawer says nothing
 * about a task that is not linked; a linked one reads "Linked to <objective>".
 * A person offered the picker may choose any objective or personal KPI they can
 * see, narrow it to one measure, change it or clear it at any time. A person
 * who may not link is drawn no control at all.
 */

/* ------------------------------------------------------------------- an issue -- */

/**
 * "Link to an objective (optional)", in the task drawer.
 *
 * Offered to the people the contract lets link a task: the assignee, whoever
 * manages the project, the assignee's manager or department head, and HR (the
 * API's own `canLinkObjective` wins where it says). Everybody who can read the
 * task still sees the one neutral line about it.
 */
export function IssueObjectiveLink({ issue }: { issue: Issue }) {
  const mayLink = useMayLinkIssue();
  /* Somebody who can read the task and change nothing (a program's read access,
     or the Master grant) is drawn the line and no control, switched off or not. */
  if (mayLink(issue)) return <Linker issue={issue} />;
  return <LinkLine issue={issue} />;
}

/**
 * Whether the signed-in person is offered the link for a task of this project.
 *
 * One rule for the drawer and for a list of tasks: the assignee, whoever manages
 * the project, the assignee's manager and HR, and nobody who can only read. The
 * API says first (`canLinkObjective`); the directory below is only the demo's
 * stand-in for "this person's manager".
 */
export function useMayLinkIssue(): (issue: Issue) => boolean {
  const { meId, canManage, canWork, connected } = useProject();
  const { editRecords } = useProjectActor();
  return useCallback(
    (issue) =>
      canWork &&
      mayLinkIssue({
        issue,
        meId,
        canManageProject: canManage,
        editRecords,
        leadsAssignee:
          !connected &&
          issue.assigneeId !== null &&
          meId !== null &&
          employeeById(issue.assigneeId)?.managerId === meId,
      }),
    [canWork, meId, canManage, editRecords, connected],
  );
}

/** The read-only half: one plain line, or nothing when the task is not linked. */
function LinkLine({ issue }: { issue: Issue }) {
  const line = objectiveLine(issue);
  if (!line) return null;
  return <p className="text-meta leading-snug text-muted">{line}</p>;
}

const LOAD_FAILED = "Objectives could not be loaded.";

function Linker({ issue }: { issue: Issue }) {
  const { actions, meId } = useProject();
  const toast = useToast();
  const base = useId();
  const { goals, loading, error, reload } = useKpis("company");

  const groups = useMemo(
    () =>
      withCurrentGroup(
        objectiveGroups(goals, { meId, assigneeId: issue.assigneeId }),
        issue,
        goals,
        meId,
      ),
    [goals, meId, issue],
  );
  const chosen = flattenGroups(groups).find((o) => o.id === issue.goalId);
  const line = objectiveLine(issue, goals);

  async function change(patch: {
    goalId: string | null;
    keyResultId: string | null;
  }) {
    const result = await actions.patchIssue(issue, patch);
    if (!result.ok) return;
    /* What the link reads as (the objective's name, whether it has closed) is
       the server's to say, so ask once more rather than guess it. */
    void actions.refreshIssue(issue);
    const title = flattenGroups(groups).find(
      (o) => o.id === patch.goalId,
    )?.title;
    toast.push({
      tone: "success",
      title:
        patch.goalId && title
          ? `${issue.key} linked to ${title}`
          : `${issue.key} is no longer linked to an objective`,
    });
  }

  /* Nothing to choose from and nothing linked: the control would be a lone "No
     link", so it is absent rather than empty. */
  if (!loading && !error && groups.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={`${base}-objective`}
        className="block text-meta font-medium text-muted"
      >
        Link to an objective (optional)
      </label>
      <ObjectivePicker
        id={`${base}-objective`}
        compact
        groups={groups}
        value={issue.goalId}
        loading={loading}
        onChange={(next) => void change({ goalId: next, keyResultId: null })}
      />
      {chosen && chosen.measures.length > 0 && (
        <MeasurePicker
          compact
          measures={chosen.measures}
          value={issue.keyResultId ?? null}
          onChange={(next) =>
            void change({ goalId: issue.goalId, keyResultId: next })
          }
        />
      )}
      {line && <p className="text-meta leading-snug text-muted">{line}</p>}
      {error && (
        <p className="flex flex-wrap items-center gap-x-2 text-meta text-muted">
          {LOAD_FAILED}
          <Button size="sm" variant="ghost" onClick={reload}>
            Try again
          </Button>
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- a project -- */

const PROJECT_HELP =
  "Tasks in this project use this link unless they have one of their own. You can leave it empty.";

/**
 * "Link to an objective (optional)", in project settings.
 *
 * The lead's and HR's to set, so the settings page draws it only for them. It is
 * the project's default: a task with no link of its own shows under it.
 */
export function ProjectObjectiveField() {
  const { canManage } = useProject();
  if (!canManage) return null;
  return <ProjectObjective />;
}

function ProjectObjective() {
  const { project, actions, meId } = useProject();
  const toast = useToast();
  const { goals, loading, error, reload } = useKpis("company");

  const groups = useMemo(
    () =>
      withCurrentGroup(
        objectiveGroups(goals, { meId }),
        { goalId: project.goalId },
        goals,
        meId,
      ),
    [goals, meId, project.goalId],
  );

  async function change(next: string | null) {
    const result = await actions.updateProject({ goalId: next });
    if (!result.ok) return;
    const title = flattenGroups(groups).find((o) => o.id === next)?.title;
    toast.push({
      tone: "success",
      title:
        next && title
          ? `${project.name} linked to ${title}`
          : `${project.name} is no longer linked to an objective`,
    });
  }

  if (!loading && !error && groups.length === 0) return null;

  return (
    <div className="space-y-2">
      <Field label="Link to an objective" optional help={PROJECT_HELP}>
        <ObjectivePicker
          groups={groups}
          value={project.goalId}
          loading={loading}
          onChange={(next) => void change(next)}
        />
      </Field>
      {error && (
        <p className="flex flex-wrap items-center gap-x-2 text-meta text-muted">
          {LOAD_FAILED}
          <Button size="sm" variant="ghost" onClick={reload}>
            Try again
          </Button>
        </p>
      )}
    </div>
  );
}
