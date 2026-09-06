"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { downloadCsv } from "@/lib/csv";
import {
  downloadBlob,
  type BinaryDownload,
  type FileDownload,
} from "@/lib/api/download";

/**
 * One button that turns a file into a saved download.
 *
 * Three screens export something and all three need the same four behaviours,
 * one of which is easy to get quietly wrong:
 *
 * 1. a busy state, because a large export is a real round trip;
 * 2. the file handed to the browser through `downloadCsv`, which carries the
 *    Safari revoke-on-the-next-tick fix;
 * 3. **the server's own refusal, verbatim** — which permission is missing, or
 *    that the payroll file does not reconcile with its run, or that the set is
 *    too large and how to narrow it. Nothing on this side knows which, and a
 *    local "Download failed" would throw away the only sentence anybody can act
 *    on. That is the rule `components/portal/load-failure.tsx` already applies
 *    to reads;
 * 4. a refusal that reads as a refusal rather than as a broken button.
 *
 * The caller supplies only the request. It is **not** gated here: whether a
 * button should exist is a question about the screen — `EXPORT_DATA`, and
 * sometimes `VIEW_SALARIES` on top — and hiding it inside this component would
 * put a permission decision somewhere nobody reviewing the screen would look.
 */
export function ExportButton({
  label,
  busyLabel = "Preparing…",
  download,
  disabled,
  onDone,
}: {
  label: string;
  busyLabel?: string;
  /**
   * Produces the file. Anything it throws is shown as the reason.
   *
   * Text or binary — a `FileDownload` is saved as text and a `BinaryDownload`
   * as a blob. Two shapes rather than a flag, because a PDF read as text is a
   * corrupted PDF and a boolean would put that decision at the call site with
   * nothing to check it.
   */
  download: () => Promise<FileDownload | BinaryDownload>;
  disabled?: boolean;
  onDone?: (file: FileDownload | BinaryDownload) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const file = await download();
      if ("blob" in file) downloadBlob(file.filename, file.blob);
      else downloadCsv(file.filename, file.body);
      toast.push({ title: `Downloaded ${file.filename}`, tone: "success" });
      onDone?.(file);
    } catch (caught) {
      toast.push({
        title: "Nothing was downloaded",
        detail:
          caught instanceof ApiError || caught instanceof Error
            ? caught.message
            : "Something went wrong. Try again.",
        tone: "danger",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={disabled === true || busy}
      onClick={() => void run()}
    >
      <Download aria-hidden="true" className="size-3.5" />
      {busy ? busyLabel : label}
    </Button>
  );
}
