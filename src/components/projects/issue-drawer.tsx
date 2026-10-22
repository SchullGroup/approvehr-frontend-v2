"use client";

import { useId, useMemo, useState } from "react";
import { Link2, Trash2 } from "lucide-react";
import {
  Button,
  Checkbox,
  Drawer,
  IconButton,
  Input,
  Select,
  useToast,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { openSprints } from "@/lib/projects/board";
import { describeActivity, type HistoryLookup } from "@/lib/projects/history";
import {
  childrenOf,
  parseLabels,
  parsePoints,
  storiesOf,
} from "@/lib/projects/mutations";
import { canDeleteComment } from "@/lib/projects/access";
import { weeklyTaskLine } from "@/lib/projects/objectives";
import { byRank } from "@/lib/projects/rank";
import { countProgress } from "@/lib/projects/progress";
import {
  ISSUE_TYPE_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  type Issue,
  type IssueComment,
  type Priority,
} from "@/lib/projects/types";
import {
  checkboxTarget,
  effectiveStatus,
  isDone,
  sortStatuses,
} from "@/lib/projects/workflow";
import { useIssueThread } from "@/lib/store/projects";
import { useProjectActor } from "@/lib/store/project-session";
import { formatDateTimeShort } from "@/lib/time";
import { CommentItem } from "./comment-item";
import { DraftHeading, DraftInput, DraftTextarea } from "./draft-fields";
import { LinkedTasks } from "./linked-tasks";
import { IssueKey, StatusPill, TypeIcon } from "./glyphs";
import { MentionComposer } from "./mention-composer";
import { IssueObjectiveLink } from "./objective-link";
import { PersonAvatar, PersonName, PersonPicker } from "./person";
import { SectionTabs } from "./section-tabs";
import { closeTopPopup } from "./popups";
import { useProject } from "./project-context";

/**
 * One issue, in a panel beside the board.
 *
 * Everything the design's drawer has: an editable summary and description,
 * sub-tasks (or an epic's stories) with progress and a quick-add row, comments
 * with @mentions, the history, and every field — status, assignee, type,
 * priority, points, sprint, epic, labels, dates — plus delete with a count of
 * what goes with it.
 *
 * ## It stays mounted
 *
 * The drawer is always rendered and only its `open` flag moves, so `Drawer`'s own
 * exit animation can run; the issue it shows is frozen at the last one while it
 * closes. Its body is keyed by the issue's id, so switching issues starts every
 * draft fresh instead of carrying the last issue's half-typed text across.
 *
 * ## Changes are saved as they are made
 *
 * Selects and dates save on change; text saves when you leave it (`draft-fields`).
 * Each goes through `actions.patchIssue`, which applies it at once and rolls it
 * back with a toast if the API refuses.
 */
export function IssueDrawer({
  issue,
  onClose,
}: {
  issue: Issue | null;
  onClose: () => void;
}) {
  /* Frozen at the last issue while closing. `useState` with an update during
     render, never a ref: reading one during render is what this repo's lint
     forbids. */
  const [shown, setShown] = useState(issue);
  if (issue && issue !== shown) setShown(issue);

  return (
    <Drawer
      open={issue !== null}
      onClose={() => {
        /* A dropdown open inside the panel closes first, so Escape never throws
           away a half-made choice along with the drawer. */
        if (!closeTopPopup()) onClose();
      }}
      title={shown ? shown.key : "Issue"}
      size="xl"
      className="sm:max-w-4xl"
    >
      {shown && <DrawerBody key={shown.id} issue={shown} onClose={onClose} />}
    </Drawer>
  );
}

function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
      <label htmlFor={htmlFor} className="text-meta font-medium text-muted">
        {label}
      </label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function DrawerBody({ issue, onClose }: { issue: Issue; onClose: () => void }) {
  const {
    project,
    issues,
    sprints,
    epics,
    issueById,
    actions,
    people,
    meId,
    canWork,
    timeZone,
    openIssue,
  } = useProject();
  const toast = useToast();
  const actor = useProjectActor();
  const { thread, reload: reloadThread } = useIssueThread(issue.id);
  const base = useId();

  const [confirming, setConfirming] = useState(false);
  const [tab, setTab] = useState<"comments" | "history">("comments");
  const [quickAdd, setQuickAdd] = useState("");

  const statuses = useMemo(
    () => sortStatuses(project.statuses),
    [project.statuses],
  );
  const status = effectiveStatus(project.statuses, issue.statusId);
  const isEpic = issue.type === "EPIC";
  const isSubtask = issue.type === "SUBTASK";
  const kids = useMemo(
    () =>
      (isEpic
        ? storiesOf(issues, issue.id)
        : childrenOf(issues, issue.id)
      ).sort(byRank),
    [issues, issue.id, isEpic],
  );
  const progress = countProgress(project.statuses, kids);
  const parent = issue.parentId
    ? (issueById.get(issue.parentId) ?? null)
    : null;
  const epic = issue.epicId ? (issueById.get(issue.epicId) ?? null) : null;
  const planned = openSprints(sprints);
  const currentSprint = sprints.find((s) => s.id === issue.sprintId);
  const sprintChoices =
    currentSprint && currentSprint.state === "CLOSED"
      ? [...planned, currentSprint]
      : planned;

  const save = (patch: Parameters<typeof actions.patchIssue>[1]) =>
    void actions.patchIssue(issue, patch);

  const lookup: HistoryLookup = {
    statusName: (id) => project.statuses.find((s) => s.id === id)?.name ?? null,
    personName: (id) => people.nameOf(id),
    sprintName: (id) => sprints.find((s) => s.id === id)?.name ?? null,
    issueKey: (id) => issueById.get(id)?.key ?? null,
  };

  const comments = [...thread.comments].reverse();
  const history = [...thread.activity].reverse();

  async function addKid() {
    const title = quickAdd.trim();
    if (!title) return;
    setQuickAdd("");
    const result = await actions.createIssue(
      isEpic
        ? { type: "STORY", title, epicId: issue.id }
        : { type: "SUBTASK", title, parentId: issue.id },
    );
    if (result.ok) {
      toast.push({ tone: "success", title: `${result.value.key} created` });
    } else {
      setQuickAdd(title);
    }
  }

  async function remove() {
    const label = issue.key;
    onClose();
    const result = await actions.deleteIssue(issue);
    if (result.ok) toast.push({ tone: "success", title: `${label} deleted` });
  }

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}?issue=${issue.key}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.push({ tone: "success", title: `Link to ${issue.key} copied` });
    } catch {
      toast.push({
        tone: "info",
        title: "Could not copy the link",
        detail: "It is in the address bar.",
      });
    }
  }

  const canDelete = (c: IssueComment) => canDeleteComment(actor, project, c);

  /* Said only when the API says it: nothing for an epic, a sub-task, an
     unassigned or unfinished issue, and nothing at all in the demo. */
  const bridgeNote = weeklyTaskLine(issue.weeklyTask);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <nav
          aria-label="Where this issue sits"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-meta text-muted"
        >
          {epic && (
            <>
              <button
                type="button"
                onClick={() => openIssue(epic)}
                className="inline-flex items-center gap-1 rounded-sm hover:text-ink hover:underline"
              >
                <TypeIcon type="EPIC" />
                {epic.key}
              </button>
              <span aria-hidden="true">/</span>
            </>
          )}
          {parent && (
            <>
              <button
                type="button"
                onClick={() => openIssue(parent)}
                className="inline-flex items-center gap-1 rounded-sm hover:text-ink hover:underline"
              >
                <TypeIcon type={parent.type} />
                {parent.key}
              </button>
              <span aria-hidden="true">/</span>
            </>
          )}
          <span className="inline-flex items-center gap-1.5 font-medium text-ink">
            <TypeIcon type={issue.type} />
            {ISSUE_TYPE_LABEL[issue.type]}
          </span>
        </nav>
        <IconButton
          label="Copy link to this issue"
          size="sm"
          onClick={copyLink}
        >
          <Link2 className="size-4" />
        </IconButton>
        {canWork && (
          <IconButton
            label="Delete this issue"
            size="sm"
            onClick={() => setConfirming(true)}
          >
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </div>

      {confirming && (
        <div
          role="alertdialog"
          aria-label={`Delete ${issue.key}`}
          className="flex flex-wrap items-center gap-3 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-body-sm text-ink"
        >
          <span className="min-w-0 flex-1">
            Delete <strong>{issue.key}</strong>
            {isEpic && kids.length > 0
              ? `? Its ${kids.length} ${kids.length === 1 ? "issue stays" : "issues stay"}, without an epic.`
              : kids.length > 0
                ? ` and its ${kids.length} ${kids.length === 1 ? "sub-task" : "sub-tasks"}?`
                : "?"}{" "}
            This cannot be undone.
          </span>
          <Button size="sm" variant="danger" onClick={() => void remove()}>
            Delete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
        </div>
      )}

      <DraftHeading
        value={issue.title}
        aria-label="Summary"
        disabled={!canWork}
        clean={(draft) => (draft.trim() ? draft.trim() : null)}
        onCommit={(title) => save({ title })}
      />

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="order-last min-w-0 space-y-6 md:order-first">
          <section aria-labelledby={`${base}-desc`}>
            <h3
              id={`${base}-desc`}
              className="mb-2 text-meta font-semibold text-muted"
            >
              Description
            </h3>
            <DraftTextarea
              value={issue.description}
              rows={5}
              disabled={!canWork}
              placeholder={
                canWork
                  ? "Add context, acceptance criteria, links"
                  : "No description"
              }
              aria-labelledby={`${base}-desc`}
              onCommit={(description) => save({ description })}
            />
          </section>

          {!isSubtask && (
            <section aria-labelledby={`${base}-kids`}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3
                  id={`${base}-kids`}
                  className="text-meta font-semibold text-muted"
                >
                  {isEpic ? "Issues in this epic" : "Sub-tasks"}
                </h3>
                {kids.length > 0 && (
                  <span className="tabular text-meta text-muted">
                    {progress.done} of {progress.total} done
                  </span>
                )}
              </div>
              {kids.length > 0 && (
                <div
                  role="progressbar"
                  aria-label={isEpic ? "Epic progress" : "Sub-task progress"}
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                  aria-valuenow={progress.done}
                  className="mb-3 h-1.5 overflow-hidden rounded-full bg-sunken"
                >
                  <div
                    className="h-full rounded-full bg-success-strong transition-[width] duration-300 motion-reduce:transition-none"
                    style={{ width: `${progress.ratio * 100}%` }}
                  />
                </div>
              )}
              <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
                {kids.map((kid) => {
                  const done = isDone(project.statuses, kid);
                  return (
                    <li
                      key={kid.id}
                      className="flex items-center gap-2.5 px-3 py-2"
                    >
                      <Checkbox
                        label={
                          <span className="sr-only">
                            {done ? "Reopen" : "Mark done"} {kid.key}
                          </span>
                        }
                        checked={done}
                        disabled={!canWork}
                        onChange={() =>
                          void actions.patchIssue(kid, {
                            statusId: checkboxTarget(project.statuses, done).id,
                          })
                        }
                      />
                      <TypeIcon type={kid.type} />
                      <IssueKey issueKey={kid.key} done={done} />
                      <button
                        type="button"
                        onClick={() => openIssue(kid)}
                        className="min-w-0 flex-1 truncate text-left text-body-sm text-ink hover:underline"
                      >
                        {kid.title}
                      </button>
                      <StatusPill
                        status={effectiveStatus(project.statuses, kid.statusId)}
                        className="hidden sm:inline-flex"
                      />
                      <PersonAvatar people={people} id={kid.assigneeId} />
                    </li>
                  );
                })}
                {kids.length === 0 && !canWork && (
                  <li className="px-3 py-3 text-body-sm text-muted">None</li>
                )}
                {canWork && (
                  <li className="bg-canvas px-3 py-2">
                    <Input
                      value={quickAdd}
                      onChange={(event) => setQuickAdd(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void addKid();
                        }
                      }}
                      placeholder={
                        isEpic
                          ? "Add a story to this epic and press Enter"
                          : "Add a sub-task and press Enter"
                      }
                      aria-label={
                        isEpic ? "Add a story to this epic" : "Add a sub-task"
                      }
                      autoComplete="off"
                      maxLength={240}
                    />
                  </li>
                )}
              </ul>
            </section>
          )}

          <LinkedTasks
            key={issue.id}
            issueId={issue.id}
            onChanged={reloadThread}
          />

          <SectionTabs
            label="Comments and history"
            items={[
              {
                id: "comments",
                label: "Comments",
                ...(comments.length > 0 ? { count: comments.length } : {}),
              },
              { id: "history", label: "History" },
            ]}
            value={tab}
            onChange={setTab}
          >
            {tab === "comments" ? (
              <div className="space-y-5">
                {canWork && meId && (
                  <MentionComposer
                    people={people}
                    memberIds={project.memberIds}
                    meId={meId}
                    onPost={async (body) => {
                      const result = await actions.addComment(issue.id, body);
                      return result.ok;
                    }}
                  />
                )}
                {comments.length === 0 ? (
                  <p className="text-body-sm text-muted">No comments yet.</p>
                ) : (
                  <ul className="space-y-4">
                    {comments.map((comment) => (
                      <CommentItem
                        key={comment.id}
                        comment={comment}
                        people={people}
                        memberIds={project.memberIds}
                        meId={meId}
                        timeZone={timeZone}
                        canEdit={meId !== null && comment.authorId === meId}
                        canDelete={canDelete(comment)}
                        onSave={async (body) =>
                          (
                            await actions.editComment(
                              issue.id,
                              comment.id,
                              body,
                            )
                          ).ok
                        }
                        onDelete={() =>
                          void actions.deleteComment(issue.id, comment.id)
                        }
                      />
                    ))}
                  </ul>
                )}
              </div>
            ) : history.length === 0 ? (
              <p className="text-body-sm text-muted">No history yet.</p>
            ) : (
              <ul className="space-y-3">
                {history.map((row) => {
                  const text = describeActivity(row, lookup);
                  return (
                    <li key={row.id} className="flex items-start gap-3">
                      <PersonAvatar
                        people={people}
                        id={row.actorId}
                        decorative
                      />
                      <p className="min-w-0 flex-1 text-body-sm text-ink">
                        <strong className="font-semibold">
                          {row.actorId ? people.nameOf(row.actorId) : "Someone"}
                        </strong>{" "}
                        {text.verb}
                        {text.from !== null && text.to !== null && (
                          <>
                            {" "}
                            <span className="text-faint line-through">
                              {text.from}
                            </span>{" "}
                            to {text.to}
                          </>
                        )}{" "}
                        <time
                          dateTime={row.at}
                          className="text-meta text-muted"
                        >
                          {formatDateTimeShort(row.at, timeZone)}
                        </time>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionTabs>
        </div>

        <aside
          aria-label="Details"
          className="order-first space-y-3.5 self-start rounded-lg border border-line bg-canvas p-4 md:order-last"
        >
          <Row label="Status" htmlFor={`${base}-status`}>
            <Select
              id={`${base}-status`}
              value={status.id}
              disabled={!canWork}
              onChange={(event) => save({ statusId: event.target.value })}
              className="h-9"
            >
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Row>

          <Row label="Assignee">
            <PersonPicker
              people={people}
              value={issue.assigneeId ?? ""}
              ids={project.memberIds}
              allowNone
              disabled={!canWork}
              aria-label="Assignee"
              onChange={(id) => save({ assigneeId: id || null })}
            />
          </Row>
          {canWork &&
            meId &&
            issue.assigneeId !== meId &&
            project.memberIds.includes(meId) && (
              <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3">
                <span />
                <Button
                  size="sm"
                  variant="ghost"
                  className="justify-self-start"
                  onClick={() => save({ assigneeId: meId })}
                >
                  Assign to me
                </Button>
              </div>
            )}
          <IssueObjectiveLink issue={issue} />
          {bridgeNote && (
            <p className="text-meta leading-snug text-muted">{bridgeNote}</p>
          )}

          <Row label="Reporter">
            <PersonName people={people} id={issue.reporterId} />
          </Row>

          <Row label="Type" htmlFor={`${base}-type`}>
            {isEpic || isSubtask ? (
              <span className="text-body-sm text-ink">
                {ISSUE_TYPE_LABEL[issue.type]}
              </span>
            ) : (
              <Select
                id={`${base}-type`}
                value={issue.type}
                disabled={!canWork}
                onChange={(event) =>
                  save({ type: event.target.value as Issue["type"] })
                }
                className="h-9"
              >
                {(["STORY", "TASK", "BUG"] as const).map((type) => (
                  <option key={type} value={type}>
                    {ISSUE_TYPE_LABEL[type]}
                  </option>
                ))}
              </Select>
            )}
          </Row>

          <Row label="Priority" htmlFor={`${base}-priority`}>
            <Select
              id={`${base}-priority`}
              value={issue.priority}
              disabled={!canWork}
              onChange={(event) =>
                save({ priority: event.target.value as Priority })
              }
              className="h-9"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </Select>
          </Row>

          {!isEpic && (
            <Row label="Points" htmlFor={`${base}-points`}>
              <DraftInput
                id={`${base}-points`}
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                placeholder="None"
                disabled={!canWork}
                value={issue.points === null ? "" : String(issue.points)}
                clean={(draft) => {
                  if (draft.trim() === "") return "";
                  const points = parsePoints(draft);
                  return points === null ? null : String(points);
                }}
                onCommit={(next) => save({ points: parsePoints(next) })}
                className="h-9"
              />
            </Row>
          )}

          {project.type === "SCRUM" && !isEpic && !isSubtask && (
            <Row label="Sprint" htmlFor={`${base}-sprint`}>
              <Select
                id={`${base}-sprint`}
                value={issue.sprintId ?? ""}
                disabled={!canWork}
                onChange={(event) =>
                  save({ sprintId: event.target.value || null })
                }
                className="h-9"
              >
                <option value="">Backlog</option>
                {sprintChoices.map((sprint) => (
                  <option key={sprint.id} value={sprint.id}>
                    {sprint.name}
                    {sprint.state === "ACTIVE"
                      ? " (active)"
                      : sprint.state === "CLOSED"
                        ? " (closed)"
                        : ""}
                  </option>
                ))}
              </Select>
            </Row>
          )}

          {!isEpic && !isSubtask && (
            <Row label="Epic" htmlFor={`${base}-epic`}>
              <Select
                id={`${base}-epic`}
                value={issue.epicId ?? ""}
                disabled={!canWork}
                onChange={(event) =>
                  save({ epicId: event.target.value || null })
                }
                className="h-9"
              >
                <option value="">None</option>
                {epics.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.key} {e.title}
                  </option>
                ))}
              </Select>
            </Row>
          )}

          <Row label="Labels" htmlFor={`${base}-labels`}>
            <DraftInput
              id={`${base}-labels`}
              placeholder="Comma separated"
              disabled={!canWork}
              value={issue.labels.join(", ")}
              clean={(draft) => parseLabels(draft).join(", ")}
              onCommit={(next) => save({ labels: parseLabels(next) })}
              className="h-9"
            />
          </Row>

          {isEpic && (
            <Row label="Start" htmlFor={`${base}-start`}>
              <Input
                id={`${base}-start`}
                type="date"
                disabled={!canWork}
                value={issue.startDate ?? ""}
                onChange={(event) =>
                  save({ startDate: event.target.value || null })
                }
                className="h-9"
              />
            </Row>
          )}
          <Row label="Due" htmlFor={`${base}-due`}>
            <Input
              id={`${base}-due`}
              type="date"
              disabled={!canWork}
              value={issue.dueDate ?? ""}
              onChange={(event) =>
                save({ dueDate: event.target.value || null })
              }
              className="h-9"
            />
          </Row>

          <dl
            className={cn(
              "space-y-1 border-t border-line pt-3 text-meta text-muted",
            )}
          >
            <div className="flex justify-between gap-3">
              <dt>Created</dt>
              <dd className="tabular text-right">
                {formatDateTimeShort(issue.createdAt, timeZone)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Updated</dt>
              <dd className="tabular text-right">
                {formatDateTimeShort(issue.updatedAt, timeZone)}
              </dd>
            </div>
            {issue.doneAt && (
              <div className="flex justify-between gap-3">
                <dt>Done</dt>
                <dd className="tabular text-right">
                  {formatDateTimeShort(issue.doneAt, timeZone)}
                </dd>
              </div>
            )}
          </dl>
        </aside>
      </div>
    </div>
  );
}
