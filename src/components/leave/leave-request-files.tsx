"use client";

import { useState } from "react";
import { FileText, X } from "lucide-react";
import {
  AttentionMark,
  Button,
  ConfirmDialog,
  DrawerSection,
  IconButton,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  fileProblem,
  leaveFilesApi,
  openLeaveFile,
  uploadLeaveFile,
  type LeaveFile,
} from "@/lib/api/leave-files";
import { useDropTarget } from "@/components/projects/task-files";
import { formatBytes } from "@/lib/projects/files";
import { useLeaveFiles } from "@/lib/store/leave-files";
import {
  AttachFilesButton,
  StagedLeaveFileList,
  fileHint,
  useStagedLeaveFiles,
} from "./leave-file-picker";

/**
 * The files on one leave request, in its panel.
 *
 * **Everything here comes from what the API says about this reader**, not from
 * their role. It is asked for the list only for somebody who could be let in
 * (the person the leave is for, HR, or a manager reading the reduced view), and
 * what it answers decides the rest: `canRemove` per file, `access.canAdd` for the
 * picker, `requirement` for the flag. A control the API would refuse is not
 * drawn, and a request with no file and nobody who may add one draws nothing at
 * all, not an empty "Files" heading.
 *
 * ## A file is opened from a click and from nowhere else
 *
 * `openLeaveFile` is called from the button's `onClick`, and the link it gets
 * goes to the address bar and no further (see `lib/api/leave-files.ts`). No
 * thumbnail, no preview, nothing that would ask for a link the reader did not
 * press. Every call is a look in the audit trail for anybody but the owner.
 *
 * ## Names are in the list and nowhere else
 *
 * A file's name is a row here. Every message this component writes (blocked
 * pop-up, refused, removed) is worded without it, because a message is a toast
 * or a line another screen may copy, and a name is a medical detail.
 */
export function LeaveRequestFiles({
  requestId,
  employeeId,
  attachmentCount,
  reader,
  onChanged,
}: {
  requestId: string;
  /** Whose leave it is: a file uploaded here is signed for that person. */
  employeeId: string;
  /** From the request itself. A number and nothing else. */
  attachmentCount: number;
  reader: {
    /** The leave is the signed-in person's own. */
    isOwner: boolean;
    /** Holds `APPROVE_LEAVE_ALL`. */
    isHr: boolean;
    /** The API gave this reader the reduced read: they decide it. */
    reduced: boolean;
  };
  /** A file was added or removed, so whatever shows the count can follow. */
  onChanged?: () => void;
}) {
  /* Only these three can be let in by the API; the rest would be a 403. */
  const mayOpen = reader.isOwner || reader.isHr || reader.reduced;
  const files = useLeaveFiles(mayOpen ? requestId : null);
  const list = files.list;

  const staged = useStagedLeaveFiles(list?.limits ?? null, () =>
    list ? list.limits.maxFiles - list.files.length : 0,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [removing, setRemoving] = useState<LeaveFile | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const canAdd = list?.access.canAdd === true && list.limits.storage;
  const drop = useDropTarget((dropped) => void take(dropped), canAdd);

  async function take(chosen: File[]) {
    if (!list) return;
    setMessage(null);
    const added = staged.add(chosen);
    let landed = 0;
    for (const item of added) {
      if (item.refused) continue;
      staged.patch(item.id, { progress: 0, error: null });
      try {
        const ref = await uploadLeaveFile(item.file, list.limits, {
          employeeId,
          onProgress: (progress) => staged.patch(item.id, { progress }),
        });
        /* Recorded only once it is in storage, and the API reads it here. */
        await leaveFilesApi.record(requestId, ref);
        staged.remove(item.id);
        landed += 1;
      } catch (failure) {
        staged.patch(item.id, { progress: null, error: fileProblem(failure) });
      }
    }
    if (landed > 0) {
      files.reload();
      onChanged?.();
    }
  }

  async function open(file: LeaveFile) {
    setMessage(null);
    try {
      /* Called from the click itself, so the tab it opens is not blocked. */
      const result = await openLeaveFile(requestId, file);
      if (result === "blocked") {
        setMessage(
          "Your browser stopped the file opening. Allow pop-ups for this site, then open it again.",
        );
      }
    } catch (failure) {
      setMessage(fileProblem(failure));
    }
  }

  async function remove(file: LeaveFile) {
    setRemoveBusy(true);
    try {
      await leaveFilesApi.remove(requestId, file.id);
      setRemoving(null);
      files.reload();
      onChanged?.();
    } catch (failure) {
      setRemoving(null);
      setMessage(fileProblem(failure));
    } finally {
      setRemoveBusy(false);
    }
  }

  /* Somebody the API would refuse: no list to ask for. A count is all there is. */
  if (!mayOpen) {
    return attachmentCount > 0 ? (
      <p className="text-body-sm text-muted">
        {attachmentCount === 1
          ? "1 supporting file is attached. You cannot open it."
          : `${String(attachmentCount)} supporting files are attached. You cannot open them.`}
      </p>
    ) : null;
  }

  if (files.loading) {
    return <p className="text-body-sm text-muted">Loading files…</p>;
  }

  /* 403 and 404 are the API saying this reader is not let in: draw nothing,
     rather than a failure about a thing they were never meant to see. */
  if (!list) {
    if (
      files.error &&
      files.error.status !== 403 &&
      files.error.status !== 404
    ) {
      return (
        <p className="text-body-sm text-muted">
          The files did not load.{" "}
          <button
            type="button"
            onClick={files.reload}
            className="font-medium text-accent-text underline-offset-2 hover:underline"
          >
            Try again
          </button>
        </p>
      );
    }
    return null;
  }

  /* Nothing attached and nobody who may attach: no heading for an empty list. */
  if (list.files.length === 0 && !canAdd) return null;

  const unmet = list.requirement.required && !list.requirement.met;

  return (
    <DrawerSection
      title="Supporting files"
      action={
        unmet ? (
          <AttentionMark text="A supporting file is required for this request, and none is attached yet." />
        ) : undefined
      }
    >
      <div
        {...drop.handlers}
        className={cn(
          "flex flex-col gap-2 rounded-md",
          drop.over &&
            "outline-2 outline-offset-4 outline-dashed outline-accent",
        )}
      >
        {list.files.length === 0 ? (
          <p className="text-body-sm text-muted">No files yet.</p>
        ) : (
          <ul aria-label="Supporting files" className="flex flex-col">
            {list.files.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-2 border-b border-line py-2 last:border-b-0"
              >
                <FileText
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted"
                />
                <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
                  {file.filename}
                </span>
                <span className="tabular shrink-0 text-meta text-muted">
                  {formatBytes(file.sizeBytes)}
                </span>
                {file.flagged ? (
                  <span className="shrink-0 text-meta text-muted">
                    Cannot be opened
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`${file.viewable ? "Open" : "Download"} ${file.filename}`}
                    onClick={() => void open(file)}
                  >
                    {file.viewable ? "Open" : "Download"}
                  </Button>
                )}
                {file.canRemove && (
                  <IconButton
                    label={`Remove ${file.filename}`}
                    size="sm"
                    onClick={() => setRemoving(file)}
                  >
                    <X className="size-4" />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}

        {canAdd && (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <AttachFilesButton
                limits={list.limits}
                onFiles={(chosen) => void take(chosen)}
                label="Add files"
              />
              <span className="min-w-0 text-meta text-muted">
                {fileHint(list.limits)}
              </span>
            </div>
            <StagedLeaveFileList staged={staged} />
          </>
        )}

        {message && (
          <p aria-live="polite" className="text-body-sm text-danger-text">
            {message}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) void remove(removing);
        }}
        loading={removeBusy}
        title="Remove this file?"
        confirmLabel="Remove file"
        body={
          <p className="text-body-sm text-body">
            It comes off the request and is deleted, so whoever decides it will
            not see it. This cannot be undone.
          </p>
        }
      />
    </DrawerSection>
  );
}
