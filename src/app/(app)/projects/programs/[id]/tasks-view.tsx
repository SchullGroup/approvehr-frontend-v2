"use client";

import { useProgram } from "@/components/projects/program-context";
import { WorkTasks } from "@/components/projects/work-list";

/**
 * A program's tasks, across all of its projects, a page at a time with filters.
 * The same list the Master view's All tasks is, scoped to this program (or to the
 * projects in none, for the Unassigned bucket).
 */
export function TasksView() {
  const { program, unassigned } = useProgram();
  return (
    <WorkTasks
      scope={unassigned ? { unassigned: true } : { programId: program.id }}
      showProgram={false}
    />
  );
}
