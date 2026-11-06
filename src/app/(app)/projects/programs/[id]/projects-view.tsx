"use client";

import { useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
import {
  Button,
  EmptyState,
  FilterBar,
  LoadState,
  Skeleton,
} from "@/components/ui";
import { useProgram } from "@/components/projects/program-context";
import { ProjectCard } from "@/components/projects/project-card";
import { PROGRAM, NEW_PROJECT } from "@/lib/projects/terms";
import { useProgramProjects } from "@/lib/store/programs";
import { NewProjectDialog } from "../../new-project-dialog";

/**
 * The projects of one program, as cards: the ones this person can open.
 *
 * A person on one project of the program sees that one and nothing else; the
 * list is the API's, not narrowed here. "New project" is offered only to people
 * the API says may start one in this program, and starts it in this program.
 */
export function ProgramProjectsView() {
  const { program, unassigned, reach, people } = useProgram();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const list = useProgramProjects(
    unassigned ? { unassigned: true } : { programId: program.id },
    reach === "all",
  );
  const projects = [...(list.data ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          p.key.toLowerCase().includes(needle),
      )
    : projects;

  return (
    <div className="space-y-5">
      {projects.length > 0 && (
        <FilterBar
          search={query}
          onSearchChange={setQuery}
          searchPlaceholder="Search projects"
          searchLabel="Search this program's projects by name or key"
          count={shown.length}
          noun={["project", "projects"]}
          onClearAll={() => setQuery("")}
        />
      )}
      <LoadState
        loading={list.status === "loading"}
        error={list.status === "error" ? list.error : null}
        subject="the projects"
        onRetry={list.reload}
        skeleton={
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((n) => (
              <Skeleton key={n} className="h-44" />
            ))}
          </div>
        }
      >
        {projects.length === 0 && (
          <EmptyState
            icon={<FolderKanban />}
            title={
              unassigned
                ? `Every project you can see is in a ${PROGRAM.one}`
                : `No projects in this ${PROGRAM.one} yet`
            }
            description={
              program.canCreateProject
                ? `A project holds a team's tasks and board. Start one here and the people with access to ${program.name} will see it.`
                : unassigned
                  ? "Projects that are in no program show up here."
                  : "Nothing has been started here, or none of it is yours to open."
            }
            {...(program.canCreateProject
              ? {
                  action: (
                    <Button variant="primary" onClick={() => setCreating(true)}>
                      <Plus aria-hidden="true" className="size-4" />
                      {NEW_PROJECT}
                    </Button>
                  ),
                }
              : {})}
          />
        )}
        {projects.length > 0 && shown.length === 0 && (
          <EmptyState
            icon={<FolderKanban />}
            title="No projects match"
            description="Try another name or key, or clear the search."
            action={
              <Button variant="secondary" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        )}
        {shown.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((project) => (
              <li key={project.id} className="min-w-0">
                <ProjectCard
                  project={project}
                  leadName={
                    people.byId.get(project.leadId)?.name ??
                    project.leadName ??
                    people.nameOf(project.leadId)
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </LoadState>

      <NewProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        takenKeys={projects.map((p) => p.key)}
        defaultProgramId={unassigned ? null : program.id}
      />
    </div>
  );
}
