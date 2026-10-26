"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FileText, Paperclip, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  acceptAttribute,
  formatBytes,
  limitsLine,
  refuseFile,
  type FileProfile,
} from "@/lib/marketing/apply-files";
import type { UploadedFile } from "@/lib/marketing/apply-form";
import type { ApplyClient, ApplyMode } from "@/lib/marketing/apply-client";
import {
  FieldError,
  Help,
  OptionalMark,
  RequiredMark,
  describedBy,
} from "@/components/marketing/apply/fields";

/**
 * One file box on the apply form.
 *
 * ## What it promises, and keeps
 *
 * - **The limits are on the page before anything is chosen** — what kind of file,
 *   how big — because a wrong guess on a slow connection costs minutes.
 * - **A wrong file is refused at once**, in a sentence, without a request.
 * - **A right one shows moving**: a progress bar with a percentage, and Cancel.
 * - **A failure keeps the file**: Try again re-sends the same one, so nobody has to
 *   find it in their phone a second time. Remove lets go of it.
 * - **The rest of the form is untouched** by any of this. A failed upload is a
 *   message under this box, never a reset of the page.
 *
 * ## Where the bytes go
 *
 * Not through this component. It asks the form's client to upload, and in a
 * preview or a demo that client moves nothing and this box says so.
 */

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; file: File; progress: number }
  | { kind: "failed"; file: File; message: string; retryable: boolean };

const SIZE_DONE = (file: UploadedFile) => formatBytes(file.sizeBytes);

export function FileUpload({
  id,
  label,
  help,
  required,
  optional,
  profile,
  value,
  onChange,
  onBusy,
  error,
  client,
}: {
  id: string;
  label: string;
  help?: string | undefined;
  required?: boolean;
  optional?: boolean;
  profile: FileProfile;
  value: UploadedFile | null;
  onChange: (file: UploadedFile | null) => void;
  /** Tells the form an upload is in flight, so it can wait for it before sending. */
  onBusy: (busy: boolean) => void;
  error?: string | undefined;
  client: ApplyClient;
}) {
  const reactId = useId();
  const inputId = `${id}-input`;
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  /* Let go of a request that is still running when the box goes away. */
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  async function send(file: File) {
    const refusal = refuseFile(file, profile);
    if (refusal) {
      setPhase({ kind: "failed", file, message: refusal, retryable: false });
      return;
    }

    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setPhase({ kind: "uploading", file, progress: 0 });
    onBusy(true);

    const outcome = await client.upload({
      file,
      profile,
      signal: abort.signal,
      onProgress: (fraction) =>
        setPhase((current) =>
          current.kind === "uploading"
            ? { ...current, progress: fraction }
            : current,
        ),
    });

    if (controller.current !== abort) return;
    controller.current = null;
    onBusy(false);

    if (outcome.ok) {
      setPhase({ kind: "idle" });
      onChange(outcome.file);
      return;
    }
    if (outcome.cancelled) {
      setPhase({ kind: "idle" });
      return;
    }
    setPhase({
      kind: "failed",
      file,
      message: outcome.message,
      retryable: outcome.retryable,
    });
  }

  function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    /* Clear the box so choosing the same file again, after removing it, fires. */
    event.currentTarget.value = "";
    if (!file) return;
    onChange(null);
    void send(file);
  }

  function cancel() {
    controller.current?.abort();
  }

  function remove() {
    controller.current?.abort();
    controller.current = null;
    onBusy(false);
    setPhase({ kind: "idle" });
    onChange(null);
  }

  const failed = phase.kind === "failed" ? phase : null;
  const uploading = phase.kind === "uploading" ? phase : null;
  const shownError = failed?.message ?? error;
  const percent = uploading ? Math.round(uploading.progress * 100) : 0;
  const notReal = client.mode !== "live";

  return (
    <div data-testid={`${id}-upload`}>
      <span
        id={`${reactId}-label`}
        className="block text-body-sm font-medium text-slate"
      >
        {label}
        {required && <RequiredMark />}
        {optional && <OptionalMark />}
      </span>
      {help && <Help id={`${id}-help`}>{help}</Help>}
      <p id={`${id}-limits`} className="mt-1.5 text-meta text-slate-muted">
        {limitsLine(profile)}
        {notReal && <> {modeNote(client.mode)}</>}
      </p>

      <div
        className={cn(
          "mt-2 rounded-xl border bg-white p-3",
          "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-slate",
          shownError ? "border-danger" : "border-sand-line",
        )}
      >
        {/* The real control is always in the page, visually hidden, so the
            keyboard and a screen reader meet a file input and the phone's own
            picker opens from it. The visible button is its label. */}
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={acceptAttribute(profile)}
          className="sr-only-focusable"
          aria-labelledby={`${reactId}-label`}
          aria-describedby={describedBy(
            help && `${id}-help`,
            `${id}-limits`,
            shownError && `${id}-error`,
          )}
          aria-invalid={Boolean(shownError)}
          onChange={choose}
        />

        {uploading ? (
          <div role="group" aria-label={`Uploading ${uploading.file.name}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-body-sm text-slate">
                <FileText
                  aria-hidden="true"
                  className="size-4 shrink-0 text-slate-muted"
                />
                <span className="truncate">{uploading.file.name}</span>
              </span>
              <button
                type="button"
                onClick={cancel}
                className="shrink-0 rounded-md px-2 py-1 text-meta font-medium text-slate underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate"
              >
                Cancel
              </button>
            </div>
            <div
              role="progressbar"
              aria-label={`Uploading ${uploading.file.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="mt-2.5 h-2 overflow-hidden rounded-full bg-sand-deep"
            >
              <div
                className="h-full rounded-full bg-slate transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="tabular mt-1.5 text-meta text-slate-muted">
              {percent}% of {formatBytes(uploading.file.size)}. Keep this page
              open.
            </p>
          </div>
        ) : value ? (
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-body-sm text-slate">
              <FileText
                aria-hidden="true"
                className="size-4 shrink-0 text-slate-muted"
              />
              <span className="min-w-0 truncate" data-testid={`${id}-name`}>
                {value.name}
              </span>
              <span className="tabular shrink-0 text-meta text-slate-muted">
                {SIZE_DONE(value)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <label
                htmlFor={inputId}
                className="cursor-pointer rounded-md px-2 py-1 text-meta font-medium text-slate underline underline-offset-2 focus-within:outline-2"
              >
                Replace
              </label>
              <button
                type="button"
                onClick={remove}
                aria-label={`Remove ${value.name}`}
                className="flex size-8 items-center justify-center rounded-md text-slate-muted hover:text-slate focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </span>
          </div>
        ) : failed ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-body-sm text-slate">
              <FileText
                aria-hidden="true"
                className="size-4 shrink-0 text-slate-muted"
              />
              <span className="truncate">{failed.file.name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {failed.retryable && (
                <button
                  type="button"
                  onClick={() => void send(failed.file)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-meta font-medium text-slate underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate"
                >
                  <RotateCcw aria-hidden="true" className="size-3.5" />
                  Try again
                </button>
              )}
              <label
                htmlFor={inputId}
                className="cursor-pointer rounded-md px-2 py-1 text-meta font-medium text-slate underline underline-offset-2"
              >
                Choose another
              </label>
              <button
                type="button"
                onClick={remove}
                aria-label={`Remove ${failed.file.name}`}
                className="flex size-8 items-center justify-center rounded-md text-slate-muted hover:text-slate focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </span>
          </div>
        ) : (
          <label
            htmlFor={inputId}
            className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-1 text-body-sm font-medium text-slate"
          >
            <Paperclip aria-hidden="true" className="size-4" />
            Choose a file
          </label>
        )}
      </div>

      {shownError && <FieldError id={`${id}-error`}>{shownError}</FieldError>}
    </div>
  );
}

function modeNote(mode: ApplyMode): string {
  return mode === "demo"
    ? "Demo: the file stays on this device and is not stored."
    : "Preview: the file stays on this device and is not sent.";
}
