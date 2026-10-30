"use client";

import { useCallback, useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  acceptAttribute,
  acceptedLabels,
  fileRefusal,
  filesFull,
  megabytes,
  type FileRef,
  type LeaveFileLimits,
} from "@/lib/api/leave-files";
import { useDropTarget } from "@/components/projects/task-files";
import { formatBytes } from "@/lib/projects/files";

/**
 * Choosing supporting files for a leave request, before it is raised.
 *
 * Files are chosen here and **uploaded when the request is sent**, not when they
 * are picked. A person who picks a medical certificate and then closes the form
 * has asked for nothing to be stored, and an upload at pick time would leave it
 * in a bucket until the sweep next runs. The cost is that a refusal arrives at
 * send rather than at pick, which is why the checks that need no server (empty,
 * too big, the wrong kind, too many) are made here and said beside the file.
 *
 * What was uploaded is remembered on the file (`uploaded`), keyed to whom the
 * leave is for: a send that failed on the third file does not upload the first
 * two again, and a file uploaded for one employee is not sent for another, whose
 * key it would not match.
 *
 * ## Names are on the page and nowhere else
 *
 * A file's name is shown in this list, to the person who chose it, and no
 * sentence built here contains one: not the refusals, not the aria labels that
 * describe a state. A control's accessible name is the one place it appears,
 * because a button that removes "a file" is useless to somebody with five.
 *
 * ## Not a banner, not a pill
 *
 * Plain rows under a heading. A refusal is red words under the row it is about;
 * the requirement is one muted line.
 */

export type StagedLeaveFile = {
  id: string;
  file: File;
  /** Why this file alone cannot be sent. Shown under it. */
  error: string | null;
  /** Refused before any upload: never sent, and does not count against the limit. */
  refused: boolean;
  /** 0 to 1 while it is being uploaded; null before and after. */
  progress: number | null;
  /** Already in storage, for this employee. Kept so a retry does not repeat it. */
  uploaded: { employeeId: string; ref: FileRef } | null;
};

let seq = 0;

export function useStagedLeaveFiles(
  limits: LeaveFileLimits | null,
  /** How many files may still be added, read when files arrive. For a request
   *  that already carries some. Defaults to the API's limit. */
  room?: number | (() => number),
) {
  const [items, setItems] = useState<StagedLeaveFile[]>([]);
  /* The list as of the last change rather than the last render: a second drop,
     or an upload's progress while one is still running, must see what the first
     did. */
  const current = useRef<StagedLeaveFile[]>([]);
  const commit = useCallback((next: StagedLeaveFile[]) => {
    current.current = next;
    setItems(next);
  }, []);

  const add = useCallback(
    (incoming: Iterable<File>): StagedLeaveFile[] => {
      const limit =
        typeof room === "function" ? room() : (room ?? limits?.maxFiles ?? 5);
      let space = limit - current.current.filter((i) => !i.refused).length;
      const next = [...incoming].map((file): StagedLeaveFile => {
        seq += 1;
        let error = fileRefusal(file, limits);
        if (!error) {
          if (space <= 0) error = filesFull(limits);
          else space -= 1;
        }
        return {
          id: `leave-file-${String(seq)}`,
          file,
          error,
          refused: error !== null,
          progress: null,
          uploaded: null,
        };
      });
      commit([...current.current, ...next]);
      return next;
    },
    [limits, room, commit],
  );

  const patch = useCallback(
    (id: string, change: Partial<StagedLeaveFile>) =>
      commit(
        current.current.map((item) =>
          item.id === id ? { ...item, ...change } : item,
        ),
      ),
    [commit],
  );
  const remove = useCallback(
    (id: string) => commit(current.current.filter((item) => item.id !== id)),
    [commit],
  );
  const clear = useCallback(() => commit([]), [commit]);

  /** What will be sent: everything not refused. */
  const sendable = items.filter((item) => !item.refused);

  return { items, sendable, add, patch, remove, clear };
}

export type StagedLeaveFiles = ReturnType<typeof useStagedLeaveFiles>;

/* ------------------------------------------------------------------ the UI */

/** A button over a hidden multiple-file input. The keyboard path. */
export function AttachFilesButton({
  limits,
  onFiles,
  disabled = false,
  label = "Attach files",
}: {
  limits: LeaveFileLimits | null;
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <Paperclip aria-hidden="true" className="size-4" />
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept={acceptAttribute(limits)}
        aria-label={label}
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          /* Cleared so choosing the same file again is a change. */
          event.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
    </>
  );
}

/** What can be attached, in one line. */
export const fileHint = (limits: LeaveFileLimits): string =>
  `${acceptedLabels(limits)}, up to ${String(limits.maxFiles)} files of ${megabytes(limits.maxBytes)} each.`;

/** The files chosen and not yet sent: name, size, progress, and why not. */
export function StagedLeaveFileList({
  staged,
  disabled = false,
}: {
  staged: StagedLeaveFiles;
  disabled?: boolean;
}) {
  if (staged.items.length === 0) return null;
  return (
    <ul aria-label="Files to send" className="flex flex-col gap-1">
      {staged.items.map((item) => (
        <li
          key={item.id}
          className="flex flex-col gap-1 border-b border-line py-1.5 last:border-b-0"
        >
          <div className="flex items-center gap-2.5">
            <FileText
              aria-hidden="true"
              className="size-4 shrink-0 text-muted"
            />
            <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
              {item.file.name}
            </span>
            <span className="tabular shrink-0 text-meta text-muted">
              {formatBytes(item.file.size)}
            </span>
            {item.progress === null && !disabled && (
              <IconButton
                label={`Remove ${item.file.name}`}
                size="sm"
                onClick={() => staged.remove(item.id)}
              >
                <X className="size-4" />
              </IconButton>
            )}
          </div>
          {item.progress !== null && (
            <div
              role="progressbar"
              aria-label="Uploading"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(item.progress * 100)}
              className="h-1 overflow-hidden rounded-full bg-sunken"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-150 motion-reduce:transition-none"
                style={{ width: `${String(item.progress * 100)}%` }}
              />
            </div>
          )}
          {item.error && (
            <p aria-live="polite" className="text-body-sm text-danger-text">
              {item.error}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function LeaveFilePicker({
  staged,
  limits,
  required,
  error,
  disabled = false,
  className,
}: {
  staged: StagedLeaveFiles;
  limits: LeaveFileLimits;
  /** The API's own answer for these dates: the leave type asks for a file. */
  required: boolean;
  /** A refusal that belongs to the whole group, said in red under it. */
  error?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const drop = useDropTarget((files) => staged.add(files), !disabled);
  const unmet = required && staged.sendable.length === 0;
  return (
    <fieldset
      {...drop.handlers}
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-md",
        drop.over && "outline-2 outline-offset-4 outline-dashed outline-accent",
        className,
      )}
    >
      <legend className="mb-1 text-body-sm font-medium text-ink">
        Supporting file
        {required && (
          <>
            <span className="ml-0.5 text-danger-text" aria-hidden="true">
              *
            </span>
            <span className="sr-only"> required</span>
          </>
        )}
        {!required && (
          <span className="font-normal text-muted"> (optional)</span>
        )}
      </legend>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <AttachFilesButton
          limits={limits}
          disabled={disabled}
          onFiles={(files) => staged.add(files)}
        />
        <span className="min-w-0 text-meta text-muted">{fileHint(limits)}</span>
      </div>

      {unmet && !error && (
        <p className="text-body-sm text-muted">
          A supporting file is required.
        </p>
      )}

      <StagedLeaveFileList staged={staged} disabled={disabled} />

      {error && (
        <p aria-live="polite" className="text-body-sm text-danger-text">
          {error}
        </p>
      )}
    </fieldset>
  );
}
