"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks } from "lucide-react";
import { Button, ButtonLink, EmptyState, Skeleton } from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { NotFoundState } from "@/components/portal/not-found-state";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ProjectsOff } from "@/components/projects/module-off";
import { PersonalIssueDrawer } from "@/components/projects/personal-issue-drawer";
import { ReducedIssueDrawer } from "@/components/projects/reduced-issue-drawer";
import { ApiError } from "@/lib/api/client";
import { isModuleOff, projectsApi, type TaskTarget } from "@/lib/api/projects";
import { usePeople, useProjectsGate } from "@/lib/store/project-session";

/**
 * `/projects/tasks/:id`: any task, opened by its id.
 *
 * This is where a notification about a personal task points, and where a link
 * to one goes (a personal list has no board to open it on, and every list has a
 * `MY-1`, so a key names nothing). What opens depends on what `GET /issues/:id`
 * answers for this reader:
 *
 * - **A personal task:** its drawer, over a plain page.
 * - **A board task:** its board, with the drawer open (`?issue=KEY`).
 * - **A board task the reader only leads somebody on:** the read-only view.
 * - **A 404** (not there, or not theirs to see — the API answers both alike):
 *   the app's not-found.
 */

type State =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "error"; error: unknown }
  | { status: "ready"; target: TaskTarget };

export function TaskScreen({ id }: { id: string }) {
  const gate = useProjectsGate();
  if (gate.loading) {
    return (
      <>
        <PageHeader title="Task" />
        <PageBody>
          <Skeleton className="h-40" aria-label="Opening the task" />
        </PageBody>
      </>
    );
  }
  if (!gate.enabled) return <ProjectsOff />;
  return <Opened id={id} />;
}

function Opened({ id }: { id: string }) {
  const router = useRouter();
  const people = usePeople();
  const [state, setState] = useState<State>({ status: "loading" });
  const [open, setOpen] = useState(true);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  /* Another task's id (a link from inside the drawer): start again. */
  const [seenId, setSeenId] = useState(id);
  if (seenId !== id) {
    setSeenId(id);
    setState({ status: "loading" });
    setOpen(true);
  }

  useEffect(() => {
    const controller = new AbortController();
    projectsApi
      .openTask(id, controller.signal)
      .then((target) => {
        if (target.kind === "board") {
          router.replace(
            `/projects/${target.projectId}?issue=${encodeURIComponent(target.key)}`,
          );
        }
        setState({ status: "ready", target });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState(
          error instanceof ApiError && error.status === 404
            ? { status: "missing" }
            : { status: "error", error },
        );
      });
    return () => controller.abort();
    // `router` changes identity on navigation; the id is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, version]);

  if (state.status === "missing") {
    return (
      <>
        <PageHeader title="Page not found" />
        <PageBody>
          <NotFoundState subject="that task" />
        </PageBody>
      </>
    );
  }
  if (state.status === "error" && isModuleOff(state.error)) {
    return <ProjectsOff />;
  }

  const target = state.status === "ready" ? state.target : null;
  const title =
    target && target.kind !== "board"
      ? `${target.issue.key} ${target.issue.title}`
      : "Task";

  return (
    <>
      <PageHeader title={title} />
      <PageBody>
        {(state.status === "loading" || target?.kind === "board") && (
          <Skeleton className="h-40" aria-label="Opening the task" />
        )}
        {state.status === "error" && (
          <LoadFailure
            subject="this task"
            error={state.error}
            onRetry={reload}
          />
        )}
        {target && target.kind !== "board" && !open && (
          <EmptyState
            icon={<ListChecks />}
            title="The task is closed"
            description="Open it again, or go back to your tasks."
            action={
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button variant="primary" onClick={() => setOpen(true)}>
                  Open the task
                </Button>
                <ButtonLink href="/projects/mine" variant="secondary">
                  My tasks
                </ButtonLink>
              </div>
            }
          />
        )}
      </PageBody>

      {target?.kind === "personal" && (
        <PersonalIssueDrawer
          issueId={open ? target.issue.id : null}
          issues={[]}
          onClose={() => setOpen(false)}
          onChanged={reload}
        />
      )}
      {target?.kind === "reduced" && (
        <ReducedIssueDrawer
          detail={open ? target : null}
          assigneeName={people.nameOf(target.issue.assigneeId)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
