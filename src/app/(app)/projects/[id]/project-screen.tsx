"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArchiveRestore, FolderKanban, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  LinkTabs,
  RowActions,
  Skeleton,
  useToast,
  LoadState,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { CreateIssueDialog } from "@/components/projects/create-issue-dialog";
import { ProjectKeyChip } from "@/components/projects/glyphs";
import { FILTER_INPUT_ID } from "@/components/projects/issue-filter-bar";
import { IssueDrawer } from "@/components/projects/issue-drawer";
import { ProjectsOff } from "@/components/projects/module-off";
import {
  ProjectProvider,
  type ProjectContextValue,
} from "@/components/projects/project-context";
import { accessFor, accessOfProject } from "@/lib/projects/access";
import { isModuleOff } from "@/lib/api/projects";
import {
  EMPTY_FILTER,
  statusFromParam,
  type IssueFilter,
} from "@/lib/projects/filters";
import {
  PROJECT_TYPE_LABEL,
  type Issue,
  type NewIssueInput,
  type ProjectData,
} from "@/lib/projects/types";
import {
  CYCLE,
  NEW_TASK,
  readOnlyProject,
  TASK,
  UNASSIGNED,
  UNASSIGNED_ID,
} from "@/lib/projects/terms";
import { setNavHint } from "@/lib/store/nav-hint";
import { useProgramFacts, useProgramList } from "@/lib/store/programs";
import { useProjectActions, useProjectData } from "@/lib/store/projects";
import {
  usePeople,
  useProjectActor,
  useProjectsGate,
} from "@/lib/store/project-session";
import { useOrgTimezone, useSession } from "@/lib/store/session";
import { dayIn, todayIn } from "@/lib/time";
import { DeleteProjectDialog } from "./settings-view";
import { DEFAULT_VIEW, PROJECT_VIEWS, viewById } from "./views";

/**
 * `/projects/[id]`: one project, its tabs, and the drawer.
 *
 * The screen resolves what to show in this order, and each step is a real state
 * rather than a blank: module off (a plain "not switched on"), loading (a
 * skeleton, not a spinner over nothing), failed (with a retry that fits the
 * failure), not found (which is also what a project you are not on looks like —
 * the API answers both the same way, on purpose), and then the project.
 */
export function ProjectScreen({ id }: { id: string }) {
  const gate = useProjectsGate();
  const project = useProjectData(id);

  if (gate.loading) return <ScreenSkeleton />;
  if (!gate.enabled) return <ProjectsOff />;

  if (project.status === "loading") return <ScreenSkeleton />;
  /* The flags can lag the API by a moment: if it says the module is off, so is it. */
  if (project.status === "error" && isModuleOff(project.error)) {
    return <ProjectsOff />;
  }
  if (project.status === "error") {
    return (
      <>
        <PageHeader
          title="Project"
          breadcrumb={[{ href: "/projects", label: "Projects" }]}
        />
        <PageBody>
          <LoadState
            loading={false}
            error={project.error}
            subject="this project"
            onRetry={project.reload}
          >
            {null}
          </LoadState>
        </PageBody>
      </>
    );
  }
  if (project.status === "notFound" || !project.data) {
    return (
      <>
        <PageHeader
          title="Project"
          breadcrumb={[{ href: "/projects", label: "Projects" }]}
        />
        <PageBody>
          <EmptyState
            icon={<FolderKanban />}
            title="This project is not here"
            description="It may have been deleted, or it may not be part of your access. You see the projects you are on, and the ones in programs you have been given."
          />
        </PageBody>
      </>
    );
  }

  return <ProjectShell key={id} data={project.data} capped={project.capped} />;
}

function ScreenSkeleton() {
  return (
    <>
      <PageHeader title="Project" />
      <PageBody>
        <div
          className="space-y-4"
          aria-busy="true"
          aria-label="Loading the project"
        >
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <div className="flex gap-3 overflow-hidden pt-4">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-64 w-72 shrink-0" />
            ))}
          </div>
        </div>
      </PageBody>
    </>
  );
}

function ProjectShell({
  data,
  capped,
}: {
  data: ProjectData;
  capped: boolean;
}) {
  const { project, issues, sprints } = data;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const people = usePeople();
  const actor = useProjectActor();
  const actions = useProjectActions(project.id);
  const timeZone = useOrgTimezone();
  const today = todayIn(timeZone);
  /* Objectives and the weekly-task bridge are the API's: the demo has neither. */
  const { isConnected: connected } = useSession();

  /* `?status=DONE` (the board's "View all done tasks" link) starts the shared
     filter on that status, and a later link with another status moves it. */
  const statusParam = statusFromParam(params.get("status"));
  const [filter, setFilter] = useState<IssueFilter>(() => ({
    ...EMPTY_FILTER,
    statusCategory: statusParam,
  }));
  /* Adjusted while rendering rather than in an effect: a new `?status=` moves
     the filter once, and the filter stays the person's to change after that. */
  const [seenStatus, setSeenStatus] = useState(statusParam);
  if (statusParam !== seenStatus) {
    setSeenStatus(statusParam);
    if (statusParam)
      setFilter((f) => ({ ...f, statusCategory: statusParam, statusIds: [] }));
  }
  const [create, setCreate] = useState<{
    open: boolean;
    defaults: Partial<NewIssueInput>;
  }>({ open: false, defaults: {} });

  /* What the person may do here: the API's own answer where it gave one, the
     same rule worked out from the project and its program where it did not (the
     demo). One answer, asked of everything below: READ shows the project and
     changes nothing, WRITE works its tasks, MANAGE also its settings. */
  const programFacts = useProgramFacts(project.programId);
  const access =
    accessOfProject(project) ??
    accessFor(
      { ...actor, seesAll: actor.seesAll || programFacts.seesAll },
      project,
      programFacts.facts,
    );
  const canWork = access === "WRITE" || access === "MANAGE";
  const canManage = access === "MANAGE";
  /* An archived project keeps its tasks open to work on, and takes no new ones. */
  const archived = project.archived === true;
  const canAdd = canWork && !archived;
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function restore() {
    setRestoring(true);
    const result = await actions.archiveProject(false);
    setRestoring(false);
    if (result.ok) {
      toast.push({ tone: "success", title: `${project.name} restored` });
    }
  }
  const meId = actor.employeeId;

  /* The program's row in the sidebar lights while this project is open. */
  const programId = project.programId ?? null;
  useEffect(() => {
    setNavHint(
      programId ? { programId, path: `/projects/${project.id}` } : null,
    );
    return () => setNavHint(null);
  }, [programId, project.id]);

  const programs = useProgramList();
  const hasPrograms = (programs.data?.programs.length ?? 0) > 0;
  /* The API names the program on the project; the demo's stored project holds
     only its id, so the name is read from the programs the person can see. */
  const programName =
    project.programName ??
    programs.data?.programs.find((p) => p.id === project.programId)?.name ??
    null;

  /* Settings are for people who manage the project; for everybody else the tab
     is absent, and a link to it opens the board. */
  const offered = PROJECT_VIEWS.filter((v) => v.id !== "settings" || canManage);
  const asked = viewById(params.get("view") ?? DEFAULT_VIEW);
  const view = offered.some((v) => v.id === asked.id)
    ? asked
    : viewById(DEFAULT_VIEW);
  /* `?issue=KEY` is what the API's links and the app write, and stays so for the
     links already out there. `?task=KEY` is read as the same thing, so a link
     written in the new word opens the drawer too. */
  const issueParam = params.get("issue") ?? params.get("task");

  const issueById = useMemo(
    () => new Map(issues.map((i) => [i.id, i])),
    [issues],
  );
  const issueByKey = useMemo(
    () => new Map(issues.map((i) => [i.key, i])),
    [issues],
  );
  const epics = useMemo(
    () => issues.filter((i) => i.type === "EPIC"),
    [issues],
  );
  const dayOf = useCallback(
    (instant: string) => dayIn(instant, timeZone),
    [timeZone],
  );

  /* ------------------------------------------------------- the open issue -- */

  const open = issueParam
    ? (issueByKey.get(issueParam.toUpperCase()) ?? null)
    : null;

  /* Where the URL was before an issue was opened by a click here, so closing can
     go back to it instead of stacking another entry. A link someone shared, a
     reload, or a change of tab all leave this not matching, and closing then
     simply removes the parameter. */
  const openedFrom = useRef<string | null>(null);

  const urlWith = useCallback(
    (key: string | null) => {
      const query = new URLSearchParams(params.toString());
      query.delete("task");
      if (key === null) query.delete("issue");
      else query.set("issue", key);
      const qs = query.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [params, pathname],
  );

  const openIssue = useCallback(
    (target: Pick<Issue, "key">) => {
      if (issueParam) {
        /* Already in the drawer (a sub-task, the epic): swap, do not stack. */
        router.replace(urlWith(target.key), { scroll: false });
        return;
      }
      openedFrom.current = urlWith(null);
      router.push(urlWith(target.key), { scroll: false });
    },
    [issueParam, router, urlWith],
  );

  /* Opened from a list of tasks (My tasks, or the program and Master lists):
     closing goes back to it. */
  const fromMyTasks = ["my-tasks", "work"].includes(params.get("from") ?? "");
  const closeIssue = useCallback(() => {
    /* Opened from a My tasks row: closing goes back there, to the same segment. */
    if (fromMyTasks) {
      router.back();
      return;
    }
    if (openedFrom.current !== null && openedFrom.current === urlWith(null)) {
      openedFrom.current = null;
      router.back();
      return;
    }
    openedFrom.current = null;
    router.replace(urlWith(null), { scroll: false });
  }, [router, urlWith, fromMyTasks]);

  /* The last issue the drawer showed, so that an issue that disappears while it
     is open (deleted here, or by somebody else) is told apart from a link to one
     that was never in this project. Written in an effect: a ref is not read or
     written during render. */
  const lastShown = useRef<string | null>(null);
  useEffect(() => {
    if (open) lastShown.current = open.key;
  });

  /* A link to an issue that is not in this project (mistyped, or from another
     project) says so once and drops the parameter. An issue that was open and has
     gone is not that: closing it is already under way, and a toast about a thing
     the person just deleted would be noise. Once per value, because this effect
     re-runs on every render that changes a dependency, and a toast raised on each
     of those is a column of them. */
  const told = useRef<string | null>(null);
  const { push: pushToast } = toast;
  useEffect(() => {
    if (issueParam === null || open !== null) return;
    if (told.current === issueParam) return;
    told.current = issueParam;
    if (lastShown.current !== issueParam.toUpperCase()) {
      pushToast({
        tone: "info",
        title: `${issueParam} is not in this project`,
      });
    }
    router.replace(urlWith(null), { scroll: false });
  }, [issueParam, open, router, urlWith, pushToast]);

  /* ---------------------------------------------------------- the shortcuts -- */

  const openCreate = useCallback(
    (defaults: Partial<NewIssueInput> = {}) => {
      if (!canAdd) return;
      setCreate({ open: true, defaults });
    },
    [canAdd],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target !== null &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing) return;
      /* With a dialog or the drawer open the page behind is not the target. */
      if (document.querySelector('[role="dialog"]')) return;
      if (event.key === "c" && canAdd) {
        event.preventDefault();
        setCreate({ open: true, defaults: {} });
      } else if (event.key === "/") {
        const field = document.getElementById(FILTER_INPUT_ID);
        if (field) {
          event.preventDefault();
          field.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canAdd]);

  /* ------------------------------------------------------------ the context -- */

  const value: ProjectContextValue = useMemo(
    () => ({
      project,
      issues,
      sprints,
      epics,
      issueById,
      issueByKey,
      actions,
      people,
      meId,
      connected,
      canWork,
      canManage,
      timeZone,
      today,
      dayOf,
      filter,
      setFilter,
      openIssue,
      openCreate,
    }),
    [
      project,
      issues,
      sprints,
      epics,
      issueById,
      issueByKey,
      actions,
      people,
      meId,
      connected,
      canWork,
      canManage,
      timeZone,
      today,
      dayOf,
      filter,
      openIssue,
      openCreate,
    ],
  );

  const hrefFor = (id: string) =>
    id === DEFAULT_VIEW
      ? `/projects/${project.id}`
      : `/projects/${project.id}?view=${id}`;
  const View = view.Component;

  return (
    <ProjectProvider value={value}>
      <PageHeader
        title={project.name}
        breadcrumb={[
          { href: "/projects", label: "Projects" },
          ...(project.programId && programName
            ? [
                {
                  href: `/projects/programs/${project.programId}`,
                  label: programName,
                },
              ]
            : hasPrograms
              ? [
                  {
                    href: `/projects/programs/${UNASSIGNED_ID}`,
                    label: UNASSIGNED,
                  },
                ]
              : []),
        ]}
        meta={
          <>
            <ProjectKeyChip project={project} />
            <Badge tone="neutral" size="sm">
              {PROJECT_TYPE_LABEL[project.type]}
            </Badge>
            {archived && (
              <Badge tone="neutral" size="sm">
                Archived
              </Badge>
            )}
            {project.departmentName && (
              <Badge tone="neutral" size="sm">
                {project.departmentName}
              </Badge>
            )}
          </>
        }
        {...(project.description ? { description: project.description } : {})}
        {...(canAdd || canManage
          ? {
              action: (
                <div className="flex items-center gap-2">
                  {/* Edit and delete were only on the Settings tab, which
                      nobody found from the board. The menu is beside the one
                      button people come for, and only for those who manage it. */}
                  {canManage && (
                    <RowActions
                      label={`More actions for ${project.name}`}
                      items={[
                        {
                          label: "Edit project",
                          icon: <Pencil aria-hidden="true" className="size-4" />,
                          href: hrefFor("settings"),
                        },
                        {
                          label: "Delete project",
                          icon: <Trash2 aria-hidden="true" className="size-4" />,
                          tone: "danger",
                          onSelect: () => setDeleting(true),
                        },
                      ]}
                    />
                  )}
                  {canAdd && (
                    <Button variant="primary" onClick={() => openCreate()}>
                      <Plus aria-hidden="true" className="size-4" />
                      {NEW_TASK}
                    </Button>
                  )}
                </div>
              ),
            }
          : {})}
        tabs={
          <LinkTabs
            label={`${project.name} sections`}
            items={offered.map((v) => ({
              href: hrefFor(v.id),
              label: v.label,
            }))}
            activeHref={hrefFor(view.id)}
            className="-mb-5 border-b-0"
          />
        }
      />
      <PageBody className="space-y-5">
        {archived && (
          <div
            role="note"
            className="flex flex-col gap-3 rounded-lg border border-line bg-sunken px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-body-sm text-body">
              This project is archived. It keeps its {TASK.many}, people and{" "}
              {CYCLE.many}, and is listed under the Archive. It takes no new{" "}
              {TASK.many} until it is restored.
            </p>
            {canManage && (
              <Button
                variant="secondary"
                size="sm"
                loading={restoring}
                onClick={() => void restore()}
                className="shrink-0"
              >
                <ArchiveRestore aria-hidden="true" className="size-4" />
                Restore project
              </Button>
            )}
          </div>
        )}
        {access === "READ" && (
          <p className="text-body-sm text-muted" role="note">
            {readOnlyProject(programName)}
          </p>
        )}
        {capped && (
          <Callout
            tone="warning"
            title={`Only the first 5,000 ${TASK.many} are shown`}
          >
            This project has more than that. Filters and counts here work on
            what is shown.
          </Callout>
        )}
        <View />
      </PageBody>

      <IssueDrawer issue={open} onClose={closeIssue} />
      {canManage && (
        <DeleteProjectDialog
          open={deleting}
          onClose={() => setDeleting(false)}
        />
      )}
      <CreateIssueDialog
        open={create.open}
        onClose={() => setCreate((c) => ({ ...c, open: false }))}
        defaults={create.defaults}
      />
    </ProjectProvider>
  );
}
