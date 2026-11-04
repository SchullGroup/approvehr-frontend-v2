"use client";

import { createContext, useContext } from "react";
import type { IssueFilter } from "@/lib/projects/filters";
import type {
  Issue,
  NewIssueInput,
  Project,
  Sprint,
} from "@/lib/projects/types";
import type { ProjectActions } from "@/lib/store/projects";
import type { People } from "@/lib/store/project-session";

/**
 * What a view of a project is handed.
 *
 * The project screen loads one project and provides it here, so every view — the
 * Board, the Backlog, the Roadmap, the Reports, All issues, Settings — is a
 * component with **no props** that calls `useProject()`. A new view needs the
 * registry entry in `app/(app)/projects/[id]/views.tsx` and nothing else.
 *
 * What is in it, and what to use it for:
 *
 * - `project`, `issues`, `sprints` — the data, all of it. A view filters; nothing
 *   here pages. `issueByKey` and `issueById` are the lookups, built once.
 * - `actions` — every mutation, optimistic and rolled back on refusal, with a
 *   toast on failure already raised. See `ProjectActions`.
 * - `people` — names for ids, and the list for pickers.
 * - `canWork` / `canManage` — member-or-HR and lead-or-HR. Hide what will not
 *   work, but the API is the authority.
 * - `filter` / `setFilter` — one filter shared by every view of the project.
 * - `today` — the company's calendar day, for overdue and days-left arithmetic.
 *   Use it rather than reading a clock.
 * - `openIssue` / `openCreate` — open the drawer (the URL gains `?issue=KEY`) and
 *   the create dialog.
 */
export type ProjectContextValue = {
  project: Project;
  issues: Issue[];
  sprints: Sprint[];
  epics: Issue[];
  issueById: ReadonlyMap<string, Issue>;
  issueByKey: ReadonlyMap<string, Issue>;
  actions: ProjectActions;
  people: People;
  /** The signed-in person's employee id, if they have one. */
  meId: string | null;
  /**
   * Talking to the real API. Objectives and the weekly-task bridge exist only
   * there, so a control that links a project or an issue to one is drawn only
   * when this is true; the demo has none to link to.
   */
  connected: boolean;
  canWork: boolean;
  /** Whether the reader may comment. Absent, `canWork` decides. */
  canComment?: boolean;
  /**
   * Whether the reader may move the issue between columns (and tick its
   * sub-tasks). Absent, `canWork` decides. On a personal task a colleague its
   * owner put on it may, and nothing else.
   */
  canChangeStatus?: boolean;
  /**
   * Whether the reader may change the title, description and due date. Absent,
   * `canWork` decides. On a personal task the leader who set it may, though
   * everything else stays the owner's.
   */
  canEditDetails?: boolean;
  canManage: boolean;
  timeZone: string;
  /** The company's today, `YYYY-MM-DD`. */
  today: string;
  /** The day an instant falls on in the company's zone, or null when unparseable. */
  dayOf: (instant: string) => string | null;
  filter: IssueFilter;
  setFilter: (next: IssueFilter) => void;
  openIssue: (issue: Pick<Issue, "key">) => void;
  openCreate: (defaults?: Partial<NewIssueInput>) => void;
  /**
   * Set when the drawer is showing a task on somebody's own list ("My tasks"),
   * which has no board, no assignee to pick, no epic and no link by key (every
   * list has a `MY-1`). `setByName` is who put it there, when that was not its
   * owner. Absent for a board issue.
   */
  personal?: { setByName: string | null };
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

export const ProjectProvider = ProjectContext.Provider;

export function useProject(): ProjectContextValue {
  const value = useContext(ProjectContext);
  if (!value) {
    throw new Error("useProject must be used inside a project screen.");
  }
  return value;
}
