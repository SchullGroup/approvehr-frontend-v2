"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FolderKanban, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  LinkTabs,
  Skeleton,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
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
import { canManageProject, canWorkInProject } from "@/lib/projects/access";
import { isModuleOff } from "@/lib/api/projects";
import { EMPTY_FILTER, type IssueFilter } from "@/lib/projects/filters";
import {
  PROJECT_TYPE_LABEL,
  type Issue,
  type NewIssueInput,
  type ProjectData,
} from "@/lib/projects/types";
import { useProjectActions, useProjectData } from "@/lib/store/projects";
import {
  usePeople,
  useProjectActor,
  useProjectsGate,
} from "@/lib/store/project-session";
import { useOrgTimezone, useSession } from "@/lib/store/session";
import { dayIn, todayIn } from "@/lib/time";
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
          <LoadFailure
            subject="this project"
            error={project.error}
            onRetry={project.reload}
          />
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
            description="It may have been deleted, or you may not be a member of it. Projects are only visible to the people on them."
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

  const [filter, setFilter] = useState<IssueFilter>(EMPTY_FILTER);
  const [create, setCreate] = useState<{
    open: boolean;
    defaults: Partial<NewIssueInput>;
  }>({ open: false, defaults: {} });

  const canWork = canWorkInProject(actor, project);
  /* The API's own answer where it gave one; the same rule worked out here where
     it did not (the demo). */
  const canManage = project.canManage ?? canManageProject(actor, project);
  const meId = actor.employeeId;

  const view = viewById(params.get("view") ?? DEFAULT_VIEW);
  const issueParam = params.get("issue");

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

  const closeIssue = useCallback(() => {
    if (openedFrom.current !== null && openedFrom.current === urlWith(null)) {
      openedFrom.current = null;
      router.back();
      return;
    }
    openedFrom.current = null;
    router.replace(urlWith(null), { scroll: false });
  }, [router, urlWith]);

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
      if (!canWork) return;
      setCreate({ open: true, defaults });
    },
    [canWork],
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
      if (event.key === "c" && canWork) {
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
  }, [canWork]);

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
        breadcrumb={[{ href: "/projects", label: "Projects" }]}
        meta={
          <>
            <ProjectKeyChip project={project} />
            <Badge tone="neutral" size="sm">
              {PROJECT_TYPE_LABEL[project.type]}
            </Badge>
            {project.departmentName && (
              <Badge tone="neutral" size="sm">
                {project.departmentName}
              </Badge>
            )}
          </>
        }
        {...(project.description ? { description: project.description } : {})}
        {...(canWork
          ? {
              action: (
                <Button variant="primary" onClick={() => openCreate()}>
                  <Plus aria-hidden="true" className="size-4" />
                  Create issue
                </Button>
              ),
            }
          : {})}
        tabs={
          <LinkTabs
            items={PROJECT_VIEWS.map((v) => ({
              href: hrefFor(v.id),
              label: v.label,
            }))}
            activeHref={hrefFor(view.id)}
            className="-mb-5 border-b-0"
          />
        }
      />
      <PageBody className="space-y-5">
        {capped && (
          <Callout tone="warning" title="Only the first 5,000 issues are shown">
            This project has more than that. Filters and counts here work on
            what is shown.
          </Callout>
        )}
        <View />
      </PageBody>

      <IssueDrawer issue={open} onClose={closeIssue} />
      <CreateIssueDialog
        open={create.open}
        onClose={() => setCreate((c) => ({ ...c, open: false }))}
        defaults={create.defaults}
      />
    </ProjectProvider>
  );
}
