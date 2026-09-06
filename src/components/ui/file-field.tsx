"use client";

import { useId, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "./button";
import { Field } from "./field";
import { cn } from "@/lib/cn";
import {
  UploadRefused,
  upload,
  type UploadScope,
} from "@/lib/api/uploads";

/**
 * Attach one file.
 *
 * ## It uploads before it reports a key, and that ordering is the feature
 *
 * `onUploaded` fires only once the bytes are actually in storage. A form that
 * recorded the key beside the request would produce the failure this product is
 * built to avoid — a personnel file listing a work permit with nothing behind
 * it, which fails the one inspection it exists for.
 *
 * So the caller's save is disabled while `busy` is true and receives a key that
 * is already good. Nothing here writes to the database; the surrounding form
 * does that after.
 *
 * ## Refusals are the server's own words
 *
 * `UploadRefused` carries the API's sentence — the wrong kind of file, one over
 * the cap, or a deployment with no storage configured. It is rendered verbatim,
 * because the API knows which of the three it is and this component does not.
 * That also means a deployment with no bucket says so **at the moment somebody
 * tries**, rather than the control being hidden by a probe that guessed at page
 * load.
 *
 * ## Not a drop zone
 *
 * A plain input behind a button. Drag-and-drop needs a keyboard path anyway, so
 * it is a second interaction to build and test for something most people do
 * with the picker, and a drop target that silently misses is worse than a
 * button that does not.
 */
export function FileField({
  label,
  help,
  scope,
  accept = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx",
  required,
  onUploaded,
  onBusyChange,
  className,
}: {
  label: string;
  help?: string;
  scope: UploadScope;
  accept?: string;
  required?: boolean;
  /** Fires with the storage key, only once the file is genuinely stored. */
  onUploaded: (key: string | null, filename: string | null) => void;
  /** So the surrounding form can disable its own save while bytes are moving. */
  onBusyChange?: (busy: boolean) => void;
  className?: string;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  function setWorking(next: boolean) {
    setBusy(next);
    onBusyChange?.(next);
  }

  function clear() {
    setChosen(null);
    setProgress(0);
    setFailed(null);
    onUploaded(null, null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function take(file: File) {
    setFailed(null);
    setChosen(file.name);
    setWorking(true);
    setProgress(0);
    try {
      const key = await upload(file, scope, setProgress);
      onUploaded(key, file.name);
    } catch (caught) {
      /* Every one of these is a sentence somebody can act on: the API's own
         refusal, or one of the two transport messages `putToStorage` writes.
         None of them is a status code. */
      setFailed(
        caught instanceof UploadRefused || caught instanceof Error
          ? caught.message
          : "The file could not be attached. Try again.",
      );
      setChosen(null);
      onUploaded(null, null);
      if (inputRef.current) inputRef.current.value = "";
    } finally {
      setWorking(false);
    }
  }

  return (
    <Field
      label={label}
      {...(required ? { required: true } : {})}
      {...(help ? { help } : {})}
      {...(failed ? { error: failed } : {})}
    >
      <div className={cn("flex flex-col gap-2", className)}>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(event) => {
            /* Read before the handler goes async — the input is cleared on
               failure below, and reading it afterwards would find nothing. */
            const file = event.target.files?.[0];
            if (file) void take(file);
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip aria-hidden="true" className="size-3.5" />
            {chosen ? "Choose a different file" : "Choose a file"}
          </Button>

          {chosen && !busy && (
            <>
              <span className="text-body-sm text-ink">{chosen}</span>
              <button
                type="button"
                onClick={clear}
                className="text-muted hover:text-ink"
                aria-label={`Remove ${chosen}`}
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </>
          )}
        </div>

        {busy && (
          <div className="flex flex-col gap-1">
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-canvas"
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Upload progress"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${String(Math.round(progress * 100))}%` }}
              />
            </div>
            <p className="text-meta text-muted" aria-live="polite">
              {/* The name as well as the percentage: somebody who picked the
                  wrong file wants to know that before it finishes. */}
              Uploading {chosen} — {Math.round(progress * 100)}%
            </p>
          </div>
        )}
      </div>
    </Field>
  );
}
