"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FileText, Paperclip, X } from "lucide-react";
import { Button, IconButton, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";
import { projectsApi } from "@/lib/api/projects";
import {
  ATTACH_ACCEPT,
  MAX_FILES,
  attachIssueFile,
  fileRefusal,
  formatBytes,
  isPreviewable,
  uploadFailure,
} from "@/lib/projects/files";
import type { AttachmentRef, IssueAttachment } from "@/lib/projects/types";

/**
 * Files on a task: the drawer's Files section, and the pieces the comment box
 * and the create forms share with it.
 *
 * - `useStagedFiles` holds files chosen but not yet attached, each with its
 *   progress and its own error. A file refused here (too big, the wrong kind,
 *   one too many) is listed with the reason and never uploaded.
 * - `AttachButton` and `dropHandlers` are the two ways in: the picker, and
 *   dropping files onto the section. The button is the keyboard path.
 * - `StagedList` draws the staged files; `AttachmentList` draws attached ones,
 *   images as thumbnails and anything else as an icon, name and size. Clicking
 *   one opens it through a short-lived link (`GET /attachments/:id/url`).
 * - `attachStaged` uploads and records each staged file on a task that exists,
 *   one at a time, so a failure is that file's alone.
 */

export type Staged = {
  id: string;
  file: File;
  /** 0–1 while uploading; null before and after. */
  progress: number | null;
  error: string | null;
  /** Refused before upload; never sent. */
  refused: boolean;
  /** Uploaded, not yet recorded: what a comment sends. */
  ref: AttachmentRef | null;
  /** The task a failed file was meant for, once that task exists. */
  target: { id: string; key: string } | null;
};

let seq = 0;

export function useStagedFiles(
  /** How many more files may be added. */
  room: number = MAX_FILES,
  full = `You can attach up to ${MAX_FILES} files.`,
) {
  const [items, setItems] = useState<Staged[]>([]);

  const add = useCallback(
    (incoming: Iterable<File>): Staged[] => {
      let space =
        room - items.filter((i) => !i.refused && i.target === null).length;
      const next = [...incoming].map((file): Staged => {
        seq += 1;
        let error = fileRefusal(file);
        if (!error) {
          if (space <= 0) error = full;
          else space -= 1;
        }
        return {
          id: `staged-${seq}`,
          file,
          progress: null,
          error,
          refused: error !== null,
          ref: null,
          target: null,
        };
      });
      setItems((prev) => [...prev, ...next]);
      return next;
    },
    [items, room, full],
  );

  const patch = useCallback(
    (id: string, change: Partial<Staged>) =>
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...change } : item)),
      ),
    [],
  );
  const remove = useCallback(
    (id: string) => setItems((prev) => prev.filter((item) => item.id !== id)),
    [],
  );
  const clear = useCallback(() => setItems([]), []);

  return { items, add, patch, remove, clear };
}

export type StagedFiles = ReturnType<typeof useStagedFiles>;

/**
 * Upload and record each file on a task, one at a time. Recorded files leave
 * the list; a failure stays, with its reason, marked for the task it was meant
 * for. Resolves with how many failed. Refused files are left alone.
 */
export async function attachStaged(
  task: { id: string; key: string },
  items: readonly Staged[],
  staged: Pick<StagedFiles, "patch" | "remove">,
  onAttached?: (attachment: IssueAttachment) => void,
): Promise<number> {
  let failed = 0;
  for (const item of items) {
    if (item.refused) continue;
    staged.patch(item.id, { progress: 0, error: null });
    try {
      const attachment = await attachIssueFile(task.id, item.file, (p) =>
        staged.patch(item.id, { progress: p }),
      );
      staged.remove(item.id);
      onAttached?.(attachment);
    } catch (error) {
      failed += 1;
      staged.patch(item.id, {
        progress: null,
        error: uploadFailure(error),
        target: task,
      });
    }
  }
  return failed;
}

/** Drag-and-drop onto any element: spread these onto it. */
export function useDropTarget(
  onFiles: (files: File[]) => void,
  enabled = true,
) {
  const [over, setOver] = useState(false);
  if (!enabled) return { over: false, handlers: {} };
  return {
    over,
    handlers: {
      onDragOver: (event: React.DragEvent) => {
        event.preventDefault();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (event: React.DragEvent) => {
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length === 0) return;
        event.preventDefault();
        setOver(false);
        onFiles(files);
      },
    },
  };
}

/** "Attach files": a button over a hidden, multiple file input. */
export function AttachButton({
  onFiles,
  label = "Attach files",
  iconOnly = false,
  disabled = false,
  size = "sm",
}: {
  onFiles: (files: File[]) => void;
  /** Names both the button and the input. */
  label?: string;
  /** A paperclip alone, for the comment box. */
  iconOnly?: boolean;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      {iconOnly ? (
        <IconButton
          label={label}
          size="sm"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <Paperclip className="size-4" />
        </IconButton>
      ) : (
        <Button
          type="button"
          size={size}
          variant="secondary"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <Paperclip aria-hidden="true" className="size-4" />
          {label}
        </Button>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept={ATTACH_ACCEPT}
        aria-label={label}
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
    </>
  );
}

/** Files chosen and not yet attached: name, size, progress, and why not. */
export function StagedList({
  items,
  onRemove,
  label,
  busy = false,
}: {
  items: readonly Staged[];
  onRemove: (id: string) => void;
  label: string;
  busy?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul aria-label={label} className="space-y-1.5">
      {items.map((item) => (
        <li
          key={item.id}
          className={cn(
            "rounded-md border px-3 py-2",
            item.error
              ? "border-danger-line bg-danger-soft"
              : "border-line bg-surface",
          )}
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
            {item.progress === null && !busy && (
              <IconButton
                label={`Remove ${item.file.name}`}
                size="sm"
                onClick={() => onRemove(item.id)}
              >
                <X className="size-4" />
              </IconButton>
            )}
          </div>
          {item.progress !== null && (
            <div
              role="progressbar"
              aria-label={`Uploading ${item.file.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(item.progress * 100)}
              className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-150 motion-reduce:transition-none"
                style={{ width: `${item.progress * 100}%` }}
              />
            </div>
          )}
          {item.error && (
            <p className="mt-1 text-meta text-danger-text">{item.error}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Open a file through a short-lived link, in a new tab. */
async function openFile(id: string): Promise<void> {
  const { url } = await projectsApi.attachmentUrl(id);
  /* `noopener` because the target is storage's origin, not ours. */
  window.open(url, "_blank", "noopener,noreferrer");
}

function Thumbnail({ attachment }: { attachment: IssueAttachment }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    projectsApi
      .attachmentUrl(attachment.id, controller.signal)
      .then((read) => setSrc(read.url))
      /* The name still shows; a thumbnail is a courtesy. */
      .catch(() => {});
    return () => controller.abort();
  }, [attachment.id]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a presigned URL on storage's origin, not something next/image can optimise
    <img
      src={src}
      alt={attachment.filename}
      className="size-16 rounded-md border border-line object-cover"
    />
  ) : (
    <span
      aria-hidden="true"
      className="block size-16 rounded-md border border-line bg-sunken"
    />
  );
}

/** Attached files: thumbnails for images, icon, name and size for the rest. */
export function AttachmentList({
  attachments,
  canRemove = () => false,
  onRemove,
  label = "Files",
}: {
  attachments: readonly IssueAttachment[];
  canRemove?: (attachment: IssueAttachment) => boolean;
  onRemove?: (attachment: IssueAttachment) => void;
  label?: string;
}) {
  const toast = useToast();
  if (attachments.length === 0) return null;
  const open = (attachment: IssueAttachment) =>
    void openFile(attachment.id).catch((error: unknown) =>
      toast.push({
        tone: "danger",
        title: `Could not open ${attachment.filename}`,
        detail: uploadFailure(error),
      }),
    );
  const images = attachments.filter((a) => isPreviewable(a.contentType));
  const others = attachments.filter((a) => !isPreviewable(a.contentType));
  const remove = (attachment: IssueAttachment) =>
    canRemove(attachment) &&
    onRemove && (
      <IconButton
        label={`Remove ${attachment.filename}`}
        size="sm"
        onClick={() => onRemove(attachment)}
      >
        <X className="size-4" />
      </IconButton>
    );
  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <ul aria-label={`${label}: images`} className="flex flex-wrap gap-2">
          {images.map((attachment) => (
            <li key={attachment.id} className="flex items-start gap-0.5">
              <button
                type="button"
                onClick={() => open(attachment)}
                aria-label={`Open ${attachment.filename}`}
                title={attachment.filename}
                className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
              >
                <Thumbnail attachment={attachment} />
              </button>
              {remove(attachment)}
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <ul
          aria-label={label}
          className="divide-y divide-line overflow-hidden rounded-md border border-line"
        >
          {others.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center gap-2 px-3 py-1.5"
            >
              <button
                type="button"
                onClick={() => open(attachment)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
              >
                <FileText
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted"
                />
                <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
                  {attachment.filename}
                </span>
                <span className="tabular shrink-0 text-meta text-muted">
                  {formatBytes(attachment.sizeBytes)}
                </span>
              </button>
              {remove(attachment)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The drawer's Files section: what is attached, "Attach files", and files
 * dropped onto it, each uploaded and recorded on its own.
 */
export function TaskFiles({
  issueId,
  issueKey,
  attachments: fromThread,
  canAttach,
  canRemove,
  onChanged,
}: {
  issueId: string;
  issueKey: string;
  attachments: readonly IssueAttachment[];
  canAttach: boolean;
  canRemove: (attachment: IssueAttachment) => boolean;
  /** A file was attached or removed: the history has a new line. */
  onChanged: () => void;
}) {
  const toast = useToast();
  const heading = useId();
  /* What the thread said, then what this section has done since. */
  const [list, setList] = useState(fromThread);
  const [seen, setSeen] = useState(fromThread);
  if (seen !== fromThread) {
    setSeen(fromThread);
    setList(fromThread);
  }
  const staged = useStagedFiles(
    MAX_FILES - list.length,
    `A task can have up to ${MAX_FILES} files. Remove one to add another.`,
  );

  async function take(files: File[]) {
    const added = staged.add(files);
    const failed = await attachStaged(
      { id: issueId, key: issueKey },
      added,
      staged,
      (attachment) => {
        setList((prev) => [...prev, attachment]);
        toast.push({ tone: "success", title: "File attached" });
      },
    );
    if (failed < added.filter((i) => !i.refused).length) onChanged();
  }

  async function remove(attachment: IssueAttachment) {
    try {
      await projectsApi.removeAttachment(attachment.id);
      setList((prev) => prev.filter((a) => a.id !== attachment.id));
      toast.push({ tone: "success", title: "File removed" });
      onChanged();
    } catch (error) {
      toast.push({
        tone: "danger",
        title: `Could not remove ${attachment.filename}`,
        detail: uploadFailure(error),
      });
    }
  }

  const drop = useDropTarget((files) => void take(files), canAttach);
  const nothing = list.length === 0 && staged.items.length === 0;

  return (
    <section
      aria-labelledby={heading}
      {...drop.handlers}
      className={cn(
        "rounded-md",
        drop.over && "outline-2 outline-offset-4 outline-dashed outline-accent",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 id={heading} className="text-meta font-semibold text-muted">
          Files
        </h3>
        {canAttach && <AttachButton onFiles={(f) => void take(f)} />}
      </div>
      {nothing ? (
        <p className="text-body-sm text-muted">
          {canAttach
            ? "No files yet. Drop files here to attach them."
            : "No files"}
        </p>
      ) : (
        <div className="space-y-2">
          <AttachmentList
            attachments={list}
            canRemove={canRemove}
            onRemove={(attachment) => void remove(attachment)}
          />
          <StagedList
            items={staged.items}
            onRemove={staged.remove}
            label="Files being attached"
          />
        </div>
      )}
    </section>
  );
}
