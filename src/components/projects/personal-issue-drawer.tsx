"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { projectsApi, type PersonalTaskDetail } from "@/lib/api/projects";
import { EMPTY_FILTER } from "@/lib/projects/filters";
import type {
  AttachmentRef,
  Issue,
  IssuePatch,
  NewIssueInput,
  Project,
} from "@/lib/projects/types";
import { usePeople, useProjectActor } from "@/lib/store/project-session";
import { useIssueThread, type ProjectActions } from "@/lib/store/projects";
import { useOrgTimezone } from "@/lib/store/session";
import { dayIn, todayIn } from "@/lib/time";
import { IssueDrawer } from "./issue-drawer";
import { ProjectProvider, type ProjectContextValue } from "./project-context";

/**
 * The issue drawer for a task on somebody's own list.
 *
 * A personal task has no board: `GET /projects/:id` is a 404 for its list, so
 * the project screen's store has nothing to load it from. This wrapper builds the
 * context `IssueDrawer` reads out of what the API does give: the issue with its
 * list's columns (`GET /issues/:id`), and the tasks the caller already holds
 * (sub-tasks). Its actions call the issue endpoints directly.
 *
 * Reused by Team tasks, for a leader opening a person's personal task, and by
 * watchers. `canWork` is true only for the list's owner; `canEditDetails` (title,
 * description, due date) is what the API says, so the leader who set a task can
 * fix those too. The API still decides.
 *
 * ## What it does not do
 *
 * Sub-tasks are looked up in `issues`, so a caller that wants them shown passes
 * them (`onChanged` is how it hears that something here changed).
 */
export function PersonalIssueDrawer({
  issueId,
  issues,
  onClose,
  onChanged,
  onOpen,
}: {
  /** The task to show, or null for a closed drawer. */
  issueId: string | null;
  /** Tasks the caller holds, with sub-tasks, for the sub-task list. */
  issues: Issue[];
  onClose: () => void;
  /** Something in the drawer changed a task: reload the list behind it. */
  onChanged?: () => void;
  /** A sub-task was clicked: show it instead. */
  onOpen?: (id: string) => void;
}) {
  const toast = useToast();
  const people = usePeople();
  const actor = useProjectActor();
  const timeZone = useOrgTimezone();
  const today = todayIn(timeZone);
  const thread = useIssueThread(issueId);
  const reloadThread = thread.reload;

  const [loaded, setLoaded] = useState<{
    id: string;
    detail: PersonalTaskDetail;
  } | null>(null);
  /* What this drawer has saved since `issues` was last handed in; null is "gone". */
  const [overlay, setOverlay] = useState<ReadonlyMap<string, Issue | null>>(
    new Map(),
  );
  const [seen, setSeen] = useState(issues);
  if (seen !== issues) {
    setSeen(issues);
    setOverlay(new Map());
  }

  useEffect(() => {
    if (!issueId) return;
    const controller = new AbortController();
    projectsApi
      .personalTask(issueId, controller.signal)
      .then((detail) => setLoaded({ id: issueId, detail }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        toast.push({
          tone: "danger",
          title: "Could not open that task",
          detail:
            error instanceof ApiError
              ? error.message
              : "Try again in a moment.",
        });
        onClose();
      });
    return () => controller.abort();
    // `toast` and `onClose` change identity every render; the task is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueId]);

  /* The last task's columns stay while the drawer closes, so it can animate out. */
  const detail = loaded ? loaded.detail : null;

  const all = useMemo(() => {
    const byId = new Map<string, Issue>(issues.map((i) => [i.id, i]));
    if (detail) byId.set(detail.issue.id, detail.issue);
    for (const [id, row] of overlay) {
      if (row) byId.set(id, row);
      else byId.delete(id);
    }
    return [...byId.values()];
  }, [issues, detail, overlay]);

  /* Only a task on the list whose columns are loaded: another person's list has
     columns of its own. */
  const found = issueId ? all.find((i) => i.id === issueId) : undefined;
  const current =
    found && detail && found.projectId === detail.issue.projectId
      ? found
      : null;

  const remember = useCallback(
    (id: string, row: Issue | null) =>
      setOverlay((prev) => new Map(prev).set(id, row)),
    [],
  );

  /* The overlay only stands in for a save until the caller's list is read again,
     and then it goes. The copy this drawer loaded when it opened is applied over
     the list's row, so it has to be the saved one, or the old title, status and
     the rest come back into the fields the person has just changed. */
  const keep = useCallback(
    (row: Issue) =>
      setLoaded((prev) =>
        prev && prev.detail.issue.id === row.id
          ? { ...prev, detail: { ...prev.detail, issue: row } }
          : prev,
      ),
    [],
  );

  const actions = useMemo<ProjectActions>(() => {
    const failed = (title: string, error: unknown) => {
      const message =
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.";
      toast.push({ tone: "danger", title, detail: message });
      return { ok: false as const, message, error };
    };
    const unsupported = async () => ({
      ok: false as const,
      message: "A personal list has no project to change.",
      error: null,
    });
    return {
      createIssue: async (input: NewIssueInput) => {
        const projectId = detail?.issue.projectId;
        if (!projectId) return failed("Could not add the sub-task", null);
        try {
          const made = await projectsApi.createIssue(projectId, input);
          remember(made.id, made);
          onChanged?.();
          return { ok: true as const, value: made };
        } catch (error) {
          return failed("Could not add the sub-task", error);
        }
      },
      patchIssue: async (
        target: Pick<Issue, "id" | "key">,
        patch: IssuePatch,
      ) => {
        const before = all.find((i) => i.id === target.id);
        if (before) remember(target.id, { ...before, ...patch } as Issue);
        try {
          const saved = await projectsApi.updateIssue(target.id, patch);
          remember(target.id, saved);
          keep(saved);
          onChanged?.();
          reloadThread();
          return { ok: true as const, value: saved };
        } catch (error) {
          if (before) remember(target.id, before);
          return failed(`Could not update ${target.key}`, error);
        }
      },
      refreshIssue: async (target: Pick<Issue, "id">) => {
        try {
          const fresh = await projectsApi.getIssue(target.id);
          remember(target.id, fresh);
          keep(fresh);
          return { ok: true as const, value: fresh };
        } catch (error) {
          return { ok: false as const, message: "", error };
        }
      },
      deleteIssue: async (target: Pick<Issue, "id" | "key">) => {
        try {
          await projectsApi.removeIssue(target.id);
          remember(target.id, null);
          onChanged?.();
          return { ok: true as const, value: undefined };
        } catch (error) {
          return failed(`Could not delete ${target.key}`, error);
        }
      },
      addComment: async (
        id: string,
        body: string,
        options?: { attachments?: AttachmentRef[] },
      ) => {
        try {
          const comment = await projectsApi.addComment(
            id,
            body,
            options?.attachments,
          );
          reloadThread();
          return { ok: true as const, value: comment };
        } catch (error) {
          return failed("Could not post the comment", error);
        }
      },
      editComment: async (_id: string, commentId: string, body: string) => {
        try {
          const comment = await projectsApi.editComment(commentId, body);
          reloadThread();
          return { ok: true as const, value: comment };
        } catch (error) {
          return failed("Could not save the comment", error);
        }
      },
      deleteComment: async (_id: string, commentId: string) => {
        try {
          await projectsApi.removeComment(commentId);
          reloadThread();
          return { ok: true as const, value: undefined };
        } catch (error) {
          return failed("Could not delete the comment", error);
        }
      },
      updateProject: unsupported,
      setMembers: unsupported,
      saveWorkflow: unsupported,
      deleteProject: unsupported,
      createSprint: unsupported,
      updateSprint: unsupported,
      deleteSprint: unsupported,
      startSprint: unsupported,
      completeSprint: unsupported,
    } as unknown as ProjectActions;
  }, [all, detail, keep, onChanged, reloadThread, remember, toast]);

  const ownerId = (current ?? detail?.issue)?.assigneeId ?? null;
  const meId = actor.employeeId;
  const setByName =
    current && ownerId && current.reporterId !== ownerId
      ? people.nameOf(current.reporterId)
      : null;

  const value = useMemo<ProjectContextValue | null>(() => {
    if (!detail) return null;
    const project: Project = {
      id: detail.issue.projectId,
      key: "MY",
      name: "Personal",
      description: "",
      type: "KANBAN",
      color: "#2B3990",
      departmentId: null,
      departmentName: null,
      leadId: ownerId ?? "",
      goalId: null,
      memberIds: ownerId ? [ownerId] : [],
      statuses: detail.statuses,
      createdById: ownerId ?? "",
      createdAt: detail.issue.createdAt,
      updatedAt: detail.issue.updatedAt,
      leadName: null,
      openIssueCount: null,
      issueCount: null,
      activeSprintId: null,
      canManage: false,
    };
    return {
      project,
      issues: all,
      sprints: [],
      epics: [],
      issueById: new Map(all.map((i) => [i.id, i])),
      issueByKey: new Map(all.map((i) => [i.key, i])),
      actions,
      people,
      meId,
      connected: true,
      canWork: meId !== null && meId === ownerId,
      /* The API's word: the owner, or the leader who set it, fixes the details. */
      canEditDetails: detail.canEditDetails,
      /* Everybody who can open somebody's task may comment on it: its owner,
         their leaders, HR and its watchers. */
      canComment: meId !== null,
      canManage: false,
      timeZone,
      today,
      dayOf: (instant: string) => dayIn(instant, timeZone),
      filter: EMPTY_FILTER,
      setFilter: () => {},
      /* A sub-task opens in the same drawer; the caller owns which one is open. */
      openIssue: (target) => {
        const row = all.find((i) => i.key === target.key);
        if (row) onOpen?.(row.id);
      },
      openCreate: () => {},
      personal: { setByName },
    };
  }, [
    detail,
    all,
    onOpen,
    actions,
    people,
    meId,
    ownerId,
    timeZone,
    today,
    setByName,
  ]);

  if (!value) return null;
  return (
    <ProjectProvider value={value}>
      <IssueDrawer issue={current} onClose={onClose} />
    </ProjectProvider>
  );
}
