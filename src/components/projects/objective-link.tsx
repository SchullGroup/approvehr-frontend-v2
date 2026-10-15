"use client";

import { useId, useMemo } from "react";
import { Button, Field, useToast } from "@/components/ui";
import {
  issueObjectiveOptions,
  mayClearIssueObjective,
  mayLinkIssueObjective,
  projectObjectiveOptions,
  withCurrent,
} from "@/lib/projects/objectives";
import type { Issue } from "@/lib/projects/types";
import { useKpis } from "@/lib/store/performance";
import { ObjectivePicker } from "./objective-picker";
import { useProject } from "./project-context";

/**
 * The two places a Projects record is tied to an objective.
 *
 * Both exist only against the real API: the demo has no objectives to choose
 * from and no bridge to file anything, so neither draws there.
 */

/* ------------------------------------------------------------------- an issue -- */

/**
 * "Count toward", in the issue drawer.
 *
 * Shown to the person the issue is assigned to, who is the only one the API lets
 * link it, and to the lead or HR as a way to remove a link somebody else made.
 * Everyone else sees nothing: the weekly-task line under it already says what
 * happened. Epics and sub-tasks never file, so they get no control for it.
 */
export function IssueObjectiveLink({ issue }: { issue: Issue }) {
  const { connected, meId, canManage } = useProject();
  if (!connected) return null;
  if (mayLinkIssueObjective(meId, issue)) return <AssigneeLink issue={issue} />;
  if (mayClearIssueObjective(meId, issue, canManage)) {
    return <ClearLink issue={issue} />;
  }
  return null;
}

const NO_OBJECTIVES = "You have no agreed objective to count this toward yet.";
const LOAD_FAILED = "Your objectives could not be loaded.";

function AssigneeLink({ issue }: { issue: Issue }) {
  const { actions, meId, canWork } = useProject();
  const toast = useToast();
  const base = useId();
  const { goals, loading, error, reload } = useKpis("mine");

  const options = useMemo(
    () =>
      withCurrent(
        issueObjectiveOptions(goals, meId),
        issue.goalId,
        goals,
        meId,
      ),
    [goals, meId, issue.goalId],
  );

  async function change(next: string | null) {
    const result = await actions.patchIssue(issue, { goalId: next });
    if (!result.ok) return;
    const title = options.find((o) => o.id === next)?.label;
    toast.push({
      tone: "success",
      title:
        next && title
          ? `${issue.key} counts toward ${title}`
          : `${issue.key} no longer counts toward an objective`,
    });
  }

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={`${base}-objective`}
        className="block text-meta font-medium text-muted"
      >
        Count toward
      </label>
      <ObjectivePicker
        id={`${base}-objective`}
        compact
        options={options}
        value={issue.goalId}
        loading={loading}
        disabled={!canWork}
        onChange={(next) => void change(next)}
      />
      {error ? (
        <p className="flex flex-wrap items-center gap-x-2 text-meta text-danger-text">
          {LOAD_FAILED}
          <Button size="sm" variant="ghost" onClick={reload}>
            Try again
          </Button>
        </p>
      ) : (
        !loading &&
        options.length === 0 && (
          <p className="text-meta leading-snug text-muted">{NO_OBJECTIVES}</p>
        )
      )}
    </div>
  );
}

/**
 * The lead's and HR's half: the link is somebody else's choice, so it is named
 * only as that, and the one thing they may do is take it off.
 */
function ClearLink({ issue }: { issue: Issue }) {
  const { actions } = useProject();
  const toast = useToast();

  async function clear() {
    const result = await actions.patchIssue(issue, { goalId: null });
    if (result.ok) {
      toast.push({
        tone: "success",
        title: `${issue.key} no longer counts toward an objective`,
      });
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-meta font-medium text-muted">Count toward</p>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-body-sm text-ink">
          An objective the assignee chose
        </p>
        <Button size="sm" variant="ghost" onClick={() => void clear()}>
          Remove link
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- a project -- */

const PROJECT_HELP =
  "When someone finishes an issue assigned to them, a weekly task is filed under this objective for the week it was finished. A manager still grades it. Issues finished before you link it are not counted.";
const SHARED_HELP =
  "It is a company or department objective, so each person's work is filed under their own objective beneath it.";

/**
 * "Count finished work toward", in project settings.
 *
 * The lead's and HR's to set, so the settings page draws it only for them. The
 * list is what they can read: agreed objectives, and the company and department
 * ones those sit under. The API refuses anything else.
 */
export function ProjectObjectiveField() {
  const { connected, canManage } = useProject();
  if (!connected || !canManage) return null;
  return <ProjectObjective />;
}

function ProjectObjective() {
  const { project, actions, meId } = useProject();
  const toast = useToast();
  const { goals, loading, error, reload } = useKpis("company");

  const options = useMemo(
    () =>
      withCurrent(
        projectObjectiveOptions(goals, meId),
        project.goalId,
        goals,
        meId,
      ),
    [goals, meId, project.goalId],
  );
  const chosen = options.find((o) => o.id === project.goalId);

  async function change(next: string | null) {
    const result = await actions.updateProject({ goalId: next });
    if (!result.ok) return;
    const title = options.find((o) => o.id === next)?.label;
    toast.push({
      tone: "success",
      title:
        next && title
          ? `${project.name} counts toward ${title}`
          : `${project.name} no longer counts toward an objective`,
    });
  }

  return (
    <div className="space-y-2">
      <Field
        label="Count finished work toward"
        optional
        help={chosen?.shared ? `${PROJECT_HELP} ${SHARED_HELP}` : PROJECT_HELP}
        {...(error ? { error: "Objectives could not be loaded." } : {})}
      >
        <ObjectivePicker
          options={options}
          value={project.goalId}
          loading={loading}
          onChange={(next) => void change(next)}
        />
      </Field>
      {error && (
        <Button size="sm" variant="ghost" onClick={reload}>
          Try again
        </Button>
      )}
      {!loading && !error && options.length === 0 && (
        <p className="text-meta text-muted">
          There are no agreed objectives to choose from yet.
        </p>
      )}
    </div>
  );
}
