"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  SegmentedControl,
  Skeleton,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ProjectKeyChip } from "@/components/projects/glyphs";
import { ProjectsOff } from "@/components/projects/module-off";
import { canCreateProject, canSeeProject } from "@/lib/projects/access";
import { PROJECT_TYPE_LABEL, type Project } from "@/lib/projects/types";
import { useProjectList } from "@/lib/store/projects";
import {
  usePeople,
  useProjectActor,
  useProjectsGate,
} from "@/lib/store/project-session";
import { NewProjectDialog } from "./new-project-dialog";

/**
 * `/projects`: the projects you are on, as cards.
 *
 * Visibility is membership: you see the projects you lead or belong to, and
 * nothing else. People who manage employee records can also switch to everybody's,
 * which is for support and audit and says so. Creating one is for people who lead
 * others (a line manager, a department head) and for those same records
 * managers; everybody else is told how a project comes to exist instead of being
 * shown a button that would be refused.
 */

type Scope = "mine" | "all";

export function ProjectsScreen() {
  const gate = useProjectsGate();
  if (gate.loading) return <ListSkeleton />;
  if (!gate.enabled) return <ProjectsOff />;
  return <List />;
}

function ListSkeleton() {
  return (
    <>
      <PageHeader title="Projects" />
      <PageBody>
        <div
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
          aria-busy="true"
          aria-label="Loading projects"
        >
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} className="h-44" />
          ))}
        </div>
      </PageBody>
    </>
  );
}

function List() {
  const actor = useProjectActor();
  const people = usePeople();
  const [scope, setScope] = useState<Scope>("mine");
  const [creating, setCreating] = useState(false);

  /* In demo the list is the whole book, so it is narrowed here by the same
     predicate the API applies; connected, the API has already done it. */
  const visible = useCallback(
    (project: Project) =>
      scope === "all" ||
      canSeeProject({ ...actor, editRecords: false }, project),
    [actor, scope],
  );
  const list = useProjectList(scope, visible);
  const canCreate = canCreateProject(actor);
  const projects = [...list.projects].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <>
      <PageHeader
        title="Projects"
        description="Plan work as projects, with issues, sprints and a board."
        {...(canCreate
          ? {
              action: (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  <Plus aria-hidden="true" className="size-4" />
                  New project
                </Button>
              ),
            }
          : {})}
      />
      <PageBody className="space-y-6">
        {actor.editRecords && (
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl<Scope>
              label="Which projects"
              value={scope}
              onChange={setScope}
              options={[
                { value: "mine", label: "My projects" },
                { value: "all", label: "Everyone's" },
              ]}
            />
            {scope === "all" && (
              <p className="text-body-sm text-muted">
                Every project in the company, for support and audit. You can
                read and change any of them.
              </p>
            )}
          </div>
        )}

        {list.status === "loading" && (
          <div
            className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            aria-busy="true"
            aria-label="Loading projects"
          >
            {[0, 1, 2].map((n) => (
              <Skeleton key={n} className="h-44" />
            ))}
          </div>
        )}

        {list.status === "error" && (
          <LoadFailure
            subject="the projects"
            error={list.error}
            onRetry={list.reload}
          />
        )}

        {list.status === "ready" && projects.length === 0 && (
          <EmptyState
            icon={<FolderKanban />}
            title={
              scope === "all"
                ? "No projects in the company yet"
                : canCreate
                  ? "Start your first project"
                  : "You are not on a project yet"
            }
            description={
              canCreate
                ? "A project holds a team's issues, sprints and board. Create one, and add the people who work on it."
                : "Projects are started by people who lead a team or a department, and you see the ones you are added to. Ask whoever leads the work to add you."
            }
            {...(canCreate
              ? {
                  action: (
                    <Button variant="primary" onClick={() => setCreating(true)}>
                      <Plus aria-hidden="true" className="size-4" />
                      New project
                    </Button>
                  ),
                }
              : {})}
          />
        )}

        {list.status === "ready" && projects.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <li key={project.id} className="min-w-0">
                <Link
                  href={`/projects/${project.id}`}
                  className="group flex h-full flex-col gap-3 rounded-lg border border-line bg-surface p-5 transition-[border-color,box-shadow] duration-200 hover:border-line-strong hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <ProjectKeyChip project={project} />
                    <Badge tone="neutral" size="sm">
                      {PROJECT_TYPE_LABEL[project.type]}
                    </Badge>
                    {project.departmentName && (
                      <Badge tone="neutral" size="sm">
                        {project.departmentName}
                      </Badge>
                    )}
                  </span>
                  <span className="text-body-md font-semibold text-ink">
                    {project.name}
                  </span>
                  <span className="line-clamp-2 text-body-sm text-muted">
                    {project.description || "No description yet."}
                  </span>
                  <span className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-meta text-muted">
                    <span>
                      Lead{" "}
                      <strong className="font-semibold text-ink">
                        {people.nameOf(project.leadId)}
                      </strong>
                    </span>
                    <span className="tabular">
                      <strong className="font-semibold text-ink">
                        {project.memberIds.length}
                      </strong>{" "}
                      {project.memberIds.length === 1 ? "member" : "members"}
                    </span>
                    {project.openIssueCount !== null && (
                      <span className="tabular">
                        <strong className="font-semibold text-ink">
                          {project.openIssueCount}
                        </strong>{" "}
                        open
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageBody>

      <NewProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        takenKeys={list.projects.map((p) => p.key)}
      />
    </>
  );
}
