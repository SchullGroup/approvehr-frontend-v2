"use client";

import { useId, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "./button";
import { Field } from "./field";
import { cn } from "@/lib/cn";
import {
  UploadRefused,
  readAsAttachment,
  type InlineFile,
} from "@/lib/api/uploads";

/**
 * Attach one file.
 *
 * ## It hands over the file, not a key
 *
 * `onAttached` fires with the bytes once they are read, and the surrounding
 * form sends them **with** the record it is creating. One request, so there is
 * no window in which a personnel file lists a work permit with nothing behind
 * it — the failure this product exists to avoid, and which a two-step
 * presign-then-save could always produce if the second step failed.
 *
 * It used to presign and PUT to object storage and report the key.
 * `S3_BUCKET` has never been set on any deployment, so that path refused every
 * time, honestly, and the field could not attach anything. Documents hold their
 * own bytes now — see `EmployeeDocument.content` — and this reads them.
 *
 * `presign`/`upload` are still in `lib/api/uploads.ts` for the receipt and CV
 * scopes and for a deployment that does configure a bucket. Nothing in the
 * interface calls them today, which is why the `scope` prop is gone: it only
 * ever chose a storage prefix, and a prop that no longer decides anything is
 * worse than no prop.
 *
 * ## Refusals are sentences, not status codes
 *
 * `UploadRefused` carries one — an empty file, or one over the cap. The size is
 * checked here so the answer arrives before a minute is spent encoding a video
 * somebody attached by mistake; the API checks the decoded length itself and
 * its refusal is the one that counts.
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
  accept = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx",
  required,
  onAttached,
  onBusyChange,
  className,
}: {
  label: string;
  help?: string;
  accept?: string;
  required?: boolean;
  /**
   * Fires with the file, ready to send. Null when the choice is cleared or the
   * read failed, so a form can never save a record with a stale attachment.
   */
  onAttached: (file: InlineFile | null) => void;
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
    onAttached(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function take(file: File) {
    setFailed(null);
    setChosen(file.name);
    setWorking(true);
    setProgress(0);
    try {
      onAttached(await readAsAttachment(file, setProgress));
    } catch (caught) {
      /* Every one of these is a sentence somebody can act on — an empty file,
         one over the cap, or a read that failed. None of them is a status
         code. */
      setFailed(
        caught instanceof UploadRefused || caught instanceof Error
          ? caught.message
          : "The file could not be attached. Try again.",
      );
      setChosen(null);
      onAttached(null);
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
