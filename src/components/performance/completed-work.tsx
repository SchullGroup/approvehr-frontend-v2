"use client";

import { useState } from "react";
import { Disclosure, LoadFailure, Skeleton } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiGoal } from "@/lib/api/performance";
import type { CompletedWork as Work } from "@/lib/projects/completions";
import { count } from "@/lib/projects/terms";
import { useCompletedWork } from "@/lib/store/completions";
import { useOrgTimezone } from "@/lib/store/session";
import { CompletedItem } from "./completed-item";

/**
 * "Completed work", under an objective or a KPI.
 *
 * The finished tasks that people linked to this objective, where whoever opens it
 * to agree it, to review it or to read it can see the work that went into it. For
 * a team objective they are grouped by person. For a person's KPI they are that
 * person's own, and also their tasks linked to an objective above it, each marked
 * with the level it was linked at, so a link made at the department or the company
 * lands where the reader is looking.
 *
 * Read-only, and about work, never a grade: nothing here marks a task, and the
 * objective is agreed and measured exactly as before. A task nobody linked is not
 * here, and that is not a fault. An empty list is said once and plainly.
 *
 * ## One request, when it is wanted
 *
 * In a dialog opened for one objective it asks at once. In a list of objectives
 * (the approval queue) it is `lazy` and asks only when somebody opens it, so a
 * queue of twenty costs nothing until one is read. Where the API answers that the
 * reader may not see it, nothing is drawn at all.
 */
export function CompletedWork({
  goal,
  lazy = false,
}: {
  goal: Pick<
    ApiGoal,
    "id" | "ownerId" | "parentId" | "level" | "reviewCycleId"
  >;
  lazy?: boolean;
}) {
  const [asked, setAsked] = useState(!lazy);
  const [choice, setChoice] = useState<boolean | null>(null);
  const read = useCompletedWork({ goal, enabled: asked });
  const timeZone = useOrgTimezone();

  if (
    read.error instanceof ApiError &&
    (read.error.status === 403 || read.error.status === 404)
  ) {
    return null;
  }

  const open = choice ?? false;
  const work = read.data;
  const total = work?.total ?? null;

  return (
    <Disclosure
      level={4}
      dense
      title="Completed work"
      meta={
        total !== null && total > 0 ? (
          <span className="text-meta font-normal text-muted">
            {count(total, "task")}
          </span>
        ) : undefined
      }
      hint={
        open || total !== null
          ? undefined
          : "Finished tasks linked to this. For reading; nothing here is graded."
      }
      open={open}
      onToggle={() => {
        setAsked(true);
        setChoice(!open);
      }}
    >
      {read.loading ? (
        <Skeleton className="h-12 w-full" aria-label="Loading completed work" />
      ) : read.error ? (
        <LoadFailure
          subject="the completed work"
          error={read.error}
          onRetry={read.reload}
        />
      ) : work ? (
        <Groups
          work={work}
          shared={goal.level !== "personal"}
          timeZone={timeZone}
        />
      ) : null}
    </Disclosure>
  );
}

function Groups({
  work,
  shared,
  timeZone,
}: {
  work: Work;
  shared: boolean;
  timeZone: string;
}) {
  if (work.groups.length === 0) {
    return (
      <p className="text-body-sm text-muted">
        No finished tasks are linked to this yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {work.groups.map((group) => (
        <section key={group.personId}>
          {/* A team objective names who finished what; one person's KPI is theirs
              already, and a heading with their name above it would say nothing. */}
          {(shared || work.groups.length > 1) && (
            <h5 className="mb-1.5 text-body-sm font-medium text-ink">
              {group.personName}
              <span className="ml-2 font-normal text-muted">
                {count(group.items.length, "task")}
              </span>
            </h5>
          )}
          <ul className="divide-y divide-line">
            {group.items.map((item) => (
              <CompletedItem key={item.id} item={item} timeZone={timeZone} />
            ))}
          </ul>
        </section>
      ))}
      {work.capped && (
        <p className="text-meta text-muted">
          Showing {String(work.groups.reduce((n, g) => n + g.items.length, 0))}{" "}
          of {String(work.total)}.
        </p>
      )}
    </div>
  );
}
