"use client";

import { DueTimeInput } from "@/components/projects/due-time-input";
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
import { dueLabel } from "@/lib/projects/due";
import { describeActivity, type HistoryLookup } from "@/lib/projects/history";
import {
  childrenOf,
  parseLabels,
  parsePoints,
  storiesOf,
} from "@/lib/projects/mutations";
import { canDeleteComment } from "@/lib/projects/access";
import { byRank } from "@/lib/projects/rank";
import { countProgress } from "@/lib/projects/progress";
import {
  CYCLE,
  EFFORT,
  INITIATIVE,
  LATER,
  STAGE,
  SUBTASK,
  TASK,
  TYPE_LABEL,
  WORK_TYPES,
  displayType,
} from "@/lib/projects/terms";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  type Issue,
  type IssueAttachment,
  type IssueComment,
  type Priority,
  type Watcher,
} from "@/lib/projects/types";
import {
  checkboxTarget,
  effectiveStatus,
  isDone,
  sortStatuses,
} from "@/lib/projects/workflow";
import { useIssueThread } from "@/lib/store/projects";
import { useProjectActor } from "@/lib/store/project-session";
import { useSession } from "@/lib/store/session";
import { formatDateTimeShort } from "@/lib/time";
import { CommentItem } from "./comment-item";
import { DraftHeading, DraftInput, DraftTextarea } from "./draft-fields";
import { LinkedTasks } from "./linked-tasks";
import { IssueKey, StatusPill, TypeIcon } from "./glyphs";
import { MentionComposer } from "./mention-composer";
import { IssueObjectiveLink } from "./objective-link";
import { PersonAvatar, PersonName } from "./person";
import { SectionTabs } from "./section-tabs";
import { closeTopPopup } from "./popups";
import { useProject } from "./project-context";
import { TaskFiles } from "./task-files";
import { Watchers } from "./watchers";
import { AssigneeList, AssigneeMenu, AssigneeStack } from "./assignees";
import { SubtaskComposer } from "./subtask-composer";
import { assigneesOf, isOn } from "@/lib/projects/assignees";
import type { NewIssueInput } from "@/lib/projects/types";

const NO_FILES: IssueAttachment[] = [];
const NO_WATCHERS: Watcher[] = [];

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
      title={shown ? shown.key : "Task"}
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
  htmlFor?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-meta font-medium text-muted">
          {label}
        </label>
      ) : (
        <span className="text-meta font-medium text-muted">{label}</span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * A field the reader may not change, shown as what it says.
 *
 * Not a switched-off control: a person without the right is never shown the
 * editor at all, only the value (or "None" when there is nothing to show).
 */
function Value({ children }: { children?: React.ReactNode }) {
  const empty =
    children === undefined ||
    children === null ||
    children === false ||
    children === "";
  return (
    <span
      className={cn(
        "block break-words text-body-sm",
        empty ? "text-muted" : "text-ink",
      )}
    >
      {empty ? "None" : children}
    </span>
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
    canComment = canWork,
    canChangeStatus = canWork,
    canEditDetails = canWork,
    canManage,
    connected,
    timeZone,
    today,
    openIssue,
    personal,
  } = useProject();
  const toast = useToast();
  const actor = useProjectActor();
  /* `addedById` on a watcher is a user id, not an employee id. */
  const userId = useSession().user?.id ?? null;
  const { thread, reload: reloadThread } = useIssueThread(issue.id);
  const base = useId();

  const [confirming, setConfirming] = useState(false);
  const [tab, setTab] = useState<"comments" | "history">("comments");

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

  /* Who can be put on it: a board's members; on a personal list, anybody at
     the company, with the list's owner always kept on it. */
  const assignable = personal
    ? people.people.map((p) => p.id)
    : project.memberIds;
  const locked = personal && project.leadId ? [project.leadId] : [];

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

  async function addKid(
    input: Pick<
      NewIssueInput,
      "title" | "assigneeIds" | "dueDate" | "priority"
    >,
  ): Promise<boolean> {
    const result = await actions.createIssue(
      isEpic
        ? { type: "TASK", epicId: issue.id, ...input }
        : { type: "SUBTASK", parentId: issue.id, ...input },
    );
    if (result.ok) {
      toast.push({ tone: "success", title: `${result.value.key} created` });
    }
    return result.ok;
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

  /* Files and watchers. Only the API keeps them, so the demo has neither. The
     issue's read says who may attach to the task itself and choose its
     watchers (`canAttachToTask`, `canManageWatchers`); everybody who can open
     it comments, with files. A watcher can be taken off by themselves, by
     whoever added them (a user id), or by whoever may manage: the lead or HR on
     a board, the owner or their leader on a personal task. */
  const isOwner =
    Boolean(personal) && meId !== null && meId === issue.assigneeId;
  /* On a personal task the author or its owner deletes a comment, as the API
     rules; HR and leaders, who may manage a board, may not. */
  /* Somebody who can read a board task and change nothing (a program's read
     access, or the Master grant) is offered no change at all, whoever wrote the
     comment: the API would refuse it, and a control that only refuses is noise. */
  const readOnly = !personal && !canWork;
  const canDelete = (c: IssueComment) =>
    !readOnly &&
    (personal
      ? (meId !== null && c.authorId === meId) || isOwner
      : canDeleteComment(actor, project, c));
  const canAttachToTask = connected && thread.canAttachToTask === true;
  const mayChooseWatchers = connected && thread.canManageWatchers === true;
  const mayRemoveWatcher = (w: Watcher) =>
    (meId !== null && w.id === meId) ||
    (userId !== null && w.addedById === userId) ||
    (personal ? mayChooseWatchers : canManage);
  const watchState = useMemo(
    () => ({
      watchers: thread.watchers ?? NO_WATCHERS,
      watching: thread.watching ?? false,
    }),
    [thread.watchers, thread.watching],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <nav
          aria-label="Where this task sits"
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
            {TYPE_LABEL[issue.type]}
          </span>
        </nav>
        {!personal && (
          <IconButton
            label="Copy link to this task"
            size="sm"
            onClick={copyLink}
          >
            <Link2 className="size-4" />
          </IconButton>
        )}
        {canWork && (
          <IconButton
            label="Delete this task"
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
          className="flex flex-wrap items-center gap-3 rounded-md border border-line px-4 py-3 text-body-sm text-danger-text"
        >
          <span className="min-w-0 flex-1">
            Delete <strong>{issue.key}</strong>
            {isEpic && kids.length > 0
              ? `? Its ${kids.length} ${kids.length === 1 ? `${TASK.one} stays` : `${TASK.many} stay`}, without an ${INITIATIVE.one}.`
              : kids.length > 0
                ? ` and its ${kids.length} ${kids.length === 1 ? SUBTASK.one : SUBTASK.many}?`
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
        disabled={!canEditDetails}
        clean={(draft) => (draft.trim() ? draft.trim() : null)}
        onCommit={(title) => save({ title })}
        buttons
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
            {canEditDetails ? (
              <DraftTextarea
                value={issue.description}
                rows={5}
                placeholder="Add context, acceptance criteria, links"
                aria-labelledby={`${base}-desc`}
                onCommit={(description) => save({ description })}
                buttons
              />
            ) : issue.description.trim() ? (
              <p className="whitespace-pre-wrap break-words text-body-sm text-ink">
                {issue.description}
              </p>
            ) : (
              <p className="text-body-sm text-muted">No description</p>
            )}
          </section>

          {connected && (
            <TaskFiles
              issueId={issue.id}
              issueKey={issue.key}
              attachments={thread.attachments ?? NO_FILES}
              canAttach={canAttachToTask}
              canRemove={(file) =>
                !readOnly &&
                (file.uploadedBy === meId || (personal ? isOwner : canManage))
              }
              onChanged={reloadThread}
            />
          )}

          {!isSubtask && (
            <section aria-labelledby={`${base}-kids`}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h3
                  id={`${base}-kids`}
                  className="text-meta font-semibold text-muted"
                >
                  {isEpic
                    ? `${TASK.Many} in this ${INITIATIVE.one}`
                    : SUBTASK.Many}
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
                  aria-label={
                    isEpic
                      ? `${INITIATIVE.One} progress`
                      : `${SUBTASK.One} progress`
                  }
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
              {/* Not `overflow-hidden`: it would clip each row's people menu. */}
              <ul className="divide-y divide-line rounded-md border border-line">
                {kids.map((kid) => {
                  const done = isDone(project.statuses, kid);
                  return (
                    <li
                      key={kid.id}
                      className="flex items-center gap-2.5 px-3 py-2"
                    >
                      {canChangeStatus ? (
                        <Checkbox
                          label={
                            <span className="sr-only">
                              {done ? "Reopen" : "Mark done"} {kid.key}
                            </span>
                          }
                          checked={done}
                          onChange={() =>
                            void actions.patchIssue(kid, {
                              statusId: checkboxTarget(project.statuses, done)
                                .id,
                            })
                          }
                        />
                      ) : (
                        <span className="sr-only">
                          {done ? "Done" : "Not done"}: {kid.key}
                        </span>
                      )}
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
                      {canWork ? (
                        <AssigneeMenu
                          people={people}
                          value={assigneesOf(kid)}
                          candidates={assignable}
                          locked={locked}
                          label={`Assignees of ${kid.key}`}
                          onChange={(next) =>
                            void actions.patchIssue(kid, { assigneeIds: next })
                          }
                        />
                      ) : (
                        <AssigneeStack people={people} ids={assigneesOf(kid)} />
                      )}
                    </li>
                  );
                })}
                {kids.length === 0 && !canWork && (
                  <li className="px-3 py-3 text-body-sm text-muted">None</li>
                )}
                {canWork && (
                  <li>
                    <SubtaskComposer
                      people={people}
                      candidates={assignable}
                      locked={locked}
                      noun={isEpic ? TASK.one : SUBTASK.one}
                      onCreate={addKid}
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

          {connected && (
            <Watchers
              issueId={issue.id}
              state={watchState}
              meId={meId}
              people={people}
              candidates={
                personal ? people.people.map((p) => p.id) : project.memberIds
              }
              mayChoose={mayChooseWatchers}
              mayRemove={mayRemoveWatcher}
              readOnly={readOnly}
              onChanged={reloadThread}
            />
          )}

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
                {canComment && meId && (
                  <MentionComposer
                    people={people}
                    memberIds={project.memberIds}
                    meId={meId}
                    attach={connected ? { issueId: issue.id } : undefined}
                    onPost={async (body, attachments) => {
                      const result =
                        attachments.length > 0
                          ? await actions.addComment(issue.id, body, {
                              attachments,
                            })
                          : await actions.addComment(issue.id, body);
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
                        canEdit={
                          !readOnly &&
                          meId !== null &&
                          comment.authorId === meId
                        }
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
          <Row
            label={STAGE.One}
            htmlFor={canChangeStatus ? `${base}-status` : undefined}
          >
            {canChangeStatus ? (
              <Select
                id={`${base}-status`}
                value={status.id}
                onChange={(event) => save({ statusId: event.target.value })}
                className="h-9"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Value>{status.name}</Value>
            )}
          </Row>

          {personal && (
            <Row label="List">
              <span className="text-body-sm text-ink">Personal</span>
            </Row>
          )}
          {personal?.setByName && (
            <Row label="Set by">
              <span className="text-body-sm text-ink">
                {personal.setByName}
              </span>
            </Row>
          )}

          {(!personal || canWork) && (
            <Row label="Assignees">
              <AssigneeList
                people={people}
                value={assigneesOf(issue)}
                candidates={assignable}
                locked={locked}
                disabled={!canWork}
                onChange={(next) => save({ assigneeIds: next })}
              />
            </Row>
          )}
          {!personal &&
            canWork &&
            meId &&
            !isOn(issue, meId) &&
            project.memberIds.includes(meId) && (
              <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-x-3">
                <span />
                <Button
                  size="sm"
                  variant="ghost"
                  className="justify-self-start"
                  onClick={() =>
                    save({ assigneeIds: [...assigneesOf(issue), meId] })
                  }
                >
                  Assign to me
                </Button>
              </div>
            )}
          <IssueObjectiveLink
            issue={
              thread.canLinkObjective === undefined
                ? issue
                : { ...issue, canLinkObjective: thread.canLinkObjective }
            }
          />

          {!personal && (
            <Row label="Reporter">
              <PersonName people={people} id={issue.reporterId} />
            </Row>
          )}

          <Row
            label="Type"
            htmlFor={
              isEpic || isSubtask || personal || !canWork
                ? undefined
                : `${base}-type`
            }
          >
            {/* A personal task is never an initiative: there is no timeline to put one on. */}
            {isEpic || isSubtask || personal || !canWork ? (
              <span className="text-body-sm text-ink">
                {TYPE_LABEL[issue.type]}
              </span>
            ) : (
              <Select
                id={`${base}-type`}
                value={displayType(issue.type)}
                onChange={(event) =>
                  save({ type: event.target.value as Issue["type"] })
                }
                className="h-9"
              >
                {WORK_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABEL[type]}
                  </option>
                ))}
              </Select>
            )}
          </Row>

          <Row
            label="Priority"
            htmlFor={canWork ? `${base}-priority` : undefined}
          >
            {canWork ? (
              <Select
                id={`${base}-priority`}
                value={issue.priority}
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
            ) : (
              <Value>{PRIORITY_LABEL[issue.priority]}</Value>
            )}
          </Row>

          {!isEpic && (
            <Row
              label={EFFORT.One}
              htmlFor={canWork ? `${base}-points` : undefined}
            >
              {canWork ? (
                <DraftInput
                  id={`${base}-points`}
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  placeholder="None"
                  value={issue.points === null ? "" : String(issue.points)}
                  clean={(draft) => {
                    if (draft.trim() === "") return "";
                    const points = parsePoints(draft);
                    return points === null ? null : String(points);
                  }}
                  onCommit={(next) => save({ points: parsePoints(next) })}
                  className="h-9"
                />
              ) : (
                <Value>{issue.points === null ? null : issue.points}</Value>
              )}
            </Row>
          )}

          {project.type === "SCRUM" && !isEpic && !isSubtask && (
            <Row
              label={CYCLE.One}
              htmlFor={canWork ? `${base}-sprint` : undefined}
            >
              {canWork ? (
                <Select
                  id={`${base}-sprint`}
                  value={issue.sprintId ?? ""}
                  onChange={(event) =>
                    save({ sprintId: event.target.value || null })
                  }
                  className="h-9"
                >
                  <option value="">{LATER}</option>
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
              ) : (
                <Value>{currentSprint ? currentSprint.name : LATER}</Value>
              )}
            </Row>
          )}

          {!personal && !isEpic && !isSubtask && (
            <Row
              label={INITIATIVE.One}
              htmlFor={canWork ? `${base}-epic` : undefined}
            >
              {canWork ? (
                <Select
                  id={`${base}-epic`}
                  value={issue.epicId ?? ""}
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
              ) : (
                <Value>{epic ? `${epic.key} ${epic.title}` : null}</Value>
              )}
            </Row>
          )}

          <Row label="Labels" htmlFor={canWork ? `${base}-labels` : undefined}>
            {canWork ? (
              <DraftInput
                id={`${base}-labels`}
                placeholder="Comma separated"
                value={issue.labels.join(", ")}
                clean={(draft) => parseLabels(draft).join(", ")}
                onCommit={(next) => save({ labels: parseLabels(next) })}
                className="h-9"
              />
            ) : (
              <Value>{issue.labels.join(", ")}</Value>
            )}
          </Row>

          {isEpic && (
            <Row label="Start" htmlFor={canWork ? `${base}-start` : undefined}>
              {canWork ? (
                <Input
                  id={`${base}-start`}
                  type="date"
                  value={issue.startDate ?? ""}
                  onChange={(event) =>
                    save({ startDate: event.target.value || null })
                  }
                  className="h-9"
                />
              ) : (
                <Value>
                  {issue.startDate
                    ? dueLabel({ dueDate: issue.startDate }, today, "card")
                    : null}
                </Value>
              )}
            </Row>
          )}
          <Row label="Due" htmlFor={canEditDetails ? `${base}-due` : undefined}>
            {canEditDetails ? (
              <Input
                id={`${base}-due`}
                type="date"
                value={issue.dueDate ?? ""}
                onChange={(event) =>
                  save({ dueDate: event.target.value || null })
                }
                className="h-9"
              />
            ) : (
              <Value>
                {issue.dueDate
                  ? dueLabel(
                      { dueDate: issue.dueDate, dueTime: issue.dueTime },
                      today,
                      "card",
                    )
                  : null}
              </Value>
            )}
          </Row>
          {canEditDetails && (
            <Row label="Time" htmlFor={`${base}-due-time`}>
              <DueTimeInput
                id={`${base}-due-time`}
                date={issue.dueDate}
                value={issue.dueTime}
                onChange={(next) => save({ dueTime: next })}
              />
            </Row>
          )}

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
