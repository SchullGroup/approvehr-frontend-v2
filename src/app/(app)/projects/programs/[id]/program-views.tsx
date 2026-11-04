"use client";

import {
  CalendarRange,
  ChartNoAxesColumn,
  FolderKanban,
  Kanban,
  LayoutDashboard,
  Settings,
  Table2,
  UsersRound,
} from "lucide-react";
import {
  PROGRAM_TAB_LABEL,
  UNASSIGNED_ID,
  type ProgramViewId,
} from "@/lib/projects/terms";
import type { Program } from "@/lib/projects/programs";
import { WorkBoardView } from "./board-view";
import { OverviewView } from "./overview-view";
import { PeopleView } from "./people-view";
import { ProgramProjectsView } from "./projects-view";
import { ProgramSettingsView } from "./settings-view";
import { TasksView } from "./tasks-view";
import { TimelineView } from "./timeline-view";
import { WorkloadView } from "./workload-view";

export type { ProgramViewId };

/**
 * The views of a program, and where a new one plugs in.
 *
 * ## How a view is chosen
 *
 * `?view=<id>` on `/projects/programs/[id]`, as a project's views are on
 * `/projects/[id]`. No `view` is the default (`overview`). A query parameter
 * rather than a sub-route so the program's data and the open task stay in one
 * component tree and switching tabs reloads nothing.
 *
 * ## How to add or replace one
 *
 * A view is a component that takes **no props** and calls `useProgram()`
 * (`components/projects/program-context.tsx`). Replace the `Component` of an
 * entry below and nothing else needs to change; the tab and the `?view=` value
 * already exist. The pure rules to build on are in `lib/projects/programs.ts`
 * (the shapes, and the demo's engine), `board.ts`, `reports.ts`, `roadmap.ts`
 * and `filters.ts`; the data is `lib/store/programs.ts` (`useProgramRollup`,
 * `useWorkList`, `useProgramProjects`).
 *
 * ## Who sees which tab
 *
 * `when` says who is offered a tab. People & access and Settings are for the
 * people who manage the program: absent, not greyed out, for everybody else.
 * The bucket of projects in no program has no people or settings of its own,
 * and no workload or timeline, so those are absent there.
 */

export type ProgramViewDef = {
  id: ProgramViewId;
  label: string;
  icon: React.ReactNode;
  Component: () => React.ReactNode;
  when?: (program: Program, unassigned: boolean) => boolean;
};

export const DEFAULT_PROGRAM_VIEW: ProgramViewId = "overview";

const forManagers = (program: Program, unassigned: boolean) =>
  !unassigned && program.canManage;
const notForUnassigned = (_: Program, unassigned: boolean) => !unassigned;

export const PROGRAM_VIEWS: readonly ProgramViewDef[] = [
  {
    id: "overview",
    label: PROGRAM_TAB_LABEL.overview,
    icon: <LayoutDashboard />,
    Component: OverviewView,
  },
  {
    id: "projects",
    label: PROGRAM_TAB_LABEL.projects,
    icon: <FolderKanban />,
    Component: ProgramProjectsView,
  },
  {
    id: "board",
    label: PROGRAM_TAB_LABEL.board,
    icon: <Kanban />,
    Component: WorkBoardView,
  },
  {
    id: "tasks",
    label: PROGRAM_TAB_LABEL.tasks,
    icon: <Table2 />,
    Component: TasksView,
  },
  {
    id: "workload",
    label: PROGRAM_TAB_LABEL.workload,
    icon: <ChartNoAxesColumn />,
    Component: WorkloadView,
    when: notForUnassigned,
  },
  {
    id: "timeline",
    label: PROGRAM_TAB_LABEL.timeline,
    icon: <CalendarRange />,
    Component: TimelineView,
    when: notForUnassigned,
  },
  {
    id: "people",
    label: PROGRAM_TAB_LABEL.people,
    icon: <UsersRound />,
    Component: PeopleView,
    when: forManagers,
  },
  {
    id: "settings",
    label: PROGRAM_TAB_LABEL.settings,
    icon: <Settings />,
    Component: ProgramSettingsView,
    when: forManagers,
  },
];

/** The tabs this reader is offered, in order. */
export function viewsFor(program: Program, unassigned: boolean) {
  return PROGRAM_VIEWS.filter((v) => !v.when || v.when(program, unassigned));
}

/** The view for an id the reader may have, else the default. */
export function viewById(
  id: string,
  program: Program,
  unassigned: boolean,
): ProgramViewDef {
  const offered = viewsFor(program, unassigned);
  return (
    offered.find((v) => v.id === id) ??
    offered.find((v) => v.id === DEFAULT_PROGRAM_VIEW)!
  );
}

export { UNASSIGNED_ID };
