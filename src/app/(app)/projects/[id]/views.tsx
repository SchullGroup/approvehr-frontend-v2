"use client";

import {
  Kanban,
  ListChecks,
  Map as MapIcon,
  ChartLine,
  Settings,
  Table2,
} from "lucide-react";
import { BacklogView } from "./backlog-view";
import { BoardView } from "./board-view";
import { IssuesView } from "./issues-view";
import { ReportsView } from "./reports-view";
import { RoadmapView } from "./roadmap-view";
import { SettingsView } from "./settings-view";
import { TAB_LABEL, type ProjectViewId } from "@/lib/projects/terms";

export type { ProjectViewId };

/**
 * The views of a project, and where a new one plugs in.
 *
 * ## How a view is chosen
 *
 * `?view=<id>` on `/projects/[id]`. No `view` is the default (`board`). It is a
 * query parameter rather than a sub-route so the open task (`?issue=KEY-12`),
 * the filter and the project's data stay in one component tree — switching tabs
 * does not reload the project or close an open drawer's context.
 *
 * The ids are the old names (`backlog`, `roadmap`, `reports`, `issues`) on
 * purpose, so a link saved before the tabs were renamed still opens the right
 * one. What people read is `TAB_LABEL` in `lib/projects/terms.ts`.
 *
 * ## How to add or replace one
 *
 * A view is a component that takes **no props** and calls `useProject()` for
 * everything (`components/projects/project-context.tsx`): the project, all its
 * issues and sprints, the actions, the people, the filter, `today`. Replace the
 * `Component` of an entry below and nothing else needs to change; the tab, the
 * route and the `?view=` value already exist.
 *
 * A view that lists issues renders `<IssueFilterBar />` itself, so it can put its
 * own controls beside it (the board adds a swimlane select). The pure rules to
 * build on are in `lib/projects/*`: `board.ts` (`openSprints`, `activeSprint`),
 * `progress.ts` (`epicProgress`, `sprintPoints`, `sumPoints`), `sprints.ts` (start
 * and complete rules, `nextSprintDraft`), `rank.ts` (`rankForInsert` for a drag
 * that orders a list), `filters.ts`, `dates.ts`. Sprint writes are already on
 * `actions` (`createSprint`, `updateSprint`, `deleteSprint`, `startSprint`,
 * `completeSprint`).
 */

export type ProjectViewDef = {
  id: ProjectViewId;
  label: string;
  icon: React.ReactNode;
  Component: () => React.ReactNode;
};

export const DEFAULT_VIEW: ProjectViewId = "board";

export const PROJECT_VIEWS: readonly ProjectViewDef[] = [
  {
    id: "board",
    label: TAB_LABEL.board,
    icon: <Kanban />,
    Component: BoardView,
  },
  {
    id: "backlog",
    label: TAB_LABEL.backlog,
    icon: <ListChecks />,
    Component: BacklogView,
  },
  {
    id: "roadmap",
    label: TAB_LABEL.roadmap,
    icon: <MapIcon />,
    Component: RoadmapView,
  },
  {
    id: "reports",
    label: TAB_LABEL.reports,
    icon: <ChartLine />,
    Component: ReportsView,
  },
  {
    id: "issues",
    label: TAB_LABEL.issues,
    icon: <Table2 />,
    Component: IssuesView,
  },
  {
    id: "settings",
    label: TAB_LABEL.settings,
    icon: <Settings />,
    Component: SettingsView,
  },
];

export function viewById(id: string): ProjectViewDef {
  return (
    PROJECT_VIEWS.find((view) => view.id === id) ??
    PROJECT_VIEWS.find((view) => view.id === DEFAULT_VIEW)!
  );
}
