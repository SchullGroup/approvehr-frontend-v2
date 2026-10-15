"use client";

import {
  Kanban,
  ListChecks,
  Map as MapIcon,
  ChartLine,
  Settings,
  Table2,
} from "lucide-react";
import { ButtonLink, EmptyState } from "@/components/ui";
import { useProject } from "@/components/projects/project-context";
import { BoardView } from "./board-view";
import { IssuesView } from "./issues-view";
import { ReportsView } from "./reports-view";
import { RoadmapView } from "./roadmap-view";
import { SettingsView } from "./settings-view";

/**
 * The views of a project, and where a new one plugs in.
 *
 * ## How a view is chosen
 *
 * `?view=<id>` on `/projects/[id]`. No `view` is the default (`board`). It is a
 * query parameter rather than a sub-route so the open issue (`?issue=KEY-12`),
 * the filter and the project's data stay in one component tree — switching tabs
 * does not reload the project or close an open drawer's context.
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

export type ProjectViewId =
  "board" | "backlog" | "roadmap" | "reports" | "issues" | "settings";

export type ProjectViewDef = {
  id: ProjectViewId;
  label: string;
  icon: React.ReactNode;
  Component: () => React.ReactNode;
};

export const DEFAULT_VIEW: ProjectViewId = "board";

/**
 * A view that has not been built yet. Says what it will do and where to go in the
 * meantime — no figure, no sample.
 */
function ComingNext({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { project } = useProject();
  return (
    <EmptyState
      title={`${title} is coming next`}
      description={description}
      action={
        <ButtonLink href={`/projects/${project.id}?view=issues`}>
          Open All issues
        </ButtonLink>
      }
    />
  );
}

function BacklogView() {
  return (
    <ComingNext
      title="The backlog"
      description="Sprint planning will live here: drag issues into sprints, add them from a quick row, and start or complete a sprint. Until then, All issues lists everything, and the Board shows the active sprint."
    />
  );
}

export const PROJECT_VIEWS: readonly ProjectViewDef[] = [
  {
    id: "board",
    label: "Board",
    icon: <Kanban />,
    Component: BoardView,
  },
  {
    id: "backlog",
    label: "Backlog",
    icon: <ListChecks />,
    Component: BacklogView,
  },
  {
    id: "roadmap",
    label: "Roadmap",
    icon: <MapIcon />,
    Component: RoadmapView,
  },
  {
    id: "reports",
    label: "Reports",
    icon: <ChartLine />,
    Component: ReportsView,
  },
  {
    id: "issues",
    label: "All issues",
    icon: <Table2 />,
    Component: IssuesView,
  },
  {
    id: "settings",
    label: "Settings",
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
