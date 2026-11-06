"use client";

import { useCallback, useState } from "react";
import { FolderKanban, Plus } from "lucide-react";
import {
  Button,
  EmptyState,
  Skeleton,
  Field,
  FilterBar,
  Select,
  LoadState,
} from "@/components/ui";
import { LoadMore } from "@/components/portal/load-more";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ProjectCard } from "@/components/projects/project-card";
import { ProjectsOff } from "@/components/projects/module-off";
import { useQueryParam } from "@/components/projects/use-query-param";
import { isModuleOff } from "@/lib/api/projects";
import { canCreateProject, canSeeProject } from "@/lib/projects/access";
import {
  PROJECT_LIST_CAP,
  departmentOptions,
  filterProjects,
  resolveDepartment,
} from "@/lib/projects/project-filter";
import { PROJECTS_SUBTITLE, TASK, CYCLE } from "@/lib/projects/terms";
import type { Project } from "@/lib/projects/types";
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

/** Project cards drawn at a time on the All projects page. */
const PROJECTS_PAGE = 60;

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
  const [query, setQuery] = useQueryParam("q", "");
  const [departmentParam, setDepartment] = useQueryParam("dept", "");
  /* How many cards are drawn, for the filters it was set under. */
  const [paging, setPaging] = useState({ key: "", n: PROJECTS_PAGE });

  /* In demo the list is the whole book, so it is narrowed here by the same
     predicate the API applies; connected, the API has already done it. */
  const visible = useCallback(
    (project: Project) =>
      scope === "all" ||
      canSeeProject({ ...actor, editRecords: false }, project),
    [actor, scope],
  );
  const list = useProjectList(scope, visible);
  /* The flags can lag the API by a moment: if it says the module is off, so is it. */
  if (list.status === "error" && isModuleOff(list.error))
    return <ProjectsOff />;
  const canCreate = canCreateProject(actor);
  const projects = [...list.projects].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const departments = departmentOptions(projects);
  const department = resolveDepartment(departmentParam, departments);
  const departmentLabel = departments.find(
    (d) => d.value === department,
  )?.label;
  const matching = filterProjects(projects, query, department);
  /* The API answers every project the person can open in one list, so a large
     company's page is drawn sixty at a time; a new filter starts again from sixty. */
  const filterKey = `${query}|${department}`;
  const drawn = paging.key === filterKey ? paging.n : PROJECTS_PAGE;
  const shown = matching.slice(0, drawn);
  const filtering = query.trim() !== "" || department !== "";
  const clearFilters = () => {
    setQuery(null);
    setDepartment(null);
  };

  /* A department in the address bar that no listed project is in is not
     applied, and the list says so until another filter is chosen. */
  const staleDepartment =
    list.status === "ready" &&
    departmentParam.trim() !== "" &&
    department === "";

  return (
    <>
      <PageHeader
        title="Projects"
        description={PROJECTS_SUBTITLE}
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
        {list.status === "ready" && projects.length > 0 && (
          <FilterBar
            search={query}
            onSearchChange={(value) => setQuery(value === "" ? null : value)}
            searchPlaceholder="Search projects"
            searchLabel="Search projects by name or key"
            count={matching.length}
            noun={["project", "projects"]}
            applied={[
              ...(actor.editRecords && scope === "all"
                ? [
                    {
                      label: "Show",
                      value: "Everyone's",
                      onClear: () => setScope("mine"),
                    },
                  ]
                : []),
              ...(departmentLabel
                ? [
                    {
                      label: "Department",
                      value: departmentLabel,
                      onClear: () => setDepartment(null),
                    },
                  ]
                : []),
            ]}
            onClearAll={() => {
              clearFilters();
              if (actor.editRecords) setScope("mine");
            }}
          >
            {actor.editRecords && (
              <Field label="Which projects">
                <Select
                  value={scope}
                  onChange={(event) => setScope(event.target.value as Scope)}
                >
                  <option value="mine">My projects</option>
                  <option value="all">Everyone&apos;s</option>
                </Select>
              </Field>
            )}
            {departments.length > 0 && (
              <Field label="Department" help="By the project's department">
                <Select
                  value={department}
                  onChange={(event) =>
                    setDepartment(
                      event.target.value === "" ? null : event.target.value,
                    )
                  }
                >
                  <option value="">All departments</option>
                  {departments.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </FilterBar>
        )}

        {list.status === "ready" &&
          actor.editRecords &&
          projects.length === 0 &&
          scope === "all" && (
            <FilterBar
              applied={[
                {
                  label: "Show",
                  value: "Everyone's",
                  onClear: () => setScope("mine"),
                },
              ]}
            >
              {null}
            </FilterBar>
          )}

        {staleDepartment && (
          <p className="text-body-sm text-muted" role="status">
            That department filter no longer applies. Showing all projects.
          </p>
        )}

        {list.status === "ready" &&
          list.projects.length >= PROJECT_LIST_CAP && (
            <p className="text-body-sm text-muted" role="status">
              Showing the first {PROJECT_LIST_CAP} projects. Narrow the search
              to find others.
            </p>
          )}

        {/* The one loading and failure rule: card-shaped skeletons while it
            asks, the failure card (and nothing else) after it fails. */}
        {(list.status === "loading" || list.status === "error") && (
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
            {null}
          </LoadState>
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
                ? `A project holds a team's ${TASK.many}, ${CYCLE.many} and board. Create one, and add the people who work on it.`
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

        {list.status === "ready" &&
          projects.length > 0 &&
          matching.length === 0 &&
          filtering && (
            <EmptyState
              icon={<FolderKanban />}
              title="No projects match these filters"
              description="Try another name or department, or clear the filters to see every project."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          )}

        {list.status === "ready" && matching.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((project) => (
              <li key={project.id} className="min-w-0">
                <ProjectCard
                  project={project}
                  showProgram
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
        {list.status === "ready" && matching.length > PROJECTS_PAGE && (
          <LoadMore
            shown={shown.length}
            total={matching.length}
            noun={["project", "projects"]}
            hasMore={shown.length < matching.length}
            loading={false}
            error={null}
            onLoadMore={() =>
              setPaging({ key: filterKey, n: drawn + PROJECTS_PAGE })
            }
          />
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
