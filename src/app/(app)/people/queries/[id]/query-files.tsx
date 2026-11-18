"use client";

import { useState } from "react";
import { Download, Paperclip, Trash2 } from "lucide-react";
import { Button, FileField, IconButton, useToast } from "@/components/ui";
import { downloadBlob } from "@/lib/api/download";
import {
  QUERY_LIMITS,
  fileSize,
  type ApiQueryFile,
  type QueryFileRole,
} from "@/lib/api/queries";
import type { InlineFile } from "@/lib/api/uploads";
import { useQueryActions } from "@/lib/store/queries";
import { actionMessage } from "@/lib/use-action";

/** What the server sniffs and accepts, from the bytes: a PDF, a photo or a Word file. */
export const QUERY_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.doc,.docx";

/**
 * The files on one side of a query: the letter's, or the reply's.
 *
 * ## Opening a file is a click and nothing else
 *
 * The server writes an audit entry **before** it serves a file's bytes and serves nothing if it
 * cannot, so an open is a look somebody took. The file is therefore fetched inside the click
 * handler, once, and handed to the browser as a download: never on render, never as a prefetch,
 * never behind a link a crawler or a preview could follow. The bytes need the bearer token, which
 * is also why this is a button and not an anchor.
 *
 * ## Names stay in the row
 *
 * A file's name is the person's own and can say what the letter is about. It is drawn in the file
 * list and nowhere else: no toast, no message and no title is built from one.
 *
 * ## What may be added or removed is the server's to say
 *
 * `canAdd` and `canRemove` come from the page (a draft's letter files, or an unsent reply's), and
 * the server refuses anything else in its own sentence, which is shown as it came.
 */
export function QueryFiles({
  queryId,
  role,
  files,
  canAdd,
  canRemove,
  onChanged,
  addLabel = "Attach a file",
}: {
  queryId: string;
  role: QueryFileRole;
  files: readonly ApiQueryFile[];
  canAdd: boolean;
  canRemove: boolean;
  /** Re-read the query: the server answers a file write with the file, not the query. */
  onChanged: () => Promise<void>;
  addLabel?: string;
}) {
  const toast = useToast();
  const actions = useQueryActions();
  const [opening, setOpening] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [picked, setPicked] = useState<InlineFile | null>(null);
  const [reading, setReading] = useState(false);
  const [attaching, setAttaching] = useState(false);
  /* A new key is a new, empty file box: the box clears itself on an attach. */
  const [box, setBox] = useState(0);

  const full = files.length >= QUERY_LIMITS.filesPerSide;

  async function open(file: ApiQueryFile) {
    setOpening(file.id);
    setProblem(null);
    try {
      const result = await actions.fileContent(queryId, file.id);
      downloadBlob(file.filename, result.blob);
    } catch (error) {
      setProblem(actionMessage(error, "the file"));
    } finally {
      setOpening(null);
    }
  }

  async function remove(file: ApiQueryFile) {
    setRemoving(file.id);
    setProblem(null);
    try {
      await actions.removeFile(queryId, file.id);
      await onChanged();
      toast.push({ tone: "info", title: "File removed" });
    } catch (error) {
      setProblem(actionMessage(error, "the file"));
    } finally {
      setRemoving(null);
    }
  }

  async function attach() {
    if (!picked) return;
    setAttaching(true);
    setProblem(null);
    try {
      await actions.addFile(queryId, {
        role,
        filename: picked.filename,
        contentBase64: picked.contentBase64,
      });
      setPicked(null);
      setBox((n) => n + 1);
      await onChanged();
      toast.push({ tone: "success", title: "File attached" });
    } catch (error) {
      setProblem(actionMessage(error, "the file"));
    } finally {
      setAttaching(false);
    }
  }

  if (files.length === 0 && !canAdd) return null;

  return (
    <div className="flex flex-col gap-3">
      {files.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Paperclip
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted"
                />
                <span className="min-w-0 break-words text-body-sm text-ink">
                  {file.filename}
                </span>
                <span className="shrink-0 text-meta text-muted">
                  {fileSize(file.sizeBytes)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={opening === file.id}
                  onClick={() => void open(file)}
                >
                  <Download aria-hidden="true" className="size-4" />
                  <span>Download</span>
                </Button>
                {canRemove && (
                  <IconButton
                    label={`Remove ${file.filename}`}
                    disabled={removing === file.id}
                    onClick={() => void remove(file)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </IconButton>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canAdd &&
        (full ? (
          <p className="text-body-sm text-muted">
            A query can carry at most {QUERY_LIMITS.filesPerSide} files on this
            side.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <FileField
              key={box}
              label={addLabel}
              help="A PDF, a photo or a Word file, up to 10 MB."
              accept={QUERY_FILE_ACCEPT}
              maxBytes={QUERY_LIMITS.fileBytes}
              onAttached={setPicked}
              onBusyChange={setReading}
            />
            <div>
              <Button
                variant="secondary"
                size="sm"
                disabled={!picked || reading}
                loading={attaching}
                onClick={() => void attach()}
              >
                Attach it
              </Button>
            </div>
          </div>
        ))}

      {problem && (
        <p role="alert" className="text-body-sm text-danger-text">
          {problem}
        </p>
      )}
    </div>
  );
}
