"use client";

import { useEffect, useState } from "react";
import { Badge, Drawer, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  projectsApi,
  type IssueLink,
  type ReducedIssueDetail,
} from "@/lib/api/projects";
import { FinishMarks } from "@/components/projects/finish-marks";
import { ObjectiveLinkControl } from "@/components/projects/objective-link";
import { objectiveLine } from "@/lib/projects/objectives";
import type { IssueObjective } from "@/lib/projects/types";
import { STAGE, SUBTASK } from "@/lib/projects/terms";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateShort } from "@/lib/time";

/**
 * A board task read by somebody who leads its assignee but is not on its project.
 *
 * `GET /issues/:id` answers such a reader with `reduced: true`: the task's title,
 * status, dates, labels, links and the titles of its sub-tasks, and none of what
 * is said about it (no description, comments or files). So this is a plain viewer,
 * not the issue drawer: there is no box to comment in and nothing to edit, because
 * the API would refuse every one. It says why the reader is seeing it at all.
 */
export function ReducedIssueDrawer({
  detail,
  assigneeName,
  onClose,
}: {
  /** The task to show, or null for a closed drawer. */
  detail: ReducedIssueDetail | null;
  /** Who it is assigned to: the person the reader leads. */
  assigneeName: string;
  onClose: () => void;
}) {
  const timeZone = useOrgTimezone();
  const toast = useToast();
  const [links, setLinks] = useState<{ id: string; rows: IssueLink[] } | null>(
    null,
  );
  const id = detail?.issue.id ?? null;
  /* What the objective-only save said the link is now, so the control reads it
     at once and not the link the drawer was opened with. */
  const [saved, setSaved] = useState<{
    id: string;
    goalId: string | null;
    keyResultId: string | null;
    objective: IssueObjective;
  } | null>(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    projectsApi
      .links(id, controller.signal)
      .then((rows) => setLinks({ id, rows }))
      /* Links are a courtesy here; the rest of the view stands without them. */
      .catch(() => {});
    return () => controller.abort();
  }, [id]);

  const issue =
    detail && saved && saved.id === detail.issue.id
      ? {
          ...detail.issue,
          goalId: saved.goalId,
          keyResultId: saved.keyResultId,
          objective: saved.objective,
        }
      : detail?.issue;
  const shownLinks = links && links.id === id ? links.rows : [];

  return (
    <Drawer
      open={detail !== null}
      onClose={onClose}
      title={issue ? issue.title : "Task"}
      description={issue ? `${issue.key} in ${detail?.projectName ?? ""}` : ""}
    >
      {detail && issue && (
        <div className="space-y-5 p-5 sm:p-6">
          <p className="text-body-sm text-muted">
            You can see this because {assigneeName} is in your team.
          </p>

          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-body-sm">
            <dt className="text-muted">{STAGE.One}</dt>
            <dd className="text-ink">{detail.statusName}</dd>
            <dt className="text-muted">Start date</dt>
            <dd className="text-ink">
              {issue.startDate
                ? formatDateShort(issue.startDate, timeZone)
                : "No date"}
            </dd>
            <dt className="text-muted">Due date</dt>
            <dd className="text-ink">
              {issue.dueDate
                ? formatDateShort(issue.dueDate, timeZone)
                : "No date"}
            </dd>
            <dt className="text-muted">Labels</dt>
            <dd className="flex flex-wrap gap-1.5 text-ink">
              {issue.labels.length === 0 ? (
                <span className="text-muted">None</span>
              ) : (
                issue.labels.map((label) => <Badge key={label}>{label}</Badge>)
              )}
            </dd>
          </dl>

          {/* How it finished. A leader off the board may accept their report's finished task from
              here and read nothing else about it; the section draws only what the API says this
              reader may do, and nothing for a task with no mark. */}
          <FinishMarks
            key={issue.id}
            issue={issue}
            canMarkWontDo={detail.canMarkWontDo === true}
            canAccept={detail.canAccept === true}
          />

          {/* The one thing a leader may change here: where this task is under an
              objective. Absent when the API says they may not. */}
          {issue.canLinkObjective === true ? (
            <ObjectiveLinkControl
              issue={issue}
              save={async (patch) => {
                try {
                  const answer = await projectsApi.setObjective(
                    issue.id,
                    patch,
                  );
                  setSaved({
                    id: issue.id,
                    goalId: answer.goalId,
                    keyResultId: answer.keyResultId,
                    objective: answer.objective,
                  });
                  return true;
                } catch (error) {
                  /* A real failure is said, in the API's words. Not linking is not
                     one, and never reaches here. */
                  toast.push({
                    tone: "danger",
                    title: `Could not update ${issue.key}`,
                    detail:
                      error instanceof ApiError
                        ? error.message
                        : "Try again in a moment.",
                  });
                  return false;
                }
              }}
            />
          ) : (
            (() => {
              const line = objectiveLine(issue);
              return line ? (
                <p className="text-meta leading-snug text-muted">{line}</p>
              ) : null;
            })()
          )}

          {detail.subtasks.length > 0 && (
            <section aria-label={SUBTASK.Many}>
              <h3 className="mb-2 text-body-sm font-semibold text-ink">
                {SUBTASK.Many}
              </h3>
              <ul className="divide-y divide-line rounded-md border border-line">
                {detail.subtasks.map((s) => (
                  <li
                    key={s.id}
                    className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 px-3 py-2 text-body-sm"
                  >
                    <span className="tabular text-meta text-muted">
                      {s.key}
                    </span>
                    <span
                      className={
                        s.statusCategory === "DONE"
                          ? "truncate text-muted line-through"
                          : "truncate text-ink"
                      }
                    >
                      {s.title}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {shownLinks.length > 0 && (
            <section aria-label="Linked tasks">
              <h3 className="mb-2 text-body-sm font-semibold text-ink">
                Linked tasks
              </h3>
              <ul className="divide-y divide-line rounded-md border border-line">
                {shownLinks.map((link) => (
                  <li
                    key={link.id}
                    className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 px-3 py-2 text-body-sm"
                  >
                    <span className="text-muted">{link.label}</span>
                    <span className="truncate text-ink">
                      {"hidden" in link.other
                        ? "A task you can't open"
                        : `${link.other.key} ${link.other.title}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
