"use client";

import { useState } from "react";
import { bodySegments, decodeMentions } from "@/lib/projects/mentions";
import type { IssueComment } from "@/lib/projects/types";
import type { People } from "@/lib/store/project-session";
import { formatDateTimeShort } from "@/lib/time";
import { MentionComposer } from "./mention-composer";
import { PersonAvatar } from "./person";
import { AttachmentList } from "./task-files";

/**
 * One comment: who, when, what, and what its owner may do with it.
 *
 * The author can edit (the same box as writing one, starting from the text with
 * mentions shown as names) and delete; so can the lead and people who manage
 * records, for delete only. Delete asks twice, in place, rather than taking a
 * comment on a stray click. An edited comment says so.
 */
export function CommentItem({
  comment,
  people,
  memberIds,
  meId,
  timeZone,
  canEdit,
  canDelete,
  onSave,
  onDelete,
}: {
  comment: IssueComment;
  people: People;
  memberIds: readonly string[];
  meId: string | null;
  timeZone: string;
  canEdit: boolean;
  canDelete: boolean;
  /** Resolves true once the edit is saved. */
  onSave: (body: string) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const quiet =
    "text-meta text-muted underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text";

  return (
    <li className="flex gap-3">
      <PersonAvatar
        people={people}
        id={comment.authorId}
        size="sm"
        decorative
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span className="text-body-sm font-semibold text-ink">
            {people.nameOf(comment.authorId)}
          </span>
          <time dateTime={comment.createdAt} className="text-meta text-muted">
            {formatDateTimeShort(comment.createdAt, timeZone)}
          </time>
          {comment.editedAt && (
            <span
              className="text-meta text-muted"
              title={formatDateTimeShort(comment.editedAt, timeZone)}
            >
              edited
            </span>
          )}
          {!editing && canEdit && (
            <button
              type="button"
              className={quiet}
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          )}
          {!editing &&
            canDelete &&
            (confirming ? (
              <span className="inline-flex items-center gap-2 text-meta">
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    onDelete();
                  }}
                  className="font-medium text-danger-text underline-offset-4 hover:underline"
                >
                  Delete this comment
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-muted underline-offset-4 hover:underline"
                >
                  Keep it
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className={`${quiet} hover:text-danger-text`}
              >
                Delete
              </button>
            ))}
        </div>

        {editing ? (
          <div className="mt-2">
            <MentionComposer
              people={people}
              memberIds={memberIds}
              meId={meId}
              label="Edit your comment"
              submitLabel="Save"
              initial={decodeMentions(comment.body, people.nameOf)}
              onCancel={() => setEditing(false)}
              onPost={async (body) => {
                const saved = await onSave(body);
                if (saved) setEditing(false);
                return saved;
              }}
            />
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-body-sm text-ink">
            {bodySegments(comment.body).map((segment, i) =>
              segment.kind === "mention" ? (
                <span
                  key={i}
                  className="rounded-sm bg-accent-soft px-1 font-medium text-accent-text"
                >
                  @{people.nameOf(segment.employeeId)}
                </span>
              ) : (
                <span key={i}>{segment.text}</span>
              ),
            )}
          </p>
        )}
        {!editing && comment.attachments && comment.attachments.length > 0 && (
          <div className="mt-2">
            <AttachmentList
              attachments={comment.attachments}
              label="Files on this comment"
            />
          </div>
        )}
      </div>
    </li>
  );
}
